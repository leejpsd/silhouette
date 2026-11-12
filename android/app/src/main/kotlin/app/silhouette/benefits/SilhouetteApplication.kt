package app.silhouette.benefits

import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import app.silhouette.benefits.ai.DeviceModel
import app.silhouette.benefits.ai.DeviceModelState
import app.silhouette.benefits.ai.LoggedModelPort
import app.silhouette.benefits.ai.ModelPointerExtractor
import app.silhouette.benefits.ai.PhotoReader
import app.silhouette.benefits.ai.PointerExtraction
import app.silhouette.benefits.ai.PointerExtractor
import app.silhouette.benefits.ai.PointerRequestBuilder
import app.silhouette.benefits.ai.SampleAnswerKeyExtractor
import app.silhouette.benefits.ai.firebase.FirebaseDeviceModel
import app.silhouette.benefits.ai.firebase.FirebaseModelPort
import app.silhouette.benefits.ai.firebase.FirebasePhotoReader
import app.silhouette.benefits.config.FirebaseRemoteSettings
import app.silhouette.benefits.config.RemoteSettings
import app.silhouette.benefits.content.AppContent
import app.silhouette.benefits.content.AssetContentSource
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.data.EncryptedAnswerRepository
import app.silhouette.benefits.data.EncryptedStore
import app.silhouette.benefits.data.OutboundLog
import com.google.firebase.appcheck.FirebaseAppCheck
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File

/** App-wide services. */
class SilhouetteApplication : Application() {

    val content: AppContent by lazy { AppContent.load(AssetContentSource(assets)) }

    /** Encrypted records in the no-backup folder (also excluded because the app disallows backup). */
    val store: EncryptedStore by lazy { EncryptedStore(File(noBackupFilesDir, "store")) }

    val repository: EncryptedAnswerRepository by lazy { EncryptedAnswerRepository(store) }

    /** Every store read, write and delete runs here, one at a time, so they keep their order. */
    val storeDispatcher: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1)

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** The single record of everything that leaves, or tries to leave, the device. Persisted encrypted. */
    val outbound: OutboundLog = OutboundLog { entries ->
        val json = OutboundLog.encode(entries).toString()
        appScope.launch(storeDispatcher) { runCatching { repository.saveLedger(json) } }
    }

    /** Remote Config, fetched only right before the first model request. */
    val remote: FirebaseRemoteSettings by lazy {
        val template = assets.open("firebase/remoteconfig.template.json").use { it.readBytes().toString(Charsets.UTF_8) }
        FirebaseRemoteSettings(outbound, RemoteSettings.parseTemplate(template))
    }

    val deviceModel: DeviceModel by lazy { FirebaseDeviceModel() }

    val photoReader: PhotoReader by lazy { FirebasePhotoReader(content.photoPrompt) }

    val modelExtractor: ModelPointerExtractor by lazy {
        ModelPointerExtractor(
            port = LoggedModelPort(FirebaseModelPort(), outbound, FirebaseModelPort.CLOUD_MODEL),
            builder = PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas),
            settings = remote.settings,
            reachable = { hasNetwork() || deviceModel.state.value == DeviceModelState.Available },
            beforeFirstRequest = { remote.fetch() },
        )
    }

    /**
     * Pointer extractors, tried in order: the model (on device first, then the cloud), and the
     * fixed answers of the built-in samples when no model can be reached.
     */
    val extractors: List<PointerExtractor> by lazy {
        listOf(
            modelExtractor,
            SampleAnswerKeyExtractor(
                content.samples.map { sample ->
                    SampleAnswerKeyExtractor.Sample(
                        id = sample.id,
                        language = sample.language,
                        skeleton = skeletonize(sample.text, content.allowlist(sample.language)).skeleton,
                        pointers = SampleAnswerKeyExtractor.POINTERS.getValue(sample.id),
                    )
                },
            ),
        )
    }

    val extraction: PointerExtraction by lazy { PointerExtraction(extractors) }

    override fun onCreate() {
        super.onCreate()
        AppCheckSetup.install()
        // App Check tokens are fetched by the SDK itself; each new token is recorded when it arrives.
        FirebaseAppCheck.getInstance().addAppCheckListener {
            val id = outbound.begin(OutboundLog.Channel.APP_CHECK, "firebaseappcheck.googleapis.com", listOf("app-check-token-request"), payload = null)
            outbound.finish(id, OutboundLog.Status.SENT, responseStatus = "OK")
        }
        // Checking the on-device model is local; nothing is downloaded until the user asks.
        appScope.launch { deviceModel.refresh() }
    }

    fun hasNetwork(): Boolean {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
