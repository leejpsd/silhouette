package app.silhouette.benefits.ai

import app.silhouette.benefits.core.OutputChecks
import app.silhouette.benefits.core.OutputScope
import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.core.modelTextIsBlocked

// The person's own result: `explain.personal` and typed questions (`ask.freeText`), both
// ONLY_ON_DEVICE (shared/routing.json; prompts explain-personal.v1 and ask-personal.v1). Their input
// holds the verdict on screen, exact values and private answers, so it is Raw in shared/DATA_TYPES.md
// terms. It is carried by [PersonalRequest], which is not CloudSafe and not CloudText: it cannot be
// put into a ModelCall, and only [OnDeviceText] accepts it.

/** The person's result for the on-device prompts. Raw: never logged, never sent. */
class PersonalResult(
    val locale: String,
    val programName: String,
    /** `{programFacts}` (rulepacks/SPEC.md section 2.1), given as `{programSummaryFromRulePack}`. */
    val facts: String,
    /** The verdict on screen: a reply whose hedge contradicts it is blocked (OUTPUT_CHECKS.md scope `personal`). */
    val verdict: Verdict,
    val verdictLabel: String,
    /** `- {label}: {state}` lines, with ` (limit {limit}, yours {value})` where the rules compare with a limit. */
    val criteriaLines: String,
) {
    override fun toString(): String = "PersonalResult(values redacted)"
}

/** One on-device-only request. Its text is Raw; only [OnDeviceText] takes it. */
class PersonalRequest internal constructor(val task: String, val system: String, val user: String) {
    override fun toString(): String = "PersonalRequest($task, values redacted)"
}

/** A model that runs on this device only (`ONLY_ON_DEVICE`); it never falls back to the cloud. */
interface OnDeviceText {
    suspend fun generate(request: PersonalRequest): String
}

class PersonalAnswer(val text: String, val reason: RoutingReason) {
    val source: InferenceSource get() = InferenceSource.ON_DEVICE
}

class PersonalTasks(private val model: OnDeviceText, private val prompts: Map<String, String>, private val checks: OutputChecks) {

    fun explainRequest(result: PersonalResult): PersonalRequest =
        request(EXPLAIN_PERSONAL, "explain-personal.v1.md", result, null)

    fun askRequest(question: String, result: PersonalResult): PersonalRequest =
        request(ASK_FREE_TEXT, "ask-personal.v1.md", result, question.trim().take(MAX_QUESTION_CHARS))

    private fun request(task: String, file: String, result: PersonalResult, question: String?): PersonalRequest {
        val prompt = PromptTemplate.parse(file, prompts.getValue(file))
        val system = Regex("\\{locale\\}").replace(prompt.system, TextTasks.languageName(result.locale))
        fun user(facts: String): String = prompt.fill(
            buildMap {
                put("programName", result.programName)
                put("programSummaryFromRulePack", facts)
                put("verdictLabel", result.verdictLabel)
                put("criteriaLines", result.criteriaLines)
                put("maxWords", PERSONAL_WORDS.toString())
                if (question != null) put("question", question)
            },
        )
        // The on-device input limit is about 4,000 tokens; the program facts go first if it would not fit.
        val full = user(result.facts)
        val text = if (estimateTokens(system + full) <= MAX_INPUT_TOKENS) full else user("")
        return PersonalRequest(task, system, text)
    }

    suspend fun explain(result: PersonalResult): PersonalAnswer =
        run(explainRequest(result), result, RoutingReason.YOUR_RESULT_STAYS_ON_DEVICE)

    suspend fun ask(question: String, result: PersonalResult): PersonalAnswer =
        run(askRequest(question, result), result, RoutingReason.TYPED_TEXT_MAY_BE_PERSONAL)

    /** One retry when the reply states a result as fact or contradicts the verdict on screen, then refused (scope `personal`). */
    private suspend fun run(request: PersonalRequest, result: PersonalResult, reason: RoutingReason): PersonalAnswer {
        repeat(2) {
            val text = model.generate(request).trim()
            if (!modelTextIsBlocked(text, result.locale, OutputScope.PERSONAL, checks, result.verdict)) return PersonalAnswer(text, reason)
        }
        throw AnswerBlocked()
    }

    companion object {
        const val EXPLAIN_PERSONAL: String = "explain.personal"
        const val ASK_FREE_TEXT: String = "ask.freeText"

        /** On-device output is short (explain-personal.v1.md). */
        const val PERSONAL_WORDS: Int = 80
        const val MAX_INPUT_TOKENS: Int = 4_000
        const val MAX_QUESTION_CHARS: Int = 500

        /** A cautious estimate: about three characters per token across the app's languages. */
        fun estimateTokens(text: String): Int = text.length / 3 + 1
    }
}
