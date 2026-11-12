package app.silhouette.benefits

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.data.EncryptedAnswerRepository
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.INCOME_STEP
import app.silhouette.benefits.quickcheck.QuickCheckAnswers
import app.silhouette.benefits.quickcheck.computeVerdicts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class QuickCheckFlowTest {
    private val clean = CleanStateRule()
    private val compose = createAndroidComposeRule<MainActivity>()

    @get:Rule
    val rules: TestRule = RuleChain.outerRule(clean).around(compose)

    private val app: SilhouetteApplication get() = ApplicationProvider.getApplicationContext()
    private val t get() = clean.english()

    /** Every action also runs the Accessibility Test Framework checks (touch targets, labels, contrast). */
    @Before
    fun accessibilityChecks() = compose.enableAccessibilityChecks()

    private fun tag(tag: String): SemanticsNodeInteraction = compose.onNodeWithTag(tag, useUnmergedTree = true)

    private fun click(tag: String) {
        tag(tag).performScrollTo().performClick()
        compose.waitForIdle()
    }

    /** For the top bar and dialogs, which do not scroll. */
    private fun tap(tag: String) {
        tag(tag).performClick()
        compose.waitForIdle()
    }

    private fun onQuestion(id: String) {
        compose.onNodeWithText(t("question.$id.label")).assertExists()
    }

    private fun waitForText(text: String) = compose.waitUntil(5_000) {
        compose.onAllNodes(hasText(text)).fetchSemanticsNodes().isNotEmpty()
    }

    @Test
    fun completeTheQuickCheckAndReachVerdicts() {
        waitForText(t("start.begin"))
        click("start-begin")
        onQuestion("householdSize")
        tag("demo-banner").assertExists()
        click("stepper-increase") // empty → minimum (1)
        click("stepper-increase") // 2
        click("question-next")
        onQuestion("numChildren")
        click("stepper-increase") // 0
        click("stepper-increase") // 1
        click("question-next")
        onQuestion("hasEarnedIncome")
        click("option-yes")
        click("question-next")
        onQuestion(INCOME_STEP)
        click("option-exact")
        tag("exact-private-note").assertExists()
        tag("exact-income").performScrollTo().performTextInput("32,000")
        click("question-next")
        onQuestion("housing")
        click("option-renter")
        click("question-next")
        onQuestion("benefits")
        click("question-next") // nothing ticked: "none of these"
        onQuestion("hasOlderMember")
        click("option-no")
        click("question-next")
        onQuestion("residentStatus")
        tag("sensitive-note").assertExists()
        click("option-eligible")
        click("question-next") // "See results"
        compose.onNodeWithText(t("results.title")).assertExists()

        val expected = computeVerdicts(
            app.content.pack, app.content.bands, app.content.steps,
            QuickCheckAnswers()
                .with("householdSize", AnswerValue.Count(2))
                .with("numChildren", AnswerValue.Count(1))
                .with("hasEarnedIncome", AnswerValue.Choice("yes"))
                .with(INCOME_STEP, AnswerValue.ExactIncome(32000))
                .with("housing", AnswerValue.Choice("renter"))
                .with("benefits", AnswerValue.Picks(emptyList()))
                .with("hasOlderMember", AnswerValue.Choice("no"))
                .with("residentStatus", AnswerValue.Choice("eligible")),
        )
        assertTrue(expected.map { it.verdict }.toSet().size > 1)
        for (result in expected) {
            compose.onNode(
                hasTestTag("program-${result.programId}") and hasAnyAncestor(hasTestTag("group-${result.verdict.wire}")),
                useUnmergedTree = true,
            ).assertExists()
        }
        tag("leaving-status").assertExists()
        compose.onNodeWithText(t("leaving.none"), substring = true).assertExists()
    }

    @Test
    fun skipTheSensitiveQuestionThenAnswerItFromTheProgram() {
        waitForText(t("start.begin"))
        click("start-begin")
        for (step in app.content.steps) {
            onQuestion(step.id)
            when (step.id) {
                "householdSize" -> click("stepper-increase") // 1
                INCOME_STEP -> click("option-A")
                else -> {
                    click("question-skip")
                    continue
                }
            }
            click("question-next")
        }
        compose.onNodeWithText(t("results.title")).assertExists()
        compose.onNode(hasTestTag("program-food-help") and hasAnyAncestor(hasTestTag("group-depends")), useUnmergedTree = true).assertExists()
        click("program-food-help")
        tag("verdict-${Verdict.DEPENDS.wire}").assertExists()
        click("answer-residentStatus")
        onQuestion("residentStatus")
        tag("sensitive-note").assertExists()
        click("option-eligible")
        click("question-next")
        // Back on the program, now decided.
        tag("verdict-${Verdict.LIKELY.wire}").assertExists()
        compose.onNodeWithText(t.programName("food-help", "Test Food Help")).assertExists()
    }

    @Test
    fun deleteEverythingClearsStoredData() {
        waitForText(t("start.begin"))
        click("start-begin")
        click("stepper-increase")
        click("question-next")
        val store = app.store
        compose.waitUntil(5_000) { store.exists(EncryptedAnswerRepository.RECORD) }
        assertTrue(store.hasKey())
        assertTrue(app.store.read(EncryptedAnswerRepository.RECORD)!!.isNotEmpty())

        click("delete-everything")
        compose.onNodeWithText(t("delete.title")).assertIsDisplayed()
        compose.onNodeWithTag("delete-confirm").performClick()
        waitForText(t("delete.done"))
        assertFalse(store.exists(EncryptedAnswerRepository.RECORD))
        assertFalse(store.hasKey())
        compose.onNodeWithText(t("start.begin")).assertExists()
    }

    @Test
    fun switchLanguage() {
        waitForText(t("start.begin"))
        val ko = app.content.strings(AppLanguage.KO)
        tap("language-button")
        compose.onNodeWithTag("language-ko").performClick()
        waitForText(ko("start.title"))
        compose.onNodeWithText(ko("start.begin")).assertExists()
        compose.onNodeWithText(ko("demo.title")).assertExists()
        compose.onNodeWithText(ko("leaving.none"), substring = true).assertExists()
        assertEquals(AppLanguage.KO, app.content.strings(AppLanguage.KO).language)

        tap("language-button")
        compose.onNodeWithTag("language-es").performClick()
        val es = app.content.strings(AppLanguage.ES)
        waitForText(es("start.title"))
        click("start-begin")
        compose.onNodeWithText(es("question.householdSize.label")).assertExists()
    }
}
