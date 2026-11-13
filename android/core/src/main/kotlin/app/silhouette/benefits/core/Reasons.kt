package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonObject

// The reasons for a program's verdict, from the rule engine: each criterion with the state on
// screen and, where it compares an answer with a limit, the limit and the person's value.
// Deterministic; no model. The result holds the person's own values: it is shown on this device
// and passed only to on-device-only tasks. It is plain data, not CloudSafe.

/** The person's value in a comparison. */
public sealed interface YourValue {
    public data class Number(val value: Double) : YourValue

    /** Only an income band was given. */
    public data class Band(val band: IncomeBand) : YourValue

    public data object NotAnswered : YourValue
}

/**
 * One comparison `{op: [{"var": variable}, limit]}` of a criterion. [limit] is resolved for this
 * person's answers (table lookups included), or null when it depends on an unanswered question.
 */
public data class Comparison(val variable: String, val op: String, val limit: Double?, val yours: YourValue) {
    override fun toString(): String = "Comparison($variable $op)"
}

public data class CriterionReason(val id: String, val state: CriterionState, val comparisons: List<Comparison>) {
    override fun toString(): String = "CriterionReason($id, $state)"
}

private val COMPARISONS = setOf("<", "<=", ">", ">=")

/**
 * Comparisons at the top of a criterion's logic or directly inside a top-level `and` / `or`,
 * where the left side reads an answer (not a constant).
 */
private fun comparisonsOf(logic: Any?): List<Triple<String, String, Any?>> {
    val out = ArrayList<Triple<String, String, Any?>>()
    fun visit(node: Any?, depth: Int) {
        if (node !is Map<*, *>) return
        val (op, args) = node.entries.firstOrNull() ?: return
        if (op !is String || args !is List<*>) return
        if (op in COMPARISONS && args.size == 2) {
            val variable = (args[0] as? Map<*, *>)?.get("var") as? String
            if (variable != null && !variable.startsWith("constants.")) out += Triple(variable, op, args[1])
        } else if ((op == "and" || op == "or") && depth == 0) {
            for (child in args) visit(child, depth + 1)
        }
    }
    visit(logic, 0)
    return out
}

/** The reasons for one program's verdict (empty when the program is not in the pack). */
public fun criterionReasons(pack: RulePack, bands: Bands, answers: Raw<JsonObject>, programId: String): List<CriterionReason> {
    val program = pack.programs.find { it.id == programId } ?: return emptyList()
    val result = verdicts(pack, bands, answers).find { it.programId == programId } ?: return emptyList()
    val data = engineData(pack, bands, answers)
    return program.criteria.map { criterion ->
        val state = result.criteria.find { it.id == criterion.id }?.state ?: CriterionState.UNKNOWN
        val comparisons = comparisonsOf(criterion.logic).map { (variable, op, limit) ->
            val value = runCatching { evaluate(limit, data.base, EvalContext(data.unavailable)) }.getOrNull()
            val yours = when {
                variable == "annualIncome" && data.exactIncome -> YourValue.Number(data.base["annualIncome"] as Double)
                variable == "annualIncome" -> data.band?.let { YourValue.Band(it) } ?: YourValue.NotAnswered
                else -> (data.base[variable] as? Double)?.takeIf { it.isFinite() }?.let { YourValue.Number(it) } ?: YourValue.NotAnswered
            }
            Comparison(variable, op, (value as? Double)?.takeIf { it.isFinite() }, yours)
        }
        CriterionReason(criterion.id, state, comparisons)
    }
}
