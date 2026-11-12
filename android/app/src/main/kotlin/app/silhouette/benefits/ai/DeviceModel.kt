package app.silhouette.benefits.ai

import kotlinx.coroutines.flow.StateFlow

/** The state of the on-device model, for the photo option and for routing. */
sealed interface DeviceModelState {
    data object Checking : DeviceModelState

    /** This device has no on-device model (or this build cannot use it). */
    data object Unavailable : DeviceModelState

    /** The model can be downloaded; the SDK never downloads it by itself. */
    data object Downloadable : DeviceModelState

    data class Downloading(val bytes: Long) : DeviceModelState

    data object Available : DeviceModelState

    /** The last download did not finish. */
    data object DownloadFailed : DeviceModelState
}

/** Checks, downloads and warms up the on-device model. */
interface DeviceModel {
    val state: StateFlow<DeviceModelState>

    suspend fun refresh()

    /** Downloads the model when it is downloadable, then warms it up. */
    suspend fun download()
}
