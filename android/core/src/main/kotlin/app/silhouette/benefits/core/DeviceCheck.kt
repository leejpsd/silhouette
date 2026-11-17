package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// The on-device check's scoring and summary (shared/validation/DEVICE_CHECK.md), a validator for the
// subset of JSON Schema its run files use (shared/schemas/device-check-run.v3.json), and the judges'
// prepared household as engine answers. Run files hold placeholder ids and field names only.

/** A field's status when a reading is compared with the gold answer, by value. */
public enum class FieldStatus(public val wire: String) {
    CORRECT("correct"),
    WRONG("wrong"),
    MISSING("missing"),
    SPURIOUS("spurious"),
    ABSENT("absent"),
}

/** The yearly-income inputs as right (or rightly absent), not found, or wrong. */
public data class IncomeInputs(val right: List<String>, val notFound: List<String>, val wrong: List<String>) {
    public fun toJson(): JsonObject = JsonObject(
        linkedMapOf("right" to strings(right), "notFound" to strings(notFound), "wrong" to strings(wrong)),
    )
}

public data class FieldScore(val correct: Int, val total: Int) {
    public fun toJson(): JsonObject = JsonObject(linkedMapOf("correct" to JsonPrimitive(correct), "total" to JsonPrimitive(total)))
}

private fun strings(values: List<String>) = JsonArray(values.map { JsonPrimitive(it) })

public object DeviceCheck {
    /** The fields the yearly income is worked out from (validation/SPEC.md section 7). */
    public val INCOME_INPUTS: List<String> = listOf("grossPay", "ytdGross", "payFrequency", "periodStart", "periodEnd", "payDate")

    public const val KIND: String = "silhouette-device-check"
    public const val VERSION: Int = 3

    private fun JsonElement?.isNullish() = this == null || this is JsonNull

    private fun number(e: JsonElement?): Double? = (e as? JsonPrimitive)?.takeIf { !it.isString }?.content?.toDoubleOrNull()

    private fun near(a: JsonElement?, b: JsonElement?): Boolean {
        val x = number(a)
        val y = number(b)
        return if (x != null && y != null) kotlin.math.abs(x - y) < 0.005 else a == b
    }

    /** Field-by-field status of a reading against the gold answers, by value (DEVICE_CHECK.md section 2). */
    public fun fieldStatuses(schema: JsonObject, pointers: JsonElement, map: Map<String, String>, gold: JsonObject): Map<String, FieldStatus> {
        val values = rehydrate(schema, pointers, Raw.of(map)).reveal()
        val out = LinkedHashMap<String, FieldStatus>()
        for ((name, spec) in schema["properties"] as JsonObject) {
            val list = ((spec as JsonObject)["x-kind"] as? JsonPrimitive)?.content == "list"
            val want = gold[name]
            val got = values[name]
            val has = if (list) (got as? JsonArray)?.isNotEmpty() == true else !got.isNullish()
            if (want.isNullish()) {
                out[name] = if (has) FieldStatus.SPURIOUS else FieldStatus.ABSENT
                continue
            }
            if (!has) {
                out[name] = FieldStatus.MISSING
                continue
            }
            out[name] = if (list) {
                val wanted = (want as JsonArray).map { (it as JsonObject)["amount"] }
                val answered = (got as JsonArray).map { (it as JsonObject)["amount"] }
                if (wanted.size == answered.size && wanted.all { w -> answered.any { a -> near(a, w) } }) FieldStatus.CORRECT else FieldStatus.WRONG
            } else {
                if (near(got, want)) FieldStatus.CORRECT else FieldStatus.WRONG
            }
        }
        return out
    }

    /** [fieldStatuses] for a document's own silhouette (its values stay inside :core); [gold] is the synthetic right answer. */
    public fun fieldStatuses(schema: JsonObject, pointers: JsonElement, document: SkeletonResult, gold: Raw<JsonObject>): Map<String, FieldStatus> =
        fieldStatuses(schema, pointers, document.map.reveal(), gold.reveal())

    /** Gold answers without one field (a reading's core fields scored apart from its deductions). */
    public fun goldWithout(gold: Raw<JsonObject>, field: String): Raw<JsonObject> = Raw.of(JsonObject(gold.reveal().filterKeys { it != field }))

    /** [scoreFields] for a Raw gold answer. */
    public fun scoreFields(statuses: Map<String, FieldStatus>, gold: Raw<JsonObject>): FieldScore = scoreFields(statuses, gold.reveal())

    /** The right answer of a document from its answer key's pointers, read through the Rehydrator. */
    public fun goldFromPointers(schema: JsonObject, pointers: JsonElement, document: SkeletonResult): Raw<JsonObject> =
        rehydrate(schema, pointers, document.map)

    /**
     * Every placeholder holding a gold value, per field (a paystub can write the same amount twice):
     * placeholder ids only, for the run file's field-by-field diagnosis.
     */
    public fun goldPlaceholderIds(gold: Raw<JsonObject>, document: SkeletonResult): Map<String, List<String>> {
        val map = document.map.reveal()
        val out = LinkedHashMap<String, List<String>>()
        fun numberIds(n: Double) = map.filter { (id, text) -> id.startsWith("N") && parseNumber(text)?.let { kotlin.math.abs(it - n) < 0.005 } == true }.keys.toList()
        for ((field, value) in gold.reveal()) {
            when {
                value is JsonPrimitive && !value.isString -> value.content.toDoubleOrNull()?.let { out[field] = numberIds(it) }
                value is JsonPrimitive -> {
                    val text = value.content
                    val words = text.lowercase(java.util.Locale.ROOT).split(Regex("\\s+")).toSet()
                    val dates = map.filter { (id, t) -> id.startsWith("D") && t == text }.keys.toList()
                    out[field] = dates.ifEmpty { map.filter { (id, t) -> !id.startsWith("D") && t.lowercase(java.util.Locale.ROOT) in words }.keys.toList() }
                }
                value is JsonArray -> out[field] = value.flatMap { item -> number((item as? JsonObject)?.get("amount"))?.let(::numberIds).orEmpty() }
            }
        }
        return out
    }

    /** Fields right in a reading, out of the fields the gold answer has. */
    public fun scoreFields(statuses: Map<String, FieldStatus>, gold: JsonObject): FieldScore {
        val expected = gold.filterValues { !it.isNullish() }.keys
        return FieldScore(expected.count { statuses[it] == FieldStatus.CORRECT }, expected.size)
    }

    public fun incomeInputs(statuses: Map<String, FieldStatus>): IncomeInputs {
        fun of(want: Set<FieldStatus?>) = INCOME_INPUTS.filter { statuses[it] in want }
        return IncomeInputs(
            right = of(setOf(FieldStatus.CORRECT, FieldStatus.ABSENT, null)),
            notFound = of(setOf(FieldStatus.MISSING)),
            wrong = of(setOf(FieldStatus.WRONG, FieldStatus.SPURIOUS)),
        )
    }

    /** Fields whose value reached the person wrong. */
    public fun wrongFields(statuses: Map<String, FieldStatus>): List<String> =
        statuses.filterValues { it == FieldStatus.WRONG || it == FieldStatus.SPURIOUS }.keys.toList()

    // ---------- Summary of a run ----------

    private fun JsonElement?.obj(): JsonObject? = this as? JsonObject

    private fun JsonElement?.text(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

    private fun JsonElement?.flag(): Boolean = (this as? JsonPrimitive)?.takeIf { !it.isString }?.content == "true"

    private fun JsonElement?.int(): Int = number(this)?.toInt() ?: 0

    /** Where a case was finally answered: version 3 records it in `ran`; versions 1 and 2 in `final.ran`, else `ran`. */
    public fun finalRan(c: JsonObject, version: Int): String? = if (version >= 3) c["ran"].text() else (c["final"].obj()?.get("ran").text() ?: c["ran"].text())

    public fun firstRan(c: JsonObject, version: Int): String? = if (version >= 3) (c["first"].obj()?.get("ran").text() ?: c["ran"].text()) else c["ran"].text()

    private fun firstFields(c: JsonObject, version: Int): JsonObject? = if (version >= 3) c["first"].obj()?.get("fields").obj() else c["fields"].obj()

    /** The figures of a run (reference `summarize`), as JSON with the reference's keys. */
    public fun summarize(cases: List<JsonObject>, version: Int): JsonObject {
        val fields = cases.mapNotNull { firstFields(it, version) }
        fun afterDevice(c: JsonObject) = c["final"].obj()?.get("retried").flag() && finalRan(c, version) == "IN_CLOUD"
        val split = cases.any { it["final"].obj()?.containsKey("incomeInputs") == true && !it["final"].obj()!!["incomeInputs"].isNullish() }
        fun income(c: JsonObject) = c["final"].obj()?.get("incomeInputs").obj()
        fun len(o: JsonObject?, key: String) = (o?.get(key) as? JsonArray)?.size ?: 0
        val out = LinkedHashMap<String, JsonElement>()
        out["onDevice"] = JsonPrimitive(cases.count { finalRan(it, version) == "ON_DEVICE" })
        out["inCloudAfterDevice"] = JsonPrimitive(cases.count(::afterDevice))
        out["inCloud"] = JsonPrimitive(cases.count { finalRan(it, version) == "IN_CLOUD" && !afterDevice(it) })
        out["notRun"] = JsonPrimitive(cases.count { finalRan(it, version) == "not-run" })
        out["total"] = JsonPrimitive(cases.size)
        out["firstOnDevice"] = JsonPrimitive(cases.count { firstRan(it, version) == "ON_DEVICE" })
        out["fieldsCorrect"] = JsonPrimitive(fields.sumOf { it["correct"].int() })
        out["fieldsTotal"] = JsonPrimitive(fields.sumOf { it["total"].int() })
        out["finalCorrect"] = if (cases.any { !it["final"].isNullish() }) JsonPrimitive(cases.sumOf { it["final"].obj()?.get("fields").obj()?.get("correct").int() }) else JsonNull
        out["retriedInCloud"] = JsonPrimitive(cases.count { it["final"].obj()?.get("retried").flag() })
        out["deductionsNotRead"] = JsonPrimitive(cases.count { it["final"].obj()?.get("deductionsNotRead").flag() })
        out["incomeInputsCorrect"] = if (cases.any { it["final"].obj()?.containsKey("incomeInputsCorrect") == true }) {
            JsonPrimitive(cases.count { it["final"].obj()?.get("incomeInputsCorrect").flag() })
        } else {
            JsonNull
        }
        out["extractionCases"] = JsonPrimitive(cases.count { it["task"].text() == "document.pointer.extract" })
        out["income"] = if (split) {
            JsonObject(
                linkedMapOf(
                    "allRight" to JsonPrimitive(cases.count { income(it) != null && len(income(it), "notFound") == 0 && len(income(it), "wrong") == 0 }),
                    "notFound" to JsonPrimitive(cases.count { income(it) != null && len(income(it), "notFound") > 0 && len(income(it), "wrong") == 0 }),
                    "wrong" to JsonPrimitive(cases.count { income(it) != null && len(income(it), "wrong") > 0 }),
                ),
            )
        } else {
            JsonNull
        }
        out["wrongReachedPerson"] = if (cases.any { it["final"].obj()?.containsKey("wrongFields") == true && !it["final"].obj()!!["wrongFields"].isNullish() }) {
            JsonPrimitive(cases.count { len(it["final"].obj(), "wrongFields") > 0 })
        } else {
            JsonNull
        }
        return JsonObject(out)
    }

    /** "device-check-2026-11-16T1744-chrome157-macos.json": UTC date and time, the client's first word and major version, the platform. */
    public fun runFileName(date: String, browser: String, platform: String): String {
        fun slug(s: String) = s.lowercase(java.util.Locale.ROOT).replace(Regex("[^a-z0-9]+"), "")
        val parts = browser.split(" ")
        val name = parts.getOrNull(0)?.takeIf { it.isNotEmpty() } ?: "browser"
        val version = parts.getOrNull(1) ?: ""
        val time = Regex("T(\\d{2}):(\\d{2})").find(date)
        return "device-check-${date.take(10)}${time?.let { "T${it.groupValues[1]}${it.groupValues[2]}" } ?: ""}-${slug(name)}${version.split(".")[0]}-${slug(platform)}.json"
    }

    // ---------- JSON Schema (the subset the run-file schema uses) ----------

    /** Problems of [value] against [schema]: type, const, enum, required, properties, additionalProperties, items, minimum, `$ref` to `#/$defs`. */
    public fun validate(schema: JsonObject, value: JsonElement, root: JsonObject = schema, path: String = "$"): List<String> {
        schema["\$ref"].text()?.let { ref ->
            val def = (root["\$defs"] as JsonObject)[ref.removePrefix("#/\$defs/")] as JsonObject
            return validate(def, value, root, path)
        }
        val problems = ArrayList<String>()
        fun typeOf(v: JsonElement): String = when {
            v is JsonNull -> "null"
            v is JsonArray -> "array"
            v is JsonObject -> "object"
            (v as JsonPrimitive).isString -> "string"
            v.content == "true" || v.content == "false" -> "boolean"
            v.content.toDoubleOrNull()?.let { it == Math.floor(it) && it.isFinite() } == true -> "integer"
            else -> "number"
        }
        schema["type"]?.let { t ->
            val types = if (t is JsonArray) t.map { it.text()!! } else listOf(t.text()!!)
            val actual = typeOf(value)
            if (actual !in types && !(actual == "integer" && "number" in types)) return listOf("$path: expected ${types.joinToString(" or ")}, got $actual")
        }
        schema["const"]?.let { if (!sameValue(it, value)) problems += "$path: expected $it" }
        (schema["enum"] as? JsonArray)?.let { e -> if (e.none { sameValue(it, value) }) problems += "$path: not one of $e" }
        val min = number(schema["minimum"])
        val n = if (typeOf(value) == "integer" || typeOf(value) == "number") number(value) else null
        if (min != null && n != null && n < min) problems += "$path: below $min"
        if (value is JsonObject) {
            for (key in (schema["required"] as? JsonArray).orEmpty().mapNotNull { it.text() }) if (key !in value) problems += "$path: missing $key"
            val properties = schema["properties"] as? JsonObject
            for ((key, v) in value) {
                val sub = properties?.get(key) as? JsonObject
                val additional = schema["additionalProperties"]
                when {
                    sub != null -> problems += validate(sub, v, root, "$path.$key")
                    additional is JsonPrimitive && additional.content == "false" -> problems += "$path: unexpected $key"
                    additional is JsonObject -> problems += validate(additional, v, root, "$path.$key")
                }
            }
        }
        if (value is JsonArray) (schema["items"] as? JsonObject)?.let { items -> value.forEachIndexed { i, v -> problems += validate(items, v, root, "$path[$i]") } }
        return problems
    }

    private fun sameValue(a: JsonElement, b: JsonElement): Boolean {
        val x = number(a)
        val y = number(b)
        return if (x != null && y != null && a is JsonPrimitive && b is JsonPrimitive && !a.isString && !b.isString) x == y else a == b
    }

    // ---------- The judges' prepared household ----------

    /**
     * The household's Quick Check answers (by question id) as verdict-engine answers: the income
     * question gives `incomeBand` or `annualIncome`; every other answer keeps its question id.
     */
    public fun engineAnswers(answers: JsonObject): JsonObject {
        val out = LinkedHashMap<String, JsonElement>()
        for ((id, value) in answers) {
            if (id == "income") {
                val o = value as JsonObject
                if (o["kind"].text() == "band") out["incomeBand"] = o["bandId"]!! else out["annualIncome"] = o["amount"]!!
            } else {
                out[id] = value
            }
        }
        return JsonObject(out)
    }
}
