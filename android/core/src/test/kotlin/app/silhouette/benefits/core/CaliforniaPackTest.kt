package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/** The California draft pack (shared/rulepacks/us-ca): its hand-worked households through the engine. */
class CaliforniaPackTest {
    private val pack = RulePack.parse(Shared.json("rulepacks/us-ca/pack.json"))
    private val bands = Bands.parse(Shared.json("bands/us-ca.json"))
    private val file = Shared.json("rulepacks/us-ca/cases.json").jsonObject

    @TestFactory
    fun `every hand-worked household gives the expected result for every program`(): List<DynamicTest> {
        val base = file["base"]?.jsonObject ?: JsonObject(emptyMap())
        return file["cases"]!!.let { it as kotlinx.serialization.json.JsonArray }.flatMap { element ->
            val case = element.jsonObject
            val id = case["id"]!!.jsonPrimitive.content
            // A key set to null means the question was skipped: removed before the engine runs.
            val merged = LinkedHashMap(base).apply { putAll(case["answers"]!!.jsonObject) }.filterValues { it !is JsonNull }
            val out by lazy { verdicts(pack, bands, Raw.of(JsonObject(merged))) }
            case["expected"]!!.jsonObject.map { (programId, want) ->
                dynamicTest("$id $programId") {
                    val got = out.single { it.programId == programId }
                    val w = want.jsonObject
                    assertEquals(w["verdict"]!!.jsonPrimitive.content, got.verdict.wire, "verdict")
                    w["estimatedAmount"]?.let { assertEquals((it as JsonPrimitive).content.toDouble(), got.estimatedAmount, "amount") }
                }
            }
        }
    }

    @Test
    fun `189 results in 27 households`() {
        val cases = file["cases"] as kotlinx.serialization.json.JsonArray
        assertEquals(27, cases.size)
        assertEquals(189, cases.sumOf { it.jsonObject["expected"]!!.jsonObject.size })
    }

    @Test
    fun `the pack is a labelled draft with money, sources and links`() {
        assertTrue(pack.isDraft)
        assertEquals("2026-11-12", pack.sourcesReadOn)
        assertEquals("USD", pack.currency)
        assertEquals("en-US", pack.numberFormat)
        for (program in pack.programInfo) {
            assertTrue(program.sources.isNotEmpty(), program.id)
            assertTrue(program.applyUrl != null, program.id)
        }
    }
}
