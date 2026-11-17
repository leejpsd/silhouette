package app.silhouette.benefits

import app.silhouette.benefits.ai.PointerExtraction
import app.silhouette.benefits.ai.SampleAnswerKeyExtractor
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.data.AnswerRepository
import app.silhouette.benefits.data.LanguageStore
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.Route
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The two-minute path with the judges' prepared household (shared/rulepacks/us-ca/judges-household.json,
 * expected results in shared/fixtures/conformance/judges-household.json).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class JudgesPathTest {
    private val content = TestContent.california
    private val fixture = Json.parseToJsonElement(File(TestContent.sharedDir, "fixtures/conformance/judges-household.json").readText()) as JsonObject

    private class Memory : AnswerRepository {
        override fun load(): JsonElement? = null
        override fun save(answers: JsonObject) = Unit
        override fun deleteAll() = Unit
    }

    private object English : LanguageStore {
        override fun current() = AppLanguage.EN
        override fun set(language: AppLanguage) = Unit
        override fun clear() = Unit
    }

    private val dispatcher = StandardTestDispatcher()
    private val scope = TestScope(dispatcher)

    private fun verdicts(side: String): Map<String, String> =
        ((fixture[side] as JsonObject)["expected"] as JsonArray).associate { e ->
            val o = e as JsonObject
            (o["programId"] as JsonPrimitive).content to (o["verdict"] as JsonPrimitive).content
        }

    @Test
    fun `step 1 fills the prepared household, step 2 reads the sample paystub, and two tax credits become may qualify`() {
        val sampleKey = SampleAnswerKeyExtractor(
            content.samples.map { SampleAnswerKeyExtractor.Sample(it.id, it.language, skeletonize(it.text, content.allowlist(it.language)).skeleton, content.sampleAnswers.getValue(it.id)) },
        )
        val log = OutboundLog()
        val app = AppController(content, Memory(), English, log, scope, dispatcher, PointerExtraction(listOf(sampleKey)))
        app.load()
        scope.advanceUntilIdle()

        app.fillPreparedHousehold()
        assertEquals(Route.Results, app.route)
        assertEquals(verdicts("before"), app.results.associate { it.programId to it.verdict.wire })

        app.openSamplePaystub()
        assertEquals(Route.Preview, app.route)
        app.send()
        scope.advanceUntilIdle()
        app.confirmAll()
        app.checkReview()
        assertEquals(29233L, app.review.result!!.annualization!!.annualIncome)
        app.useAnnualIncome()
        assertEquals(verdicts("after"), app.results.associate { it.programId to it.verdict.wire })
        assertEquals("likely", verdicts("after")["caleitc"])

        // Step 3 opens the record; nothing has left this device in this path without a model.
        app.openRecord()
        assertEquals(1, app.recordOpenRequests)
        assertTrue(log.leftDevice.isEmpty())
    }
}
