package app.silhouette.benefits.ai.firebase

import app.silhouette.benefits.ai.FailureClassifier
import app.silhouette.benefits.ai.FailureKind
import app.silhouette.benefits.ai.ModelFailure
import app.silhouette.benefits.ai.OnDeviceText
import app.silhouette.benefits.ai.PersonalRequest
import com.google.firebase.Firebase
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.content
import kotlinx.coroutines.delay
import java.util.concurrent.ConcurrentHashMap
import com.google.firebase.ai.InferenceSource as SdkSource

/**
 * The person's own result and typed questions on Firebase AI Logic with
 * `InferenceMode.ONLY_ON_DEVICE`: the request runs on this device or fails; there is no cloud
 * fallback. A reply reported from the cloud is discarded. Busy and battery-quota errors are retried
 * after a growing delay.
 */
@OptIn(PublicPreviewAPI::class)
class FirebaseOnDeviceText : OnDeviceText {
    private val models = ConcurrentHashMap<String, GenerativeModel>()

    override suspend fun generate(request: PersonalRequest): String {
        val model = models.getOrPut("${request.task}|${request.system.hashCode()}") {
            Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
                modelName = FirebaseModelPort.CLOUD_MODEL,
                systemInstruction = content { text(request.system) },
                onDeviceConfig = OnDeviceConfig(mode = InferenceMode.ONLY_ON_DEVICE, maxOutputTokens = MAX_OUTPUT_TOKENS),
            )
        }
        var attempt = 0
        while (true) {
            try {
                val response = model.generateContent(request.user)
                if (response.inferenceSource != SdkSource.ON_DEVICE) throw ModelFailure(FailureKind.DEVICE_FAILED, "not-on-device")
                return response.text ?: throw ModelFailure(FailureKind.DEVICE_FAILED, "empty-response")
            } catch (e: ModelFailure) {
                throw e
            } catch (e: Exception) {
                val failure = FailureClassifier.classify(e)
                if ((failure.kind == FailureKind.DEVICE_BUSY || failure.kind == FailureKind.DEVICE_QUOTA) && attempt < 2) {
                    delay(1_000L shl attempt++)
                    continue
                }
                // Never reported as a cloud failure: this request cannot leave the device.
                throw ModelFailure(if (failure.kind == FailureKind.CLOUD) FailureKind.DEVICE_FAILED else failure.kind, failure.reason, e)
            }
        }
    }

    companion object {
        /** About 80 words in any of the app's languages; on-device output above 256 tokens is discouraged. */
        const val MAX_OUTPUT_TOKENS: Int = 320
    }
}
