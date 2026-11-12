package app.silhouette.benefits.ai.firebase

import android.graphics.Bitmap
import app.silhouette.benefits.ai.DocType
import app.silhouette.benefits.ai.FailureClassifier
import app.silhouette.benefits.ai.FailureKind
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.PhotoNotReadOnDevice
import app.silhouette.benefits.ai.PhotoReader
import app.silhouette.benefits.ai.PhotoText
import app.silhouette.benefits.ai.PromptTemplate
import app.silhouette.benefits.ai.RoutingReason
import app.silhouette.benefits.core.Raw
import com.google.firebase.Firebase
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.content
import kotlinx.coroutines.delay
import com.google.firebase.ai.InferenceSource as SdkSource

/**
 * `document.photo.read` on Firebase AI Logic with `InferenceMode.ONLY_ON_DEVICE`: the request runs
 * on the device or fails; it never falls back to the cloud. One Bitmap per request. A result that
 * reports `IN_CLOUD` is discarded (shared/prompts/photo-read.v1.md). Busy and battery-quota errors
 * are retried after a growing delay.
 *
 * This is the only model call in the app that receives Raw content, and it is on-device only.
 */
@OptIn(PublicPreviewAPI::class)
class FirebasePhotoReader(private val prompt: PromptTemplate) : PhotoReader {
    private val model by lazy {
        Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
            modelName = FirebaseModelPort.CLOUD_MODEL,
            systemInstruction = content { text(prompt.system) },
            onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE, maxOutputTokens = 1024),
        )
    }

    override suspend fun read(photo: Bitmap, docType: DocType): PhotoText {
        var attempt = 0
        while (true) {
            try {
                val response = model.generateContent(
                    content {
                        image(photo)
                        text(prompt.fill(mapOf("docType" to docType.wire)))
                    },
                )
                if (response.inferenceSource != SdkSource.ON_DEVICE) throw PhotoNotReadOnDevice("not-on-device")
                val text = response.text ?: throw PhotoNotReadOnDevice("empty")
                return PhotoText(Raw.of(text), InferenceSource.ON_DEVICE, RoutingReason.PHOTO_NEVER_LEAVES.key)
            } catch (e: PhotoNotReadOnDevice) {
                throw e
            } catch (e: Exception) {
                val failure = FailureClassifier.classify(e)
                if ((failure.kind == FailureKind.DEVICE_BUSY || failure.kind == FailureKind.DEVICE_QUOTA) && attempt < 2) {
                    delay(1_000L shl attempt++)
                    continue
                }
                throw PhotoNotReadOnDevice(failure.reason)
            }
        }
    }
}
