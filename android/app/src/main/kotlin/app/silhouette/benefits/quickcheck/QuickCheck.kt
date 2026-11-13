package app.silhouette.benefits.quickcheck

import app.silhouette.benefits.core.Bands
import app.silhouette.benefits.core.IncomeBand
import app.silhouette.benefits.core.ProgramVerdict
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.RulePack
import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.core.parseTypedAmount
import app.silhouette.benefits.core.typedAmountHasTooManyDecimals
import app.silhouette.benefits.core.verdicts
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.doubleOrNull

// Quick Check model: pure logic, no Android dependencies. One question per screen. Every question
// can be skipped; a skipped answer is null and the verdict engine reports it as `depends`.

/** The reserved step id for income (shared/rulepacks/SPEC.md section 2, `questionOrder`). */
const val INCOME_STEP: String = "income"

/** Upper bound for a typed yearly income. */
const val MAX_EXACT_INCOME: Double = 100_000_000.0

/** One screen of the Quick Check. */
sealed interface Step {
    val id: String
    val sensitive: Boolean

    data class Income(val bands: List<IncomeBand>) : Step {
        override val id: String get() = INCOME_STEP
        override val sensitive: Boolean get() = false
    }

    data class IntQuestion(override val id: String, override val sensitive: Boolean, val min: Int, val max: Int) : Step

    data class EnumQuestion(override val id: String, override val sensitive: Boolean, val values: List<String>) : Step

    data class MultiQuestion(override val id: String, override val sensitive: Boolean, val values: List<String>) : Step

    data class BoolQuestion(override val id: String, override val sensitive: Boolean) : Step
}

/** An answer to one step. */
sealed interface AnswerValue {
    data class Count(val value: Int) : AnswerValue

    data class Choice(val value: String) : AnswerValue

    data class Flag(val value: Boolean) : AnswerValue

    /** Zero picks is the answer "none of these", which is different from skipping. */
    data class Picks(val values: List<String>) : AnswerValue

    data class IncomeBandChoice(val bandId: String) : AnswerValue

    /** A yearly amount, typed by the user or worked out from a paystub ([fromDocument]). */
    data class ExactIncome(val amount: Double, val fromDocument: Boolean = false) : AnswerValue
}

/** Why an answer was rejected. Each maps to a copy key. */
enum class AnswerError(val copyKey: String) {
    INTEGER("q.error.integer"),
    CHOOSE("q.error.choose"),
    AMOUNT("q.error.amount"),

    /** A typed amount with three or more digits after the dot (`60.000`). */
    AMOUNT_DECIMALS("q.error.amountDecimals"),
}

/**
 * The user's answers by step id. A step that is absent has not been asked yet; a step mapped to
 * null was skipped.
 *
 * These are exact personal values (Raw in shared/DATA_TYPES.md terms). The type is not
 * CloudSafe, so it cannot be passed to a cloud-capable call; it is handed to the verdict engine
 * wrapped in Raw ([computeVerdicts]) and saved only through the encrypted store. Its string form
 * never shows the values.
 */
class QuickCheckAnswers(entries: Map<String, AnswerValue?> = emptyMap()) {
    private val entries: Map<String, AnswerValue?> = LinkedHashMap(entries)

    val size: Int get() = entries.size

    fun isEmpty(): Boolean = entries.isEmpty()

    fun hasEntry(stepId: String): Boolean = entries.containsKey(stepId)

    operator fun get(stepId: String): AnswerValue? = entries[stepId]

    fun with(stepId: String, value: AnswerValue?): QuickCheckAnswers =
        QuickCheckAnswers(LinkedHashMap(entries).apply { put(stepId, value) })

    internal fun entries(): Map<String, AnswerValue?> = entries

    override fun toString(): String = "QuickCheckAnswers(${entries.size} entries, values redacted)"

    override fun equals(other: Any?): Boolean = other is QuickCheckAnswers && other.entries == entries

    override fun hashCode(): Int = entries.hashCode()
}

/**
 * Steps in the pack's `questionOrder`, or by default the reserved "income" step first, then the
 * questions in pack order. Throws IllegalArgumentException when the pack cannot be asked.
 */
fun buildSteps(pack: RulePack, bands: Bands): List<Step> {
    val byId = LinkedHashMap<String, Step>()
    for (q in pack.questions) {
        byId[q.id] = when (q.type) {
            "int" -> Step.IntQuestion(
                q.id,
                q.sensitive,
                q.min ?: throw IllegalArgumentException("int question without min: ${q.id}"),
                q.max ?: throw IllegalArgumentException("int question without max: ${q.id}"),
            )
            "enum" -> Step.EnumQuestion(q.id, q.sensitive, q.values)
            "multi" -> Step.MultiQuestion(q.id, q.sensitive, q.values)
            "bool" -> Step.BoolQuestion(q.id, q.sensitive)
            else -> throw IllegalArgumentException("unsupported question type: ${q.type}")
        }
    }
    byId[INCOME_STEP] = Step.Income(bands.annualIncome)
    val order = pack.questionOrder ?: (listOf(INCOME_STEP) + pack.questions.map { it.id })
    require(order.toSet().size == order.size && order.size == byId.size) { "questionOrder must list every question once" }
    return order.map { byId[it] ?: throw IllegalArgumentException("questionOrder names an unknown step: $it") }
}

/** Checks one answer against its step. Returns null when it is valid. */
fun validateAnswer(step: Step, value: AnswerValue): AnswerError? = when (step) {
    is Step.IntQuestion ->
        if (value is AnswerValue.Count && value.value in step.min..step.max) null else AnswerError.INTEGER
    is Step.EnumQuestion ->
        if (value is AnswerValue.Choice && value.value in step.values) null else AnswerError.CHOOSE
    is Step.MultiQuestion ->
        if (value is AnswerValue.Picks && value.values.all { it in step.values } && value.values.toSet().size == value.values.size) {
            null
        } else {
            AnswerError.CHOOSE
        }
    is Step.BoolQuestion -> if (value is AnswerValue.Flag) null else AnswerError.CHOOSE
    is Step.Income -> when (value) {
        is AnswerValue.IncomeBandChoice -> if (step.bands.any { it.id == value.bandId }) null else AnswerError.CHOOSE
        is AnswerValue.ExactIncome -> if (value.amount.isFinite() && value.amount in 0.0..MAX_EXACT_INCOME) null else AnswerError.AMOUNT
        else -> AnswerError.CHOOSE
    }
}

/** Converts Quick Check answers to verdict-engine answers (shared/rulepacks/SPEC.md section 4). */
internal fun toEngineAnswers(steps: List<Step>, answers: QuickCheckAnswers): JsonObject {
    val out = LinkedHashMap<String, JsonElement>()
    for (step in steps) {
        val value = answers[step.id] ?: continue
        if (validateAnswer(step, value) != null) continue
        when (value) {
            is AnswerValue.IncomeBandChoice -> out["incomeBand"] = JsonPrimitive(value.bandId)
            is AnswerValue.ExactIncome -> out["annualIncome"] = jsonAmount(value.amount)
            else -> out[step.id] = encodeValue(value)
        }
    }
    return JsonObject(out)
}

/** Runs the verdict engine. The answers are wrapped in Raw at this boundary. */
fun computeVerdicts(pack: RulePack, bands: Bands, steps: List<Step>, answers: QuickCheckAnswers): List<ProgramVerdict> =
    verdicts(pack, bands, Raw.of(toEngineAnswers(steps, answers)))

/** The step a verdict-engine variable comes from (`annualIncome` comes from the income step). */
fun stepForVariable(variable: String): String = if (variable == "annualIncome") INCOME_STEP else variable

val VERDICT_ORDER: List<Verdict> = listOf(Verdict.LIKELY, Verdict.MAYBE, Verdict.DEPENDS, Verdict.UNLIKELY)

/** Programs grouped by verdict in display order; empty groups are left out. */
fun groupByVerdict(results: List<ProgramVerdict>): List<Pair<Verdict, List<ProgramVerdict>>> =
    VERDICT_ORDER.map { v -> v to results.filter { it.verdict == v } }.filter { it.second.isNotEmpty() }

/** Index of the first step without an entry (answered or skipped), or steps.size when done. */
fun firstOpenStep(steps: List<Step>, answers: QuickCheckAnswers): Int =
    steps.indexOfFirst { !answers.hasEntry(it.id) }.let { if (it == -1) steps.size else it }

// ---------- Drafts: what the user has typed or picked before submitting ----------

/** Form state of a question screen before validation. */
data class Draft(val text: String = "", val choice: String = "", val picked: List<String> = emptyList())

/** The draft choice value for "I know the exact amount" on the income step. */
const val EXACT_CHOICE: String = "exact"

fun initialDraft(step: Step, value: AnswerValue?): Draft = when (value) {
    null -> Draft()
    is AnswerValue.IncomeBandChoice -> Draft(choice = value.bandId)
    is AnswerValue.ExactIncome -> Draft(text = plainAmount(value.amount), choice = EXACT_CHOICE)
    is AnswerValue.Picks -> Draft(picked = value.values)
    is AnswerValue.Count -> Draft(text = value.value.toString())
    is AnswerValue.Choice -> Draft(choice = value.value)
    is AnswerValue.Flag -> Draft(choice = value.value.toString())
}

private val DIGITS = Regex("^[0-9]+$")

/** An amount as plain digits for editing: `28000.5`, `32000`. */
fun plainAmount(amount: Double): String =
    java.math.BigDecimal(amount.toString()).stripTrailingZeros().toPlainString()

/**
 * Reads a typed yearly amount: spaces and one leading currency symbol are removed, then only the
 * number format of shared/skeleton/SPEC.md section 5 is accepted (`28,000.50`, `28000.5`).
 * `28.000,50` and anything else is rejected rather than guessed, so a decimal point can never
 * turn into a hundredfold amount. Returns null when the text is not an amount.
 */
fun parseIncomeAmount(text: String): Double? = parseTypedAmount(text)

/** The error for a typed yearly amount that was refused: the decimals rule gets its own message. */
fun incomeAmountError(text: String): AnswerError =
    if (typedAmountHasTooManyDecimals(text)) AnswerError.AMOUNT_DECIMALS else AnswerError.AMOUNT

/**
 * Turns a draft into an answer. Returns null when nothing was chosen. A value that does not parse
 * is still returned (as an out-of-range value) so that validation reports the right error.
 */
fun draftToValue(step: Step, draft: Draft): AnswerValue? = when (step) {
    is Step.IntQuestion -> {
        val text = draft.text.trim()
        when {
            text.isEmpty() -> null
            DIGITS.matches(text) -> AnswerValue.Count(text.toBigInteger().min(Int.MAX_VALUE.toBigInteger()).toInt())
            else -> AnswerValue.Count(Int.MIN_VALUE)
        }
    }
    is Step.EnumQuestion -> draft.choice.takeIf { it.isNotEmpty() }?.let { AnswerValue.Choice(it) }
    // Submitting with nothing ticked is the answer "none of these", not a skip.
    is Step.MultiQuestion -> AnswerValue.Picks(step.values.filter { it in draft.picked })
    is Step.BoolQuestion -> when (draft.choice) {
        "true" -> AnswerValue.Flag(true)
        "false" -> AnswerValue.Flag(false)
        else -> null
    }
    is Step.Income -> when (draft.choice) {
        "" -> null
        // Text that is not an amount becomes an invalid value, so validation reports the format.
        EXACT_CHOICE -> AnswerValue.ExactIncome(parseIncomeAmount(draft.text) ?: Double.NaN)
        else -> AnswerValue.IncomeBandChoice(draft.choice)
    }
}

/** The stepper's next value: from the current text, or [Step.IntQuestion.min] when it does not parse. */
fun stepCount(step: Step.IntQuestion, text: String, delta: Int): String {
    val n = text.trim().toIntOrNull() ?: return step.min.toString()
    return (n + delta).coerceIn(step.min, step.max).toString()
}

// ---------- Storage format ----------

/** A whole amount as a JSON integer (`32000`), anything else as a decimal (`28000.5`). */
private fun jsonAmount(amount: Double): JsonPrimitive =
    if (amount == Math.floor(amount) && kotlin.math.abs(amount) < 9.0E15) JsonPrimitive(amount.toLong()) else JsonPrimitive(amount)

private fun encodeValue(value: AnswerValue): JsonElement = when (value) {
    is AnswerValue.Count -> JsonPrimitive(value.value)
    is AnswerValue.Choice -> JsonPrimitive(value.value)
    is AnswerValue.Flag -> JsonPrimitive(value.value)
    is AnswerValue.Picks -> JsonArray(value.values.map { JsonPrimitive(it) })
    is AnswerValue.IncomeBandChoice -> JsonObject(mapOf("band" to JsonPrimitive(value.bandId)))
    is AnswerValue.ExactIncome -> JsonObject(
        if (value.fromDocument) mapOf("exact" to jsonAmount(value.amount), "fromDocument" to JsonPrimitive(true)) else mapOf("exact" to jsonAmount(value.amount)),
    )
}

/** The answers as JSON for the encrypted store. Skipped steps are JSON null. */
fun encodeAnswers(answers: QuickCheckAnswers): JsonObject =
    JsonObject(answers.entries().mapValues { (_, v) -> if (v == null) JsonNull else encodeValue(v) })

/**
 * Reads stored answers. Entries that do not belong to a step or no longer validate are dropped, so a
 * pack update never crashes the app or feeds the engine a stale value.
 */
fun decodeAnswers(steps: List<Step>, json: JsonElement?): QuickCheckAnswers {
    val obj = json as? JsonObject ?: return QuickCheckAnswers()
    val out = LinkedHashMap<String, AnswerValue?>()
    for (step in steps) {
        val element = obj[step.id] ?: continue
        if (element is JsonNull) {
            out[step.id] = null
            continue
        }
        val value = decodeValue(step, element) ?: continue
        if (validateAnswer(step, value) == null) out[step.id] = value
    }
    return QuickCheckAnswers(out)
}

private fun decodeValue(step: Step, element: JsonElement): AnswerValue? {
    val primitive = element as? JsonPrimitive
    return when (step) {
        is Step.IntQuestion -> primitive?.takeIf { !it.isString }?.intOrNull?.let { AnswerValue.Count(it) }
        is Step.EnumQuestion -> primitive?.takeIf { it.isString }?.content?.let { AnswerValue.Choice(it) }
        is Step.BoolQuestion -> primitive?.takeIf { !it.isString }?.booleanOrNull?.let { AnswerValue.Flag(it) }
        is Step.MultiQuestion -> (element as? JsonArray)?.let { array ->
            val values = array.map { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content ?: return null }
            AnswerValue.Picks(values)
        }
        is Step.Income -> {
            val obj = element as? JsonObject ?: return null
            val band = (obj["band"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            val exact = (obj["exact"] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
            val fromDocument = (obj["fromDocument"] as? JsonPrimitive)?.booleanOrNull == true
            when {
                band != null -> AnswerValue.IncomeBandChoice(band)
                exact != null -> AnswerValue.ExactIncome(exact, fromDocument)
                else -> null
            }
        }
    }
}
