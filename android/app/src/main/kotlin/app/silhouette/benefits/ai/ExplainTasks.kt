package app.silhouette.benefits.ai

import app.silhouette.benefits.core.CriterionState
import app.silhouette.benefits.core.Generalized
import app.silhouette.benefits.core.OutputChecks
import app.silhouette.benefits.core.OutputScope
import app.silhouette.benefits.core.Public
import app.silhouette.benefits.core.SilhouetteVerdict
import app.silhouette.benefits.core.modelTextIsBlocked
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// The general explanation (`explain.short`, `explain.long`) and prepared questions (`ask.chip`):
// cloud-capable tasks that know the profile silhouette and the program's public facts only, never a
// result (shared/rulepacks/SPEC.md section 7, prompts explain.v3 and ask.v2).

/** Remote Config values the explanation tasks read. */
interface ExplainSettings {
    /** `route_short_text_max_words`. */
    val shortTextMaxWords: Int

    /** `route_ondevice_locales_android`. */
    val onDeviceLocales: Set<String>
}

/** Program facts from the rule pack and its copy, in the UI language. Static app content. */
class ProgramFacts(
    val programId: String,
    val name: Public<String>,
    /** What the program checks, its period and caveats, as sentences. */
    val facts: Public<String>,
    /** Criterion labels by criterion id. */
    val criteria: Map<String, Public<String>>,
)

/**
 * What a general explanation or a prepared question is given: the canonical profile silhouette, the
 * criterion states the engine reaches from that silhouette alone, and the program's facts. Never a
 * verdict, exact values or answers to private questions.
 */
class ExplainInput(
    val profile: Generalized<String>,
    val verdicts: Generalized<List<SilhouetteVerdict>>,
    val program: ProgramFacts,
    val locale: String,
)

enum class ExplainLength(val words: Int) { SHORT(60), LONG(180) }

/** Why an explanation runs where it runs: short enough in a device language, too long, or a language the device lacks. */
enum class RouteBasis { SHORT, LONG, LOCALE }

class ExplainRoute(val task: String, val basis: RouteBasis, val words: Int, val maxShortWords: Int, val locale: String)

/** `explain.short` when `words <= route_short_text_max_words && locale in route_ondevice_locales`, else `explain.long`. */
fun explainRoute(words: Int, locale: String, settings: ExplainSettings): ExplainRoute {
    val short = words <= settings.shortTextMaxWords
    val deviceLocale = locale in settings.onDeviceLocales
    return when {
        short && deviceLocale -> ExplainRoute(TextTasks.EXPLAIN_SHORT, RouteBasis.SHORT, words, settings.shortTextMaxWords, locale)
        short -> ExplainRoute(TextTasks.EXPLAIN_LONG, RouteBasis.LOCALE, words, settings.shortTextMaxWords, locale)
        else -> ExplainRoute(TextTasks.EXPLAIN_LONG, RouteBasis.LONG, words, settings.shortTextMaxWords, locale)
    }
}

/**
 * Everything that fixes one text request. It is built once: the step before sending shows
 * [requestBody], and the same [call] is what is sent.
 */
class TextPlan(
    val task: String,
    val reason: RoutingReason,
    val call: ModelCall,
    val route: ExplainRoute?,
    val scope: OutputScope,
    val locale: String,
    val model: String,
) {
    /** Where the request goes first, for consent: a device-first request may be sent only if the device can't answer. */
    val destination: Destination get() = if (call.mode == CallMode.PREFER_ON_DEVICE) Destination.DEVICE_FIRST else Destination.CLOUD

    /**
     * The request as Firebase AI Logic sends it to the cloud (generationConfig, safetySettings,
     * systemInstruction, contents), serialized once from [call].
     */
    val requestBody: String by lazy {
        JsonObject(
            linkedMapOf(
                "generationConfig" to JsonObject(mapOf("maxOutputTokens" to JsonPrimitive(call.maxOutputTokens))),
                "safetySettings" to JsonArray(emptyList()),
                "systemInstruction" to JsonObject(
                    linkedMapOf("role" to JsonPrimitive("system"), "parts" to JsonArray(listOf(JsonObject(mapOf("text" to JsonPrimitive(call.system.text)))))),
                ),
                "contents" to JsonArray(
                    listOf(JsonObject(linkedMapOf("role" to JsonPrimitive("user"), "parts" to JsonArray(listOf(JsonObject(mapOf("text" to JsonPrimitive(call.user.text)))))))),
                ),
            ),
        ).toString()
    }
}

enum class Destination { DEVICE_FIRST, CLOUD }

/** A model answer shown on screen, with its provenance. */
class TextAnswer(
    val text: String,
    val source: InferenceSource,
    val reason: RoutingReason,
    val route: ExplainRoute?,
    /** A device-first request ran in the cloud because this device has no model (`reason.detail.noDeviceModel`). */
    val noDeviceModel: Boolean = false,
)

/** The reply stated a result twice (shared/prompts/OUTPUT_CHECKS.md). */
class AnswerBlocked : Exception("the reply stated a result twice")

/**
 * Plans and runs the general explanation and prepared questions. A PREFER_ON_DEVICE request that
 * fails on the device is repeated once with ONLY_IN_CLOUD (`onDeviceFailure`); its text is the same
 * CloudText, so nothing new is sent. A reply that states a result is asked for once more, then
 * refused.
 */
class TextTasks(
    private val port: ModelPort,
    private val prompts: Map<String, String>,
    private val checks: OutputChecks,
    private val settings: ExplainSettings,
    /** True when the on-device model is available (for `reason.detail.noDeviceModel`). */
    private val deviceAvailable: () -> Boolean,
    private val model: String,
) {
    fun planExplain(input: ExplainInput, length: ExplainLength): TextPlan {
        val route = explainRoute(length.words, input.locale, settings)
        val task = route.task
        val mode = if (task == EXPLAIN_SHORT) CallMode.PREFER_ON_DEVICE else CallMode.PREFER_IN_CLOUD
        val reason = if (task == EXPLAIN_SHORT) RoutingReason.SHORT_TEXT else RoutingReason.LONG_OR_UNSUPPORTED_LOCALE
        return plan(task, mode, reason, "explain.v3.md", input, route.words, null, route, listOf("profile-silhouette", "program-facts"))
    }

    fun planAskChip(input: ExplainInput, question: Public<String>): TextPlan =
        plan(ASK_CHIP, CallMode.PREFER_ON_DEVICE, RoutingReason.PREPARED_QUESTION, "ask.v2.md", input, ASK_WORDS, question, null, listOf("profile-silhouette", "program-facts", "prepared-question"))

    private fun plan(
        task: String,
        mode: CallMode,
        reason: RoutingReason,
        promptFile: String,
        input: ExplainInput,
        words: Int,
        question: Public<String>?,
        route: ExplainRoute?,
        fields: List<String>,
    ): TextPlan {
        val prompt = PromptTemplate.parse(promptFile, prompts.getValue(promptFile))
        val verdict = input.verdicts.value.first { it.programId == input.program.programId }
        fun list(states: Set<CriterionState>): Public<String> {
            val labels = verdict.criteria.filter { it.state in states }.map { input.program.criteria[it.id]?.value ?: it.id }
            return Public.of(labels.joinToString("; ").ifEmpty { "none" })
        }
        val values = buildMap<String, app.silhouette.benefits.core.CloudSafe> {
            put("generalizedProfileCanonicalJson", input.profile)
            put("programName", input.program.name)
            put("programSummaryFromRulePack", input.program.facts)
            put("passedCriteriaLabels", list(setOf(CriterionState.PASS)))
            put("failedCriteriaLabels", list(setOf(CriterionState.FAIL)))
            put("unknownCriteriaLabels", list(setOf(CriterionState.UNKNOWN, CriterionState.MIXED)))
            put("maxWords", Public.of(words.toString()))
            if (question != null) put("question", question)
        }
        val call = ModelCall(
            task = task,
            mode = mode,
            system = CloudText.fill(Public.of(prompt.system), mapOf("locale" to Public.of(languageName(input.locale)))),
            user = CloudText.fill(Public.of(prompt.user), values),
            payload = input.profile,
            schema = null,
            // Room for the words asked for, in any of the app's languages.
            maxOutputTokens = maxOf(256, words * 4),
            fields = fields,
        )
        return TextPlan(task, reason, call, route, OutputScope.GENERAL, input.locale, model)
    }

    /** Runs a plan the person agreed to (or that needs no step before sending). */
    suspend fun run(plan: TextPlan): TextAnswer {
        suspend fun once(): TextAnswer = try {
            val reply = port.generate(plan.call)
            val noModel = plan.call.mode == CallMode.PREFER_ON_DEVICE && reply.source == InferenceSource.IN_CLOUD && !deviceAvailable()
            TextAnswer(reply.text.trim(), reply.source, plan.reason, plan.route, noModel)
        } catch (failure: ModelFailure) {
            val onDevice = failure.kind != FailureKind.CLOUD
            if (plan.call.mode != CallMode.PREFER_ON_DEVICE || !onDevice) throw failure
            val reply = port.generate(plan.call.withMode(CallMode.ONLY_IN_CLOUD))
            TextAnswer(reply.text.trim(), reply.source, RoutingReason.ON_DEVICE_FAILED, plan.route)
        }
        return checked(plan.scope, plan.locale) { once() }
    }

    private suspend fun checked(scope: OutputScope, locale: String, run: suspend () -> TextAnswer): TextAnswer {
        val first = run()
        if (!modelTextIsBlocked(first.text, locale, scope, checks)) return first
        val second = run()
        if (!modelTextIsBlocked(second.text, locale, scope, checks)) return second
        throw AnswerBlocked()
    }

    companion object {
        const val EXPLAIN_SHORT: String = "explain.short"
        const val EXPLAIN_LONG: String = "explain.long"
        const val ASK_CHIP: String = "ask.chip"
        const val ASK_WORDS: Int = 80

        private val LANGUAGE_NAMES = mapOf("en" to "English", "es" to "Spanish", "ko" to "Korean")

        /** The answer language as the prompts name it. */
        fun languageName(locale: String): String = LANGUAGE_NAMES[locale] ?: "English"
    }
}
