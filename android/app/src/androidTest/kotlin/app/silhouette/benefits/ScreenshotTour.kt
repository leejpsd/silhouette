package app.silhouette.benefits

import android.content.res.Configuration
import android.graphics.Bitmap
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.silhouette.benefits.core.SkeletonPiece
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.ui.AppViewModel
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import java.io.File

/**
 * Walks every screen and saves screenshots to the test output folder that the Android Gradle
 * plugin copies to `app/build/outputs/connected_android_test_additional_output/`.
 * Runs only when the instrumentation argument `screenshots` is `true`; dark mode and font scale
 * come from the device settings, and the language is chosen in the app.
 */
@RunWith(AndroidJUnit4::class)
class ScreenshotTour {
    private val clean = CleanStateRule()
    private val compose = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val rules: TestRule = RuleChain.outerRule(clean).around(compose)

    private val application: SilhouetteApplication get() = ApplicationProvider.getApplicationContext()
    private val args = InstrumentationRegistry.getArguments()
    private var prefix = ""
    private var n = 0

    private fun shot(name: String) {
        compose.waitForIdle()
        // Let the new frame reach the display before the system screenshot.
        Thread.sleep(400)
        compose.waitForIdle()
        // The whole display, so dialogs and menus (separate windows) are included.
        val image = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        val dir = (args.getString("additionalTestOutputDir")?.let(::File) ?: File(application.getExternalFilesDir(null), "screenshots")).apply { mkdirs() }
        File(dir, "$prefix-${"%02d".format(++n)}-$name.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun scrollTo(tag: String) {
        compose.onNodeWithTag(tag, useUnmergedTree = true).performScrollTo()
        compose.waitForIdle()
    }

    private fun click(tag: String) {
        compose.onNodeWithTag(tag, useUnmergedTree = true).performScrollTo().performClick()
        compose.waitForIdle()
    }

    /** For the top bar and the leaving bar, which do not scroll. */
    private fun tap(tag: String) {
        compose.onNodeWithTag(tag, useUnmergedTree = true).performClick()
        compose.waitForIdle()
    }

    /** Waits for the app, switches to the requested language and names the files. */
    private fun setUp(tour: String): AppLanguage {
        assumeTrue(args.getString("screenshots") == "true")
        val language = AppLanguage.fromTag(args.getString("language")) ?: AppLanguage.EN
        val config = application.resources.configuration
        val theme = if (config.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
        prefix = "${language.tag}-$theme-font${(config.fontScale * 100).toInt()}-$tour"
        compose.waitUntil(5_000) { compose.onAllNodes(hasTestTag("language-button"), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        if (language != AppLanguage.EN) {
            tap("language-button")
            compose.onNodeWithTag("language-${language.tag}").performClick()
            val t = application.content.strings(language)
            compose.waitUntil(5_000) { compose.onAllNodes(hasText(t("start.title"))).fetchSemanticsNodes().isNotEmpty() }
        }
        return language
    }

    private fun controller() = ViewModelProvider(compose.activity)[AppViewModel::class.java].controller

    @Test
    fun documentTour() {
        setUp("doc")
        click("start-document")
        shot("document-add")
        scrollTo("samples")
        shot("document-samples")
        click("sample-paystub-en-01")
        shot("preview")
        compose.runOnIdle {
            val app = controller()
            app.hideWord(app.document.skeleton!!.pieces.filterIsInstance<SkeletonPiece.KeptWord>().first { it.text == "Statement" }.hideKey)
        }
        scrollTo("hidden-notice")
        shot("preview-hidden")
        click("undo-hide")
        scrollTo("preview-send")
        shot("preview-bottom")
        click("preview-send")
        compose.waitUntil(5_000) { compose.onAllNodes(hasTestTag("inference-badge"), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        scrollTo("inference-badge")
        shot("review")
        scrollTo("field-payDate")
        shot("review-date")
        click("confirm-all")
        click("review-check")
        scrollTo("checks")
        shot("review-checks")
        scrollTo("use-income")
        shot("review-annual")
        click("use-income")
        shot("results-from-document")
        tap("leaving-details")
        shot("leaving-ledger")
    }

    @Test
    fun tour() {
        setUp("qc")
        shot("start")
        click("start-begin")
        click("stepper-increase")
        click("stepper-increase")
        click("stepper-increase")
        shot("question-int")
        click("question-next")
        click("question-skip") // numChildren
        click("option-yes")
        shot("question-enum")
        click("question-next")
        click("option-exact")
        shot("question-income-exact")
        click("option-B")
        shot("question-income-band")
        click("question-next")
        click("option-renter")
        click("question-next")
        click("option-snap")
        shot("question-multi")
        click("question-next")
        click("question-skip") // hasOlderMember
        shot("question-sensitive")
        click("question-skip") // residentStatus
        shot("results")
        click("program-food-help")
        shot("program")
        tap("leaving-details")
        shot("leaving-open")
        tap("leaving-details")
        click("delete-everything")
        shot("delete-dialog")
    }
}
