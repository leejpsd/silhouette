package app.silhouette.benefits.config

import app.silhouette.benefits.data.OutboundLog
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Remote Config with in-app defaults. The fetch is a request like any other: it is recorded in the
 * outbound log before it is made. It carries no user data.
 */
class FirebaseRemoteSettings(private val log: OutboundLog, defaults: Map<String, String>) {
    private val config: FirebaseRemoteConfig by lazy { FirebaseRemoteConfig.getInstance().apply { setDefaultsAsync(defaults) } }

    val settings: RemoteSettings = RemoteSettings(defaults) { key -> runCatching { config.getString(key) }.getOrNull() }

    suspend fun fetch() {
        val id = log.begin(OutboundLog.Channel.REMOTE_CONFIG, HOST, listOf("remote-config"), payload = null, path = "/…/namespaces/firebase:fetch")
        val ok = suspendCancellableCoroutine { cont ->
            config.fetchAndActivate().addOnCompleteListener { task -> cont.resume(task.isSuccessful) }
        }
        if (ok) log.finish(id, OutboundLog.Status.SENT, responseStatus = "OK") else log.finish(id, OutboundLog.Status.FAILED, failureReason = "fetch-failed")
    }

    companion object {
        const val HOST: String = "firebaseremoteconfig.googleapis.com"
    }
}
