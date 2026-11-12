package app.silhouette.benefits

import android.content.res.Configuration
import android.graphics.Bitmap
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.silhouette.benefits.i18n.AppLanguage
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

    private val app: SilhouetteApplication get() = ApplicationProvider.getApplicationContext()
    private val args = InstrumentationRegistry.getArguments()

    @Test
    fun tour() {
        assumeTrue(args.getString("screenshots") == "true")
        val language = AppLanguage.fromTag(args.getString("language")) ?: AppLanguage.EN
        val t = app.content.strings(language)
        val config = app.resources.configuration
        val theme = if (config.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES) "dark" else "light"
        val prefix = "${language.tag}-$theme-font${(config.fontScale * 100).toInt()}"
        // AGP passes a folder whose contents it copies to the build outputs after the run.
        val dir = (args.getString("additionalTestOutputDir")?.let(::File) ?: File(app.getExternalFilesDir(null), "screenshots")).apply { mkdirs() }
        var n = 0
        fun shot(name: String) {
            compose.waitForIdle()
            // The whole display, so dialogs and menus (separate windows) are included.
            val image = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
            File(dir, "$prefix-${"%02d".format(++n)}-$name.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
        fun tap(tag: String) {
            compose.onNodeWithTag(tag, useUnmergedTree = true).performClick()
            compose.waitForIdle()
        }
        fun click(tag: String) {
            compose.onNodeWithTag(tag, useUnmergedTree = true).performScrollTo().performClick()
            compose.waitForIdle()
        }

        compose.waitUntil(5_000) { compose.onAllNodes(hasText(app.content.strings(AppLanguage.EN)("start.begin"))).fetchSemanticsNodes().isNotEmpty() || language != AppLanguage.EN }
        if (language != AppLanguage.EN) {
            compose.onNodeWithTag("language-button", useUnmergedTree = true).performClick()
            compose.onNodeWithTag("language-${language.tag}").performClick()
            compose.waitUntil(5_000) { compose.onAllNodes(hasText(t("start.title"))).fetchSemanticsNodes().isNotEmpty() }
        }
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
