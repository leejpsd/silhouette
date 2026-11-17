package app.silhouette.benefits

import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import app.silhouette.benefits.ai.DeviceModel
import app.silhouette.benefits.ai.DeviceModelState
import app.silhouette.benefits.ai.LoggedModelPort
import app.silhouette.benefits.ai.ModelPort
import app.silhouette.benefits.ai.PersonalTasks
import app.silhouette.benefits.ai.PreparedModelPort
import app.silhouette.benefits.ai.TextTasks
import app.silhouette.benefits.ai.firebase.FirebaseOnDeviceText
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
import com.google.firebase.FirebaseApp
import app.silhouette.benefits.ai.DeviceReadingTask
import app.silhouette.benefits.ai.GuardedOnDeviceText
import app.silhouette.benefits.ai.GuardedPhotoReader
import app.silhouette.benefits.ai.NoDeviceModel
import app.silhouette.benefits.ai.RecordedOnDeviceText
import app.silhouette.benefits.ai.firebase.FirebaseDeviceText
import app.silhouette.benefits.devicecheck.AndroidCheck
import app.silhouette.benefits.devicecheck.CheckDocuments
import app.silhouette.benefits.devicecheck.DeviceCheckRunner
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
    val outbound: OutboundLog = OutboundLog(onChange = { log ->
        val json = log.encodeState().toString()
        appScope.launch(storeDispatcher) { runCatching { repository.saveLedger(json) } }
    })

    /** Remote Config, fetched only right before the first model request. */
    val remote: FirebaseRemoteSettings by lazy {
        val template = assets.open("firebase/remoteconfig.template.json").use { it.readBytes().toString(Charsets.UTF_8) }
        FirebaseRemoteSettings(outbound, RemoteSettings.parseTemplate(template))
    }

    /** False in a build without google-services.json: the app then runs without models instead of crashing. */
    val firebaseReady: Boolean by lazy { FirebaseApp.getApps(this).isNotEmpty() }

    val deviceModel: DeviceModel by lazy { if (firebaseReady) FirebaseDeviceModel() else NoDeviceModel }

    private val deviceAvailable: () -> Boolean = { deviceModel.state.value == DeviceModelState.Available }

    val photoReader: PhotoReader by lazy { GuardedPhotoReader(FirebasePhotoReader(content.photoPrompt), deviceAvailable) }

    /**
     * The one path to Firebase AI Logic for cloud-capable tasks: a device-first call on a device with
     * a ready model runs on the device only; every cloud request passes App Check first and is
     * recorded before it is made. Remote Config is fetched after the first request that was sent.
     */
    val modelPort: ModelPort by lazy {
        PreparedModelPort(LoggedModelPort(FirebaseModelPort(), outbound, FirebaseModelPort.CLOUD_MODEL, FirebaseCloudGate(outbound) { firebaseReady }, deviceAvailable)) { remote.fetch() }
    }

    /** The on-device reading of a paystub in parts (each part on this device only). */
    val deviceReading: DeviceReadingTask by lazy {
        DeviceReadingTask(FirebaseDeviceText(), content.pointerPrompts, content.devicePartPrompts, content.pointerSchemas, deviceAvailable)
    }

    val modelExtractor: ModelPointerExtractor by lazy {
        ModelPointerExtractor(
            port = modelPort,
            builder = PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas),
            settings = remote.settings,
            reachable = { firebaseReady && (hasNetwork() || deviceAvailable()) },
            deviceReading = deviceReading,
            deviceAvailable = deviceAvailable,
            onAnsweredOnDevice = { fields -> outbound.recordAnswered(fields) },
        )
    }

    /** The general explanation and prepared questions (cloud-capable, public information only). */
    val textTasks: TextTasks? by lazy {
        if (!firebaseReady) null else TextTasks(modelPort, content.prompts, content.outputChecks, remote.settings, deviceAvailable, FirebaseModelPort.CLOUD_MODEL)
    }

    /** The person's own result and typed questions (on this device only; stopped before any SDK call without a ready model). */
    val personalTasks: PersonalTasks? by lazy {
        if (!firebaseReady) {
            null
        } else {
            PersonalTasks(RecordedOnDeviceText(GuardedOnDeviceText(FirebaseOnDeviceText(), deviceAvailable)) { outbound.recordAnswered(listOf("model-request")) }, content.prompts, content.outputChecks)
        }
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
                        pointers = content.sampleAnswers.getValue(sample.id),
                    )
                },
            ),
        )
    }

    val extraction: PointerExtraction by lazy { PointerExtraction(extractors) }

    /** The on-device check's runner: the same task functions as the app, with the check's synthetic cases. */
    fun deviceCheckRunner(): DeviceCheckRunner? = if (!firebaseReady) {
        null
    } else {
        DeviceCheckRunner(
            content = content,
            documents = CheckDocuments.load(content),
            extract = { request, options -> modelExtractor.extract(request, options) },
            text = textTasks,
            personal = personalTasks,
            photo = AndroidCheck.photoCase(photoReader, ::sampleText) { deviceModel.state.value },
            availability = { AndroidCheck.availability(deviceModel.state.value) },
        )
    }

    /** The sample's text for the picture of the photo case (a synthetic document of the app's own). */
    private fun sampleText(): String =
        assets.open("shared/samples/paystub-en-01.txt").use { it.readBytes().toString(Charsets.UTF_8) }

    /** Bundled recordings of the check, by file name (until this platform has its own: the Web's reference run). */
    val checkRecordings: Map<String, String> by lazy {
        val dir = "shared/${CheckDocuments.RUNS_DIR}"
        (assets.list(dir) ?: emptyArray()).filter { it.endsWith(".json") }.associateWith { name ->
            assets.open("$dir/$name").use { it.readBytes().toString(Charsets.UTF_8) }
        }
    }

    val checkRunSchema: kotlinx.serialization.json.JsonObject? by lazy {
        runCatching { kotlinx.serialization.json.Json.parseToJsonElement(assets.open("shared/schemas/device-check-run.v3.json").use { it.readBytes().toString(Charsets.UTF_8) }) as kotlinx.serialization.json.JsonObject }.getOrNull()
    }

    val appVersion: String by lazy { runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: "0" }

    /** Saves a finished run's file to app storage (files/device-check/). */
    fun saveRunFile(name: String, text: String) {
        File(filesDir, "device-check").apply { mkdirs() }.resolve(name).writeText(text)
    }

    override fun onCreate() {
        super.onCreate()
        // No App Check here: it starts only before the first cloud request (FirebaseCloudGate).
        // Checking the on-device model is local; nothing is downloaded until the user asks.
        appScope.launch { deviceModel.refresh() }
    }

    fun hasNetwork(): Boolean {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
