package app.silhouette.benefits

import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.PointerExtraction
import app.silhouette.benefits.ai.PointerExtractor
import app.silhouette.benefits.ai.PointerRequest
import app.silhouette.benefits.ai.PointerResult
import app.silhouette.benefits.ai.SampleAnswerKeyExtractor
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.Skeleton
import app.silhouette.benefits.core.SkeletonPiece
import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.data.AnswerRepository
import app.silhouette.benefits.data.LanguageStore
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.document.RowStatus
import app.silhouette.benefits.document.SourceKind
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.INCOME_STEP
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class DocumentFlowTest {
    private val content = TestContent.content

    private class MemoryRepository : AnswerRepository {
        var answers: JsonElement? = null
        var ledger: String? = null
        override fun load() = answers
        override fun save(answers: JsonObject) {
            this.answers = answers
        }
        override fun loadLedger() = ledger
        override fun saveLedger(json: String) {
            ledger = json
        }
        override fun deleteAll() {
            answers = null
            ledger = null
        }
    }

    private object English : LanguageStore {
        override fun current() = AppLanguage.EN
        override fun set(language: AppLanguage) = Unit
        override fun clear() = Unit
    }

    /** Records every silhouette handed to the extractor interface, and answers nothing. */
    private class RecordingExtractor : PointerExtractor {
        val seen = mutableListOf<Skeleton>()
        override val destination = "recorder.test"
        override fun canRead(skeleton: Skeleton, language: String) = true
        override suspend fun extract(request: PointerRequest): PointerResult {
            seen += request.skeleton
            return PointerResult(JsonObject(emptyMap()), InferenceSource.IN_CLOUD, "document-silhouette-only")
        }
    }

    private val dispatcher = StandardTestDispatcher()
    private val scope = TestScope(dispatcher)
    private val repository = MemoryRepository()
    private val log = OutboundLog { repository.saveLedger(OutboundLog.encode(it).toString()) }

    private fun sampleKey() = SampleAnswerKeyExtractor(
        content.samples.map {
            SampleAnswerKeyExtractor.Sample(it.id, it.language, skeletonize(it.text, content.allowlist(it.language)).skeleton, SampleAnswerKeyExtractor.POINTERS.getValue(it.id))
        },
    )

    private fun controller(extractors: List<PointerExtractor> = listOf(sampleKey())): AppController =
        AppController(content, repository, English, log, scope, dispatcher, PointerExtraction(extractors, log)).also {
            it.load()
            scope.advanceUntilIdle()
        }

    @Test
    fun `the sample answer key is the correct pointers of the rehydrate fixture`() {
        val fixture = Json.parseToJsonElement(File(TestContent.sharedDir, "fixtures/conformance/rehydrate.json").readText()) as JsonObject
        val cases = (fixture["cases"] as JsonArray).map { it as JsonObject }
        for ((id, pointers) in SampleAnswerKeyExtractor.POINTERS) {
            val case = cases.first { (it["id"] as JsonPrimitive).content == "$id-correct" }
            assertEquals(id, case["pointers"], pointers)
        }
    }

    @Test
    fun `sample flow from silhouette to a clear result`() {
        val app = controller()
        // Income known only as a band straddling a limit: "maybe".
        app.answer(INCOME_STEP, AnswerValue.IncomeBandChoice("C"))
        app.answer("householdSize", AnswerValue.Count(3))
        app.answer("numChildren", AnswerValue.Count(1))
        app.answer("hasEarnedIncome", AnswerValue.Choice("yes"))
        assertEquals(Verdict.MAYBE, app.results.first { it.programId == "work-credit" }.verdict)

        app.openDocument()
        app.acceptSample(content.samples.first { it.id == "paystub-en-01" })
        assertEquals(Route.Preview, app.route)
        assertTrue(app.canExtract)
        val skeleton = app.document.skeleton!!
        assertEquals(22, skeleton.counts['N'])
        app.send()
        scope.advanceUntilIdle()
        assertEquals(Route.Review, app.route)
        assertEquals(InferenceSource.SAMPLE_ANSWER_KEY, app.document.extraction!!.source)
        assertEquals(SampleAnswerKeyExtractor.REASON, app.document.extraction!!.reason)
        val gross = app.review.rows.first { it.name == "grossPay" }
        assertEquals("1,271.88", gross.text)
        assertEquals(RowStatus.PENDING, gross.status)
        assertTrue(gross.source.flatten().any { it.highlight && it.text == "1,271.88" })

        // Nothing left the device: the call is recorded with its exact payload, as answered here.
        val entry = log.entries.value.single()
        assertEquals(OutboundLog.Status.KEPT_ON_DEVICE, entry.status)
        assertEquals(skeleton.skeleton.text, entry.payload)
        assertTrue(log.leftDevice.isEmpty())
        assertEquals(1, OutboundLog.decode(repository.ledger).size)

        app.confirmAll()
        assertEquals(0, app.review.pending)
        app.checkReview()
        val annual = app.review.result!!.annualization!!
        assertEquals(29233L, annual.annualIncome)
        assertEquals("ytd", annual.method)
        app.useAnnualIncome()
        assertEquals(Route.Results, app.route)
        assertEquals(AnswerValue.ExactIncome(29233.0, fromDocument = true), app.answers[INCOME_STEP])
        assertEquals(Verdict.LIKELY, app.results.first { it.programId == "work-credit" }.verdict)
    }

    @Test
    fun `a document that is not a sample is not sent and the user types instead`() {
        val app = controller()
        app.acceptText(Raw.of("Gross Pay 1,000.00\nNet Pay 900.00"), SourceKind.PASTE, "en")
        assertFalse(app.canExtract)
        app.send()
        scope.advanceUntilIdle()
        assertEquals("preview.noExtractor", app.document.error)
        assertTrue(log.entries.value.isEmpty())
        app.typeInstead()
        assertEquals(Route.Review, app.route)
        assertTrue(app.review.manual)
        assertTrue(app.review.rows.all { it.status == RowStatus.EMPTY })
        assertTrue(app.saveRow("grossPay", "2,000.50"))
        assertFalse(app.saveRow("netPay", "2.000,50"))
        assertTrue(app.saveRow("payFrequency", "biweekly"))
        app.checkReview()
        assertEquals(52013L, app.review.result!!.annualization!!.annualIncome) // 2,000.50 × 26
    }

    @Test
    fun `hiding a word masks it before anything is sent, and undo brings it back`() {
        val app = controller()
        app.acceptSample(content.samples.first { it.id == "paystub-en-01" })
        val before = app.document.skeleton!!
        val gross = before.pieces.filterIsInstance<SkeletonPiece.KeptWord>().first { it.text == "Gross" }
        app.hideWord(gross.ordinal)
        val hidden = app.document.skeleton!!
        assertFalse(hidden.skeleton.text.contains("Gross Pay"))
        assertEquals((before.counts['W'] ?: 0) + 2, hidden.counts['W']) // "Gross" and its phrase partner "Pay"
        assertEquals("Gross", app.lastHiddenWord())
        // A changed silhouette is no longer the sample's, so the answer key does not read it.
        assertFalse(app.canExtract)
        app.undoHide()
        assertEquals(before.skeleton, app.document.skeleton!!.skeleton)
        assertTrue(app.canExtract)
    }

    /** No canary string from shared/fixtures/canary/ reaches the extractor interface or the ledger. */
    @Test
    fun `canary strings never reach the extractor`() {
        val dir = File(TestContent.sharedDir, "fixtures/canary")
        val fixtures = dir.listFiles { f -> f.name.endsWith(".json") }!!
        assertTrue(fixtures.isNotEmpty())
        for (file in fixtures) {
            val recorder = RecordingExtractor()
            val app = controller(listOf(recorder))
            val canary = Json.parseToJsonElement(file.readText()) as JsonObject
            val values = (canary["canaries"] as JsonArray).map { (it as JsonPrimitive).content }
            val text = File(dir, (canary["document"] as JsonPrimitive).content).readText()
            val language = (canary["locale"] as JsonPrimitive).content
            app.acceptText(Raw.of(text), SourceKind.PASTE, language)
            app.send()
            scope.advanceUntilIdle()
            // Also after the user hides a word.
            app.document.skeleton!!.pieces.filterIsInstance<SkeletonPiece.KeptWord>().firstOrNull()?.let { app.hideWord(it.ordinal) }
            app.send()
            scope.advanceUntilIdle()
            assertEquals(2, recorder.seen.size)
            val outbound = recorder.seen.map { it.text } + log.entries.value.mapNotNull { it.payload }
            for (value in values) for (sent in outbound) assertFalse("leaked: $value", sent.contains(value))
            log.clear()
        }
    }

    @Test
    fun `the ledger survives a restart and an unfinished call counts as possibly sent`() {
        val entries = listOf(
            OutboundLog.Entry(1, OutboundLog.Channel.AI_CLOUD, "example.test", listOf("document-silhouette"), "Gross Pay ⟦N1⟧", OutboundLog.Status.SENT),
            OutboundLog.Entry(2, OutboundLog.Channel.AI_CLOUD, "example.test", listOf("document-silhouette"), null, OutboundLog.Status.ATTEMPTED),
        )
        val restored = OutboundLog.decode(OutboundLog.encode(entries).toString())
        assertEquals(entries[0], restored[0])
        assertEquals(OutboundLog.Status.FAILED, restored[1].status)
        assertTrue(OutboundLog.decode("not json").isEmpty())
        assertTrue(OutboundLog.decode(null).isEmpty())
    }

    @Test
    fun `delete everything also forgets the document and the ledger`() {
        val app = controller()
        app.acceptSample(content.samples.first())
        app.send()
        scope.advanceUntilIdle()
        assertNotNull(repository.ledger)
        app.deleteEverything()
        scope.advanceUntilIdle()
        assertNull(app.document.text)
        assertNull(repository.ledger)
        assertTrue(log.entries.value.isEmpty())
    }
}
