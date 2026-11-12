package app.silhouette.benefits.ai.firebase

import app.silhouette.benefits.ai.DeviceModel
import app.silhouette.benefits.ai.DeviceModelState
import com.google.firebase.Firebase
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceExtension
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The on-device model through Firebase AI Logic's on-device extension of a hybrid model:
 * `checkStatus()` → `download()` → `warmUp()`. Checking is local; nothing is downloaded until the
 * user asks for it.
 */
@OptIn(PublicPreviewAPI::class)
class FirebaseDeviceModel : DeviceModel {
    private val mutable = MutableStateFlow<DeviceModelState>(DeviceModelState.Checking)
    override val state: StateFlow<DeviceModelState> = mutable.asStateFlow()

    private val extension: OnDeviceExtension? by lazy {
        runCatching {
            Firebase.ai(backend = GenerativeBackend.googleAI())
                .generativeModel(modelName = FirebaseModelPort.CLOUD_MODEL, onDeviceConfig = OnDeviceConfig(mode = InferenceMode.PREFER_ON_DEVICE))
                .onDeviceExtension
        }.getOrNull()
    }

    override suspend fun refresh() {
        val ext = extension
        mutable.value = if (ext == null) DeviceModelState.Unavailable else runCatching { map(ext.checkStatus()) }.getOrDefault(DeviceModelState.Unavailable)
        if (mutable.value == DeviceModelState.Available) warmUp()
    }

    override suspend fun download() {
        val ext = extension ?: return
        if (mutable.value != DeviceModelState.Downloadable && mutable.value != DeviceModelState.DownloadFailed) return
        runCatching {
            ext.download().collect { status ->
                mutable.value = when (status) {
                    is DownloadStatus.DownloadInProgress -> DeviceModelState.Downloading(status.totalBytesDownloaded)
                    is DownloadStatus.DownloadCompleted -> DeviceModelState.Available
                    is DownloadStatus.DownloadFailed -> DeviceModelState.DownloadFailed
                    else -> DeviceModelState.Downloading(0)
                }
            }
        }.onFailure { mutable.value = DeviceModelState.DownloadFailed }
        if (mutable.value == DeviceModelState.Available) warmUp()
    }

    /** Loads the model into memory so the first request is fast. Best effort. */
    private suspend fun warmUp() {
        runCatching { extension?.warmUp() }
    }

    private fun map(status: OnDeviceModelStatus): DeviceModelState = when (status) {
        OnDeviceModelStatus.AVAILABLE -> DeviceModelState.Available
        OnDeviceModelStatus.DOWNLOADABLE -> DeviceModelState.Downloadable
        OnDeviceModelStatus.DOWNLOADING -> DeviceModelState.Downloading(0)
        else -> DeviceModelState.Unavailable
    }
}
