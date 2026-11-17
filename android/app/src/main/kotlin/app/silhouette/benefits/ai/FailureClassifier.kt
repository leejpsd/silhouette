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
        // The free daily limit does not recover in a minute; it gets its own reason (error.quotaDaily).
        val daily = chain.any { it.javaClass.simpleName.contains("Quota") && Regex("per.?day|daily", RegexOption.IGNORE_CASE).containsMatchIn(it.message.orEmpty()) }
        if (daily) return ModelFailure(FailureKind.CLOUD, "quota-daily", error)
        return ModelFailure(FailureKind.CLOUD, error.javaClass.simpleName.ifEmpty { "error" }, error)
    }

    private fun errorCode(t: Throwable): Int? {
        if (t.javaClass.simpleName != "GenAiException") return null
        return runCatching { t.javaClass.getMethod("getErrorCode").invoke(t) as Int }.getOrNull()
    }
}

/**
 * Admits a cloud request (shared/RECORD.md section 1): App Check starts only here, when a cloud
 * request is about to be sent, and a request is made only with a limited-use App Check token.
 * Returns false when no token could be obtained.
 */
fun interface CloudGate {
    suspend fun admit(): Boolean

    companion object {
        /** For builds and tests without App Check. */
        val OPEN: CloudGate = CloudGate { true }
    }
}

/**
 * The one path to Firebase AI Logic for cloud-capable tasks, and its record:
 * - A device-first call on a device whose model is available runs on the device only. Its answer is
 *   recorded as answered on this device (kept, no host, no body); a failure is a device failure for
 *   the caller to retry in the cloud (`onDeviceFailure`). Nothing goes on the network.
 * - Any other call goes to the cloud: first [gate] (App Check), then the request is recorded before
 *   it is made (attempted), then with what happened (sent, or failed with its reason). Without an App
 *   Check token the request is not made and is recorded as stopped (`no-app-check`).
 */
class LoggedModelPort(
    private val inner: ModelPort,
    private val log: app.silhouette.benefits.data.OutboundLog,
    private val model: String,
    private val gate: CloudGate = CloudGate.OPEN,
    private val deviceAvailable: () -> Boolean = { false },
) : ModelPort {
    override suspend fun generate(call: ModelCall): ModelReply {
        if (call.mode == CallMode.PREFER_ON_DEVICE && deviceAvailable()) {
            val reply = try {
                inner.generate(call.onDeviceAttempt())
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                val failure = FailureClassifier.classify(e)
                throw if (failure.kind == FailureKind.CLOUD) ModelFailure(FailureKind.DEVICE_FAILED, failure.reason, e) else failure
            }
            if (reply.source != InferenceSource.ON_DEVICE) throw ModelFailure(FailureKind.DEVICE_FAILED, "not-on-device")
            log.recordAnswered(call.fields)
            return reply
        }
        val cloudCall = if (call.mode == CallMode.PREFER_ON_DEVICE) call.withMode(CallMode.ONLY_IN_CLOUD) else call
        val path = FirebaseModelPort.pathFor(model)
        if (!gate.admit()) {
            log.recordBlocked(app.silhouette.benefits.data.OutboundLog.Channel.AI_CLOUD, FirebaseModelPort.HOST, call.fields, app.silhouette.benefits.data.OutboundLog.NO_APP_CHECK, path, model)
            throw ModelFailure(FailureKind.CLOUD, NO_APP_CHECK)
        }
        val id = log.begin(
            channel = app.silhouette.benefits.data.OutboundLog.Channel.AI_CLOUD,
            destination = FirebaseModelPort.HOST,
            fields = call.fields,
            payload = call.payload,
            path = path,
            model = model,
        )
        return try {
            val reply = inner.generate(cloudCall)
            log.finish(id, app.silhouette.benefits.data.OutboundLog.Status.SENT, responseStatus = "OK")
            reply
        } catch (e: kotlinx.coroutines.CancellationException) {
            log.finish(id, app.silhouette.benefits.data.OutboundLog.Status.FAILED, failureReason = "cancelled")
            throw e
        } catch (e: Exception) {
            val failure = FailureClassifier.classify(e)
            log.finish(id, app.silhouette.benefits.data.OutboundLog.Status.FAILED, failureReason = failure.reason)
            throw failure
        }
    }

    companion object {
        /** The reason of a cloud request that was not made because App Check gave no token. */
        const val NO_APP_CHECK: String = "no-app-check"
    }
}
