package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.TreeSet
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

// Verdict engine. Contract: shared/rulepacks/SPEC.md sections 4 and 5. Ported from
// shared/reference/silhouette.mjs. Eligibility is decided here, deterministically; no model is involved.

/** Thrown when the answers passed to [verdicts] are malformed. Messages never contain user values. */
public class InputError(message: String) : Exception(message)

/** A criterion of a program. [uncertainIf] is null when absent (a JSON null is kept as a value). */
internal class CriterionRule(val id: String, val logic: Any?, val hasUncertainIf: Boolean, val uncertainIf: Any?)

internal class ProgramRule(val id: String, val criteria: List<CriterionRule>, val hasAmount: Boolean, val amount: Any?)

/**
 * `shared/rulepacks/{jurisdiction}/pack.json`, as read by the verdict engine. The full JSON tree is
 * kept in [json] for display (names, sources, questions).
 */
public class RulePack private constructor(
    public val json: JsonObject,
    public val jurisdiction: String,
    internal val constants: Any?,
    internal val hasConstants: Boolean,
    public val questionIds: List<String>,
    internal val programs: List<ProgramRule>,
) {
    public companion object {
        /** Reads a rule pack. Throws IllegalArgumentException when its structure is malformed. */
        public fun parse(json: JsonElement): RulePack {
            val root = json as? JsonObject ?: malformed("root")
            fun JsonElement?.text(what: String): String =
                (this as? JsonPrimitive)?.takeIf { it.isString }?.content ?: malformed(what)
            fun JsonElement?.objects(what: String): List<JsonObject> =
                (this as? JsonArray)?.map { it as? JsonObject ?: malformed(what) } ?: malformed(what)
            val programs = root["programs"].objects("programs").map { program ->
                ProgramRule(
                    id = program["id"].text("programs.id"),
                    criteria = program["criteria"].objects("criteria").map { c ->
                        CriterionRule(
                            id = c["id"].text("criteria.id"),
                            logic = (c["logic"] ?: malformed("criteria.logic")).toValue(),
                            hasUncertainIf = c.containsKey("uncertainIf"),
                            uncertainIf = c["uncertainIf"]?.toValue(),
                        )
                    },
                    hasAmount = program.containsKey("amount"),
                    amount = program["amount"]?.toValue(),
                )
            }
            return RulePack(
                json = root,
                jurisdiction = root["jurisdiction"].text("jurisdiction"),
                constants = root["constants"]?.toValue(),
                hasConstants = root.containsKey("constants"),
                questionIds = root["questions"].objects("questions").map { it["id"].text("questions.id") },
                programs = programs,
            )
        }

        private fun malformed(what: String): Nothing = throw IllegalArgumentException("malformed rule pack: $what")
    }
}

public enum class CriterionState(public val wire: String) {
    PASS("pass"),
    FAIL("fail"),
    MIXED("mixed"),
    UNKNOWN("unknown"),
}

public enum class Verdict(public val wire: String) {
    LIKELY("likely"),
    MAYBE("maybe"),
    DEPENDS("depends"),
    UNLIKELY("unlikely"),
}

public data class CriterionResult(val id: String, val state: CriterionState)

/**
 * The verdict for one program. [estimatedAmount] is an integer-valued number, present only when
 * the verdict is likely, the income is exact and the program has an amount.
 */
public data class ProgramVerdict(
    val programId: String,
    val verdict: Verdict,
    val criteria: List<CriterionResult>,
    val dependsOn: List<String>,
    val estimatedAmount: Double? = null,
) {
    /** Keys in the order of the conformance fixtures; estimatedAmount only when present. */
    public fun toJson(): JsonObject {
        val out = linkedMapOf<String, JsonElement>(
            "programId" to JsonPrimitive(programId),
            "verdict" to JsonPrimitive(verdict.wire),
            "criteria" to JsonArray(criteria.map { JsonObject(linkedMapOf("id" to JsonPrimitive(it.id), "state" to JsonPrimitive(it.state.wire))) }),
            "dependsOn" to JsonArray(dependsOn.map { JsonPrimitive(it) }),
        )
        if (estimatedAmount != null) out["estimatedAmount"] = jsonNumber(estimatedAmount)
        return JsonObject(out)
    }
}

/** Every numeric literal anywhere in a value (object values, list items, scalars). */
internal fun numericLiterals(node: Any?, out: MutableList<Double> = ArrayList()): MutableList<Double> {
    when (node) {
        is Double -> out.add(node)
        is List<*> -> node.forEach { numericLiterals(it, out) }
        is Map<*, *> -> node.values.forEach { numericLiterals(it, out) }
    }
    return out
}

/** Sample points for a band (SPEC.md section 5), ascending, without duplicates. */
internal fun samplePoints(band: IncomeBand, literals: List<Double>): List<Double> {
    val lo = band.min
    val hi = band.max ?: (literals.fold(lo) { a, b -> max(a, b) } + 1)
    // + 0.0 turns -0 into 0, so the set treats them as one point, like a JavaScript Set.
    val points = TreeSet<Double>(listOf(lo + 0.0, hi + 0.0))
    for (v in literals) {
        if (v < lo || v > hi) continue
        for (p in doubleArrayOf(v - 1, v, v + 1)) points.add(min(hi, max(lo, p)) + 0.0)
    }
    return points.toList()
}

/**
 * Decides a verdict for every program in the pack. Deterministic; the answers are Raw and the
 * result is plain data, not CloudSafe, so it cannot be passed to a cloud-capable call.
 *
 * [answers] is a JSON object `{annualIncome?, incomeBand?, ...answers by question id}`. Absent or
 * null answers are unanswered.
 */
public fun verdicts(pack: RulePack, bands: Bands, answers: Raw<JsonObject>): List<ProgramVerdict> {
    val input = answers.reveal().toValue() as Map<*, *>
    val income = input["annualIncome"]
    val exactIncome = income != null
    if (exactIncome && !(income is Double && income.isFinite())) throw InputError("annualIncome must be a finite number")
    val bandId = input["incomeBand"]
    val band: IncomeBand? = if (exactIncome || bandId == null) {
        null
    } else {
        bands.annualIncome.find { it.id == bandId } ?: throw InputError("unknown income band")
    }

    val base = LinkedHashMap<String, Any?>()
    if (pack.hasConstants) base["constants"] = pack.constants
    val unavailable = HashSet<String>()
    for (id in pack.questionIds) {
        val answer = input[id]
        if (answer != null) base[id] = answer else unavailable.add(id)
    }
    val householdSize = base["householdSize"]
    if (householdSize is Double) {
        base["householdSizeCapped"] = jsNumberToString(min(householdSize, bands.householdSizeCap.toDouble()))
    } else {
        unavailable.add("householdSizeCapped")
    }
    if (exactIncome) base["annualIncome"] = max(income, 0.0) else if (band == null) unavailable.add("annualIncome")

    // Evaluates a boolean expression once, or at every sample point when only a band is known.
    fun assess(logic: Any?, reads: MutableSet<String>): List<Any> {
        fun once(data: Map<String, Any?>): Any {
            val result = evaluate(logic, data, EvalContext(unavailable, reads))
            if (result !== Unknown && result !is Boolean) throw RuleError("criterion logic must return a boolean")
            return result
        }
        if (band == null) return listOf(once(base))
        val literals = numericLiterals(pack.constants) + numericLiterals(logic)
        return samplePoints(band, literals).map { point -> once(LinkedHashMap(base).apply { put("annualIncome", point) }) }
    }

    return pack.programs.map { program ->
        val dependsOn = HashSet<String>()
        val criteria = program.criteria.map { criterion ->
            val reads = LinkedHashSet<String>()
            val results = assess(criterion.logic, reads)
            var state = when {
                true in results && false in results -> CriterionState.MIXED
                results.any { it === Unknown } -> CriterionState.UNKNOWN
                results[0] == true -> CriterionState.PASS
                else -> CriterionState.FAIL
            }
            if (state == CriterionState.FAIL && criterion.hasUncertainIf) {
                val uncertain = evaluate(criterion.uncertainIf, base, EvalContext(unavailable, reads))
                state = when {
                    uncertain === Unknown -> CriterionState.UNKNOWN
                    uncertain !is Boolean -> throw RuleError("uncertainIf must return a boolean")
                    uncertain -> CriterionState.MIXED
                    else -> state
                }
            }
            if (state == CriterionState.UNKNOWN) {
                for (name in reads) dependsOn.add(if (name == "householdSizeCapped") "householdSize" else name)
            }
            CriterionResult(criterion.id, state)
        }
        val states = criteria.map { it.state }
        val verdict = when {
            CriterionState.FAIL in states -> Verdict.UNLIKELY
            CriterionState.MIXED in states -> Verdict.MAYBE
            CriterionState.UNKNOWN in states -> Verdict.DEPENDS
            else -> Verdict.LIKELY
        }
        var estimatedAmount: Double? = null
        if (verdict == Verdict.LIKELY && exactIncome && program.hasAmount) {
            val amount = evaluate(program.amount, base, EvalContext(unavailable))
            if (amount !== Unknown) {
                if (!(amount is Double && amount.isFinite())) throw RuleError("amount must return a number")
                estimatedAmount = floor(amount)
            }
        }
        ProgramVerdict(program.id, verdict, criteria, dependsOn.sorted(), estimatedAmount)
    }
}
