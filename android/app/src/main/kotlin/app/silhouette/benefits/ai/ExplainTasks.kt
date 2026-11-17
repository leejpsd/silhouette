package app.silhouette.benefits.ai

import app.silhouette.benefits.core.OutputChecks
import app.silhouette.benefits.core.OutputScope
import app.silhouette.benefits.core.Public
import app.silhouette.benefits.core.modelTextIsBlocked
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// The general explanation (`explain.short`, `explain.long`) and prepared questions (`ask.chip`):
// cloud-capable tasks given the program's public information only, nothing about the person
// (shared/routing.json input `Public`; prompts explain.v5 and ask.v4).

/** Remote Config values the explanation tasks read. */
interface ExplainSettings {
    /** `route_short_text_max_words`. */
    val shortTextMaxWords: Int

    /** `route_ondevice_locales_android`. */
    val onDeviceLocales: Set<String>
}

/**
 * A program's public information from the rule pack and its copy, in the answer language: its name
 * and `{programFacts}` (shared/rulepacks/SPEC.md section 2.1, one item per line). Static app content.
 */
class ProgramFacts(
    val programId: String,
    val name: Public<String>,
    val facts: Public<String>,
)

/**
 * What a general explanation or a prepared question is given (explain.v5, ask.v4): the program's
 * public information and the answer language. Nothing about the person: no profile, no criterion
 * state, no verdict. The type holds only [Public] values, so nothing else fits.
 */
class ExplainInput(
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
        return plan(task, mode, reason, EXPLAIN_PROMPT, input, route.words, null, route, listOf("program-facts"))
    }

    fun planAskChip(input: ExplainInput, question: Public<String>): TextPlan =
        plan(ASK_CHIP, CallMode.PREFER_ON_DEVICE, RoutingReason.PREPARED_QUESTION, ASK_PROMPT, input, ASK_WORDS, question, null, listOf("program-facts", "prepared-question"))

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
        val values = buildMap<String, app.silhouette.benefits.core.CloudSafe> {
            put("programName", input.program.name)
            put("programFacts", input.program.facts)
            put("maxWords", Public.of(words.toString()))
            if (question != null) put("question", question)
        }
        val call = ModelCall(
            task = task,
            mode = mode,
            system = CloudText.fill(Public.of(prompt.system), mapOf("locale" to Public.of(languageName(input.locale)))),
            user = CloudText.fill(Public.of(prompt.user), values),
            payload = input.program.facts,
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

        /** The bundled prompts: only versions that send nothing about the person (Remote Config `prompt_explain_v` 5, `prompt_ask_v` 4). */
        const val EXPLAIN_PROMPT: String = "explain.v5.md"
        const val ASK_PROMPT: String = "ask.v4.md"

        private val LANGUAGE_NAMES = mapOf("en" to "English", "es" to "Spanish", "ko" to "Korean")

        /** The answer language as the prompts name it. */
        fun languageName(locale: String): String = LANGUAGE_NAMES[locale] ?: "English"
    }
}
