package app.silhouette.benefits.snapshots

import android.content.res.Configuration
import android.graphics.Bitmap
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.silhouette.benefits.TestContent
import app.silhouette.benefits.ai.CloudGate
import app.silhouette.benefits.ai.DeviceModel
import app.silhouette.benefits.ai.DeviceModelState
import app.silhouette.benefits.ai.DeviceReadingTask
import app.silhouette.benefits.ai.DeviceText
import app.silhouette.benefits.ai.ExplainSettings
import app.silhouette.benefits.ai.ExtractOptions
import app.silhouette.benefits.ai.FailureKind
import app.silhouette.benefits.ai.FakeModelPort
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.LoggedModelPort
import app.silhouette.benefits.ai.ModelCall
import app.silhouette.benefits.ai.ModelFailure
import app.silhouette.benefits.ai.ModelPointerExtractor
import app.silhouette.benefits.ai.ModelPort
import app.silhouette.benefits.ai.ModelReply
import app.silhouette.benefits.ai.ModelSettings
import app.silhouette.benefits.ai.OnDeviceText
import app.silhouette.benefits.ai.PersonalRequest
import app.silhouette.benefits.ai.PersonalTasks
import app.silhouette.benefits.ai.PointerExtraction
import app.silhouette.benefits.ai.PointerExtractor
import app.silhouette.benefits.ai.PointerRequest
import app.silhouette.benefits.ai.PointerRequestBuilder
import app.silhouette.benefits.ai.PointerResult
import app.silhouette.benefits.ai.SampleAnswerKeyExtractor
import app.silhouette.benefits.ai.TextTasks
import app.silhouette.benefits.core.DevicePart
import app.silhouette.benefits.core.Skeleton
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.data.AnswerRepository
import app.silhouette.benefits.data.LanguageStore
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.device.FakeDevice
import app.silhouette.benefits.devicecheck.CheckEnvironment
import app.silhouette.benefits.devicecheck.DeviceCheckController
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.ui.SilhouetteApp
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.util.TimeZone

/**
 * A capture of every screen and state, as tooling for design work: English and Spanish, light and
 * dark, default and largest font scale. Runs on the JVM (Robolectric, native graphics), no device:
 *
 *     ./gradlew :app:testDebugUnitTest -Psnapshots
 *
 * Images: app/build/snapshots/{nn}-{state}-{language}-{light|dark}-font{100|200}.png. Synthetic data
 * and fake models only; nothing is sent anywhere.
 */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h2800dp-mdpi")
class SnapshotTour {
    @get:Rule
    val compose = createComposeRule()

    private val content = TestContent.california
    private val out = File(System.getProperty("silhouette.snapshots") ?: "build/snapshots").apply { mkdirs() }
    private val shown = mutableStateOf<AppController?>(null)

    @Test fun englishLight() = tour(AppLanguage.EN, dark = false, scale = 1f)
    @Test fun englishDark() = tour(AppLanguage.EN, dark = true, scale = 1f)
    @Test fun englishLightLargest() = tour(AppLanguage.EN, dark = false, scale = 2f)
    @Test fun englishDarkLargest() = tour(AppLanguage.EN, dark = true, scale = 2f)
    @Test fun spanishLight() = tour(AppLanguage.ES, dark = false, scale = 1f)
    @Test fun spanishDark() = tour(AppLanguage.ES, dark = true, scale = 1f)
    @Test fun spanishLightLargest() = tour(AppLanguage.ES, dark = false, scale = 2f)
    @Test fun spanishDarkLargest() = tour(AppLanguage.ES, dark = true, scale = 2f)

    // ---------- Fakes ----------

    private class Memory : AnswerRepository {
        override fun load(): JsonElement? = null
        override fun save(answers: JsonObject) = Unit
        override fun deleteAll() = Unit
    }

    private class Language(var current: AppLanguage) : LanguageStore {
        override fun current() = current
        override fun set(language: AppLanguage) {
            current = language
        }
        override fun clear() = Unit
    }

    private class Device(state: DeviceModelState) : DeviceModel {
        override val state: StateFlow<DeviceModelState> = MutableStateFlow(state)
        override suspend fun refresh() = Unit
        override suspend fun download() = Unit
    }

    /** A model that never answers (the loading state). */
    private object Silent : ModelPort, DeviceText {
        override suspend fun generate(call: ModelCall): ModelReply = CompletableDeferred<ModelReply>().await()
        override suspend fun generate(system: app.silhouette.benefits.ai.CloudText, user: app.silhouette.benefits.ai.CloudText): String = CompletableDeferred<String>().await()
    }

    /** An extractor that finds nothing (not a paystub). */
    private object Nothing : PointerExtractor {
        override val destination = "test"
        override fun canRead(skeleton: Skeleton, language: String) = true
        override suspend fun extract(request: PointerRequest, options: ExtractOptions) = PointerResult(JsonObject(emptyMap()), InferenceSource.IN_CLOUD, "document-silhouette-only")
    }

    private val settings = object : ModelSettings, ExplainSettings {
        override val pointerPromptVersion: Int? = 5
        override val onDeviceLocales: Set<String> = setOf("en")
        override val shortTextMaxWords: Int = 80
    }

    private val clock = 1_794_960_000_000L

    private inner class Built(val app: AppController, val log: OutboundLog)

    private fun build(
        language: AppLanguage,
        device: DeviceModelState = DeviceModelState.Unavailable,
        port: ModelPort = FakeModelPort(*Array(4) { FakeModelPort.reply("The program helps with the cost of food. The information about this program lists where to apply.", InferenceSource.IN_CLOUD) }),
        deviceText: DeviceText = FakeDevice(),
        extractors: List<PointerExtractor>? = null,
        withCheck: Boolean = true,
    ): Built {
        val log = OutboundLog(clock = { clock })
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        val available = device == DeviceModelState.Available
        val logged = LoggedModelPort(port, log, "gemini-test", CloudGate.OPEN) { available }
        val builder = PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas)
        val sampleKey = SampleAnswerKeyExtractor(
            content.samples.map { SampleAnswerKeyExtractor.Sample(it.id, it.language, skeletonize(it.text, content.allowlist(it.language)).skeleton, content.sampleAnswers.getValue(it.id)) },
        )
        val model = ModelPointerExtractor(
            logged, builder, settings, reachable = { true },
            deviceReading = DeviceReadingTask(deviceText, content.pointerPrompts, content.devicePartPrompts, content.pointerSchemas, available = { available }),
            deviceAvailable = { available }, onAnsweredOnDevice = { log.recordAnswered(it) },
        )
        val personal = PersonalTasks(object : OnDeviceText {
            override suspend fun generate(request: PersonalRequest) = "The rules on this phone show this result because your yearly income range is under the limit."
        }, content.prompts, content.outputChecks)
        val check = if (withCheck) {
            val runs = File(TestContent.sharedDir, "fixtures/device-check/runs").listFiles()!!.associate { it.name to it.readText() }
            DeviceCheckController(
                scope, { null }, { CheckEnvironment("Silhouette 0.1.0", "Android 16", "", null) }, { _, _ -> }, runs,
                Json.parseToJsonElement(File(TestContent.sharedDir, "schemas/device-check-run.v3.json").readText()) as JsonObject,
            )
        } else {
            null
        }
        val app = AppController(
            content, Memory(), Language(language), log, scope, Dispatchers.Main, PointerExtraction(extractors ?: listOf(model, sampleKey)),
            deviceModel = Device(device),
            textTasks = TextTasks(logged, content.prompts, content.outputChecks, settings, { available }, "gemini-test"),
            personalTasks = personal,
            explainSettings = settings,
            deviceCheck = check,
        )
        app.load()
        shown.value = app
        idle()
        return Built(app, log)
    }

    // ---------- Scenes ----------

    private fun idle() {
        org.robolectric.shadows.ShadowLooper.idleMainLooper()
        compose.waitForIdle()
    }

    /** Scrolls a control into view and taps it (a long page at the largest font is taller than the window). */
    private fun click(tag: String) {
        val node = compose.onAllNodesWithTag(tag, useUnmergedTree = true)[0]
        runCatching { node.performScrollTo() }
        node.performClick()
        idle()
    }

    /** Taps a control that only some configurations show (the device's own explanation is English-only here). */
    private fun clickIfShown(tag: String) {
        if (compose.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()) click(tag)
    }

    private fun household(b: Built): Built {
        b.app.fillPreparedHousehold()
        idle()
        return b
    }

    private fun scenes(language: AppLanguage): List<Pair<String, () -> AppController>> {
        fun go(route: Route, b: Built = build(language)): AppController {
            b.app.navigate(route)
            return b.app
        }
        fun question(id: String) = Route.Question(id)
        fun sample(b: Built): Built {
            b.app.openSamplePaystub()
            idle()
            return b
        }
        val failing = { reason: String -> FakeModelPort(*Array(4) { FakeModelPort.fail(FailureKind.CLOUD, reason) }) }
        val blocked = FakeModelPort(*Array(4) { FakeModelPort.reply("You qualify for this program.", InferenceSource.IN_CLOUD) })
        val shortDeductions = FakeDevice(override = { part, _ -> if (part == DevicePart.DEDUCTIONS || part == DevicePart.DEDUCTIONS_AGAIN) "{\"deductions\":[{\"amount\":\"N14\",\"kind\":\"federal_tax\"}]}" else null })
        return listOf(
            "start" to { build(language).app },
            "start-after-delete" to { build(language).app.also { it.deleteEverything(); idle() } },
            "question-number" to { go(question("householdSize")) },
            "question-number-error" to { go(question("householdSize")).also { idle(); click("question-next") } },
            "question-yes-no" to { go(question("hasChildUnder6")) },
            "question-choice" to { go(question("ageGroup")) },
            "question-multi" to { go(question("benefits")) },
            "question-income" to { go(question("income")) },
            "question-income-exact" to { go(question("income")).also { idle(); click("option-exact"); compose.onAllNodesWithTag("exact-income")[0].performTextInput("28,000.50"); idle() } },
            "question-sensitive" to { go(question("filingStatus")) },
            "question-money" to { go(question("investmentIncome")).also { idle(); compose.onAllNodesWithTag("amount-field")[0].performTextInput("1,200"); idle() } },
            "results-before-answers" to { go(Route.Results) },
            "results" to { household(build(language)).app },
            "results-after-send" to { household(build(language)).also { it.log.finish(it.log.begin(OutboundLog.Channel.AI_CLOUD, "firebasevertexai.googleapis.com", listOf("program-facts"), null), OutboundLog.Status.SENT, "200") }.app },
            "program" to { household(build(language)).app.also { it.navigate(Route.Program("caleitc")) } },
            "program-unlikely" to { household(build(language)).app.also { it.navigate(Route.Program("fera")) } },
            "program-send-step" to { household(build(language)).app.also { it.navigate(Route.Program("caleitc")); idle(); click("about-explain") } },
            "program-answer" to { household(build(language)).app.also { it.navigate(Route.Program("caleitc")); idle(); click("about-explain"); click("send-send") } },
            "program-blocked" to { household(build(language, port = blocked)).app.also { it.navigate(Route.Program("caleitc")); idle(); click("about-explain"); click("send-send") } },
            "program-daily-limit" to { household(build(language, port = failing("quota-daily"))).app.also { it.navigate(Route.Program("caleitc")); idle(); click("about-explain"); click("send-send") } },
            "program-loading" to { household(build(language, port = Silent)).app.also { it.navigate(Route.Program("caleitc")); idle(); click("about-explain"); click("send-send") } },
            "program-on-device" to { household(build(language, device = DeviceModelState.Available)).app.also { it.navigate(Route.Program("caleitc")); idle(); clickIfShown("why-explain") } },
            "add-paystub" to { go(Route.Document) },
            "add-paystub-model-downloadable" to { go(Route.Document, build(language, device = DeviceModelState.Downloadable)) },
            "add-paystub-model-downloading" to { go(Route.Document, build(language, device = DeviceModelState.Downloading(120_000_000))) },
            "preview" to { sample(build(language)).app },
            "preview-on-device" to { sample(build(language, device = DeviceModelState.Available)).app },
            "preview-word-hidden" to { sample(build(language)).app.also { it.hideWord("STAFFING") } },
            "preview-reading" to { sample(build(language, device = DeviceModelState.Available, deviceText = Silent)).app.also { it.keepOnDevice(); idle() } },
            "preview-unreliable" to { sample(build(language, device = DeviceModelState.Available, deviceText = FakeDevice(override = { _, _ -> "not json" }))).app.also { it.keepOnDevice(); idle() } },
            "preview-daily-limit" to { sample(build(language, port = failing("quota-daily"), extractors = null)).app.also { it.send(); idle() } },
            "preview-no-app-check" to { sample(build(language, port = failing(LoggedModelPort.NO_APP_CHECK))).app.also { it.send(); idle() } },
            "review" to { sample(build(language, extractors = listOf(sampleKeyOnly()))).app.also { it.send(); idle() } },
            "review-more-values" to { sample(build(language, extractors = listOf(sampleKeyOnly()))).app.also { it.send(); idle(); click("more-values") } },
            "review-not-read" to { sample(build(language, device = DeviceModelState.Available, deviceText = shortDeductions)).app.also { it.keepOnDevice(); idle(); click("more-values") } },
            "review-yearly-income" to { sample(build(language, extractors = listOf(sampleKeyOnly()))).app.also { it.send(); idle(); it.confirmAll(); it.checkReview(); idle() } },
            "review-checks-warn" to { sample(build(language, extractors = listOf(sampleKeyOnly()))).app.also { it.send(); idle(); it.confirmAll(); it.saveRow("grossPay", "100"); it.checkReview(); idle() } },
            "review-not-a-paystub" to { sample(build(language, extractors = listOf(Nothing))).app.also { it.send(); idle() } },
            "review-typed" to { build(language).app.also { it.typeInstead() } },
            "record-every-status" to { record(build(language)).app.also { it.openRecord() } },
            "record-deleted" to { build(language).app.also { it.deleteEverything(); idle(); it.openRecord() } },
            "draft-rules-sheet" to { build(language).app.also { idle(); click("demo-more") } },
            "language" to { build(language).app.also { idle(); click("language-button") } },
            "judges" to { go(Route.Judges) },
            "device-check-no-model" to { go(Route.DeviceCheck, build(language, withCheck = true)) },
            "device-check-recording" to { build(language, withCheck = true).app.also { it.navigate(Route.DeviceCheck); it.deviceCheck!!.showRecording(it.deviceCheck!!.recordings.keys.first()) } },
            "delete-confirmation" to { build(language).app.also { idle(); click("delete-everything") } },
        )
    }

    private fun sampleKeyOnly() = SampleAnswerKeyExtractor(
        content.samples.map { SampleAnswerKeyExtractor.Sample(it.id, it.language, skeletonize(it.text, content.allowlist(it.language)).skeleton, content.sampleAnswers.getValue(it.id)) },
    )

    /** The record with one entry of every status. */
    private fun record(b: Built): Built {
        val log = b.log
        log.finish(log.begin(OutboundLog.Channel.APP_CHECK, "firebaseappcheck.googleapis.com", listOf("app-check-token-request"), null), OutboundLog.Status.SENT, "200")
        log.finish(log.begin(OutboundLog.Channel.AI_CLOUD, "firebasevertexai.googleapis.com", listOf("document-silhouette"), null, "/…/models/gemini:generateContent", "gemini"), OutboundLog.Status.SENT, "200")
        log.begin(OutboundLog.Channel.AI_CLOUD, "firebasevertexai.googleapis.com", listOf("program-facts"), null)
        log.finish(log.begin(OutboundLog.Channel.REMOTE_CONFIG, "firebaseremoteconfig.googleapis.com", listOf("remote-config"), null), OutboundLog.Status.FAILED, failureReason = "IOException")
        log.recordBlocked(OutboundLog.Channel.AI_CLOUD, "firebasevertexai.googleapis.com", listOf("document-silhouette"), OutboundLog.NO_APP_CHECK)
        log.recordAnswered(listOf("document-silhouette"))
        return b
    }

    // ---------- Capture ----------

    /**
     * Draws the topmost window (a dialog or menu when one is open, else the screen) into a bitmap,
     * the way the platform draws it, without waiting for a frame.
     */
    private fun drawTopWindow(): Bitmap {
        val global = Class.forName("android.view.WindowManagerGlobal")
        val instance = global.getMethod("getInstance").invoke(null)
        val field = global.getDeclaredField("mViews").apply { isAccessible = true }
        @Suppress("UNCHECKED_CAST")
        val views = (field.get(instance) as List<android.view.View>).filter { it.isAttachedToWindow && it.width > 0 && it.height > 0 }
        val view = views.last()
        val screen = views.first()
        val bitmap = Bitmap.createBitmap(screen.width, screen.height, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bitmap)
        // A dialog or menu is drawn over the dimmed screen, as a person sees it.
        if (views.size > 1) {
            views.first().draw(canvas)
            canvas.drawColor(0x66000000)
            val location = IntArray(2)
            view.getLocationOnScreen(location)
            canvas.translate(location[0].toFloat(), location[1].toFloat())
        }
        view.draw(canvas)
        return bitmap
    }

    private fun tour(language: AppLanguage, dark: Boolean, scale: Float) {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"))
        compose.setContent {
            val base = LocalConfiguration.current
            val conf = Configuration(base).apply {
                uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or if (dark) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
                fontScale = scale
            }
            CompositionLocalProvider(LocalConfiguration provides conf, LocalDensity provides Density(LocalDensity.current.density, scale)) {
                shown.value?.let { SilhouetteApp(it) }
            }
        }
        val suffix = "${language.tag}-${if (dark) "dark" else "light"}-font${(scale * 100).toInt()}"
        val failures = ArrayList<String>()
        for ((i, scene) in scenes(language).withIndex()) {
            val name = "%02d-%s-%s.png".format(i + 1, scene.first, suffix)
            try {
                shown.value = null
                idle()
                val app = scene.second()
                if (shown.value !== app) shown.value = app
                idle()
                val image = drawTopWindow()
                File(out, name).outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
            } catch (e: Throwable) {
                failures += "$name: ${e.javaClass.simpleName}: ${e.message?.take(200)}"
            }
        }
        check(failures.isEmpty()) { "scenes that could not be captured:\n" + failures.joinToString("\n") }
    }
}
