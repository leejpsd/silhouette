package app.silhouette.benefits.ui

import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.silhouette.benefits.ai.DeviceModel
import app.silhouette.benefits.ai.ExplainSettings
import app.silhouette.benefits.ai.PersonalTasks
import app.silhouette.benefits.ai.TextTasks
import app.silhouette.benefits.answers.AnswerSession
import app.silhouette.benefits.answers.AnswersController
import app.silhouette.benefits.answers.ProgramContext
import app.silhouette.benefits.answers.Silhouette
import app.silhouette.benefits.ai.DeviceModelState
import app.silhouette.benefits.ai.DocType
import app.silhouette.benefits.ai.ModelFailure
import app.silhouette.benefits.ai.ModelPointerExtractor
import app.silhouette.benefits.ai.PhotoReader
import app.silhouette.benefits.ai.SampleAnswerKeyExtractor
import app.silhouette.benefits.document.PhotoSource
import app.silhouette.benefits.document.ReadingPlace
import app.silhouette.benefits.document.errorKey
import app.silhouette.benefits.ai.ExtractorUnavailable
import app.silhouette.benefits.ai.PointerExtraction
import app.silhouette.benefits.ai.PointerRequest
import app.silhouette.benefits.ai.PointerResult
import app.silhouette.benefits.content.AppContent
import app.silhouette.benefits.content.SampleDocument
import app.silhouette.benefits.core.FieldKind
import app.silhouette.benefits.core.ProgramVerdict
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.SkeletonPiece
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import app.silhouette.benefits.core.Validation
import app.silhouette.benefits.core.buildReview
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.document.DeductionRow
import app.silhouette.benefits.document.DocumentSession
import app.silhouette.benefits.document.Extraction
import app.silhouette.benefits.document.ReviewRow
import app.silhouette.benefits.document.ReviewState
import app.silhouette.benefits.document.RowStatus
import app.silhouette.benefits.document.SourceKind
import app.silhouette.benefits.document.initialReview
import app.silhouette.benefits.document.parseReviewNumber
import app.silhouette.benefits.document.toValues
import app.silhouette.benefits.data.AnswerRepository
import app.silhouette.benefits.data.LanguageStore
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.INCOME_STEP
import app.silhouette.benefits.quickcheck.QuickCheckAnswers
import app.silhouette.benefits.quickcheck.Step
import app.silhouette.benefits.quickcheck.computeVerdicts
import app.silhouette.benefits.quickcheck.decodeAnswers
import app.silhouette.benefits.quickcheck.encodeAnswers
import app.silhouette.benefits.quickcheck.firstOpenStep
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Where the user is. */
sealed interface Route {
    data object Start : Route

    /** A question. [then] is where to go after it, when it was opened from a program's "Answer" button. */
    data class Question(val stepId: String, val then: Route? = null) : Route

    data object Results : Route

    data class Program(val id: String) : Route

    /** Add a document. */
    data object Document : Route

    /** The silhouette preview: exactly what could leave the device. */
    data object Preview : Route

    /** Review of the found values, checks and the yearly income. */
    data object Review : Route
}

/**
 * App state and navigation. Answers live in memory and in the encrypted store; every change is
 * saved right after the user acts, never from a background effect, so "Delete everything" is not
 * followed by a write that brings the data back.
 *
 * Storage calls run on [io], which must run one task at a time so saves and deletes keep their order.
 */
class AppController(
    val content: AppContent,
    private val repository: AnswerRepository,
    private val languageStore: LanguageStore,
    val outbound: OutboundLog,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher,
    private val extraction: PointerExtraction = PointerExtraction(emptyList()),
    /** The on-device model, or null where none is configured (tests). */
    val deviceModel: DeviceModel? = null,
    private val photoReader: PhotoReader? = null,
    /** The general explanation and prepared questions, or null where no model is configured (tests). */
    val textTasks: TextTasks? = null,
    val personalTasks: PersonalTasks? = null,
    private val explainSettings: ExplainSettings? = null,
) {
    val programs: ProgramContext = ProgramContext(content)

    /** Explanations and questions of this session (memory only). */
    val requests: AnswersController = AnswersController(scope, AnswerSession(), textTasks)

    /**
     * Whether the person's own result can be explained, and typed questions answered: only by an
     * on-device model, in a language it is validated for.
     */
    val personalAvailable: Boolean
        get() = personalTasks != null && deviceModel?.state?.value == DeviceModelState.Available &&
            strings.language.tag in (explainSettings?.onDeviceLocales ?: emptySet())

    /** True once any request has left, or may have left, the device (results then say so). */
    val anythingLeft: Boolean get() = outbound.leftDevice.isNotEmpty()
    val steps: List<Step> get() = content.steps

    var strings: Strings by mutableStateOf(content.strings(languageStore.current()))
        private set

    var answers: QuickCheckAnswers by mutableStateOf(QuickCheckAnswers())
        private set

    var route: Route by mutableStateOf(Route.Start)
        private set

    var loaded: Boolean by mutableStateOf(false)
        private set

    /** A copy key shown once on the start screen (after "Delete everything"). */
    var notice: String? by mutableStateOf(null)
        private set

    var document: DocumentSession by mutableStateOf(DocumentSession(language = strings.language.tag))
        private set

    var review: ReviewState by mutableStateOf(ReviewState())
        private set

    /** The profile silhouette of the current answers, or null when it cannot be built. */
    val silhouette: Silhouette? by derivedStateOf { programs.silhouette(content.steps, answers) }

    val results: List<ProgramVerdict> by derivedStateOf {
        computeVerdicts(content.pack, content.bands, content.steps, answers)
    }

    val started: Boolean get() = !answers.isEmpty()

    fun load() {
        scope.launch {
            val stored = withContext(io) { runCatching { repository.load() }.getOrNull() }
            val ledger = withContext(io) { runCatching { repository.loadLedger() }.getOrNull() }
            answers = decodeAnswers(steps, stored)
            outbound.restore(OutboundLog.decode(ledger))
            loaded = true
        }
    }

    fun setLanguage(language: AppLanguage) {
        strings = strings.withLanguage(language)
        languageStore.set(language)
    }

    /** Picks up a language change made outside the app (system per-app language settings). */
    fun refreshLanguage() {
        val current = languageStore.current()
        if (current != strings.language) strings = strings.withLanguage(current)
    }

    fun navigate(to: Route) {
        if (to !is Route.Start) notice = null
        route = to
    }

    /** "Start" or "Continue" on the start screen. */
    fun begin() {
        if (!started) return navigate(Route.Question(steps.first().id))
        val open = firstOpenStep(steps, answers)
        navigate(if (open < steps.size) Route.Question(steps[open].id) else Route.Results)
    }

    /** "Start over": forget the answers and ask the first question. */
    fun restart() {
        answers = QuickCheckAnswers()
        persist()
        navigate(Route.Question(steps.first().id))
    }

    /** Records an answer (null = skipped) and moves on. */
    fun answer(stepId: String, value: AnswerValue?) {
        answers = answers.with(stepId, value)
        persist()
        val current = route
        navigate(nextAfter(stepId, (current as? Route.Question)?.then))
    }

    private fun nextAfter(stepId: String, then: Route?): Route {
        if (then != null) return then
        val index = steps.indexOfFirst { it.id == stepId }
        return steps.getOrNull(index + 1)?.let { Route.Question(it.id) } ?: Route.Results
    }

    /** In-app and system back. Returns false at the start screen, where back leaves the app. */
    fun back(): Boolean {
        when (val r = route) {
            Route.Start -> return false
            is Route.Question -> {
                if (r.then != null) {
                    navigate(r.then)
                } else {
                    val index = steps.indexOfFirst { it.id == r.stepId }
                    navigate(steps.getOrNull(index - 1)?.let { Route.Question(it.id) } ?: Route.Start)
                }
            }
            Route.Results -> navigate(Route.Start)
            is Route.Program -> navigate(Route.Results)
            Route.Document -> navigate(if (started) Route.Results else Route.Start)
            Route.Preview -> navigate(Route.Document)
            Route.Review -> navigate(if (document.skeleton != null) Route.Preview else Route.Document)
        }
        return true
    }

    // ---------- Documents ----------

    fun openDocument() {
        if (document.confirmedStubs.isEmpty() && document.text == null) document = document.copy(language = strings.language.tag)
        navigate(Route.Document)
    }

    fun setDocumentLanguage(tag: String) {
        document = document.copy(language = tag)
    }

    /** Text shared into the app from another app: shown in the paste box first. */
    fun receiveSharedText(text: String) {
        document = document.copy(sharedText = text, sharedReceived = true, error = null)
        navigate(Route.Document)
    }

    /** The shared text is now in the paste box. */
    fun sharedTextShown() {
        document = document.copy(sharedText = null)
    }

    /** Every source ends here: Raw text → silhouette, then the preview. */
    fun acceptText(text: Raw<String>, source: SourceKind, language: String = document.language) {
        val skeleton = skeletonize(text, content.allowlist(language))
        document = document.copy(
            language = language, text = text, source = source, hidden = emptyList(), skeleton = skeleton, extraction = null, error = null,
            sharedText = null, sharedReceived = false, photoSource = if (source == SourceKind.PHOTO) document.photoSource else null,
        )
        navigate(Route.Preview)
    }

    fun acceptSample(sample: SampleDocument) = acceptText(sample.text, SourceKind.SAMPLE, sample.language)

    /**
     * Hides a word that is still visible, everywhere in this document (its lowercase form, see
     * [SkeletonPiece.KeptWord.hideKey]), before anything is sent.
     */
    fun hideWord(word: String) {
        val key = word.lowercase(java.util.Locale.ROOT)
        if (key in document.hidden) return
        reskeletonize(document.hidden + key)
    }

    fun undoHide() = reskeletonize(document.hidden.dropLast(1))

    /** The word hidden last. */
    fun lastHiddenWord(): String? = document.hidden.lastOrNull()

    /** Deduction kinds of the paystub pointer schema. */
    val deductionKinds: List<String> by lazy {
        val schema = content.pointerSchemas.getValue(DocType.PAYSTUB.schemaFile)
        val kind = (((schema["properties"] as JsonObject)["deductions"] as JsonObject)["items"] as JsonObject)
            .let { (it["properties"] as JsonObject)["kind"] as JsonObject }
        (kind["enum"] as JsonArray).map { (it as JsonPrimitive).content }
    }

    private fun reskeletonize(hidden: List<String>) {
        val text = document.text ?: return
        document = document.copy(hidden = hidden, skeleton = skeletonize(text, content.allowlist(document.language), hidden.toSet()))
    }

    /** Whether something can read this silhouette (a model, or the answers of a built-in sample). */
    val canExtract: Boolean
        get() = document.skeleton?.let { extraction.extractorFor(it.skeleton, document.language) != null } == true

    /** Hands the silhouette to the pointer extractor, then opens the review. */
    fun send() {
        val skeleton = document.skeleton ?: return
        document = document.copy(sending = true, error = null)
        scope.launch {
            try {
                val result = extraction.extract(PointerRequest(skeleton.skeleton, DocType.PAYSTUB, document.language))
                val schema = content.pointerSchemas.getValue(DocType.PAYSTUB.schemaFile)
                val fields = buildReview(schema, result.pointers, skeleton)
                document = document.copy(sending = false, extraction = Extraction(fields, result.source(), result.reason))
                review = initialReview(schema, fields)
                navigate(Route.Review)
            } catch (_: ExtractorUnavailable) {
                document = document.copy(sending = false, error = "preview.noExtractor")
            } catch (e: ModelFailure) {
                document = document.copy(sending = false, error = errorKey(e))
            } catch (_: Exception) {
                document = document.copy(sending = false, error = "error.unknown")
            }
        }
    }

    private fun PointerResult.source() = inferenceSource

    /** Where the silhouette will be read if the user sends it, for the honest sentence in the preview. */
    val readingPlace: ReadingPlace
        get() {
            val skeleton = document.skeleton ?: return ReadingPlace.NOWHERE
            return when (val extractor = extraction.extractorFor(skeleton.skeleton, document.language)) {
                null -> ReadingPlace.NOWHERE
                is SampleAnswerKeyExtractor -> ReadingPlace.SAMPLE_ANSWERS
                is ModelPointerExtractor ->
                    if (extractor.prefersDevice(document.language) && deviceModel?.state?.value == DeviceModelState.Available) {
                        ReadingPlace.DEVICE_FIRST
                    } else {
                        ReadingPlace.CLOUD
                    }
                else -> ReadingPlace.CLOUD
            }
        }

    /** Reads a photo on this device only, then treats the text like pasted text. */
    fun readPhoto(photo: android.graphics.Bitmap) {
        val reader = photoReader ?: return
        document = document.copy(readingPhoto = true, error = null)
        scope.launch {
            try {
                val result = reader.read(photo, DocType.PAYSTUB)
                document = document.copy(readingPhoto = false, photoSource = PhotoSource(result.source, result.reason))
                acceptText(result.text, SourceKind.PHOTO)
            } catch (_: Exception) {
                document = document.copy(readingPhoto = false, error = "error.on-device-unavailable")
            }
        }
    }

    fun downloadDeviceModel() {
        val model = deviceModel ?: return
        scope.launch { model.download() }
    }

    /** "Type the numbers yourself": an empty review, nothing sent. */
    fun typeInstead() {
        document = document.copy(extraction = null, error = null, source = document.source ?: SourceKind.MANUAL)
        review = initialReview(content.pointerSchemas.getValue(DocType.PAYSTUB.schemaFile), null)
        navigate(Route.Review)
    }

    fun confirmRow(name: String) = updateRows { it.copy(status = RowStatus.CONFIRMED).takeIf { r -> r.name == name } }

    fun confirmAll() {
        review = review.copy(
            rows = review.rows.map { if (it.status == RowStatus.PENDING) it.copy(status = RowStatus.CONFIRMED) else it },
            deductions = review.deductions.map { if (it.status == RowStatus.PENDING && parseReviewNumber(it.amount) != null) it.copy(status = RowStatus.CONFIRMED) else it },
            result = null,
        )
    }

    /** Saves an edited value. Returns false when a number field does not hold a number. */
    fun saveRow(name: String, text: String): Boolean {
        val row = review.rows.find { it.name == name } ?: return false
        val value = text.trim()
        if (row.kind == FieldKind.NUMBER && value.isNotEmpty() && parseReviewNumber(value) == null) return false
        updateRows { r -> if (r.name == name) r.copy(text = value, status = if (value.isEmpty()) RowStatus.EMPTY else RowStatus.CONFIRMED) else null }
        return true
    }

    private fun updateRows(change: (ReviewRow) -> ReviewRow?) {
        review = review.copy(rows = review.rows.map { change(it) ?: it }, result = null)
    }

    fun addDeduction() {
        review = review.copy(deductions = review.deductions + DeductionRow("", "", RowStatus.PENDING, emptyList()), result = null)
    }

    fun updateDeduction(index: Int, amount: String, kind: String) {
        review = review.copy(
            deductions = review.deductions.mapIndexed { i, d -> if (i == index) d.copy(amount = amount, kind = kind, status = RowStatus.PENDING) else d },
            result = null,
        )
    }

    /** Confirms a deduction. Returns false when its amount is not a number. */
    fun confirmDeduction(index: Int): Boolean {
        val d = review.deductions.getOrNull(index) ?: return false
        if (parseReviewNumber(d.amount) == null) return false
        review = review.copy(deductions = review.deductions.mapIndexed { i, x -> if (i == index) x.copy(status = RowStatus.CONFIRMED) else x }, result = null)
        return true
    }

    fun removeDeduction(index: Int) {
        review = review.copy(deductions = review.deductions.filterIndexed { i, _ -> i != index }, result = null)
    }

    /** Validation and annualization of every confirmed paystub (shared/validation/SPEC.md). */
    fun checkReview() {
        val values = document.confirmedStubs + toValues(review)
        review = review.copy(result = Validation.validatePaystubs(values, content.pack.jurisdiction))
    }

    /** Keeps this paystub and adds another one. */
    fun addAnotherPaystub() {
        document = DocumentSession(language = document.language, confirmedStubs = document.confirmedStubs + toValues(review))
        review = ReviewState()
        navigate(Route.Document)
    }

    /** Uses the worked-out yearly income as the income answer; band-based `maybe` results become clear. */
    fun useAnnualIncome() {
        val annual = review.result?.annualization ?: return
        answers = answers.with(INCOME_STEP, AnswerValue.ExactIncome(annual.annualIncome.toDouble(), fromDocument = true))
        persist()
        navigate(Route.Results)
    }

    fun deleteEverything(onDone: () -> Unit = {}) {
        requests.clear()
        answers = QuickCheckAnswers()
        document = DocumentSession(language = strings.language.tag)
        review = ReviewState()
        outbound.clear()
        scope.launch {
            withContext(io) { repository.deleteAll() }
            languageStore.clear()
            strings = strings.withLanguage(languageStore.current())
            document = DocumentSession(language = strings.language.tag)
            route = Route.Start
            notice = "delete.done"
            onDone()
        }
    }

    private fun persist() {
        val snapshot = encodeAnswers(answers)
        scope.launch(io) { repository.save(snapshot) }
    }
}
