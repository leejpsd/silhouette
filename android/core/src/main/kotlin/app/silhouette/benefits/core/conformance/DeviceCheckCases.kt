package app.silhouette.benefits.core.conformance

import app.silhouette.benefits.core.Bands
import app.silhouette.benefits.core.DeviceCheck
import app.silhouette.benefits.core.PaystubValues
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.RulePack
import app.silhouette.benefits.core.Validation
import app.silhouette.benefits.core.verdicts
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** shared/fixtures/conformance/device-check.json and judges-household.json (validation/DEVICE_CHECK.md). */
internal object DeviceCheckCases {
    private fun fail(message: String): Nothing = throw ConformanceFailure(message)

    private fun equal(expected: Any?, actual: Any?, what: String) {
        if (expected != actual) fail("$what: expected <$expected> but was <$actual>")
    }

    private fun JsonElement?.text(): String = (this as? JsonPrimitive)?.content ?: fail("not text: $this")

    private fun JsonElement?.obj(): JsonObject = this as? JsonObject ?: fail("not an object: $this")

    private fun json(source: FixtureSource, path: String): JsonElement = Json.parseToJsonElement(source.text(path))

    fun deviceCheck(source: FixtureSource, file: String, fixture: JsonObject): List<ConformanceCase> {
        val schema by lazy { json(source, fixture["schema"].text()).obj() }
        val runSchema by lazy { json(source, fixture["runSchema"].text()).obj() }
        val docs = fixture["documents"].obj()
        val out = ArrayList<ConformanceCase>()
        for (r in (fixture["readings"] as JsonArray).map { it.obj() }) {
            out += ConformanceCase(file, "reading ${r["id"].text()}") {
                val doc = docs[r["document"].text()].obj()
                val map = doc["map"].obj().mapValues { (_, v) -> v.text() }
                val gold = doc["gold"].obj()
                val statuses = DeviceCheck.fieldStatuses(schema, r["pointers"]!!, map, gold)
                val want = r["expected"].obj()
                equal(want["statuses"].obj().mapValues { (_, v) -> v.text() }, statuses.mapValues { it.value.wire }, "statuses")
                equal(want["fields"], DeviceCheck.scoreFields(statuses, gold).toJson(), "fields")
                equal(want["incomeInputs"], DeviceCheck.incomeInputs(statuses).toJson(), "income inputs")
                equal((want["wrongFields"] as JsonArray).map { it.text() }, DeviceCheck.wrongFields(statuses), "wrong fields")
            }
        }
        for (run in (fixture["runs"] as JsonArray).map { it.obj() }) {
            out += ConformanceCase(file, "run ${run["id"].text()}") {
                val version = run["version"].text().toInt()
                equal(run["expected"], DeviceCheck.summarize((run["cases"] as JsonArray).map { it.obj() }, version), "summary")
            }
        }
        for (n in (fixture["fileNames"] as JsonArray).map { it.obj() }) {
            out += ConformanceCase(file, "file name ${n["expected"].text()}") {
                equal(n["expected"].text(), DeviceCheck.runFileName(n["date"].text(), n["browser"].text(), n["platform"].text()), "file name")
            }
        }
        for (path in (fixture["validRuns"] as JsonArray).map { it.text() }) {
            out += ConformanceCase(file, "valid run $path") { equal(emptyList<String>(), DeviceCheck.validate(runSchema, json(source, path)), "schema problems") }
        }
        out += ConformanceCase(file, "the schema refuses what is not a run file") {
            val header = mapOf(
                "kind" to JsonPrimitive(DeviceCheck.KIND), "date" to JsonPrimitive("2026-11-17T10:00:00.000Z"), "browser" to JsonPrimitive("Silhouette 1.0"),
                "platform" to JsonPrimitive("Android 16"), "userAgent" to JsonPrimitive("Silhouette/1.0"), "availability" to JsonObject(emptyMap()),
                "jurisdiction" to JsonPrimitive("us-ca"),
            )
            fun run(vararg extra: Pair<String, JsonElement>) = JsonObject(header + extra)
            equal(emptyList<String>(), DeviceCheck.validate(runSchema, run("version" to JsonPrimitive(3), "cases" to JsonArray(emptyList()))), "empty run")
            check(DeviceCheck.validate(runSchema, run("version" to JsonPrimitive(4), "cases" to JsonArray(emptyList()))).isNotEmpty()) { "version 4 accepted" }
            check(DeviceCheck.validate(runSchema, run("version" to JsonPrimitive(3), "cases" to JsonArray(emptyList()), "extra" to JsonPrimitive(true))).isNotEmpty()) { "extra key accepted" }
        }
        return out
    }

    private inline fun check(condition: Boolean, message: () -> String) {
        if (!condition) fail(message())
    }

    fun judgesHousehold(source: FixtureSource, file: String, fixture: JsonObject): List<ConformanceCase> {
        val pack by lazy { RulePack.parse(json(source, fixture["pack"].text())) }
        val bands by lazy { Bands.parse(json(source, fixture["bands"].text())) }
        val household by lazy { json(source, fixture["household"].text()).obj() }
        fun results(answers: JsonObject) = JsonArray(verdicts(pack, bands, Raw.of(answers)).map { it.toJson() })
        return listOf(
            ConformanceCase(file, "the household file gives the engine answers") {
                equal(fixture["before"].obj()["engineAnswers"], DeviceCheck.engineAnswers(household["answers"].obj()), "engine answers")
            },
            ConformanceCase(file, "results before the paystub") {
                equal(fixture["before"].obj()["expected"], results(fixture["before"].obj()["engineAnswers"].obj()), "before")
            },
            ConformanceCase(file, "the sample paystub's yearly income") {
                val values = PaystubValues.fromJson(fixture["paystub"].obj()["values"]!!)
                val annual = Validation.validatePaystubs(listOf(values), pack.jurisdiction).annualization ?: fail("no yearly income")
                equal(fixture["paystub"].obj()["annualIncome"].text().toLong(), annual.annualIncome, "annual income")
            },
            ConformanceCase(file, "results after the paystub") {
                equal(fixture["after"].obj()["expected"], results(fixture["after"].obj()["engineAnswers"].obj()), "after")
            },
        )
    }
}
