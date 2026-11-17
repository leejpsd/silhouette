package app.silhouette.benefits

import app.silhouette.benefits.ai.CloudGate
import app.silhouette.benefits.data.OutboundLog
import com.google.firebase.appcheck.FirebaseAppCheck
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * App Check for cloud requests only (shared/RECORD.md section 1). Nothing about App Check exists
 * until the first cloud request the person chose to send: then its provider is installed (Play
 * Integrity, or the debug provider in debug builds), and before every cloud request a limited-use
 * token is obtained. Without a token the request is not made. The token request is recorded.
 */
class FirebaseCloudGate(private val log: OutboundLog, private val firebaseReady: () -> Boolean) : CloudGate {
    @Volatile
    private var installed = false

    override suspend fun admit(): Boolean {
        if (!firebaseReady()) return false
        if (!installed) {
            synchronized(this) {
                if (!installed) {
                    AppCheckSetup.install()
                    installed = true
                }
            }
        }
        val id = log.begin(OutboundLog.Channel.APP_CHECK, HOST, listOf("app-check-token-request"), payload = null, path = "/…:exchange")
        val ok = runCatching {
            suspendCancellableCoroutine { cont ->
                FirebaseAppCheck.getInstance().limitedUseAppCheckToken.addOnCompleteListener { task ->
                    cont.resume(task.isSuccessful && task.result?.token?.isNotEmpty() == true)
                }
            }
        }.getOrDefault(false)
        if (ok) log.finish(id, OutboundLog.Status.SENT, responseStatus = "OK") else log.finish(id, OutboundLog.Status.FAILED, failureReason = "no-token")
        return ok
    }

    companion object {
        const val HOST: String = "firebaseappcheck.googleapis.com"
    }
}
