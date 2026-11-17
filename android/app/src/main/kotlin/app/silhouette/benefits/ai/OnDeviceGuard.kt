package app.silhouette.benefits.ai

/**
 * The hard stop before any `ONLY_ON_DEVICE` SDK call: when the device model does not report
 * `available`, the request is not made at all. It does not rely on what the SDK would do without a
 * model; [GUARD_REASON] tells the record and the run file that the app stopped it.
 */
class GuardedOnDeviceText(private val inner: OnDeviceText, private val available: () -> Boolean) : OnDeviceText {
    override suspend fun generate(request: PersonalRequest): String {
        if (!available()) throw ModelFailure(FailureKind.DEVICE_FAILED, GUARD_REASON)
        return inner.generate(request)
    }

    companion object {
        const val GUARD_REASON: String = "guard:model-not-available"
    }
}

/** The same stop for the photo reader. */
class GuardedPhotoReader(private val inner: PhotoReader, private val available: () -> Boolean) : PhotoReader {
    override suspend fun read(photo: android.graphics.Bitmap, docType: DocType): PhotoText {
        if (!available()) throw ModelFailure(FailureKind.DEVICE_FAILED, GuardedOnDeviceText.GUARD_REASON)
        return inner.read(photo, docType)
    }
}

/** Records each answer the on-device model wrote (kept, never sent) in the outbound log. */
class RecordedOnDeviceText(private val inner: OnDeviceText, private val onAnswered: () -> Unit) : OnDeviceText {
    override suspend fun generate(request: PersonalRequest): String = inner.generate(request).also { onAnswered() }
}
