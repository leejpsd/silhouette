package app.silhouette.benefits.ai.firebase

import app.silhouette.benefits.ai.CloudText
import app.silhouette.benefits.ai.DeviceText
import app.silhouette.benefits.ai.FailureClassifier
import app.silhouette.benefits.ai.FailureKind
import app.silhouette.benefits.ai.ModelFailure
import com.google.firebase.Firebase
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.content
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import java.util.concurrent.ConcurrentHashMap
import com.google.firebase.ai.InferenceSource as SdkSource

/**
 * The parts of the on-device reading on Firebase AI Logic with `InferenceMode.ONLY_ON_DEVICE`. In
 * firebase-ai 18.2.0 this mode builds an on-device provider only (no cloud provider and no App Check
 * header provider), so the request cannot go to the cloud; a reply reported from anywhere else is
 * refused all the same.
 *
 * Sampling is the most deterministic the SDK offers on the device: temperature 0, top-K 1, one
 * candidate and a fixed seed. Busy and battery-quota errors are retried after a growing delay.
 */
@OptIn(PublicPreviewAPI::class)
class FirebaseDeviceText : DeviceText {
    private val models = ConcurrentHashMap<String, GenerativeModel>()

    override suspend fun generate(system: CloudText, user: CloudText): String {
        val model = models.getOrPut(system.text) {
            Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
                modelName = FirebaseModelPort.CLOUD_MODEL,
                systemInstruction = content { text(system.text) },
                onDeviceConfig = OnDeviceConfig(
                    mode = InferenceMode.ONLY_ON_DEVICE,
                    maxOutputTokens = MAX_OUTPUT_TOKENS,
                    temperature = 0f,
                    topK = 1,
                    seed = SEED,
                    candidateCount = 1,
                ),
            )
        }
        var attempt = 0
        while (true) {
            try {
                val response = model.generateContent(user.text)
                if (response.inferenceSource != SdkSource.ON_DEVICE) throw ModelFailure(FailureKind.DEVICE_FAILED, "not-on-device")
                return response.text ?: throw ModelFailure(FailureKind.DEVICE_FAILED, "empty-response")
            } catch (e: CancellationException) {
                throw e
            } catch (e: ModelFailure) {
                throw e
            } catch (e: Exception) {
                val failure = FailureClassifier.classify(e)
                if ((failure.kind == FailureKind.DEVICE_BUSY || failure.kind == FailureKind.DEVICE_QUOTA) && attempt < MAX_RETRIES) {
                    delay(1_000L shl attempt++)
                    continue
                }
                throw ModelFailure(if (failure.kind == FailureKind.CLOUD) FailureKind.DEVICE_FAILED else failure.kind, failure.reason, e)
            }
        }
    }

    companion object {
        /** A whole core answer of a paystub is about 200 tokens; room for the longest deductions list. */
        const val MAX_OUTPUT_TOKENS: Int = 512
        const val SEED: Int = 0
        const val MAX_RETRIES: Int = 2
    }
}
