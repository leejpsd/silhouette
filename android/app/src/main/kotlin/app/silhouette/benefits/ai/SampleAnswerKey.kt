package app.silhouette.benefits.ai

import app.silhouette.benefits.core.Skeleton
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * A test double, not a model: fixed pointer answers for the built-in sample documents
 * (shared/samples/). It answers only when the silhouette is exactly the silhouette of a sample, so
 * it can never pretend to read a real document, and only when no model can be reached (no network
 * and no on-device model). Its results carry [InferenceSource.SAMPLE_ANSWER_KEY], and the app
 * labels them as sample answers.
 *
 * The answers are the pointers of the `*-correct` cases in shared/fixtures/conformance/rehydrate.json
 * (a unit test keeps them identical).
 */
class SampleAnswerKeyExtractor(private val samples: List<Sample>) : PointerExtractor {

    /** A sample document's silhouette and its correct pointers. */
    class Sample(val id: String, val language: String, val skeleton: Skeleton, val pointers: JsonObject)

    override val destination: String = "this device (sample answers)"

    override fun canRead(skeleton: Skeleton, language: String): Boolean = samples.any { it.skeleton == skeleton && it.language == language }

    /** The sample documents' fixed answers make no request. */

    override suspend fun extract(request: PointerRequest): PointerResult {
        val sample = samples.firstOrNull { it.skeleton == request.skeleton && it.language == request.language } ?: throw ExtractorUnavailable()
        return PointerResult(sample.pointers, InferenceSource.SAMPLE_ANSWER_KEY, REASON)
    }

    companion object {
        const val REASON: String = "sample-answer-key"

        /** Pointers per sample id (file name without extension). */
        val POINTERS: Map<String, JsonObject> = mapOf(
            "paystub-en-01" to Json.parseToJsonElement(
                """{"employerName":["W1","W2","W3"],"employeeName":["W4","W5"],"periodStart":"D1","periodEnd":"D2","payDate":"D3",""" +
                    """"grossPay":"N12","netPay":"N22","ytdGross":"N13","hoursWorked":"N5","hourlyRate":"N4","payFrequency":"semimonthly",""" +
                    """"deductions":[{"amount":"N14","kind":"federal_tax"},{"amount":"N16","kind":"social_security"},""" +
                    """{"amount":"N18","kind":"medicare"},{"amount":"N20","kind":"state_tax"}]}""",
            ) as JsonObject,
            "payslip-ko-01" to Json.parseToJsonElement(
                """{"employerName":["W1","W2"],"employeeName":["W3"],"payDate":["N4","N5","N6"],"grossPay":"N10","netPay":"N18",""" +
                    """"deductions":[{"amount":"N11"},{"amount":"N12"},{"amount":"N13"},{"amount":"N14"},{"amount":"N15"},{"amount":"N16"}]}""",
            ) as JsonObject,
        )
    }
}
