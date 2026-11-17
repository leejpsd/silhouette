package app.silhouette.benefits.ai

import app.silhouette.benefits.core.Skeleton
import kotlinx.serialization.json.JsonObject

/**
 * A test double, not a model: fixed pointer answers for the built-in sample documents
 * (shared/samples/). It answers only when the silhouette is exactly the silhouette of a sample, so
 * it can never pretend to read a real document, and only when no model can be reached (no network
 * and no on-device model). Its results carry [InferenceSource.SAMPLE_ANSWER_KEY], and the app
 * labels them as sample answers.
 *
 * The answers come from shared/samples/answers.json (shared/routing.json `offlineSample`).
 */
class SampleAnswerKeyExtractor(private val samples: List<Sample>) : PointerExtractor {

    /** A sample document's silhouette and its correct pointers. */
    class Sample(val id: String, val language: String, val skeleton: Skeleton, val pointers: JsonObject)

    override val destination: String = "this device (sample answers)"

    override fun canRead(skeleton: Skeleton, language: String): Boolean = samples.any { it.skeleton == skeleton && it.language == language }

    /** The sample documents' fixed answers make no request. */

    override suspend fun extract(request: PointerRequest, options: ExtractOptions): PointerResult {
        val sample = samples.firstOrNull { it.skeleton == request.skeleton && it.language == request.language } ?: throw ExtractorUnavailable()
        return PointerResult(sample.pointers, InferenceSource.SAMPLE_ANSWER_KEY, REASON)
    }

    companion object {
        const val REASON: String = "sample-answer-key"
    }
}
