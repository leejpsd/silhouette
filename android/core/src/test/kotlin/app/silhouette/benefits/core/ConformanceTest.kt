package app.silhouette.benefits.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.fail
import org.junit.jupiter.api.DynamicContainer.dynamicContainer
import org.junit.jupiter.api.DynamicNode
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.TestFactory
import java.util.Locale

/**
 * Runs every file in shared/fixtures/conformance/ and every canary in shared/fixtures/canary/,
 * read in place from the shared folder (never copied). Exact equality means equal JSON trees *and*
 * identical serialization (key order, number format).
 */
class ConformanceTest {

    private val conformanceDir = Shared.file("fixtures/conformance")
    private val canaryDir = Shared.file("fixtures/canary")

    private val runners: Map<String, (JsonObject) -> List<DynamicNode>> = mapOf(
        "skeleton.json" to ::skeletonCases,
        "rehydrate.json" to ::rehydrateCases,
        "generalize.json" to ::generalizeCases,
        "evaluator.json" to ::evaluatorCases,
        "verdict.json" to ::verdictCases,
    )

    @TestFactory
    fun conformance(): List<DynamicNode> {
        val files = Shared.listFiles(conformanceDir)
        val nodes = mutableListOf<DynamicNode>(
            dynamicTest("every conformance file has a runner and every runner has a file") {
                assertEquals(emptyList<String>(), files - runners.keys, "conformance files without a runner")
                assertEquals(emptyList<String>(), (runners.keys - files.toSet()).toList(), "runners without a conformance file")
            },
        )
        for (file in files) {
            val runner = runners[file]
            nodes += if (runner == null) {
                dynamicTest("$file has a runner") { fail<Unit>("no runner for fixtures/conformance/$file") }
            } else {
                dynamicContainer(file, runner(Shared.json("fixtures/conformance/$file") as JsonObject))
            }
        }
        return nodes
    }

    // ---------- skeleton.json ----------

    private fun skeletonCases(fixture: JsonObject): List<DynamicNode> = fixture.cases().flatMap { k ->
        val id = k.str("id")
        val input = k.str("input")
        val allow = Shared.allowlist(k.str("locale"))
        val expected = k.obj("expected")
        val result = skeletonize(Raw.of(input), allow)
        val map = result.map.reveal()
        listOf(
            dynamicTest("$id: skeleton and map") {
                assertEquals(expected.str("skeleton"), result.skeleton.text)
                assertExact(expected.obj("map"), JsonObject(map.mapValues { JsonPrimitive(it.value) }))
            },
            dynamicTest("$id: no digit and no non-allowlisted word survives") {
                val stripped = result.skeleton.text.replace(PLACEHOLDER_REF, "")
                assertFalse(stripped.any { it in '0'..'9' }, "a digit survived")
                for (word in Regex("[\\p{L}\\p{M}]+").findAll(stripped).map { it.value }) {
                    assertTrue(word.lowercase(Locale.ROOT) in allow, "\"$word\" survived but is not allowlisted")
                }
            },
            dynamicTest("$id: skeleton + map rebuild the normalized input") {
                val rebuilt = result.skeleton.text.replace(PLACEHOLDER_REF) { map.getValue(it.groupValues[1]) }
                assertEquals(normalizeDocument(input), rebuilt)
            },
        )
    }

    // ---------- rehydrate.json ----------

    private fun rehydrateCases(fixture: JsonObject): List<DynamicNode> {
        val numbers = (fixture["numbers"] as JsonArray).map { it as JsonObject }.map { n ->
            val token = n.str("token")
            dynamicTest("parseNumber ${jsonQuote(token)}") {
                assertExact(n["expected"]!!, parseNumber(token)?.let(::jsonNumber) ?: JsonNull)
            }
        }
        val cases = fixture.cases().map { k ->
            dynamicTest(k.str("id")) {
                val schema = Shared.json("schemas/${k.str("schema")}") as JsonObject
                val map = k.obj("map").mapValues { (it.value as JsonPrimitive).content }
                val actual = rehydrate(schema, k["pointers"]!!, Raw.of(map)).reveal()
                assertExact(k["expected"]!!, actual)
            }
        }
        return listOf(nonEmpty(numbers), nonEmpty(cases)) + numbers + cases
    }

    // ---------- generalize.json ----------

    private fun generalizeCases(fixture: JsonObject): List<DynamicNode> {
        val bands = Bands.parse(Shared.json(fixture.str("bands")))
        val cases = fixture.cases().map { k ->
            dynamicTest(k.str("id")) {
                val exact = Raw.of(k.obj("exact"))
                when {
                    k.containsKey("expectedError") -> expectError(k.str("expectedError")) { generalize(exact, bands) }
                    k.containsKey("expected") -> {
                        val profile = generalize(exact, bands)
                        assertExact(k["expected"]!!, profile.value.toJson())
                        assertEquals(k.str("expectedCanonical"), canonical(profile).value)
                    }
                    else -> fail("case has neither expected nor expectedError")
                }
            }
        }
        return listOf(nonEmpty(cases)) + cases
    }

    // ---------- evaluator.json ----------

    private fun evaluatorCases(fixture: JsonObject): List<DynamicNode> {
        val data = fixture["data"]!!.toValue()
        val unavailable = (fixture["unavailable"] as JsonArray).map { (it as JsonPrimitive).content }.toSet()
        val cases = fixture.cases().map { k ->
            dynamicTest(k.str("id")) {
                val reads = LinkedHashSet<String>()
                val run = { evaluate(k["expr"]!!.toValue(), data, EvalContext(unavailable, reads)) }
                when {
                    k.containsKey("expectedError") -> expectError(k.str("expectedError")) { run() }
                    k.containsKey("expectedUnknown") -> {
                        assertEquals(JsonPrimitive(true), k["expectedUnknown"])
                        assertSame(Unknown, run())
                        assertExact(k["expectedUnknownReads"]!!, JsonArray(reads.sorted().map { JsonPrimitive(it) }))
                    }
                    k.containsKey("expected") -> assertExact(k["expected"]!!, valueToJson(run()))
                    else -> fail("case has no expectation")
                }
            }
        }
        return listOf(nonEmpty(cases)) + cases
    }

    // ---------- verdict.json ----------

    private fun verdictCases(fixture: JsonObject): List<DynamicNode> {
        val pack = RulePack.parse(Shared.json(fixture.str("pack")))
        val bands = Bands.parse(Shared.json(fixture.str("bands")))
        val cases = fixture.cases().map { k ->
            dynamicTest(k.str("id")) {
                val answers = Raw.of(k.obj("answers"))
                when {
                    k.containsKey("expectedError") -> expectError(k.str("expectedError")) { verdicts(pack, bands, answers) }
                    k.containsKey("expected") -> assertExact(k["expected"]!!, JsonArray(verdicts(pack, bands, answers).map { it.toJson() }))
                    else -> fail("case has neither expected nor expectedError")
                }
            }
        }
        return listOf(nonEmpty(cases)) + cases
    }

    // ---------- Canary ----------

    @TestFactory
    fun canary(): List<DynamicNode> {
        val files = Shared.listFiles(canaryDir)
        val fixtures = files.filter { it.endsWith(".json") }
        val documents = fixtures.map { (Shared.json("fixtures/canary/$it") as JsonObject).str("document") }.toSet()
        return listOf(
            dynamicTest("the canary folder holds canary fixtures and their documents only") {
                assertTrue(fixtures.isNotEmpty(), "no canary fixture")
                assertEquals(emptyList<String>(), files.filterNot { it in fixtures || it in documents }, "unexpected files")
            },
        ) + fixtures.map { file ->
            dynamicTest("$file: no canary string appears in the skeleton") {
                val canary = Shared.json("fixtures/canary/$file") as JsonObject
                val values = (canary["canaries"] as JsonArray).map { (it as JsonPrimitive).content }
                assertTrue(values.isNotEmpty())
                val text = Shared.text("fixtures/canary/${canary.str("document")}")
                // The document really contains canaries, so the check is meaningful. Some canaries
                // are derived forms such as "1487.5" that do not appear literally.
                assertTrue(values.any { normalizeDocument(text).contains(it) })
                val skeleton = skeletonize(Raw.of(text), Shared.allowlist(canary.str("locale"))).skeleton.text
                for (value in values) assertFalse(skeleton.contains(value), "leaked: $value")
            }
        }
    }

    // ---------- Spec text ----------

    @TestFactory
    fun specText(): List<DynamicNode> = listOf(
        dynamicTest("the tokenizer pattern is the combined reference regex of shared/skeleton/SPEC.md, character for character") {
            val spec = Shared.text("skeleton/SPEC.md")
            val block = Regex("Combined reference regex[^\\n]*\\n+```\\n([^\\n]+)\\n```").find(spec)
            assertEquals(block?.groupValues?.get(1), TOKEN_PATTERN)
        },
    )

    // ---------- Helpers ----------

    private companion object {
        val PLACEHOLDER_REF = Regex("⟦([DNW][0-9]+)⟧")
        val ERRORS: Map<String, Class<out Throwable>> = mapOf(
            "GeneralizeError" to GeneralizeError::class.java,
            "RuleError" to RuleError::class.java,
            "InputError" to InputError::class.java,
        )
        val printer = Json { prettyPrint = false }

        fun JsonObject.cases(): List<JsonObject> = (this["cases"] as JsonArray).map { it as JsonObject }
        fun JsonObject.str(key: String): String = (this[key] as JsonPrimitive).content
        fun JsonObject.obj(key: String): JsonObject = this[key] as JsonObject

        fun nonEmpty(list: List<DynamicNode>): DynamicNode = dynamicTest("has cases") { assertTrue(list.isNotEmpty()) }

        /** Equal JSON trees and byte-identical compact serialization (key order, number format). */
        fun assertExact(expected: JsonElement, actual: JsonElement) {
            assertEquals(expected, actual)
            assertEquals(printer.encodeToString(JsonElement.serializer(), expected), printer.encodeToString(JsonElement.serializer(), actual))
        }

        fun expectError(name: String, block: () -> Unit) {
            val type = ERRORS[name] ?: fail<Class<out Throwable>>("unknown expectedError $name")
            try {
                block()
            } catch (e: Throwable) {
                assertTrue(type.isInstance(e), "expected $name but got $e")
                return
            }
            fail<Unit>("expected $name")
        }
    }
}
