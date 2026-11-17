package app.silhouette.benefits.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.Locale

// The on-device reading of a paystub (shared/validation/DEVICE_READING.md v2): the per-document
// response constraint, the deterministic checks of each part, and the order in which the parts are
// asked. Code only rejects or leaves fields out; it never picks or fills in a placeholder. Problems,
// records and logs hold placeholder ids and field names only, never document values.

/** A part of the on-device reading (DEVICE_READING.md section 2). */
public enum class DevicePart(public val wire: String) {
    CORE("core"),
    GROSS("gross"),
    DEDUCTIONS("deductions"),
    DEDUCTIONS_AGAIN("deductions-again"),

    /** A document type without a list field (a lease): one request with every field. */
    WHOLE("whole"),
}

/**
 * One answer of the device: the model's text parsed and limited to the part's fields. [value] is
 * null when the text did not parse as a JSON object (problem `not-json`). [marked] lists the problems
 * of fields left out as not read (sections 5 and 5.1), recorded on the core pass.
 */
public data class DevicePass(
    val part: DevicePart,
    val parsed: Boolean,
    val value: JsonObject?,
    val problems: List<String>,
    val extraKeys: List<String>,
    val missingKeys: List<String>,
    val marked: List<String> = emptyList(),
    /** The model's text: placeholder ids and field names only. Empty when the device gave no answer. */
    val rawText: String = "",
    val latencyMs: Long = 0,
) {
    override fun toString(): String = "DevicePass(${part.wire}, problems=$problems)"
}

/**
 * What the device gave for one part: its text, or no answer with the reason (where the call stopped
 * and the error's type, never a value), which becomes the pass's problem.
 */
public sealed interface DeviceAnswer {
    public val latencyMs: Long

    public data class Text(val text: String, override val latencyMs: Long = 0) : DeviceAnswer {
        override fun toString(): String = "DeviceAnswer.Text(${text.length} chars)"
    }

    public data class NoAnswer(val problem: String, override val latencyMs: Long = 0) : DeviceAnswer
}

/** The outcome of a reading (DEVICE_READING.md section 7). */
public sealed interface DeviceOutcome {
    /** The core passed: [value] is the answer used; [notRead] the fields left out (marked "not read"). */
    public data class OnDevice(val value: JsonObject, val notRead: List<String>) : DeviceOutcome

    /** A failed on-device attempt, with the problems of the last pass. */
    public data class Failed(val problems: List<String>) : DeviceOutcome
}

public data class DeviceReadingResult(val asked: List<DevicePart>, val passes: List<DevicePass>, val outcome: DeviceOutcome)

/** Problems and the fields they leave out. */
public data class LeftOut(val problems: List<String>, val fields: List<String>)

public object DeviceReading {
    /** Core checks of validation/SPEC.md section 5 that never warn on a correct reading. */
    public val CORE_CHECKS: List<String> = listOf("period-length", "pay-date", "ytd-gross", "ytd-periods", "dates-parsed")
    public val GROSS_PART_FIELDS: List<String> = listOf("grossPay", "ytdGross")
    public val NAME_FIELDS: List<String> = listOf("employerName", "employeeName")

    /** Labels that mark net pay, per document language (words the Skeletonizer keeps visible). */
    public val NET_PAY_LABELS: Map<String, List<String>> = mapOf(
        "en" to listOf("net", "take home"),
        "es" to listOf("neto", "neta", "líquido", "liquido"),
        "ko" to listOf("실수령", "실지급", "차인지급"),
    )

    private val PLACEHOLDER = Regex("⟦([NDW][0-9]+)⟧")
    private val NUMBER_PLACEHOLDER = Regex("⟦(N[0-9]+)⟧")
    private val MONEY_WITH_CENTS = Regex("[.,][0-9]{2}$")

    private fun near(a: Double, b: Double) = kotlin.math.abs(a - b) < 0.005

    // ---------- 1. Parts and the response constraint ----------

    /** Placeholder ids of a silhouette by kind (`N`, `D`, `W`), in order of first appearance. */
    public fun placeholderIds(skeleton: String): Map<Char, List<String>> {
        val out = linkedMapOf('N' to ArrayList<String>(), 'D' to ArrayList(), 'W' to ArrayList())
        for (m in PLACEHOLDER.findAll(skeleton)) {
            val id = m.groupValues[1]
            val list = out.getValue(id[0])
            if (id !in list) list += id
        }
        return out
    }

    private fun JsonObject.props(): JsonObject = this["properties"] as? JsonObject ?: throw IllegalArgumentException("a pointer schema needs properties")

    private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun kindOf(spec: JsonElement?): String? = ((spec as? JsonObject)?.get("x-kind")).str()

    /** Field names of a part. */
    public fun partFields(schema: JsonObject, part: DevicePart): List<String> {
        val properties = schema.props()
        if (part == DevicePart.GROSS) return GROSS_PART_FIELDS.filter { kindOf(properties[it]) == "number" }
        val list = part == DevicePart.DEDUCTIONS || part == DevicePart.DEDUCTIONS_AGAIN
        return properties.filter { (_, spec) -> part == DevicePart.WHOLE || (kindOf(spec) == "list") == list }.keys.toList()
    }

    /** Whether a document type has a list field and is therefore read in parts. */
    public fun readsInParts(schema: JsonObject): Boolean = schema.props().values.any { kindOf(it) == "list" }

    private fun strings(values: List<String?>): JsonArray = JsonArray(values.map { if (it == null) JsonNull else JsonPrimitive(it) })

    private fun obj(vararg pairs: Pair<String, JsonElement>): JsonObject = JsonObject(linkedMapOf(*pairs))

    private val NULL_ONLY = obj("type" to JsonPrimitive("null"))

    private fun idOrNull(ids: List<String>): JsonObject =
        if (ids.isNotEmpty()) obj("type" to strings(listOf("string", "null")), "enum" to strings(ids + null)) else NULL_ONLY

    private fun fieldConstraint(spec: JsonObject, ids: Map<Char, List<String>>): JsonObject = when (kindOf(spec)) {
        "text" -> if (ids.getValue('W').isNotEmpty()) {
            obj(
                "type" to strings(listOf("array", "null")),
                "minItems" to JsonPrimitive(1),
                "items" to obj("type" to JsonPrimitive("string"), "enum" to strings(ids.getValue('W'))),
            )
        } else {
            NULL_ONLY
        }
        "date" -> idOrNull(ids.getValue('D'))
        "number" -> idOrNull(ids.getValue('N'))
        "enum" -> obj("type" to strings(listOf("string", "null")), "enum" to strings(enumOf(spec) + null))
        "list" -> {
            val kinds = ((((spec["items"] as? JsonObject)?.get("properties") as? JsonObject)?.get("kind") as? JsonObject))?.let(::enumOf).orEmpty()
            obj(
                "type" to JsonPrimitive("array"),
                "items" to obj(
                    "type" to JsonPrimitive("object"),
                    "properties" to obj(
                        "amount" to if (ids.getValue('N').isNotEmpty()) obj("type" to JsonPrimitive("string"), "enum" to strings(ids.getValue('N'))) else NULL_ONLY,
                        "kind" to obj("type" to JsonPrimitive("string"), "enum" to strings(kinds)),
                    ),
                    "required" to strings(listOf("amount", "kind")),
                    "additionalProperties" to JsonPrimitive(false),
                ),
            )
        }
        else -> obj("type" to strings(listOf("string", "null")), "enum" to strings(ids.getValue('N') + ids.getValue('D') + ids.getValue('W') + null))
    }

    private fun enumOf(spec: JsonObject): List<String> = (spec["enum"] as? JsonArray)?.mapNotNull { it.str() }.orEmpty()

    /** The strict response constraint (JSON Schema) of one part, for one silhouette (DEVICE_READING.md section 2). */
    public fun deviceConstraint(schema: JsonObject, skeleton: String, part: DevicePart): JsonObject {
        val ids = placeholderIds(skeleton)
        val fields = partFields(schema, part)
        val properties = schema.props()
        return obj(
            "type" to JsonPrimitive("object"),
            "properties" to JsonObject(fields.associateWith { fieldConstraint(properties[it] as JsonObject, ids) }.let { LinkedHashMap(it) }),
            "required" to strings(fields),
            "additionalProperties" to JsonPrimitive(false),
        )
    }

    // ---------- 2. Checks ----------

    /** Whether a reference fits a field of this kind. */
    private fun fits(kind: String?, ref: JsonElement?, map: Map<String, String>): Boolean {
        if (ref is JsonArray) {
            if (kind == "date") return ref.size == 3 && ref.all { val r = it.str(); r != null && r.startsWith("N") && r in map }
            return ref.isNotEmpty() && ref.all { fits(kind, it, map) }
        }
        val r = ref.str() ?: return false
        if (r !in map) return false
        return when (kind) {
            "number" -> r.startsWith("N")
            "date" -> r.startsWith("D")
            "text" -> r.startsWith("W")
            else -> true
        }
    }

    private fun values(schema: JsonObject, pointers: JsonElement, map: Map<String, String>): JsonObject = rehydrate(schema, pointers, Raw.of(map)).reveal()

    private fun JsonObject.num(key: String): Double? = (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull()

    private fun warnings(v: JsonObject, jurisdiction: String, which: List<String>): List<String> = try {
        val result = Validation.validatePaystubs(listOf(PaystubValues.fromJson(v)), jurisdiction)
        result.checks.firstOrNull().orEmpty().filter { it.status == CheckStatus.WARN && it.id in which }.map { "check:${it.id}" }
    } catch (_: ValidationInputError) {
        listOf("values:malformed")
    }

    /** Whether [ytd] fits as year to date for this gross pay, frequency and date: no ytd-gross or ytd-periods warning. */
    public fun fitsYtd(v: JsonObject, ytd: Double, jurisdiction: String): Boolean {
        val gross = v.num("grossPay") ?: return false
        if (ytd < gross) return false
        val stub = LinkedHashMap<String, JsonElement>()
        stub["grossPay"] = v["grossPay"]!!
        stub["ytdGross"] = JsonPrimitive(ytd)
        for (key in listOf("payFrequency", "periodEnd", "payDate")) v[key]?.let { stub[key] = it }
        return try {
            val result = Validation.validatePaystubs(listOf(PaystubValues.fromJson(JsonObject(stub))), jurisdiction)
            result.checks.firstOrNull().orEmpty().none { it.status == CheckStatus.WARN && (it.id == "ytd-gross" || it.id == "ytd-periods") }
        } catch (_: ValidationInputError) {
            true
        }
    }

    private fun numbersOnLineOf(skeleton: String, id: String): List<String> {
        val line = skeleton.split("\n").find { it.contains("⟦$id⟧") } ?: return emptyList()
        return NUMBER_PLACEHOLDER.findAll(line).map { it.groupValues[1] }.toList()
    }

    private fun amount(map: Map<String, String>, id: String): Double? = parseNumber(map[id] ?: "")

    private fun JsonElement.asObject(): JsonObject? = this as? JsonObject

    /** Same-line rule (DEVICE_READING.md section 4.2). */
    public fun sameLineYtdProblems(schema: JsonObject, pointers: JsonObject, skeleton: String, map: Map<String, String>, jurisdiction: String): List<String> {
        val gross = pointers["grossPay"].str() ?: return emptyList()
        val v = values(schema, pointers, map)
        if (v.num("grossPay") == null) return emptyList()
        val candidates = numbersOnLineOf(skeleton, gross).filter { id -> id != gross && amount(map, id)?.let { fitsYtd(v, it, jurisdiction) } == true }
        val ytd = v.num("ytdGross")
        if (candidates.size != 1 || ytd == null) return emptyList()
        return if (near(ytd, amount(map, candidates[0])!!)) emptyList() else listOf("ytdGross:not-on-gross-line")
    }

    /** Larger-candidate rule (DEVICE_READING.md section 4.3). */
    public fun largerYtdProblems(schema: JsonObject, pointers: JsonObject, skeleton: String, map: Map<String, String>, jurisdiction: String): List<String> {
        val v = values(schema, pointers, map)
        val ytd = v.num("ytdGross") ?: return emptyList()
        if (v.num("grossPay") == null) return emptyList()
        val ids = NUMBER_PLACEHOLDER.findAll(skeleton).map { it.groupValues[1] }.toCollection(LinkedHashSet())
        for (id in ids) {
            if (!MONEY_WITH_CENTS.containsMatchIn(map[id] ?: "")) continue
            val n = amount(map, id) ?: continue
            if (n > ytd && !near(n, ytd) && fitsYtd(v, n, jurisdiction)) return listOf("ytdGross:ambiguous")
        }
        return emptyList()
    }

    /** Problems of the core (deductions ignored); empty: the core may be used (DEVICE_READING.md section 4.1). */
    public fun coreProblems(schema: JsonObject, pointers: JsonElement, skeleton: String, map: Map<String, String>, jurisdiction: String): List<String> {
        val p = pointers.asObject() ?: return listOf("not-an-object")
        val problems = ArrayList<String>()
        for ((name, spec) in schema.props()) {
            val kind = kindOf(spec)
            val value = p[name]
            if (kind == "list" || value == null || value is JsonNull) continue
            if (kind == "enum") {
                if (value.str() !in enumOf(spec as JsonObject) || value.str() == null) problems += "$name:not-an-option"
            } else if (!fits(kind, value, map)) {
                problems += "$name:bad-reference"
            }
        }
        val core = JsonObject(p.filterKeys { it != "deductions" })
        val v = values(schema, core, map)
        val gross = v.num("grossPay")
        val net = v.num("netPay")
        if (gross == null) problems += "grossPay:missing"
        if (gross != null && net != null && net > gross) problems += "netPay:above-gross"
        problems += warnings(v, jurisdiction, CORE_CHECKS)
        problems += sameLineYtdProblems(schema, core, skeleton, map, jurisdiction)
        problems += largerYtdProblems(schema, core, skeleton, map, jurisdiction)
        return problems
    }

    /** Problems of the deductions, given the core (DEVICE_READING.md section 6). */
    public fun deductionsProblems(schema: JsonObject, pointers: JsonElement, map: Map<String, String>, jurisdiction: String): List<String> {
        val p = pointers.asObject() ?: return listOf("not-an-object")
        val spec = schema.props()["deductions"] as? JsonObject
        val kinds = (((spec?.get("items") as? JsonObject)?.get("properties") as? JsonObject)?.get("kind") as? JsonObject)?.let(::enumOf).orEmpty()
        val list = p["deductions"]
        if (list == null || list is JsonNull) return listOf("deductions:missing")
        if (list !is JsonArray) return listOf("deductions:not-a-list")
        val problems = LinkedHashSet<String>()
        for (item in list) {
            val o = item as? JsonObject
            if (o == null || !fits("number", o["amount"], map)) {
                problems += "deductions:bad-reference"
            } else {
                val kind = o["kind"]
                if (kind != null && kind !is JsonNull && kind.str() !in kinds) problems += "deductions:not-an-option"
            }
        }
        val v = values(schema, p, map)
        if (v.num("netPay") == null || v.num("grossPay") == null) problems += "deductions:cannot-check" else problems += warnings(v, jurisdiction, listOf("net-sum"))
        return problems.toList()
    }

    private fun wordIds(v: JsonElement?): List<String> = (v as? JsonArray)?.mapNotNull { it.str() }.orEmpty()

    /** The two names share a placeholder. */
    public fun namesProblems(pointers: JsonObject): List<String> {
        val employer = wordIds(pointers["employerName"]).toSet()
        return if (wordIds(pointers["employeeName"]).any { it in employer }) listOf("names:shared-placeholder") else emptyList()
    }

    private val ONE_OR_TWO_SPACES = Regex("^ {1,2}$")

    /** A name cut short: next to an answered word, with only one or two spaces between, a word placeholder the answer leaves out. */
    public fun incompleteNameProblems(pointers: JsonObject, skeleton: String): List<String> {
        val out = ArrayList<String>()
        for (field in NAME_FIELDS) {
            val answered = wordIds(pointers[field]).toSet()
            if (answered.isEmpty()) continue
            var cut = false
            for (line in skeleton.split("\n")) {
                val tokens = PLACEHOLDER.findAll(line).toList()
                var i = 0
                while (i < tokens.size && !cut) {
                    if (tokens[i].groupValues[1] in answered) {
                        for (j in listOf(i - 1, i + 1)) {
                            val other = tokens.getOrNull(j) ?: continue
                            val id = other.groupValues[1]
                            if (!id.startsWith("W") || id in answered) continue
                            val (a, b) = if (j < i) other to tokens[i] else tokens[i] to other
                            if (ONE_OR_TWO_SPACES.matches(line.substring(a.range.last + 1, b.range.first))) cut = true
                        }
                    }
                    i++
                }
                if (cut) break
            }
            if (cut) out += "$field:incomplete"
        }
        return out
    }

    /** Hours worked or hourly rate on the placeholder answered for gross pay, net pay or year to date. */
    public fun sharedAmountProblems(pointers: JsonObject): List<String> {
        val amounts = listOf("grossPay", "netPay", "ytdGross").mapNotNull { pointers[it].str() }.toSet()
        return listOf("hoursWorked", "hourlyRate").filter { f -> pointers[f].str()?.let { it in amounts } == true }.map { "$it:shares-placeholder" }
    }

    /** Fields left out as not read, and why (DEVICE_READING.md section 5). */
    public fun notReadFields(pointers: JsonObject, skeleton: String): LeftOut {
        val names = namesProblems(pointers)
        val incomplete = incompleteNameProblems(pointers, skeleton)
        val shared = sharedAmountProblems(pointers)
        val fields = (if (names.isNotEmpty()) NAME_FIELDS else emptyList()) + (incomplete + shared).map { it.substringBefore(':') }
        return LeftOut(names + incomplete + shared, fields.distinct())
    }

    /** Year to date left out although the document has exactly one place for it (DEVICE_READING.md section 4.4). */
    public fun ytdMissingWithCandidate(schema: JsonObject, pointers: JsonObject, skeleton: String, map: Map<String, String>, jurisdiction: String): Boolean {
        val gross = pointers["grossPay"].str() ?: return false
        val ytd = pointers["ytdGross"]
        if (ytd != null && ytd !is JsonNull) return false
        val v = values(schema, pointers, map)
        val grossAmount = v.num("grossPay") ?: return false
        fun fitting(id: String): Boolean = amount(map, id)?.let { fitsYtd(v, it, jurisdiction) } == true
        val onLine = numbersOnLineOf(skeleton, gross).filter { it != gross && fitting(it) }
        if (onLine.isNotEmpty()) return onLine.size == 1
        val amounts = NUMBER_PLACEHOLDER.findAll(skeleton).map { it.groupValues[1] }
            .filter { id -> MONEY_WITH_CENTS.containsMatchIn(map[id] ?: "") && !near(amount(map, id) ?: Double.NaN, grossAmount) && fitting(id) }
            .mapNotNull { amount(map, it) }
            .toSet()
        return amounts.size == 1
    }

    // ---------- Shown only when confirmed (DEVICE_READING.md section 5.1) ----------

    private fun netLabelled(skeleton: String, id: String, language: String): Boolean {
        val line = skeleton.split("\n").find { it.contains("⟦$id⟧") } ?: return false
        val text = line.replace(PLACEHOLDER, " ").lowercase(Locale.ROOT)
        val labels = NET_PAY_LABELS[language].orEmpty() + if (language == "en") emptyList() else NET_PAY_LABELS.getValue("en")
        return labels.any { label ->
            if (Regex("^[a-z ]+$").matches(label)) Regex("(^|[^a-z])${Regex.escape(label)}([^a-z]|$)").containsMatchIn(text) else text.contains(label)
        }
    }

    /** Fields of a reading about to be used that no check confirms, and why. */
    public fun unconfirmedFields(schema: JsonObject, pointers: JsonObject, skeleton: String, map: Map<String, String>, jurisdiction: String, language: String): LeftOut {
        val v = values(schema, pointers, map)
        val problems = ArrayList<String>()
        if (pointers.containsKey("hoursWorked") || pointers.containsKey("hourlyRate")) {
            val h = v.num("hoursWorked")
            val r = v.num("hourlyRate")
            val g = v.num("grossPay")
            val confirmed = h != null && r != null && g != null &&
                NUMBER_PLACEHOLDER.findAll(skeleton).map { it.groupValues[1] }.distinct().any { id ->
                    val text = map[id] ?: ""
                    val m = if (MONEY_WITH_CENTS.containsMatchIn(text)) parseNumber(text) else null
                    m != null && m <= g + 0.005 && kotlin.math.abs(r * h - m) <= 0.01 + 1e-9
                }
            if (!confirmed) problems += listOf("hoursWorked:unconfirmed", "hourlyRate:unconfirmed")
        }
        val net = pointers["netPay"].str()
        if (net != null) {
            val byDeductions = pointers["deductions"] is JsonArray && deductionsProblems(schema, pointers, map, jurisdiction).isEmpty()
            if (!byDeductions && !netLabelled(skeleton, net, language)) problems += "netPay:unconfirmed"
        }
        val pay = v["payDate"].str()?.let { Dates.parse(it, jurisdiction) }
        if (pay != null) {
            val start = v["periodStart"].str()?.let { Dates.parse(it, jurisdiction) }
            val end = v["periodEnd"].str()?.let { Dates.parse(it, jurisdiction) }
            if ((start != null && pay.dayNumber <= start.dayNumber) || (end != null && pay.dayNumber < end.dayNumber)) problems += "payDate:before-period-end"
        }
        val kept = problems.filter { pointers.containsKey(it.substringBefore(':')) }
        return LeftOut(kept, kept.map { it.substringBefore(':') }.distinct())
    }

    // ---------- 3. The reading, part by part ----------

    private val json = Json

    /** One answer of the device: the model's text, parsed and limited to the part's fields. */
    public fun readPass(schema: JsonObject, part: DevicePart, text: String, latencyMs: Long = 0): DevicePass {
        val fields = partFields(schema, part)
        val parsed = runCatching { json.parseToJsonElement(text) }.getOrNull() as? JsonObject
            ?: return DevicePass(part, false, null, listOf("not-json"), emptyList(), emptyList(), rawText = text, latencyMs = latencyMs)
        val keys = parsed.keys.toList()
        val value = JsonObject(LinkedHashMap(parsed.filter { (k, v) -> v !is JsonNull && k in fields }))
        return DevicePass(part, true, value, emptyList(), keys.filter { it !in fields }, fields.filter { it !in keys }, rawText = text, latencyMs = latencyMs)
    }

    /** A pass for an answer, or for no answer (its reason is the pass's only problem). */
    public fun readPass(schema: JsonObject, part: DevicePart, answer: DeviceAnswer): DevicePass = when (answer) {
        is DeviceAnswer.Text -> readPass(schema, part, answer.text, answer.latencyMs)
        is DeviceAnswer.NoAnswer -> DevicePass(part, false, null, listOf(answer.problem), emptyList(), emptyList(), latencyMs = answer.latencyMs)
    }

    private fun isGrossProblem(p: String) = p.startsWith("grossPay:") || p.startsWith("ytdGross:") || p == "check:ytd-gross" || p == "check:ytd-periods"

    /**
     * The reading of DEVICE_READING.md section 3. [ask] asks the device for one part. Returns the
     * parts asked, each pass, and the outcome: answered on the device with the value and the fields
     * not read, or a failed attempt.
     */
    /** [readOnDevice] for a document's own silhouette; its values stay inside :core. */
    public suspend fun readOnDevice(
        schema: JsonObject,
        result: SkeletonResult,
        jurisdiction: String,
        language: String,
        ask: suspend (DevicePart) -> DeviceAnswer,
    ): DeviceReadingResult = readOnDevice(schema, result.skeleton.text, result.map.reveal(), jurisdiction, language, ask)

    public suspend fun readOnDevice(
        schema: JsonObject,
        skeleton: String,
        map: Map<String, String>,
        jurisdiction: String,
        language: String = "en",
        ask: suspend (DevicePart) -> DeviceAnswer,
    ): DeviceReadingResult {
        suspend fun pass(part: DevicePart) = readPass(schema, part, ask(part))
        fun checkCore(v: JsonObject) = coreProblems(schema, v, skeleton, map, jurisdiction)
        val passes = ArrayList<DevicePass>()
        val core0 = pass(DevicePart.CORE)
        var core = core0.value?.let { core0.copy(problems = checkCore(it)) } ?: core0
        passes += core
        val coreValue0 = core.value
        val grossFailed = coreValue0 != null && core.problems.isNotEmpty() && core.problems.all(::isGrossProblem)
        val ytdMissing = coreValue0 != null && core.problems.isEmpty() && ytdMissingWithCandidate(schema, coreValue0, skeleton, map, jurisdiction)
        if (coreValue0 != null && (grossFailed || ytdMissing)) {
            val gross0 = pass(DevicePart.GROSS)
            val merged = gross0.value?.let { JsonObject(LinkedHashMap(coreValue0).apply { putAll(it) }) }
            val answered = merged != null && merged.containsKey("ytdGross")
            val problems = if (merged != null) checkCore(merged) else gross0.problems
            passes += gross0.copy(problems = if (ytdMissing && !answered && problems.isEmpty()) listOf("ytdGross:still-missing") else problems)
            if (merged != null && problems.isEmpty() && (grossFailed || answered)) core = core.copy(value = merged, problems = emptyList())
        }
        val coreValue = core.value
        if (coreValue == null || core.problems.isNotEmpty()) {
            return DeviceReadingResult(passes.map { it.part }, passes, DeviceOutcome.Failed(passes.last().problems))
        }
        val contradictions = notReadFields(coreValue, skeleton)
        val notRead = ArrayList(contradictions.fields)
        val kept = JsonObject(LinkedHashMap(coreValue.filterKeys { it !in notRead }))
        if (contradictions.problems.isNotEmpty()) passes[0] = passes[0].copy(marked = contradictions.problems)
        suspend fun readDeductions(part: DevicePart): Pair<DevicePass, JsonObject> {
            val p = pass(part)
            val merged = p.value?.let { JsonObject(LinkedHashMap(kept).apply { putAll(it) }) } ?: kept
            val checked = if (p.value != null) p.copy(problems = deductionsProblems(schema, merged, map, jurisdiction)) else p
            passes += checked
            return checked to merged
        }
        var ded = readDeductions(DevicePart.DEDUCTIONS)
        if (ded.first.value != null && "check:net-sum" in ded.first.problems) ded = readDeductions(DevicePart.DEDUCTIONS_AGAIN)
        val deductionsNotRead = ded.first.value == null || ded.first.problems.isNotEmpty()
        if (deductionsNotRead) notRead += "deductions"
        val read = if (deductionsNotRead) kept else ded.second
        // Shown only when confirmed: values that feed no result and that no check confirms are left out.
        val unconfirmed = unconfirmedFields(schema, read, skeleton, map, jurisdiction, language)
        notRead += unconfirmed.fields
        if (unconfirmed.problems.isNotEmpty()) passes[0] = passes[0].copy(marked = passes[0].marked + unconfirmed.problems)
        val value = JsonObject(LinkedHashMap(read.filterKeys { it !in unconfirmed.fields }))
        return DeviceReadingResult(passes.map { it.part }, passes, DeviceOutcome.OnDevice(value, notRead))
    }
}
