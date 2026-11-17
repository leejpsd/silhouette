package app.silhouette.benefits.ai

import app.silhouette.benefits.core.Skeleton
import kotlinx.serialization.json.JsonObject

// Task `document.pointer.extract` (shared/routing.json): input Skeleton only, PREFER_ON_DEVICE,
// reason `document-silhouette-only`. The model reads the document silhouette and answers with
// placeholder ids (shared/prompts/pointer-extract.v2.md); the Rehydrator fills in the values on
// this device. Because the input type is Skeleton, no Raw value can be passed here.

/** Where a model answer was produced. */
enum class InferenceSource {
    ON_DEVICE,
    IN_CLOUD,

    /** No model: the fixed answers of a built-in sample document. */
    SAMPLE_ANSWER_KEY,
}

enum class DocType(val wire: String, val schemaFile: String) { PAYSTUB("paystub", "pointer.paystub.json") }

class PointerRequest(val skeleton: Skeleton, val docType: DocType, val language: String)

/**
 * The model's pointer JSON (untrusted; the Rehydrator validates every reference), where it ran,
 * and the routing reason key from shared/routing.json (or `sample-answer-key`). [notRead]: fields the
 * device left out as not read (DEVICE_READING.md sections 5 and 5.1, `deductions` when the deductions
 * did not hold up). [noDeviceModel]: a device-first document read in the cloud because this phone has
 * no model. [deviceAttempt]: the on-device reading, whether it was used or repeated in the cloud.
 */
class PointerResult(
    val pointers: JsonObject,
    val inferenceSource: InferenceSource,
    val reason: String,
    val notRead: List<String> = emptyList(),
    val noDeviceModel: Boolean = false,
    val deviceAttempt: app.silhouette.benefits.core.DeviceReadingResult? = null,
) {
    val deductionsNotRead: Boolean get() = "deductions" in notRead
}

/**
 * How a reading runs. [deviceOnly]: the person chose to keep everything on this device, so nothing is
 * ever sent and a failed on-device reading is reported instead of repeated in the cloud. [document]
 * is the silhouette with its values, for the checks of the on-device reading (they run on the device).
 */
class ExtractOptions(
    val deviceOnly: Boolean = false,
    val document: app.silhouette.benefits.core.SkeletonResult? = null,
    val jurisdiction: String = "us-ca",
    val onStage: (ReadingStage) -> Unit = {},
)

/** The person kept everything on this device and the device could not read the silhouette reliably: nothing was filled in or sent. */
class OnDeviceUnreliable(val attempt: app.silhouette.benefits.core.DeviceReadingResult?) : Exception("on-device-unreliable")

/** The cloud retry after a failed on-device reading failed too; [attempt] is the device's reading. */
class CloudRetryFailed(val attempt: app.silhouette.benefits.core.DeviceReadingResult, val failure: ModelFailure) : Exception(failure.reason, failure)

/** The person kept everything on this device but no on-device reading is possible here. */
class DeviceReadingUnavailable : Exception("on-device-unavailable")

/** Reads pointers from a document silhouette. Implementations: a model, or the sample answer key. */
interface PointerExtractor {
    /** Where a request goes, for the outbound ledger. */
    val destination: String

    /** Whether this extractor can read [skeleton] at all (without sending anything). */
    fun canRead(skeleton: Skeleton, language: String): Boolean

    suspend fun extract(request: PointerRequest, options: ExtractOptions = ExtractOptions()): PointerResult
}

/** Raised when no extractor can read a document. */
class ExtractorUnavailable : Exception("no pointer extractor for this document")

/**
 * The single path from a document silhouette to an extractor: the first extractor that can read
 * it is used. Model extractors record every request they make in the outbound log themselves
 * ([LoggedModelPort]), before the request is made; the sample answer key makes no request.
 */
class PointerExtraction(private val extractors: List<PointerExtractor>) {

    fun extractorFor(skeleton: Skeleton, language: String): PointerExtractor? = extractors.firstOrNull { it.canRead(skeleton, language) }

    suspend fun extract(request: PointerRequest, options: ExtractOptions = ExtractOptions()): PointerResult {
        val extractor = extractorFor(request.skeleton, request.language) ?: throw ExtractorUnavailable()
        return extractor.extract(request, options)
    }
}
