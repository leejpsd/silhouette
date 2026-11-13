package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** "Why this result": the engine's criterion states with the limit and the person's value. */
class ReasonsTest {
    private val pack = RulePack.parse(Shared.json("rulepacks/zz-test/pack.json"))
    private val bands = Bands.parse(Shared.json("bands/zz-test.json"))

    private fun answers(vararg pairs: Pair<String, Any>) = Raw.of(
        JsonObject(
            pairs.associate { (k, v) ->
                k to when (v) {
                    is Number -> JsonPrimitive(v)
                    else -> JsonPrimitive(v.toString())
                }
            },
        ),
    )

    @Test
    fun `an exact income is compared with the limit for the household size`() {
        val reasons = criterionReasons(pack, bands, answers("householdSize" to 3, "annualIncome" to 30524, "residentStatus" to "eligible"), "food-help")
        assertEquals(listOf("income-limit", "residency"), reasons.map { it.id })
        val income = reasons[0]
        assertEquals(CriterionState.PASS, income.state)
        assertEquals(listOf(Comparison("annualIncome", "<=", 34000.0, YourValue.Number(30524.0))), income.comparisons)
        // A criterion without a comparison with a limit has no limit line.
        assertEquals(CriterionState.PASS, reasons[1].state)
        assertTrue(reasons[1].comparisons.isEmpty())
    }

    @Test
    fun `a band that straddles the limit shows the band and the mixed state`() {
        val reasons = criterionReasons(pack, bands, answers("householdSize" to 3, "incomeBand" to "C"), "food-help")
        val income = reasons.first { it.id == "income-limit" }
        assertEquals(CriterionState.MIXED, income.state)
        val yours = income.comparisons.single().yours as YourValue.Band
        assertEquals("C", yours.band.id)
        assertEquals(CriterionState.UNKNOWN, reasons.first { it.id == "residency" }.state)
    }

    @Test
    fun `a limit that depends on an unanswered question is not shown, and an unknown program has no reasons`() {
        val reasons = criterionReasons(pack, bands, answers("annualIncome" to 30524), "food-help")
        val income = reasons.first { it.id == "income-limit" }
        assertEquals(CriterionState.UNKNOWN, income.state)
        assertEquals(null, income.comparisons.single().limit)
        assertTrue(criterionReasons(pack, bands, answers(), "no-such-program").isEmpty())
    }

    @Test
    fun `reason strings never show values`() {
        val reasons = criterionReasons(pack, bands, answers("householdSize" to 3, "annualIncome" to 30524), "food-help")
        assertTrue(reasons.none { it.toString().contains("30524") || it.comparisons.toString().contains("30524") })
    }
}
