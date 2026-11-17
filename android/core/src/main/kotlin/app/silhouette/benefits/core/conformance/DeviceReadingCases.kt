package app.silhouette.benefits.core.conformance

import app.silhouette.benefits.core.DeviceOutcome
import app.silhouette.benefits.core.DevicePart
import app.silhouette.benefits.core.DeviceReading
import app.silhouette.benefits.core.LeftOut
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** shared/fixtures/conformance/device-reading.json (validation/DEVICE_READING.md v2). */
internal object DeviceReadingCases {
    private class Doc(val skeleton: String, val map: Map<String, String>)

    private fun fail(message: String): Nothing = throw ConformanceFailure(message)

    private fun equal(expected: Any?, actual: Any?, what: String) {
        if (expected != actual) fail("$what: expected <$expected> but was <$actual>")
    }

    private fun JsonElement?.text(): String = (this as? JsonPrimitive)?.content ?: fail("not text: $this")

    private fun JsonElement?.texts(): List<String> = (this as? JsonArray)?.map { it.text() } ?: fail("not a list: $this")

    private fun JsonElement?.obj(): JsonObject = this as? JsonObject ?: fail("not an object: $this")

    private fun leftOut(e: JsonElement?): LeftOut = LeftOut(e.obj()["problems"].texts(), e.obj()["fields"].texts())

    private fun part(wire: String): DevicePart = DevicePart.entries.find { it.wire == wire } ?: fail("unknown part $wire")

    fun cases(source: FixtureSource, file: String, fixture: JsonObject): List<ConformanceCase> {
        val schema by lazy { Json.parseToJsonElement(source.text(fixture["schema"].text())) as JsonObject }
        val jurisdiction = fixture["jurisdiction"].text()
        val language = (fixture["confirmedOnly"] as? JsonObject)?.get("language")?.text() ?: "en"
        val docs = fixture["documents"].obj().mapValues { (_, v) ->
            Doc(v.obj()["skeleton"].text(), v.obj()["map"].obj().mapValues { (_, t) -> t.text() })
        }
        fun doc(id: String) = docs[id] ?: fail("unknown document $id")
        val out = ArrayList<ConformanceCase>()

        for (c in (fixture["constraints"] as JsonArray).map { it.obj() }) {
            out += ConformanceCase(file, "constraint ${c["id"].text()}") {
                val d = doc(c["document"].text())
                equal(c["expected"], DeviceReading.deviceConstraint(schema, d.skeleton, part(c["part"].text())), "constraint")
            }
        }

        for (c in (fixture["checks"] as JsonArray).map { it.obj() }) {
            out += ConformanceCase(file, "check ${c["id"].text()}") {
                val d = doc(c["document"].text())
                val p = c["pointers"].obj()
                val want = c["expected"].obj()
                equal(want["core"].texts(), DeviceReading.coreProblems(schema, p, d.skeleton, d.map, jurisdiction), "core")
                equal(want["deductions"].texts(), DeviceReading.deductionsProblems(schema, p, d.map, jurisdiction), "deductions")
                equal(leftOut(want["notRead"]), DeviceReading.notReadFields(p, d.skeleton), "not read")
                equal(want["ytdMissingWithCandidate"].text().toBoolean(), DeviceReading.ytdMissingWithCandidate(schema, p, d.skeleton, d.map, jurisdiction), "trigger")
                want["unconfirmed"]?.let { equal(leftOut(it), DeviceReading.unconfirmedFields(schema, p, d.skeleton, d.map, jurisdiction, language), "unconfirmed") }
            }
        }

        for (c in (fixture["readings"] as JsonArray).map { it.obj() }) {
            out += ConformanceCase(file, "reading ${c["id"].text()}") {
                val d = doc(c["document"].text())
                val answers = c["answers"].obj()
                val r = runBlocking {
                    DeviceReading.readOnDevice(schema, d.skeleton, d.map, jurisdiction, language) { p ->
                        val key = if (p == DevicePart.DEDUCTIONS_AGAIN) "deductionsAgain" else p.wire
                        app.silhouette.benefits.core.DeviceAnswer.Text(answers[key]?.text() ?: fail("no answer given for the ${p.wire} part"))
                    }
                }
                val want = c["expected"].obj()
                equal(want["asked"].texts(), r.asked.map { it.wire }, "asked")
                val passes = (want["passes"] as JsonArray).map { it.obj() }
                equal(passes.size, r.passes.size, "passes")
                passes.zip(r.passes).forEachIndexed { i, (w, got) ->
                    equal(w["part"].text(), got.part.wire, "pass $i part")
                    equal(w["parsed"].text().toBoolean(), got.parsed, "pass $i parsed")
                    equal(w["problems"].texts(), got.problems, "pass $i problems")
                    equal(w["extraKeys"].texts(), got.extraKeys, "pass $i extraKeys")
                    equal(w["missingKeys"].texts(), got.missingKeys, "pass $i missingKeys")
                    equal(w["marked"]?.texts() ?: emptyList<String>(), got.marked, "pass $i marked")
                }
                equal(want["outcome"].text(), if (r.outcome is DeviceOutcome.OnDevice) "on-device" else "failed", "outcome")
                when (val o = r.outcome) {
                    is DeviceOutcome.OnDevice -> {
                        equal(want["value"], o.value, "value")
                        equal(want["notRead"].texts(), o.notRead, "not read")
                    }
                    is DeviceOutcome.Failed -> equal(want["problems"].texts(), o.problems, "problems")
                }
            }
        }

        val gold = (fixture["gold"].obj()["cases"] as JsonArray).map { it.obj() }
        out += ConformanceCase(file, "gold: 38 English evaluation paystubs") { equal(38, gold.size, "gold cases") }
        for (g in gold) {
            out += ConformanceCase(file, "gold ${g["document"].text()}: no false alarm on any right reading") {
                val d = doc(g["document"].text())
                val readings = rightReadings(g)
                val want = g["expected"].obj()
                equal(want["readings"].text().toInt(), readings.size, "readings")
                val deductions = g["deductions"] as? JsonArray ?: JsonArray(emptyList())
                for (r in readings) {
                    equal(emptyList<String>(), DeviceReading.coreProblems(schema, r, d.skeleton, d.map, jurisdiction), "core")
                    equal(emptyList<String>(), DeviceReading.notReadFields(r, d.skeleton).problems, "not read")
                    val reading = if (deductions.isNotEmpty()) JsonObject(LinkedHashMap(r).apply { put("deductions", deductions) }) else r
                    equal(emptyList<String>(), DeviceReading.unconfirmedFields(schema, reading, d.skeleton, d.map, jurisdiction, "en").problems, "unconfirmed")
                }
                for ((field, runs) in g["names"].obj()) {
                    for (ids in runs as JsonArray) {
                        equal(emptyList<String>(), DeviceReading.incompleteNameProblems(JsonObject(mapOf(field to ids)), d.skeleton), "names $field")
                    }
                }
                equal(emptyList<String>(), want["problems"].texts(), "expected problems")
                val alternatives = (g["alternatives"].obj()["grossPay"] as? JsonArray).orEmpty()
                val trigger = alternatives.map { gross ->
                    val rest = LinkedHashMap(g["base"].obj()).apply {
                        put("grossPay", gross)
                        remove("ytdGross")
                    }
                    DeviceReading.ytdMissingWithCandidate(schema, JsonObject(rest), d.skeleton, d.map, jurisdiction)
                }
                equal(want["ytdMissingWhenLeftOut"].let { (it as JsonArray).map { b -> b.text().toBoolean() } }, trigger, "ytd missing when left out")
            }
        }
        return out
    }

    /** Every combination of the alternatives over base (reference/device-reading.cases.mjs rightReadings). */
    private fun rightReadings(g: JsonObject): List<JsonObject> {
        val alternatives = g["alternatives"].obj()
        fun choices(field: String): List<JsonElement?> = (alternatives[field] as? JsonArray)?.takeIf { it.isNotEmpty() } ?: listOf(null)
        val out = ArrayList<JsonObject>()
        for (grossPay in choices("grossPay")) for (ytdGross in choices("ytdGross")) for (hoursWorked in choices("hoursWorked")) for (hourlyRate in choices("hourlyRate")) {
            val r = LinkedHashMap(g["base"].obj())
            for ((k, v) in listOf("grossPay" to grossPay, "ytdGross" to ytdGross, "hoursWorked" to hoursWorked, "hourlyRate" to hourlyRate)) {
                if (v == null || v is JsonNull) r.remove(k) else r[k] = v
            }
            out += JsonObject(r)
        }
        return out
    }
}
