package app.silhouette.benefits

import app.silhouette.benefits.answers.ProgramContext
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.criterionReasons
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.Draft
import app.silhouette.benefits.quickcheck.Step
import app.silhouette.benefits.quickcheck.draftToValue
import app.silhouette.benefits.quickcheck.isMoneyVariable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The pack people see: the California draft, with money, its notice, sources and program copy. */
class CaliforniaContentTest {
    private val content = TestContent.california
    private val en = content.strings(AppLanguage.EN)
    private val es = content.strings(AppLanguage.ES)

    @Test
    fun `the app shows the California pack as a labelled draft`() {
        assertEquals("us-ca", content.pack.jurisdiction)
        assertTrue(content.isDraftPack)
        assertFalse(content.isDemoPack)
        assertEquals("Draft rules, read November 12, 2026.", en("pack.draft.short", "date" to en.packDate(content.pack.sourcesReadOn!!)))
        assertTrue(en("official.readOn", "date" to en.packDate("2026-11-12")).contains("November 12, 2026"))
        assertTrue(es.packDate("2026-11-12").contains("noviembre"))
    }

    @Test
    fun `money is written the jurisdiction's way in every language`() {
        assertEquals("$34,000", en.money(34000.0))
        assertEquals("$34,000", es.money(34000.0))
        assertEquals("$1,271.88", es.money(127188))
        val first = content.bands.annualIncome.first()
        assertTrue(es.bandLabel(first), es.bandLabel(first).contains("$15,000"))
    }

    @Test
    fun `periods and the tax year are in the reader's language`() {
        assertEquals("tax year 2025", en.packPeriod("Tax year 2025"))
        assertEquals("el año fiscal 2025", es.packPeriod("Tax year 2025"))
        assertTrue(es.packPeriod("October 1, 2026 - September 30, 2027").contains("octubre"))
        assertEquals("anything else", es.packPeriod("anything else"))
    }

    @Test
    fun `investment income is asked as money`() {
        assertTrue(isMoneyVariable("investmentIncome"))
        assertFalse(isMoneyVariable("hasEarnedIncome"))
        val step = content.steps.single { it.id == "investmentIncome" } as Step.IntQuestion
        assertEquals(AnswerValue.Count(1200), draftToValue(step, Draft(text = "$1,200")))
        assertEquals(AnswerValue.Count(1201), draftToValue(step, Draft(text = "1,200.50")))
        assertEquals(AnswerValue.Count(Int.MIN_VALUE), draftToValue(step, Draft(text = "1.200,50")))
    }

    @Test
    fun `program facts follow the pack copy, what the program uses and what it checks`() {
        val facts = ProgramContext(content).facts(en, "caleitc").facts.value.split("\n")
        assertEquals(en("program.caleitc.summary"), facts.first())
        assertTrue(facts.any { it.startsWith("This program uses: Yearly income;") })
        assertTrue(facts.last().startsWith("This program checks: "))
        assertTrue(ProgramContext(content).facts(es, "caleitc").facts.value.startsWith(es("program.caleitc.summary")))
    }

    @Test
    fun `why rows show money limits only for the comparisons that decide the state`() {
        val answers = JsonObject(
            mapOf(
                "annualIncome" to JsonPrimitive(18000), "householdSize" to JsonPrimitive(1), "numQualifyingChildren" to JsonPrimitive(0),
                "hasEarnedIncome" to JsonPrimitive("yes"), "ageGroup" to JsonPrimitive("25-64"), "filingStatus" to JsonPrimitive("single"),
                "taxIdType" to JsonPrimitive("ssn-valid-for-work"), "investmentIncome" to JsonPrimitive(0),
            ),
        )
        val reasons = criterionReasons(content.pack, content.bands, Raw.of(answers), "federal-eitc")
        val rows = ProgramContext.whyRows(en, "federal-eitc", reasons)
        val income = rows.single { it.id == "income-limit" }
        assertTrue(income.limits.single().first.startsWith("$"))
        assertEquals("$18,000", income.limits.single().second)
        // The prompt for the device keeps plain numbers.
        assertEquals("18,000", ProgramContext.whyRows(en, "federal-eitc", reasons, money = false).single { it.id == "income-limit" }.limits.single().second)
    }
}
