package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.math.BigInteger
import java.util.regex.Pattern
import kotlin.math.abs

// Validation and annualization of confirmed paystub values. Contract: shared/validation/SPEC.md,
// reference shared/reference/validate.mjs. No clock, no time zones. Money in integer cents; every
// ratio in exact integer arithmetic.

/** Thrown for malformed input. Messages never contain values. */
public class ValidationInputError(message: String) : Exception(message)

public enum class PayFrequency(public val wire: String, public val periodsPerYear: Int, internal val minDays: Int, internal val maxDays: Int) {
    WEEKLY("weekly", 52, 7, 7),
    BIWEEKLY("biweekly", 26, 14, 14),
    SEMIMONTHLY("semimonthly", 24, 13, 16),
    MONTHLY("monthly", 12, 28, 31),
    ;

    public companion object {
        public fun fromWire(value: String): PayFrequency? = entries.find { it.wire == value }

        /** SPEC.md section 4: the frequency implied by an inclusive period length, or null. */
        public fun forLength(days: Long): PayFrequency? = when (days) {
            7L -> WEEKLY
            14L -> BIWEEKLY
            in 13L..16L -> SEMIMONTHLY
            in 28L..31L -> MONTHLY
            else -> null
        }
    }
}

/** A deduction line: amount in currency units, and the optional kind. */
public data class Deduction(val amount: Double, val kind: String? = null)

/** Confirmed values of one paystub (SPEC.md section 1). Dates are unparsed text. */
public data class PaystubValues(
    val grossPay: Double? = null,
    val netPay: Double? = null,
    val ytdGross: Double? = null,
    val hourlyRate: Double? = null,
    val hoursWorked: Double? = null,
    val payFrequency: String? = null,
    val payDate: String? = null,
    val periodStart: String? = null,
    val periodEnd: String? = null,
    val deductions: List<Deduction> = emptyList(),
    /**
     * Date fields that were present in the input as `null`. They are absent for every rule except
     * the `dates-parsed` check, where the conformance fixtures count them as given and unreadable.
     */
    val nullDates: Set<String> = emptySet(),
) {
    override fun toString(): String = "PaystubValues(values redacted)"

    public companion object {
        /**
         * Reads one paystub from JSON. A field that is missing or `null` is absent (SPEC.md section 1);
         * a field of the wrong type raises [ValidationInputError].
         */
        public fun fromJson(json: JsonElement): PaystubValues {
            val obj = json as? JsonObject ?: throw ValidationInputError("a paystub is an object")
            fun present(key: String): JsonElement? = obj[key]?.takeIf { it !is JsonNull }
            fun number(key: String): Double? = present(key)?.let { v ->
                (v as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull()
                    ?: throw ValidationInputError("$key must be a number")
            }
            fun text(key: String): String? = present(key)?.let { v ->
                (v as? JsonPrimitive)?.takeIf { it.isString }?.content ?: throw ValidationInputError("$key must be text")
            }
            val deductions = when (val d = obj["deductions"]) {
                null, is JsonNull -> emptyList()
                is JsonArray -> d.map { entry ->
                    val e = entry as? JsonObject ?: throw ValidationInputError("a deduction is an object")
                    val amount = (e["amount"] as? JsonPrimitive)?.takeIf { !it.isString && e["amount"] !is JsonNull }?.content?.toDoubleOrNull()
                        ?: throw ValidationInputError("a deduction amount must be a number")
                    Deduction(amount, (e["kind"] as? JsonPrimitive)?.takeIf { it.isString }?.content)
                }
                else -> throw ValidationInputError("deductions must be a list")
            }
            return PaystubValues(
                nullDates = listOf("payDate", "periodStart", "periodEnd").filter { obj[it] is JsonNull }.toSet(),
                grossPay = number("grossPay"),
                netPay = number("netPay"),
                ytdGross = number("ytdGross"),
                hourlyRate = number("hourlyRate"),
                hoursWorked = number("hoursWorked"),
                payFrequency = text("payFrequency"),
                payDate = text("payDate"),
                periodStart = text("periodStart"),
                periodEnd = text("periodEnd"),
                deductions = deductions,
            )
        }
    }
}

/** A calendar date in the proleptic Gregorian calendar. */
public data class CivilDate(val year: Int, val month: Int, val day: Int) {
    /** `YYYY-MM-DD`. */
    public val iso: String get() = String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", year, month, day)

    /** Days since 1970-01-01. */
    public val dayNumber: Long
        get() {
            val y = (if (month <= 2) year - 1 else year).toLong()
            val era = Math.floorDiv(y, 400L)
            val yoe = y - era * 400
            val mp = (month + 9) % 12
            val doy = (153 * mp + 2) / 5 + day - 1
            val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
            return era * 146097 + doe - 719468
        }
}

public object Dates {
    /** Component order of non-year-first dates, per jurisdiction (SPEC.md section 3). */
    public val ORDER: Map<String, String> = mapOf("us-ca" to "MDY", "zz-test" to "MDY", "kr" to "YMD")

    private val DATE_TEXT = Regex("^([0-9]{1,4})[/.\\-]([0-9]{1,2})[/.\\-]([0-9]{1,4})$")
    private val MONTH_FIRST = Pattern.compile("^($MONTH_ALTERNATION)\\.? ([0-9]{1,2})(?:st|nd|rd|th)?,? ([0-9]{4})$", Pattern.CASE_INSENSITIVE)
    private val DAY_FIRST =
        Pattern.compile("^([0-9]{1,2})(?:st|nd|rd|th)? (?:de )?($MONTH_ALTERNATION)\\.?,? (?:del? )?([0-9]{4})$", Pattern.CASE_INSENSITIVE)

    private fun isLeap(y: Int) = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0

    public fun daysInMonth(year: Int, month: Int): Int = when (month) {
        1, 3, 5, 7, 8, 10, 12 -> 31
        4, 6, 9, 11 -> 30
        2 -> if (isLeap(year)) 29 else 28
        else -> 0
    }

    /** ASCII-only lowercasing, matching the ASCII case-insensitive month names. */
    private fun asciiLower(s: String) = buildString { s.forEach { append(if (it in 'A'..'Z') it + 32 else it) } }

    private fun monthNumber(word: String): Int = MONTH_NAMES.indexOfFirst { asciiLower(word) in it } + 1

    private fun valid(year: Int, month: Int, day: Int): CivilDate? =
        if (year < 1900 || year > 2099 || month !in 1..12 || day < 1 || day > daysInMonth(year, month)) null else CivilDate(year, month, day)

    /** Parses date text for a jurisdiction, or returns null when it does not parse (SPEC.md section 3). */
    public fun parse(text: String, jurisdiction: String): CivilDate? {
        val t = text.trim()
        // `matches()` is a whole-string match: a trailing line break never matches.
        MONTH_FIRST.matcher(t).takeIf { it.matches() }?.let { m ->
            return valid(m.group(3).toInt(), monthNumber(m.group(1)), m.group(2).toInt())
        }
        DAY_FIRST.matcher(t).takeIf { it.matches() }?.let { m ->
            return valid(m.group(3).toInt(), monthNumber(m.group(2)), m.group(1).toInt())
        }
        val m = DATE_TEXT.matchEntire(t) ?: return null
        val (a, b, c) = m.destructured
        val order = if (a.length == 4) "YMD" else ORDER[jurisdiction] ?: return null
        val (ys, ms, ds) = when (order) {
            "YMD" -> Triple(a, b, c)
            "MDY" -> Triple(c, a, b)
            else -> Triple(c, b, a)
        }
        if (ds.length > 2 || ms.length > 2) return null
        val year = when (ys.length) {
            4 -> ys.toInt()
            2 -> 2000 + ys.toInt()
            else -> return null
        }
        return valid(year, ms.toInt(), ds.toInt())
    }
}

public enum class CheckStatus(public val wire: String) { OK("ok"), WARN("warn"), SKIPPED("skipped") }

/** Check ids in report order (SPEC.md section 5). */
public val CHECK_IDS: List<String> = listOf("net-sum", "rate-hours", "period-length", "pay-date", "ytd-gross", "ytd-periods", "dates-parsed")

public data class Check(val id: String, val status: CheckStatus)

public sealed interface AnnualizationBasis {
    public data class YearToDate(val ytdCents: Long, val referenceDate: String, val elapsedNumerator: Long, val elapsedDenominator: Long, val stubsUsed: List<Int>) :
        AnnualizationBasis

    public data class Average(val averageGrossCents: Long, val periodsPerYear: Int, val frequency: PayFrequency, val stubsUsed: List<Int>) :
        AnnualizationBasis
}

/** The exact yearly income in whole currency units, and how it was worked out. */
public data class Annualization(val annualIncome: Long, val basis: AnnualizationBasis) {
    val method: String get() = if (basis is AnnualizationBasis.YearToDate) "ytd" else "average"
}

public data class ValidationResult(
    val checks: List<List<Check>>,
    val duplicates: List<Int>,
    /** `no-gross`, `no-frequency` or null. */
    val failure: String?,
    val annualization: Annualization?,
) {
    /** Keys in the order of the conformance fixture. */
    public fun toJson(): JsonObject {
        fun ints(list: List<Int>) = JsonArray(list.map { JsonPrimitive(it) })
        val annual = annualization?.let { a ->
            val basis = when (val b = a.basis) {
                is AnnualizationBasis.YearToDate -> JsonObject(
                    linkedMapOf(
                        "ytdCents" to JsonPrimitive(b.ytdCents),
                        "referenceDate" to JsonPrimitive(b.referenceDate),
                        "elapsedMonths" to JsonObject(linkedMapOf("numerator" to JsonPrimitive(b.elapsedNumerator), "denominator" to JsonPrimitive(b.elapsedDenominator))),
                        "stubsUsed" to ints(b.stubsUsed),
                    ),
                )
                is AnnualizationBasis.Average -> JsonObject(
                    linkedMapOf(
                        "averageGrossCents" to JsonPrimitive(b.averageGrossCents),
                        "periodsPerYear" to JsonPrimitive(b.periodsPerYear),
                        "frequency" to JsonPrimitive(b.frequency.wire),
                        "stubsUsed" to ints(b.stubsUsed),
                    ),
                )
            }
            JsonObject(linkedMapOf("annualIncome" to JsonPrimitive(a.annualIncome), "method" to JsonPrimitive(a.method), "basis" to basis))
        } ?: JsonNull
        return JsonObject(
            linkedMapOf(
                "checks" to JsonArray(checks.map { list -> JsonArray(list.map { JsonObject(linkedMapOf("id" to JsonPrimitive(it.id), "status" to JsonPrimitive(it.status.wire))) }) }),
                "duplicates" to ints(duplicates),
                "failure" to (failure?.let { JsonPrimitive(it) } ?: JsonNull),
                "annualization" to annual,
            ),
        )
    }
}

public object Validation {
    /** `round(x × 100)`, half up for the non-negative inputs allowed here (SPEC.md section 2). */
    public fun toCents(value: Double): Long {
        if (!value.isFinite() || value < 0) throw ValidationInputError("money values must be finite and non-negative")
        // Allowed by SPEC.md section 1; keeps every product within exact arithmetic.
        if (value >= 1e15) throw ValidationInputError("money values must be below 10^15")
        return Math.round(value * 100)
    }

    /** Exact non-negative num/den rounded to the nearest integer, halves up. */
    private fun roundRatio(num: BigInteger, den: BigInteger): Long =
        (BigInteger.TWO * num + den).divide(BigInteger.TWO * den).toLong()

    private class Stub(
        val index: Int,
        val gross: Long?,
        val net: Long?,
        val ytd: Long?,
        val rate: Long?,
        val hoursHundredths: Long?,
        val deductions: List<Long>,
        val frequency: PayFrequency?,
        val frequencyInferred: Boolean,
        val payDate: CivilDate?,
        val periodStart: CivilDate?,
        val periodEnd: CivilDate?,
    ) {
        val reference: CivilDate? get() = periodEnd ?: payDate
    }

    private fun normalize(v: PaystubValues, index: Int, jurisdiction: String): Stub {
        val frequencyGiven = v.payFrequency?.let { PayFrequency.fromWire(it) ?: throw ValidationInputError("unknown pay frequency") }
        v.hoursWorked?.let { if (!it.isFinite() || it < 0) throw ValidationInputError("hours must be finite and non-negative") }
        fun date(t: String?) = t?.let { Dates.parse(it, jurisdiction) }
        val start = date(v.periodStart)
        val end = date(v.periodEnd)
        var frequency = frequencyGiven
        var inferred = false
        if (frequency == null && start != null && end != null) {
            frequency = PayFrequency.forLength(end.dayNumber - start.dayNumber + 1)
            inferred = frequency != null
        }
        return Stub(
            index = index,
            gross = v.grossPay?.let(::toCents),
            net = v.netPay?.let(::toCents),
            ytd = v.ytdGross?.let(::toCents),
            rate = v.hourlyRate?.let(::toCents),
            hoursHundredths = v.hoursWorked?.let { Math.round(it * 100) },
            deductions = v.deductions.map { toCents(it.amount) },
            frequency = frequency,
            frequencyInferred = inferred,
            payDate = date(v.payDate),
            periodStart = start,
            periodEnd = end,
        )
    }

    /** Elapsed months at a date as the exact fraction ((m − 1)·D + d) / D. */
    private fun elapsed(d: CivilDate): Pair<BigInteger, BigInteger> {
        val days = Dates.daysInMonth(d.year, d.month)
        return BigInteger.valueOf(((d.month - 1) * days + d.day).toLong()) to BigInteger.valueOf(days.toLong())
    }

    private fun big(n: Long) = BigInteger.valueOf(n)

    private fun checkStub(s: Stub, raw: PaystubValues): List<Check> {
        val checks = ArrayList<Check>(CHECK_IDS.size)
        fun add(id: String, status: CheckStatus) = checks.add(Check(id, status))

        if (s.gross != null && s.net != null) {
            val diff = abs(s.gross - s.deductions.sum() - s.net)
            add("net-sum", if (big(diff) * big(100) <= big(s.gross)) CheckStatus.OK else CheckStatus.WARN)
        } else {
            add("net-sum", CheckStatus.SKIPPED)
        }

        if (s.rate != null && s.hoursHundredths != null && s.gross != null) {
            val product = big(s.rate) * big(s.hoursHundredths)
            val gross = big(s.gross) * big(100)
            val diff = (product - gross).abs()
            add("rate-hours", if (diff * big(100) <= gross) CheckStatus.OK else CheckStatus.WARN)
        } else {
            add("rate-hours", CheckStatus.SKIPPED)
        }

        if (s.periodStart != null && s.periodEnd != null) {
            val length = s.periodEnd.dayNumber - s.periodStart.dayNumber + 1
            val status = when {
                length < 1 -> CheckStatus.WARN
                s.frequency == null -> CheckStatus.WARN
                s.frequencyInferred -> CheckStatus.OK
                length in s.frequency.minDays..s.frequency.maxDays -> CheckStatus.OK
                else -> CheckStatus.WARN
            }
            add("period-length", status)
        } else {
            add("period-length", CheckStatus.SKIPPED)
        }

        if (s.payDate != null && s.periodEnd != null) {
            add("pay-date", if (abs(s.payDate.dayNumber - s.periodEnd.dayNumber) <= 31) CheckStatus.OK else CheckStatus.WARN)
        } else {
            add("pay-date", CheckStatus.SKIPPED)
        }

        if (s.ytd != null && s.gross != null) add("ytd-gross", if (s.ytd >= s.gross) CheckStatus.OK else CheckStatus.WARN)
        else add("ytd-gross", CheckStatus.SKIPPED)

        val ref = s.reference
        if (s.ytd != null && s.gross != null && s.gross > 0 && s.frequency != null && ref != null) {
            val (num, den) = elapsed(ref)
            val p = big(s.frequency.periodsPerYear.toLong())
            val twelveDen = big(12) * den
            val n = (p * num + twelveDen - BigInteger.ONE).divide(twelveDen) // ceil(P × E / 12)
            val ytd2 = big(2) * big(s.ytd)
            val gross = big(s.gross)
            add("ytd-periods", if (ytd2 >= n * gross && ytd2 <= big(3) * n * gross) CheckStatus.OK else CheckStatus.WARN)
        } else {
            add("ytd-periods", CheckStatus.SKIPPED)
        }

        val dates = listOf(
            (raw.payDate != null || "payDate" in raw.nullDates) to s.payDate,
            (raw.periodStart != null || "periodStart" in raw.nullDates) to s.periodStart,
            (raw.periodEnd != null || "periodEnd" in raw.nullDates) to s.periodEnd,
        ).filter { it.first }
        add(
            "dates-parsed",
            when {
                dates.isEmpty() -> CheckStatus.SKIPPED
                dates.all { it.second != null } -> CheckStatus.OK
                else -> CheckStatus.WARN
            },
        )
        return checks
    }

    /** Checks every paystub and annualizes the income (SPEC.md sections 5–7). */
    public fun validatePaystubs(values: List<PaystubValues>, jurisdiction: String): ValidationResult {
        val stubs = values.mapIndexed { i, v -> normalize(v, i, jurisdiction) }
        val checks = stubs.mapIndexed { i, s -> checkStub(s, values[i]) }

        val seen = HashSet<String>()
        val duplicates = ArrayList<Int>()
        val unique = stubs.filter { s ->
            val key = listOf(s.periodStart, s.periodEnd, s.payDate).joinToString("|") { it?.iso ?: "-" } + "|" + (s.gross?.toString() ?: "-")
            if (!seen.add(key)) {
                duplicates += s.index
                false
            } else {
                true
            }
        }

        var reference: Stub? = null
        for (s in unique) {
            val day = s.reference?.dayNumber ?: continue
            if (reference == null || day >= reference.reference!!.dayNumber) reference = s
        }

        if (reference != null && reference.ytd != null && reference.ytd > 0) {
            val refDate = reference.reference!!
            val (num, den) = elapsed(refDate)
            if (num >= den) {
                return ValidationResult(
                    checks,
                    duplicates,
                    failure = null,
                    annualization = Annualization(
                        annualIncome = roundRatio(big(reference.ytd) * big(12) * den, big(100) * num),
                        basis = AnnualizationBasis.YearToDate(reference.ytd, refDate.iso, num.toLong(), den.toLong(), listOf(reference.index)),
                    ),
                )
            }
        }

        val withGross = unique.filter { it.gross != null }
        if (withGross.isEmpty()) return ValidationResult(checks, duplicates, "no-gross", null)
        var latest: Stub? = null
        for (s in withGross) {
            val day = s.reference?.dayNumber ?: continue
            if (latest == null || day >= latest.reference!!.dayNumber) latest = s
        }
        val frequency = latest?.frequency ?: withGross.firstOrNull { it.frequency != null }?.frequency
            ?: return ValidationResult(checks, duplicates, "no-frequency", null)
        val used = withGross.filter { it.frequency == frequency || it.frequency == null }
        val total = used.fold(BigInteger.ZERO) { acc, s -> acc + big(s.gross!!) }
        val count = big(used.size.toLong())
        return ValidationResult(
            checks,
            duplicates,
            failure = null,
            annualization = Annualization(
                annualIncome = roundRatio(total * big(frequency.periodsPerYear.toLong()), big(100) * count),
                basis = AnnualizationBasis.Average(roundRatio(total, count), frequency.periodsPerYear, frequency, used.map { it.index }),
            ),
        )
    }
}
