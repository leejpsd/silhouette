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
 * and the routing reason key from shared/routing.json (or `sample-answer-key`).
 */
class PointerResult(val pointers: JsonObject, val inferenceSource: InferenceSource, val reason: String)

/** Reads pointers from a document silhouette. Implementations: a model, or the sample answer key. */
interface PointerExtractor {
    /** Where a request goes, for the outbound ledger. */
    val destination: String

    /** Whether this extractor can read [skeleton] at all (without sending anything). */
    fun canRead(skeleton: Skeleton, language: String): Boolean

    suspend fun extract(request: PointerRequest): PointerResult
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

    suspend fun extract(request: PointerRequest): PointerResult {
        val extractor = extractorFor(request.skeleton, request.language) ?: throw ExtractorUnavailable()
        return extractor.extract(request)
    }
}
