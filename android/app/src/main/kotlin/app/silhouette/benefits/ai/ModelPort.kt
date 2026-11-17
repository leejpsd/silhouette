package app.silhouette.benefits.ai

import app.silhouette.benefits.core.CloudSafe

// The narrow interface the tasks use to reach a model, so unit tests replace Firebase AI Logic with
// fakes at this boundary. Production: FirebaseModelPort, wrapped in LoggedModelPort so that every
// request is recorded in the outbound log before it is made.

/** Where a call may run (shared/routing.json `mode`). */
enum class CallMode { PREFER_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD, ONLY_ON_DEVICE }

/**
 * One cloud-capable model call (shared/DATA_TYPES.md). Its text is [CloudText], which can only be
 * made from bundled prompts and cloud-safe values, and [payload] — the content the outbound log
 * records — is [CloudSafe]: a Raw value cannot be put into either. [fields] names what the request
 * carries, for the outbound log (never values). [schema] constrains a structured cloud answer.
 */
class ModelCall(
    val task: String,
    val mode: CallMode,
    val system: CloudText,
    val user: CloudText,
    val payload: CloudSafe,
    val schema: SchemaNode?,
    val maxOutputTokens: Int,
    val fields: List<String> = listOf("document-silhouette"),
    /**
     * The device attempt of a `PREFER_ON_DEVICE` call: run with `ONLY_ON_DEVICE`, so the SDK cannot
     * fall back to the cloud by itself; the app decides about the cloud (and App Check) on its own.
     */
    val deviceAttempt: Boolean = false,
) {
    init {
        require(mode != CallMode.ONLY_ON_DEVICE) { "an on-device-only task does not use ModelCall" }
        require(!deviceAttempt || mode == CallMode.PREFER_ON_DEVICE) { "only a device-first call has a device attempt" }
    }

    /** The same request with another mode (the cloud retry of `onDeviceFailure`). */
    fun withMode(next: CallMode): ModelCall = ModelCall(task, next, system, user, payload, schema, maxOutputTokens, fields)

    /** This device-first call's attempt on the device only. */
    fun onDeviceAttempt(): ModelCall = ModelCall(task, mode, system, user, payload, schema, maxOutputTokens, fields, deviceAttempt = true)
}

/** A model's answer text and where it ran. */
class ModelReply(val text: String, val source: InferenceSource, val model: String?)

interface ModelPort {
    suspend fun generate(call: ModelCall): ModelReply
}

/** Why a call failed, without any user value. */
enum class FailureKind {
    /** The on-device model is busy; retry after a delay. */
    DEVICE_BUSY,

    /** The app used up the device model's battery quota for now. */
    DEVICE_QUOTA,

    /** The on-device model is missing or failed. */
    DEVICE_FAILED,

    /** A network or service error in the cloud. */
    CLOUD,
}

/** A failed model call, classified. [reason] is a short code for the outbound log. */
class ModelFailure(val kind: FailureKind, val reason: String, cause: Throwable? = null) : Exception(reason, cause)

/**
 * Runs [prepare] (fetching Remote Config) once, after the first request that went to the cloud
 * (shared/RECORD.md section 1): device-only work never triggers it.
 */
class PreparedModelPort(private val inner: ModelPort, private val prepare: suspend () -> Unit) : ModelPort {
    private var prepared = false

    override suspend fun generate(call: ModelCall): ModelReply {
        val reply = inner.generate(call)
        if (!prepared && reply.source == InferenceSource.IN_CLOUD) {
            prepared = true
            runCatching { prepare() }
        }
        return reply
    }
}
