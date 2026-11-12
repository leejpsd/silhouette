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
 * - A busy or over-quota on-device model is retried after a growing delay.
 * - If the on-device attempt still fails (an error, or an answer that is not a JSON object), the
 *   task is retried once with `ONLY_IN_CLOUD` and reason `on-device-failed` (`onDeviceFailure`).
 *   Its input is a Skeleton, so the retry sends nothing the first attempt could not have sent.
 * - A document language the device model is not validated for goes to the cloud directly.
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
) : PointerExtractor {
    private var prepared = false

    override val destination: String get() = app.silhouette.benefits.ai.firebase.FirebaseModelPort.HOST

    override fun canRead(skeleton: Skeleton, language: String): Boolean = reachable()

    /** Whether this document language is tried on the device first. */
    fun prefersDevice(language: String): Boolean = language in settings.onDeviceLocales

    override suspend fun extract(request: PointerRequest): PointerResult {
        if (!prepared) {
            prepared = true
            runCatching { beforeFirstRequest() }
        }
        val version = settings.pointerPromptVersion
        if (request.language in settings.onDeviceLocales) {
            val first = tryPreferOnDevice(request, version)
            if (first != null) return first
            return cloud(request, version, RoutingReason.ON_DEVICE_FAILED)
        }
        return cloud(request, version, RoutingReason.DOCUMENT_SILHOUETTE_ONLY)
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
            if (pointers != null) return PointerResult(pointers, reply.source, RoutingReason.DOCUMENT_SILHOUETTE_ONLY.key)
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
    }
}
