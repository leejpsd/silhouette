package app.silhouette.benefits

import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.quickcheck.AnswerError
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.Draft
import app.silhouette.benefits.quickcheck.EXACT_CHOICE
import app.silhouette.benefits.quickcheck.INCOME_STEP
import app.silhouette.benefits.quickcheck.QuickCheckAnswers
import app.silhouette.benefits.quickcheck.Step
import app.silhouette.benefits.quickcheck.computeVerdicts
import app.silhouette.benefits.quickcheck.decodeAnswers
import app.silhouette.benefits.quickcheck.draftToValue
import app.silhouette.benefits.quickcheck.encodeAnswers
import app.silhouette.benefits.quickcheck.firstOpenStep
import app.silhouette.benefits.quickcheck.groupByVerdict
import app.silhouette.benefits.quickcheck.stepCount
import app.silhouette.benefits.quickcheck.stepForVariable
import app.silhouette.benefits.quickcheck.toEngineAnswers
import app.silhouette.benefits.quickcheck.validateAnswer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class QuickCheckTest {
    private val content = TestContent.content
    private val steps = content.steps

    private fun step(id: String) = steps.first { it.id == id }

    private fun verdictOf(answers: QuickCheckAnswers, program: String) =
        computeVerdicts(content.pack, content.bands, steps, answers).first { it.programId == program }

    @Test
    fun `steps follow questionOrder with income as its own step`() {
        assertEquals(content.pack.questionOrder, steps.map { it.id })
        assertTrue(step(INCOME_STEP) is Step.Income)
        assertTrue(step("householdSize") is Step.IntQuestion)
        assertTrue(step("benefits") is Step.MultiQuestion)
        assertTrue(step("residentStatus").sensitive)
        val household = step("householdSize") as Step.IntQuestion
        assertEquals(1, household.min)
        assertEquals(20, household.max)
    }

    @Test
    fun `answers are validated against their step`() {
        val household = step("householdSize")
        assertNull(validateAnswer(household, AnswerValue.Count(3)))
        assertEquals(AnswerError.INTEGER, validateAnswer(household, AnswerValue.Count(0)))
        assertEquals(AnswerError.INTEGER, validateAnswer(household, AnswerValue.Count(21)))
        assertEquals(AnswerError.CHOOSE, validateAnswer(step("housing"), AnswerValue.Choice("tent")))
        assertNull(validateAnswer(step("benefits"), AnswerValue.Picks(emptyList())))
        assertEquals(AnswerError.CHOOSE, validateAnswer(step("benefits"), AnswerValue.Picks(listOf("snap", "snap"))))
        assertEquals(AnswerError.CHOOSE, validateAnswer(step(INCOME_STEP), AnswerValue.IncomeBandChoice("Z")))
        assertEquals(AnswerError.AMOUNT, validateAnswer(step(INCOME_STEP), AnswerValue.ExactIncome(-1)))
        assertNull(validateAnswer(step(INCOME_STEP), AnswerValue.ExactIncome(32000)))
    }

    @Test
    fun `drafts become answers`() {
        val household = step("householdSize") as Step.IntQuestion
        assertNull(draftToValue(household, Draft(text = " ")))
        assertEquals(AnswerValue.Count(4), draftToValue(household, Draft(text = " 4 ")))
        assertEquals(AnswerError.INTEGER, validateAnswer(household, draftToValue(household, Draft(text = "4.5"))!!))
        assertEquals(AnswerError.INTEGER, validateAnswer(household, draftToValue(household, Draft(text = "99999999999999"))!!))
        val income = step(INCOME_STEP)
        assertEquals(AnswerValue.ExactIncome(32500), draftToValue(income, Draft(text = "32,500", choice = EXACT_CHOICE)))
        assertEquals(AnswerValue.ExactIncome(-1), draftToValue(income, Draft(text = "lots", choice = EXACT_CHOICE)))
        assertEquals(AnswerValue.IncomeBandChoice("B"), draftToValue(income, Draft(choice = "B")))
        assertNull(draftToValue(income, Draft()))
        // Submitting a multi question with nothing ticked answers "none of these".
        assertEquals(AnswerValue.Picks(emptyList()), draftToValue(step("benefits"), Draft()))
        assertEquals(AnswerValue.Picks(listOf("snap", "ssi")), draftToValue(step("benefits"), Draft(picked = listOf("ssi", "snap"))))
    }

    @Test
    fun `the stepper stays within min and max`() {
        val household = step("householdSize") as Step.IntQuestion
        assertEquals("1", stepCount(household, "", 1))
        assertEquals("1", stepCount(household, "1", -1))
        assertEquals("20", stepCount(household, "20", 1))
        assertEquals("4", stepCount(household, "3", 1))
    }

    @Test
    fun `engine answers use incomeBand or annualIncome and drop skipped steps`() {
        val answers = QuickCheckAnswers()
            .with(INCOME_STEP, AnswerValue.IncomeBandChoice("C"))
            .with("householdSize", AnswerValue.Count(3))
            .with("benefits", AnswerValue.Picks(emptyList()))
            .with("residentStatus", null)
        assertEquals(
            Json.parseToJsonElement("""{"householdSize":3,"incomeBand":"C","benefits":[]}"""),
            toEngineAnswers(steps, answers),
        )
        val exact = QuickCheckAnswers().with(INCOME_STEP, AnswerValue.ExactIncome(30524))
        assertEquals(Json.parseToJsonElement("""{"annualIncome":30524}"""), toEngineAnswers(steps, exact))
    }

    @Test
    fun `the same answers give the verdicts of the conformance fixture`() {
        // verdict.json case "exact-all-likely".
        val answers = QuickCheckAnswers()
            .with("hasEarnedIncome", AnswerValue.Choice("yes"))
            .with(INCOME_STEP, AnswerValue.ExactIncome(30524))
            .with("householdSize", AnswerValue.Count(3))
            .with("numChildren", AnswerValue.Count(2))
            .with("housing", AnswerValue.Choice("renter"))
            .with("residentStatus", AnswerValue.Choice("eligible"))
        val results = computeVerdicts(content.pack, content.bands, steps, answers)
        assertTrue(results.all { it.verdict == Verdict.LIKELY })
        assertEquals(3000.0, results.first { it.programId == "work-credit" }.estimatedAmount)
    }

    @Test
    fun `skipping the sensitive question makes food help depend on it`() {
        val skipped = QuickCheckAnswers()
            .with(INCOME_STEP, AnswerValue.ExactIncome(19000))
            .with("householdSize", AnswerValue.Count(1))
            .with("residentStatus", null)
        val food = verdictOf(skipped, "food-help")
        assertEquals(Verdict.DEPENDS, food.verdict)
        assertEquals(listOf("residentStatus"), food.dependsOn)
        val answered = skipped.with("residentStatus", AnswerValue.Choice("eligible"))
        assertEquals(Verdict.LIKELY, verdictOf(answered, "food-help").verdict)
    }

    @Test
    fun `zero benefits picked is an answer, skipping is not`() {
        val base = QuickCheckAnswers().with("householdSize", AnswerValue.Count(2)).with(INCOME_STEP, AnswerValue.ExactIncome(90000))
        assertEquals(Verdict.DEPENDS, verdictOf(base.with("benefits", null), "phone-discount").verdict)
        assertEquals(Verdict.UNLIKELY, verdictOf(base.with("benefits", AnswerValue.Picks(emptyList())), "phone-discount").verdict)
    }

    @Test
    fun `results are grouped in verdict order without empty groups`() {
        val groups = groupByVerdict(computeVerdicts(content.pack, content.bands, steps, QuickCheckAnswers()))
        assertEquals(listOf(Verdict.DEPENDS), groups.map { it.first })
        assertEquals(5, groups.single().second.size)
    }

    @Test
    fun `progress resumes at the first step without an entry`() {
        assertEquals(0, firstOpenStep(steps, QuickCheckAnswers()))
        val two = QuickCheckAnswers().with(steps[0].id, AnswerValue.Count(2)).with(steps[1].id, null)
        assertEquals(2, firstOpenStep(steps, two))
        var all = QuickCheckAnswers()
        for (s in steps) all = all.with(s.id, null)
        assertEquals(steps.size, firstOpenStep(steps, all))
        assertEquals(INCOME_STEP, stepForVariable("annualIncome"))
        assertEquals("benefits", stepForVariable("benefits"))
    }

    @Test
    fun `stored answers round-trip and stale entries are dropped`() {
        val answers = QuickCheckAnswers()
            .with(INCOME_STEP, AnswerValue.IncomeBandChoice("B"))
            .with("householdSize", AnswerValue.Count(4))
            .with("benefits", AnswerValue.Picks(listOf("snap")))
            .with("housing", null)
            .with("hasOlderMember", AnswerValue.Choice("no"))
        assertEquals(answers, decodeAnswers(steps, encodeAnswers(answers)))
        val stale = Json.parseToJsonElement(
            """{"householdSize":99,"housing":"tent","unknownStep":1,"income":{"band":"Z"},"benefits":["snap","snap"],"numChildren":"2"}""",
        ) as JsonObject
        assertTrue(decodeAnswers(steps, stale).isEmpty())
        assertTrue(decodeAnswers(steps, null).isEmpty())
    }

    @Test
    fun `answers never show their values as text`() {
        val answers = QuickCheckAnswers().with(INCOME_STEP, AnswerValue.ExactIncome(987654))
        assertFalse(answers.toString().contains("987654"))
    }
}
