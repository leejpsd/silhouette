package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.floor
import kotlin.math.max

// Generalizer. Contract: shared/rulepacks/SPEC.md section 6 and
// shared/schemas/generalized-profile.json. Ported from shared/reference/silhouette.mjs.

/** Thrown when a profile silhouette cannot be built. Messages never contain user values. */
public class GeneralizeError(message: String) : Exception(message)

/** An income band. [max] is null for the open-ended top band. */
public data class IncomeBand(val id: String, val min: Double, val max: Double?)

/** A child age band. */
public data class AgeBand(val id: String, val min: Double, val max: Double)

/** `shared/bands/{jurisdiction}.json` */
public class Bands(
    public val jurisdiction: String,
    public val annualIncome: List<IncomeBand>,
    public val householdSizeCap: Int,
    public val childAgeBands: List<AgeBand>,
) {
    public companion object {
        /** Reads a bands file. Throws IllegalArgumentException when it is malformed. */
        public fun parse(json: JsonElement): Bands {
            val root = json as? JsonObject ?: malformed("root")
            fun JsonElement?.number(what: String): Double =
                (this as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull() ?: malformed(what)
            fun JsonElement?.text(what: String): String =
                (this as? JsonPrimitive)?.takeIf { it.isString }?.content ?: malformed(what)
            fun JsonElement?.objects(what: String): List<JsonObject> =
                (this as? JsonArray)?.map { it as? JsonObject ?: malformed(what) } ?: malformed(what)
            val cap = root["householdSizeCap"].number("householdSizeCap")
            if (cap != floor(cap) || cap < 1 || cap > Int.MAX_VALUE) malformed("householdSizeCap")
            return Bands(
                jurisdiction = root["jurisdiction"].text("jurisdiction"),
                annualIncome = root["annualIncome"].objects("annualIncome").map {
                    IncomeBand(
                        id = it["id"].text("annualIncome.id"),
                        min = it["min"].number("annualIncome.min"),
                        max = if (it["max"] is JsonNull) null else it["max"].number("annualIncome.max"),
                    )
                },
                householdSizeCap = cap.toInt(),
                childAgeBands = root["childAgeBands"].objects("childAgeBands").map {
                    AgeBand(it["id"].text("childAgeBands.id"), it["min"].number("childAgeBands.min"), it["max"].number("childAgeBands.max"))
                },
            )
        }

        private fun malformed(what: String): Nothing = throw IllegalArgumentException("malformed bands file: $what")
    }
}

/** `housing` values of the profile silhouette. */
public enum class Housing(public val wire: String) {
    RENTER("renter"),
    OWNER("owner"),
    OTHER("other"),
}

/** `householdSize` of the profile silhouette: the integer, or `"{cap}+"` above the cap. */
public sealed interface HouseholdSize {
    public data class Count(val value: Int) : HouseholdSize

    public data class AboveCap(val cap: Int) : HouseholdSize {
        val label: String get() = "$cap+"
    }
}

/** The profile silhouette (shared/schemas/generalized-profile.json). Unanswered fields are null. */
public data class GeneralizedProfile(
    val jurisdiction: String,
    val incomeBand: String?,
    val householdSize: HouseholdSize?,
    val childAgeBands: List<String>?,
    val county: String?,
    val housing: Housing?,
) {
    /** The profile as a JSON object, keys in schema order. */
    public fun toJson(): JsonObject = JsonObject(
        linkedMapOf(
            "jurisdiction" to JsonPrimitive(jurisdiction),
            "incomeBand" to (incomeBand?.let { JsonPrimitive(it) } ?: JsonNull),
            "householdSize" to when (householdSize) {
                null -> JsonNull
                is HouseholdSize.Count -> jsonNumber(householdSize.value.toDouble())
                is HouseholdSize.AboveCap -> JsonPrimitive(householdSize.label)
            },
            "childAgeBands" to (childAgeBands?.let { list -> JsonArray(list.map { JsonPrimitive(it) }) } ?: JsonNull),
            "county" to (county?.let { JsonPrimitive(it) } ?: JsonNull),
            "housing" to (housing?.let { JsonPrimitive(it.wire) } ?: JsonNull),
        ),
    )
}

private val SLUG = Regex("^[a-z0-9]+(?:-[a-z0-9]+)*$")

/**
 * Turns the exact profile into the profile silhouette. One of the two functions allowed to produce
 * a cloud-safe value from Raw (shared/DATA_TYPES.md).
 *
 * [exact] is a JSON object `{jurisdiction, annualIncome? | incomeBand?, householdSize?, childAges?,
 * county?, housing?}`. Absent or null fields are unanswered and become null. Values are checked at
 * runtime; invalid input throws [GeneralizeError].
 */
public fun generalize(exact: Raw<JsonObject>, bands: Bands): Generalized<GeneralizedProfile> {
    val input = exact.reveal().toValue() as Map<*, *>
    fun given(key: String): Any? = input[key]

    val jurisdiction = given("jurisdiction")
    if (jurisdiction !is String || !SLUG.matches(jurisdiction)) throw GeneralizeError("jurisdiction must be a slug")

    var incomeBand: String? = null
    val income = given("annualIncome")
    val chosenBand = given("incomeBand")
    if (income != null) {
        if (income !is Double || !income.isFinite()) throw GeneralizeError("annualIncome must be a finite number")
        val value = floor(max(income, 0.0))
        val band = bands.annualIncome.find { value >= it.min && (it.max == null || value <= it.max) }
            ?: throw GeneralizeError("annualIncome is not covered by any band")
        incomeBand = band.id
    } else if (chosenBand != null) {
        if (bands.annualIncome.none { it.id == chosenBand }) throw GeneralizeError("unknown income band")
        incomeBand = chosenBand as String
    }

    var householdSize: HouseholdSize? = null
    val size = given("householdSize")
    if (size != null) {
        if (size !is Double || !isInteger(size) || size < 1) throw GeneralizeError("householdSize must be a positive integer")
        val cap = bands.householdSizeCap
        householdSize = if (size > cap) HouseholdSize.AboveCap(cap) else HouseholdSize.Count(size.toInt())
    }

    var childAgeBands: List<String>? = null
    val ages = given("childAges")
    if (ages != null) {
        if (ages !is List<*> || !ages.all { it is Double && it.isFinite() }) {
            throw GeneralizeError("childAges must be a list of numbers")
        }
        val list = ages.map { it as Double }
        childAgeBands = bands.childAgeBands.filter { b -> list.any { it >= b.min && it <= b.max } }.map { it.id }
    }

    var county: String? = null
    val countyValue = given("county")
    if (countyValue != null) {
        if (countyValue !is String || !SLUG.matches(countyValue)) throw GeneralizeError("county must be a slug")
        county = countyValue
    }

    var housing: Housing? = null
    val housingValue = given("housing")
    if (housingValue != null) {
        housing = Housing.entries.find { it.wire == housingValue } ?: throw GeneralizeError("unknown housing value")
    }

    return Generalized(GeneralizedProfile(jurisdiction, incomeBand, householdSize, childAgeBands, county, housing))
}

/** Number.isInteger */
private fun isInteger(x: Double): Boolean = x.isFinite() && floor(x) == x

/**
 * Canonical serialization: all six keys in schema order, no whitespace, null for unanswered
 * fields, integers without a fraction. Strings are written exactly as JSON.stringify writes them.
 */
public fun canonical(profile: Generalized<GeneralizedProfile>): Generalized<String> {
    val p = profile.value
    fun str(s: String?) = if (s == null) "null" else jsonQuote(s)
    val household = when (val h = p.householdSize) {
        null -> "null"
        is HouseholdSize.Count -> jsNumberToString(h.value.toDouble())
        is HouseholdSize.AboveCap -> jsonQuote(h.label)
    }
    val children = p.childAgeBands?.joinToString(",", "[", "]") { jsonQuote(it) } ?: "null"
    val text = "{\"jurisdiction\":${str(p.jurisdiction)},\"incomeBand\":${str(p.incomeBand)}," +
        "\"householdSize\":$household,\"childAgeBands\":$children," +
        "\"county\":${str(p.county)},\"housing\":${str(p.housing?.wire)}}"
    return Generalized(text)
}
