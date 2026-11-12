package app.silhouette.benefits.ai

import app.silhouette.benefits.core.Skeleton

// The narrow interface the tasks use to reach a model, so unit tests replace Firebase AI Logic with
// fakes at this boundary. Production: FirebaseModelPort, wrapped in LoggedModelPort so that every
// request is recorded in the outbound log before it is made.

/** Where a call may run (shared/routing.json `mode`). */
enum class CallMode { PREFER_ON_DEVICE, ONLY_IN_CLOUD, ONLY_ON_DEVICE }

/**
 * One cloud-capable model call. The only document content it carries is [payload], a [Skeleton]:
 * a Raw value cannot be put here (shared/DATA_TYPES.md). [user] is built from the payload by
 * [PointerRequestBuilder]; [schema] constrains the cloud answer.
 */
class ModelCall(
    val task: String,
    val mode: CallMode,
    val system: String,
    val user: String,
    val payload: Skeleton,
    val schema: SchemaNode?,
    val maxOutputTokens: Int,
) {
    init {
        require(mode != CallMode.ONLY_ON_DEVICE) { "an on-device-only task does not use ModelCall" }
    }
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
