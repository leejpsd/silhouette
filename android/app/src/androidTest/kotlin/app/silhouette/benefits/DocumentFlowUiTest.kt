package app.silhouette.benefits

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.lifecycle.ViewModelProvider
import app.silhouette.benefits.core.SkeletonPiece
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.ui.AppViewModel
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.INCOME_STEP
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/** The document part of the app with the built-in samples and their fixed sample answers. */
@RunWith(AndroidJUnit4::class)
class DocumentFlowUiTest {
    private val clean = CleanStateRule()
    private val compose = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val rules: TestRule = RuleChain.outerRule(clean).around(compose)

    private val app: SilhouetteApplication get() = ApplicationProvider.getApplicationContext()
    private val t get() = clean.english()

    @Before
    fun accessibilityChecks() = compose.enableAccessibilityChecks()

    private fun tag(tag: String): SemanticsNodeInteraction = compose.onNodeWithTag(tag, useUnmergedTree = true)

    private fun click(tag: String) {
        tag(tag).performScrollTo().performClick()
        compose.waitForIdle()
    }

    private fun waitForTag(tag: String) = compose.waitUntil(5_000) {
        compose.onAllNodes(androidx.compose.ui.test.hasTestTag(tag), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
    }

    @Test
    fun sampleDocumentToYearlyIncome() {
        compose.waitUntil(5_000) { compose.onAllNodes(hasText(t("start.begin"))).fetchSemanticsNodes().isNotEmpty() }
        click("start-document")
        compose.onNodeWithText(t("doc.title")).assertExists()
        tag("photo-option").assertExists()
        click("sample-paystub-en-01")

        // Preview: the silhouette, its counts, and an honest sentence about where it is read.
        tag("skeleton-preview").assertExists()
        compose.onNodeWithText(t("preview.counts", "numbers" to 22, "dates" to 3, "words" to 12)).assertExists()
        compose.onNodeWithText(t("preview.sample")).assertExists()
        click("preview-send")

        // Review: badge and reason, values next to their source lines.
        waitForTag("inference-source-SAMPLE_ANSWER_KEY")
        tag("inference-reason").assertExists()
        tag("value-grossPay").assertExists()
        compose.onNodeWithText("1,271.88", useUnmergedTree = true).assertExists()
        click("confirm-all")
        click("review-check")
        waitForTag("annual-amount")
        compose.onNodeWithText("29,233", useUnmergedTree = true).assertExists()
        tag("annual-basis").assertExists()
        click("use-income")

        compose.onNodeWithText(t("results.title")).assertExists()
        tag("income-from-document").assertExists()
        assertEquals(AnswerValue.ExactIncome(29233.0, fromDocument = true), latestAnswer())

        // Nothing left the device; the ledger says so, entry by entry.
        compose.onNodeWithText(t("leaving.none"), substring = true).assertExists()
        assertTrue(app.outbound.entries.value.single().status == OutboundLog.Status.KEPT_ON_DEVICE)
    }

    @Test
    fun hideAWordAndUndo() {
        compose.waitUntil(5_000) { compose.onAllNodes(hasText(t("start.begin"))).fetchSemanticsNodes().isNotEmpty() }
        click("start-document")
        click("paste-text")
        tag("paste-text").performTextInput("Employer: Northwind\nGross Pay 1,000.00")
        click("paste-continue")
        compose.onNodeWithText(t("preview.noExtractor")).assertExists()
        tag("hidden-notice").assertDoesNotExist()
        // Hide "Gross" through its link in the preview.
        compose.runOnIdle { appController().hideWord(appController().document.skeleton!!.pieces.filterIsInstance<SkeletonPiece.KeptWord>().first { it.text == "Gross" }.ordinal) }
        tag("hidden-notice").assertExists()
        compose.onNodeWithText(t("preview.counts", "numbers" to 1, "dates" to 0, "words" to 3)).assertExists()
        click("undo-hide")
        compose.onNodeWithText(t("preview.counts", "numbers" to 1, "dates" to 0, "words" to 1)).assertExists()
        click("preview-type")
        compose.onNodeWithText(t("review.manualLead")).assertExists()
        assertTrue(app.outbound.entries.value.isEmpty())
    }

    @Test
    fun typedIncomeWithDecimalsIsUnderstoodAsWritten() {
        compose.waitUntil(5_000) { compose.onAllNodes(hasText(t("start.begin"))).fetchSemanticsNodes().isNotEmpty() }
        compose.runOnIdle { appController().navigate(Route.Question(INCOME_STEP)) }
        click("option-exact")
        tag("exact-income").performScrollTo().performTextInput("28000.50")
        compose.onNodeWithText(t("q.amountUnderstood", "amount" to "28,000.50")).assertExists()
        tag("exact-income").performTextReplacement("28.000,50")
        tag("amount-understood").assertDoesNotExist()
        click("question-next")
        compose.onNodeWithText(t("q.error.amount")).assertExists()
        tag("exact-income").performTextReplacement("$28,000.50")
        click("question-next")
        assertEquals(AnswerValue.ExactIncome(28000.5), latestAnswer())
    }

    private fun appController() = compose.activity.let { activity ->
        ViewModelProvider(activity)[AppViewModel::class.java].controller
    }

    private fun latestAnswer(): AnswerValue? {
        var value: AnswerValue? = null
        compose.runOnIdle { value = appController().answers[INCOME_STEP] }
        return value
    }
}
