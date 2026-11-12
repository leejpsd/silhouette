package app.silhouette.benefits.ai

import app.silhouette.benefits.ai.firebase.FirebaseModelPort

/**
 * Sorts an exception from the model SDK into a [FailureKind] without looking at any user value.
 *
 * On-device errors arrive as `FirebaseAIOnDevice…Exception`; the device model's own error code
 * (busy = 9, battery quota = 27) sits on a `GenAiException` in the cause chain and is read through
 * its public `getErrorCode()` so that no on-device library type is compiled into the app.
 */
object FailureClassifier {
    const val CODE_BUSY: Int = 9
    const val CODE_BATTERY_QUOTA: Int = 27

    fun classify(error: Throwable): ModelFailure {
        if (error is ModelFailure) return error
        val chain = generateSequence(error) { it.cause }.take(10).toList()
        val onDevice = chain.any { it.javaClass.simpleName.startsWith("FirebaseAIOnDevice") || it.javaClass.simpleName == "GenAiException" }
        if (onDevice) {
            val code = chain.firstNotNullOfOrNull { errorCode(it) }
            return when (code) {
                CODE_BUSY -> ModelFailure(FailureKind.DEVICE_BUSY, "device-busy", error)
                CODE_BATTERY_QUOTA -> ModelFailure(FailureKind.DEVICE_QUOTA, "device-battery-quota", error)
                else -> ModelFailure(FailureKind.DEVICE_FAILED, "device-${code ?: error.javaClass.simpleName}", error)
            }
        }
        return ModelFailure(FailureKind.CLOUD, error.javaClass.simpleName.ifEmpty { "error" }, error)
    }

    private fun errorCode(t: Throwable): Int? {
        if (t.javaClass.simpleName != "GenAiException") return null
        return runCatching { t.javaClass.getMethod("getErrorCode").invoke(t) as Int }.getOrNull()
    }
}

/** Records every model request in the outbound log before it is made, then what happened to it. */
class LoggedModelPort(private val inner: ModelPort, private val log: app.silhouette.benefits.data.OutboundLog, private val model: String) : ModelPort {
    override suspend fun generate(call: ModelCall): ModelReply {
        val id = log.begin(
            channel = app.silhouette.benefits.data.OutboundLog.Channel.AI_CLOUD,
            destination = FirebaseModelPort.HOST,
            fields = listOf("document-silhouette"),
            payload = call.payload,
            path = FirebaseModelPort.pathFor(model),
            model = model,
        )
        return try {
            val reply = inner.generate(call)
            if (reply.source == InferenceSource.ON_DEVICE) {
                log.finish(id, app.silhouette.benefits.data.OutboundLog.Status.KEPT_ON_DEVICE)
            } else {
                log.finish(id, app.silhouette.benefits.data.OutboundLog.Status.SENT, responseStatus = "OK")
            }
            reply
        } catch (e: Exception) {
            val failure = FailureClassifier.classify(e)
            log.finish(id, app.silhouette.benefits.data.OutboundLog.Status.FAILED, failureReason = failure.reason)
            throw failure
        }
    }
}
