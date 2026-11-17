package app.silhouette.benefits.ai

import app.silhouette.benefits.core.Skeleton
import kotlinx.coroutines.delay
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/** The Remote Config values a model task reads (shared/routing.json `remoteConfigKeys`). */
interface ModelSettings {
    /** `prompt_pointer_extract_v`, or null when unset. */
    val pointerPromptVersion: Int?

    /** `route_ondevice_locales_android`: document languages tried on the device first. */
    val onDeviceLocales: Set<String>
}

/**
 * `document.pointer.extract` with a model (shared/routing.json): `PREFER_ON_DEVICE`, input
 * [Skeleton] only, reason `document-silhouette-only`.
 *
 * - On a device whose model is available, for a document language the device is validated for,
 *   and with Remote Config `prompt_pointer_extract_v` 5 or more, a paystub is read in parts, each
 *   part `ONLY_ON_DEVICE`, every answer checked by deterministic code (DEVICE_READING.md). A reading
 *   that holds up is used and nothing is sent; one that does not is a failed on-device attempt.
 * - With an older prompt version the device is asked once (`PREFER_ON_DEVICE`); a busy or
 *   over-quota device model is retried after a growing delay.
 * - A failed on-device attempt is repeated once with `ONLY_IN_CLOUD` and reason `on-device-failed`
 *   (`onDeviceFailure`), only when the person chose to send. When the person kept everything on the
 *   device, nothing is sent and [OnDeviceUnreliable] is raised instead.
 * - Without a device model, or for another language, the silhouette goes to the cloud directly.
 *
 * The answer is returned as untrusted pointer JSON; the Rehydrator validates every reference.
 */
class ModelPointerExtractor(
    private val port: ModelPort,
    private val builder: PointerRequestBuilder,
    private val settings: ModelSettings,
    /** True when a request can be made at all: a network connection, or an on-device model. */
    private val reachable: () -> Boolean,
    private val backoff: suspend (attempt: Int) -> Unit = { attempt -> delay(BASE_DELAY_MS shl attempt) },
    /** Runs once before the first request (fetching Remote Config), so settings are current. */
    private val beforeFirstRequest: suspend () -> Unit = {},
    /** The reading in parts on this device, or null where no device model is configured. */
    private val deviceReading: DeviceReadingTask? = null,
    /** True when the device model reports `available`. */
    private val deviceAvailable: () -> Boolean = { false },
    /** Records an answer written on this device (kept, never sent) in the outbound log. */
    private val onAnsweredOnDevice: (fields: List<String>) -> Unit = {},
) : PointerExtractor {
    private var prepared = false

    override val destination: String get() = app.silhouette.benefits.ai.firebase.FirebaseModelPort.HOST

    override fun canRead(skeleton: Skeleton, language: String): Boolean = reachable()

    /** Whether this document language is tried on the device first. */
    fun prefersDevice(language: String): Boolean = language in settings.onDeviceLocales

    override suspend fun extract(request: PointerRequest, options: ExtractOptions): PointerResult {
        if (!prepared) {
            prepared = true
            runCatching { beforeFirstRequest() }
        }
        val version = builder.resolve(settings.pointerPromptVersion)
        val deviceLanguage = request.language in settings.onDeviceLocales
        val available = deviceAvailable()
        val inParts = deviceReading != null && version >= PointerPrompts.READS_IN_PARTS_FROM && deviceReading.readsInParts(request.docType)
        if (options.deviceOnly && !(available && deviceLanguage && inParts && options.document != null)) throw DeviceReadingUnavailable()
        if (available && deviceLanguage && inParts && options.document != null) {
            val attempt = deviceReading!!.read(request, options.document, options.jurisdiction, options.onStage)
            when (val outcome = attempt.outcome) {
                is app.silhouette.benefits.core.DeviceOutcome.OnDevice -> {
                    onAnsweredOnDevice(listOf("document-silhouette"))
                    return PointerResult(outcome.value, InferenceSource.ON_DEVICE, RoutingReason.DOCUMENT_SILHOUETTE_ONLY.key, outcome.notRead, deviceAttempt = attempt)
                }
                is app.silhouette.benefits.core.DeviceOutcome.Failed -> {
                    if (options.deviceOnly) throw OnDeviceUnreliable(attempt)
                    options.onStage(ReadingStage.SENDING_AFTER_DEVICE)
                    val reply = try {
                        cloud(request, version, RoutingReason.ON_DEVICE_FAILED)
                    } catch (failure: ModelFailure) {
                        throw CloudRetryFailed(attempt, failure)
                    }
                    return PointerResult(reply.pointers, reply.inferenceSource, reply.reason, deviceAttempt = attempt)
                }
            }
        }
        if (deviceLanguage && available) {
            options.onStage(ReadingStage.DEVICE_READING)
            val first = tryPreferOnDevice(request, version)
            if (first != null) return first
            options.onStage(ReadingStage.SENDING_AFTER_DEVICE)
            return cloud(request, version, RoutingReason.ON_DEVICE_FAILED)
        }
        // Device-first language, but this phone has no model: the reason chip says so.
        val reply = cloud(request, version, RoutingReason.DOCUMENT_SILHOUETTE_ONLY)
        return PointerResult(reply.pointers, reply.inferenceSource, reply.reason, noDeviceModel = deviceLanguage && !available)
    }

    /** The PREFER_ON_DEVICE attempt. Returns null when it failed on the device and the cloud retry applies. */
    private suspend fun tryPreferOnDevice(request: PointerRequest, version: Int?): PointerResult? {
        val call = builder.build(request, CallMode.PREFER_ON_DEVICE, version)
        var attempt = 0
        while (true) {
            val reply = try {
                port.generate(call)
            } catch (failure: ModelFailure) {
                when (failure.kind) {
                    FailureKind.DEVICE_BUSY, FailureKind.DEVICE_QUOTA -> if (attempt < MAX_DEVICE_RETRIES) {
                        backoff(attempt++)
                        continue
                    } else {
                        return null
                    }
                    FailureKind.DEVICE_FAILED -> return null
                    FailureKind.CLOUD -> throw failure
                }
            }
            val pointers = parse(reply.text)
            if (pointers != null) {
                if (reply.source == InferenceSource.ON_DEVICE) onAnsweredOnDevice(listOf("document-silhouette"))
                return PointerResult(pointers, reply.source, RoutingReason.DOCUMENT_SILHOUETTE_ONLY.key)
            }
            // An unusable answer from the device counts as an on-device failure; from the cloud it is final.
            if (reply.source == InferenceSource.ON_DEVICE) return null
            throw ModelFailure(FailureKind.CLOUD, "bad-output")
        }
    }

    private suspend fun cloud(request: PointerRequest, version: Int?, reason: RoutingReason): PointerResult {
        val reply = port.generate(builder.build(request, CallMode.ONLY_IN_CLOUD, version))
        val pointers = parse(reply.text) ?: throw ModelFailure(FailureKind.CLOUD, "bad-output")
        return PointerResult(pointers, InferenceSource.IN_CLOUD, reason.key)
    }

    companion object {
        const val MAX_DEVICE_RETRIES: Int = 2
        const val BASE_DELAY_MS: Long = 1_000

        /** The answer as a JSON object, or null. Model output holds placeholder ids only, never document values. */
        fun parse(text: String): JsonObject? = runCatching { Json.parseToJsonElement(text.trim()) as? JsonObject }.getOrNull()
            ?.let { o -> JsonObject(o.filterValues { it !is kotlinx.serialization.json.JsonNull }) }
    }
}
