package app.silhouette.benefits.core.conformance

import app.silhouette.benefits.core.Allowlist
import app.silhouette.benefits.core.Bands
import app.silhouette.benefits.core.EvalContext
import app.silhouette.benefits.core.GeneralizeError
import app.silhouette.benefits.core.InputError
import app.silhouette.benefits.core.PLACEHOLDER_CLOSE
import app.silhouette.benefits.core.PLACEHOLDER_OPEN
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.RuleError
import app.silhouette.benefits.core.RulePack
import app.silhouette.benefits.core.MONTH_NAMES
import app.silhouette.benefits.core.ModelSchema
import app.silhouette.benefits.core.ModelSchemaError
import app.silhouette.benefits.core.PaystubValues
import app.silhouette.benefits.core.SAFE_CLASS
import app.silhouette.benefits.core.SchemaDialect
import app.silhouette.benefits.core.Validation
import app.silhouette.benefits.core.ValidationInputError
import app.silhouette.benefits.core.Unknown
import app.silhouette.benefits.core.canonical
import app.silhouette.benefits.core.evaluate
import app.silhouette.benefits.core.generalize
import app.silhouette.benefits.core.jsonNumber
import app.silhouette.benefits.core.jsonQuote
import app.silhouette.benefits.core.normalizeDocument
import app.silhouette.benefits.core.parseNumber
import app.silhouette.benefits.core.parseTypedAmount
import app.silhouette.benefits.core.rehydrate
import app.silhouette.benefits.core.generalizedProfileFromJson
import app.silhouette.benefits.core.silhouetteVerdicts
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.core.toValue
import app.silhouette.benefits.core.valueToJson
import app.silhouette.benefits.core.verdicts
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Read access to the shared contract folder: a directory on the JVM, packaged assets on a device. */
public interface FixtureSource {
    /** Names of the regular files directly inside [dir] (relative to the shared folder), in any order. */
    public fun list(dir: String): List<String>

    /** UTF-8 text of a file, by path relative to the shared folder. */
    public fun text(path: String): String
}

/** One runnable check. [run] throws [ConformanceFailure] (or the engine's exception) when it fails. */
public class ConformanceCase(public val group: String, public val name: String, public val run: () -> Unit) {
    override fun toString(): String = "$group / $name"
}

public class ConformanceFailure(message: String) : AssertionError(message)

/**
 * The checks every platform must pass: each case in shared/fixtures/conformance/, the canary leak
 * test for shared/fixtures/canary/, and the tokenizer regex against shared/skeleton/SPEC.md.
 *
 * The same cases run as JVM unit tests and as instrumented tests on an Android runtime, whose
 * regex engine, Unicode tables and case mapping come from ICU instead of the JDK.
 *
 * Exact equality means equal JSON trees and identical compact serialization (key order, number
 * format). A fixture file without a runner, or a runner without its file, is a failing case.
 */
public object ConformanceSuite {
    public const val CONFORMANCE_DIR: String = "fixtures/conformance"
    public const val CANARY_DIR: String = "fixtures/canary"
    public const val REFERENCE: String = "reference/silhouette.mjs"

    private val runners: Map<String, (Context) -> List<ConformanceCase>> = mapOf(
        "skeleton.json" to { c -> skeletonCases(c) },
        "rehydrate.json" to { c -> rehydrateCases(c) },
        "generalize.json" to { c -> generalizeCases(c) },
        "evaluator.json" to { c -> evaluatorCases(c) },
        "verdict.json" to { c -> verdictCases(c) },
        "validate.json" to { c -> validateCases(c) },
        "model-schema.json" to { c -> modelSchemaCases(c) },
        "silhouette-verdict.json" to { c -> silhouetteVerdictCases(c) },
    )

    /** The conformance files this suite knows how to run. */
    public val knownFiles: Set<String> get() = runners.keys

    public fun cases(source: FixtureSource): List<ConformanceCase> {
        val files = visible(source.list(CONFORMANCE_DIR))
        val out = mutableListOf(
            ConformanceCase(CONFORMANCE_DIR, "every conformance file has a runner and every runner has a file") {
                check(files.none { it !in runners }) { "conformance files without a runner: ${files - runners.keys}" }
                check(runners.keys.all { it in files }) { "runners without a conformance file: ${runners.keys - files.toSet()}" }
            },
        )
        for (file in files) {
            val runner = runners[file]
            out += if (runner == null) {
                listOf(ConformanceCase(file, "has a runner") { fail("no runner for $CONFORMANCE_DIR/$file") })
            } else {
                runner(Context(source, file, json(source, "$CONFORMANCE_DIR/$file") as JsonObject))
            }
        }
        out += canaryCases(source)
        out += ConformanceCase(REFERENCE, "the safe-character list is the reference SAFE_CLASS, range for range") {
            val reference = source.text(REFERENCE)
            val block = Regex("export const SAFE_CLASS =\\s*([^;]+);").find(reference)?.groupValues?.get(1) ?: fail("SAFE_CLASS not found")
            // Concatenated JavaScript string literals ('...' + '...'); `\\\\` in the source is one backslash.
            val joined = Regex("'([^']*)'").findAll(block).joinToString("") { it.groupValues[1].replace("\\\\", "\\") }
            equal(joined, SAFE_CLASS, "SAFE_CLASS")
        }
        out += ConformanceCase(REFERENCE, "the month names are the reference MONTHS") {
            val reference = source.text(REFERENCE)
            val block = Regex("export const MONTHS = \\[([^;]+)\\];").find(reference)?.groupValues?.get(1) ?: fail("MONTHS not found")
            val groups = Regex("\\[([^\\]]*)\\]").findAll(block).map { g -> Regex("'([^']*)'").findAll(g.groupValues[1]).map { it.groupValues[1] }.toList() }.toList()
            equal(groups, MONTH_NAMES, "MONTHS")
        }
        return out
    }

    private class Context(val source: FixtureSource, val file: String, val fixture: JsonObject)

    // ---------- skeleton.json ----------

    private val placeholderRef = Regex("$PLACEHOLDER_OPEN([DNW][0-9]+)$PLACEHOLDER_CLOSE")
    /** Word material: anything that is not safe and not an ASCII digit (SPEC.md section 2). */
    private val words = Regex("[^0-9$SAFE_CLASS]+(?:['\u2019\\-][^0-9$SAFE_CLASS]+)*")

    private fun skeletonCases(c: Context): List<ConformanceCase> = nonEmpty(c, c.fixture.cases().flatMap { k ->
        val id = k.str("id")
        val input = k.str("input")
        val expected = k.obj("expected")
        // Section 4.3: some cases carry the words the user hid.
        val hide = (k["hide"] as? JsonArray)?.map { (it as JsonPrimitive).content }?.toSet() ?: emptySet()
        val result by lazy { skeletonize(Raw.of(input), allowlist(c.source, k.str("locale")), hide) }
        listOf(
            ConformanceCase(c.file, "$id: skeleton and map") {
                equal(expected.str("skeleton"), result.skeleton.text, "skeleton")
                exact(expected.obj("map"), JsonObject(result.map.reveal().mapValues { JsonPrimitive(it.value) }))
            },
            ConformanceCase(c.file, "$id: only safe characters and allowlisted words survive") {
                val allow = allowlist(c.source, k.str("locale"))
                val stripped = result.skeleton.text.replace(placeholderRef, "")
                check(stripped.none { it in '0'..'9' }) { "a digit survived" }
                for (word in words.findAll(stripped).map { it.value }) {
                    check(allow.allows(word)) { "a word survived but is not allowlisted" }
                }
            },
            ConformanceCase(c.file, "$id: skeleton + map rebuild the normalized input") {
                val map = result.map.reveal()
                val rebuilt = result.skeleton.text.replace(placeholderRef) { map.getValue(it.groupValues[1]) }
                equal(normalizeDocument(input), rebuilt, "rebuilt input")
            },
        )
    })

    // ---------- rehydrate.json ----------

    private fun rehydrateCases(c: Context): List<ConformanceCase> {
        val numbers = (c.fixture["numbers"] as JsonArray).map { it as JsonObject }.map { n ->
            val token = n.str("token")
            ConformanceCase(c.file, "parseNumber ${jsonQuote(token)}") {
                exact(n["expected"]!!, parseNumber(token)?.let(::jsonNumber) ?: JsonNull)
            }
        }
        val cases = c.fixture.cases().map { k ->
            ConformanceCase(c.file, k.str("id")) {
                val schema = json(c.source, "schemas/${k.str("schema")}") as JsonObject
                val map = k.obj("map").mapValues { (it.value as JsonPrimitive).content }
                exact(k["expected"]!!, rehydrate(schema, k["pointers"]!!, Raw.of(map)).reveal())
            }
        }
        val typed = (c.fixture["typedAmounts"] as JsonArray).map { it as JsonObject }.map { n ->
            val text = n.str("text")
            ConformanceCase(c.file, "parseTypedAmount ${jsonQuote(text)}") {
                exact(n["expected"]!!, parseTypedAmount(text)?.let(::jsonNumber) ?: JsonNull)
            }
        }
        return listOf(
            ConformanceCase(c.file, "has number, typed amount and pointer cases") {
                check(numbers.isNotEmpty() && typed.isNotEmpty() && cases.isNotEmpty()) { "no cases" }
            },
        ) + numbers + typed + cases
    }

    // ---------- generalize.json ----------

    private fun generalizeCases(c: Context): List<ConformanceCase> {
        val bands by lazy { Bands.parse(json(c.source, c.fixture.str("bands"))) }
        return nonEmpty(c, c.fixture.cases().map { k ->
            ConformanceCase(c.file, k.str("id")) {
                val exactProfile = Raw.of(k.obj("exact"))
                when {
                    k.containsKey("expectedError") -> expectError(k.str("expectedError")) { generalize(exactProfile, bands) }
                    k.containsKey("expected") -> {
                        val profile = generalize(exactProfile, bands)
                        exact(k["expected"]!!, profile.value.toJson())
                        equal(k.str("expectedCanonical"), canonical(profile).value, "canonical")
                    }
                    else -> fail("case has neither expected nor expectedError")
                }
            }
        })
    }

    // ---------- evaluator.json ----------

    private fun evaluatorCases(c: Context): List<ConformanceCase> {
        val data = c.fixture["data"]!!.toValue()
        val unavailable = (c.fixture["unavailable"] as JsonArray).map { (it as JsonPrimitive).content }.toSet()
        return nonEmpty(c, c.fixture.cases().map { k ->
            ConformanceCase(c.file, k.str("id")) {
                val reads = LinkedHashSet<String>()
                val run = { evaluate(k["expr"]!!.toValue(), data, EvalContext(unavailable, reads)) }
                when {
                    k.containsKey("expectedError") -> expectError(k.str("expectedError")) { run() }
                    k.containsKey("expectedUnknown") -> {
                        equal(JsonPrimitive(true), k["expectedUnknown"], "expectedUnknown")
                        check(run() === Unknown) { "expected unknown" }
                        exact(k["expectedUnknownReads"]!!, JsonArray(reads.sorted().map { JsonPrimitive(it) }))
                    }
                    k.containsKey("expected") -> exact(k["expected"]!!, valueToJson(run()))
                    else -> fail("case has no expectation")
                }
            }
        })
    }

    // ---------- verdict.json ----------

    private fun verdictCases(c: Context): List<ConformanceCase> {
        val pack by lazy { RulePack.parse(json(c.source, c.fixture.str("pack"))) }
        val bands by lazy { Bands.parse(json(c.source, c.fixture.str("bands"))) }
        return nonEmpty(c, c.fixture.cases().map { k ->
            ConformanceCase(c.file, k.str("id")) {
                val answers = Raw.of(k.obj("answers"))
                when {
                    k.containsKey("expectedError") -> expectError(k.str("expectedError")) { verdicts(pack, bands, answers) }
                    k.containsKey("expected") -> exact(k["expected"]!!, JsonArray(verdicts(pack, bands, answers).map { it.toJson() }))
                    else -> fail("case has neither expected nor expectedError")
                }
            }
        })
    }

    // ---------- silhouette-verdict.json ----------

    private fun silhouetteVerdictCases(c: Context): List<ConformanceCase> {
        val pack by lazy { RulePack.parse(json(c.source, c.fixture.str("pack"))) }
        val bands by lazy { Bands.parse(json(c.source, c.fixture.str("bands"))) }
        return nonEmpty(c, c.fixture.cases().map { k ->
            ConformanceCase(c.file, k.str("id")) {
                val result = silhouetteVerdicts(pack, bands, generalizedProfileFromJson(k.obj("profile")))
                exact(k["expected"]!!, JsonArray(result.value.map { it.toJson() }))
            }
        })
    }

    // ---------- validate.json ----------

    private fun validateCases(c: Context): List<ConformanceCase> = nonEmpty(c, c.fixture.cases().map { k ->
        ConformanceCase(c.file, k.str("id")) {
            val run = { Validation.validatePaystubs((k["stubs"] as JsonArray).map { PaystubValues.fromJson(it) }, k.str("jurisdiction")) }
            when {
                k.containsKey("expectedError") -> expectError(k.str("expectedError")) { run() }
                k.containsKey("expected") -> exact(k["expected"]!!, run().toJson())
                else -> fail("case has neither expected nor expectedError")
            }
        }
    })

    // ---------- model-schema.json ----------

    private fun modelSchemaCases(c: Context): List<ConformanceCase> = nonEmpty(c, c.fixture.cases().map { k ->
        ConformanceCase(c.file, k.str("id")) {
            val options = k["options"] as? JsonObject ?: JsonObject(emptyMap())
            val requiredNullable = (options["requiredNullable"] as? JsonPrimitive)?.content == "true"
            val dialect = when ((options["dialect"] as? JsonPrimitive)?.content) {
                null, "openapi" -> SchemaDialect.OPENAPI
                "jsonschema" -> SchemaDialect.JSONSCHEMA
                else -> fail("unknown dialect")
            }
            val run = { ModelSchema.toModelSchema(k["schema"]!!, requiredNullable, dialect) }
            when {
                // The fixture marks errors with `true`: any ModelSchemaError is expected.
                k.containsKey("expectedError") -> expectError("ModelSchemaError") { run() }
                k.containsKey("expected") -> exact(k["expected"]!!, run())
                else -> fail("case has neither expected nor expectedError")
            }
        }
    })

    // ---------- Canary ----------

    private fun canaryCases(source: FixtureSource): List<ConformanceCase> {
        val files = visible(source.list(CANARY_DIR))
        val fixtures = files.filter { it.endsWith(".json") }
        val documents = fixtures.map { (json(source, "$CANARY_DIR/$it") as JsonObject).str("document") }.toSet()
        return listOf(
            ConformanceCase(CANARY_DIR, "the canary folder holds canary fixtures and their documents only") {
                check(fixtures.isNotEmpty()) { "no canary fixture" }
                val unexpected = files.filterNot { it in fixtures || it in documents }
                check(unexpected.isEmpty()) { "unexpected files: $unexpected" }
            },
        ) + fixtures.map { file ->
            ConformanceCase(CANARY_DIR, "$file: no canary string appears in the skeleton") {
                val canary = json(source, "$CANARY_DIR/$file") as JsonObject
                val values = (canary["canaries"] as JsonArray).map { (it as JsonPrimitive).content }
                check(values.isNotEmpty()) { "no canaries listed" }
                val text = source.text("$CANARY_DIR/${canary.str("document")}")
                // The document really contains canaries, so the check is meaningful. Some canaries
                // are derived forms such as "1487.5" that do not appear literally.
                check(values.any { normalizeDocument(text).contains(it) }) { "the document contains none of its canaries" }
                val skeleton = skeletonize(Raw.of(text), allowlist(source, canary.str("locale"))).skeleton.text
                for (value in values) check(!skeleton.contains(value)) { "leaked: $value" }
            }
        }
    }

    // ---------- Helpers ----------

    private val printer = Json { prettyPrint = false }

    private val errors: Map<String, Class<out Throwable>> = mapOf(
        "GeneralizeError" to GeneralizeError::class.java,
        "RuleError" to RuleError::class.java,
        "InputError" to InputError::class.java,
        "ValidationInputError" to ValidationInputError::class.java,
        "ModelSchemaError" to ModelSchemaError::class.java,
    )

    /** Hidden files (".DS_Store") are not fixtures. */
    private fun visible(names: List<String>): List<String> = names.filterNot { it.startsWith(".") }.sorted()

    private fun json(source: FixtureSource, path: String): JsonElement = Json.parseToJsonElement(source.text(path))

    private fun allowlist(source: FixtureSource, locale: String): Allowlist =
        Allowlist.fromFiles(listOf(json(source, "skeleton/allowlist/en.json"), json(source, "skeleton/allowlist/$locale.json")))

    private fun JsonObject.cases(): List<JsonObject> = (this["cases"] as JsonArray).map { it as JsonObject }

    private fun JsonObject.str(key: String): String = (this[key] as JsonPrimitive).content

    private fun JsonObject.obj(key: String): JsonObject = this[key] as JsonObject

    private fun nonEmpty(c: Context, cases: List<ConformanceCase>): List<ConformanceCase> =
        listOf(ConformanceCase(c.file, "has cases") { check(cases.isNotEmpty()) { "no cases" } }) + cases

    private fun fail(message: String): Nothing = throw ConformanceFailure(message)

    private inline fun check(condition: Boolean, message: () -> String) {
        if (!condition) fail(message())
    }

    private fun equal(expected: Any?, actual: Any?, what: String) {
        check(expected == actual) { "$what: expected <$expected> but was <$actual>" }
    }

    /** Equal JSON trees and byte-identical compact serialization (key order, number format). */
    private fun exact(expected: JsonElement, actual: JsonElement) {
        val e = printer.encodeToString(JsonElement.serializer(), expected)
        val a = printer.encodeToString(JsonElement.serializer(), actual)
        check(expected == actual && e == a) { "expected $e but was $a" }
    }

    private fun expectError(name: String, block: () -> Unit) {
        val type = errors[name] ?: fail("unknown expectedError $name")
        try {
            block()
        } catch (e: Throwable) {
            check(type.isInstance(e)) { "expected $name but got $e" }
            return
        }
        fail("expected $name")
    }
}
