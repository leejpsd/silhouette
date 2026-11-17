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
 * [decisive]: this comparison is what produces the criterion's state (inside an `or` that is met,
 * only a comparison that holds; inside an `and` that is not met, only one that fails). [capped]: the
 * limit was looked up for a household of this size or more (the household is larger than the cap).
 */
public data class Comparison(
    val variable: String,
    val op: String,
    val limit: Double?,
    val yours: YourValue,
    val decisive: Boolean = true,
    val capped: Int? = null,
) {
    override fun toString(): String = "Comparison($variable $op)"
}

/** The answer that met an `or` by a branch that is not a comparison with a limit, and its value when it is a literal. */
public data class MetBy(val variable: String, val value: String?)

/**
 * The reasons for one criterion. [metBy]: an `or` met another way. [exception]: the state is
 * `mixed` because of `uncertainIf` (the answers it reads), not because the income is uncertain.
 */
public data class CriterionReason(
    val id: String,
    val state: CriterionState,
    val comparisons: List<Comparison>,
    val metBy: MetBy? = null,
    val exception: List<String>? = null,
) {
    override fun toString(): String = "CriterionReason($id, $state)"
}

private val COMPARISONS = setOf("<", "<=", ">", ">=")

private class Found(val variable: String, val op: String, val limit: Any?)

/**
 * Comparisons at the top of a criterion's logic or directly inside a top-level `and` / `or`,
 * where the left side reads an answer (not a constant).
 */
private fun comparisonsOf(logic: Any?): List<Found> {
    val out = ArrayList<Found>()
    fun visit(node: Any?, depth: Int) {
        if (node !is Map<*, *>) return
        val (op, args) = node.entries.firstOrNull() ?: return
        if (op !is String || args !is List<*>) return
        if (op in COMPARISONS && args.size == 2) {
            val variable = (args[0] as? Map<*, *>)?.get("var") as? String
            if (variable != null && !variable.startsWith("constants.")) out += Found(variable, op, args[1])
        } else if ((op == "and" || op == "or") && depth == 0) {
            for (child in args) visit(child, depth + 1)
        }
    }
    visit(logic, 0)
    return out
}

/** The answers an expression reads (not constants), in order; `householdSizeCapped` counts as `householdSize`. */
private fun varsRead(expr: Any?, out: MutableList<String> = ArrayList()): MutableList<String> {
    when (expr) {
        is List<*> -> expr.forEach { varsRead(it, out) }
        is Map<*, *> -> for ((k, v) in expr) {
            if (k == "var" && v is String) {
                if (!v.startsWith("constants.")) out += if (v == "householdSizeCapped") "householdSize" else v
            } else {
                varsRead(v, out)
            }
        }
    }
    return out
}

/** The answer an expression such as `{"in": ["snap", {"var": "benefits"}]}` or `{"==": [{"var": "x"}, "yes"]}` checks. */
private fun answerIn(expr: Any?): MetBy? {
    val (op, args) = (expr as? Map<*, *>)?.entries?.firstOrNull() ?: return null
    if (args !is List<*> || args.size != 2) return null
    fun varOf(x: Any?) = (x as? Map<*, *>)?.get("var") as? String
    fun literal(x: Any?): String? = when (x) {
        is String -> x
        is Boolean -> x.toString()
        is Double -> jsNumberToString(x)
        else -> null
    }
    if (op == "in" && varOf(args[1]) != null) return MetBy(varOf(args[1])!!, literal(args[0]))
    if (op == "==" && varOf(args[0]) != null) return MetBy(varOf(args[0])!!, literal(args[1]))
    if (op == "==" && varOf(args[1]) != null) return MetBy(varOf(args[1])!!, literal(args[0]))
    return varsRead(expr).firstOrNull()?.let { MetBy(it, null) }
}

private enum class Outcome { TRUE, FALSE, MIXED, UNKNOWN }

/** The reasons for one program's verdict (empty when the program is not in the pack). */
public fun criterionReasons(pack: RulePack, bands: Bands, answers: Raw<JsonObject>, programId: String): List<CriterionReason> {
    val program = pack.programs.find { it.id == programId } ?: return emptyList()
    val result = verdicts(pack, bands, answers).find { it.programId == programId } ?: return emptyList()
    val data = engineData(pack, bands, answers)
    val base = data.base

    fun evalOrUnknown(expr: Any?, at: Map<String, Any?>): Any? = runCatching { evaluate(expr, at, EvalContext(data.unavailable)) }.getOrElse { Unknown }

    // The outcome of one expression for these answers: at every sample point when only a band is known.
    fun outcome(expr: Any?): Outcome {
        val results = if (data.exactIncome || data.band == null) {
            listOf(evalOrUnknown(expr, base))
        } else {
            samplePoints(data.band, numericLiterals(pack.constants) + numericLiterals(expr)).map { point ->
                evalOrUnknown(expr, LinkedHashMap(base).apply { put("annualIncome", point) })
            }
        }
        if (true in results && false in results) return Outcome.MIXED
        if (results.any { it != true && it != false }) return Outcome.UNKNOWN
        return if (results[0] == true) Outcome.TRUE else Outcome.FALSE
    }
    val householdSize = base["householdSize"] as? Double
    fun capped(limit: Any?): Int? =
        if (householdSize != null && householdSize > bands.householdSizeCap && Regex("\"householdSize(Capped)?\"").containsMatchIn(valueToJson(limit).toString())) {
            bands.householdSizeCap
        } else {
            null
        }

    return program.criteria.map { criterion ->
        val state = result.criteria.find { it.id == criterion.id }?.state ?: CriterionState.UNKNOWN
        val top = (criterion.logic as? Map<*, *>)?.entries?.firstOrNull()
        val op = top?.key as? String
        val branches: List<Any?> = if ((op == "or" || op == "and") && top.value is List<*>) top.value as List<*> else listOf(criterion.logic)
        val comparisons = comparisonsOf(criterion.logic).map { c ->
            val value = evalOrUnknown(c.limit, base)
            val yours = when {
                c.variable == "annualIncome" && data.exactIncome -> YourValue.Number(base["annualIncome"] as Double)
                c.variable == "annualIncome" -> data.band?.let { YourValue.Band(it) } ?: YourValue.NotAnswered
                else -> (base[c.variable] as? Double)?.takeIf { it.isFinite() }?.let { YourValue.Number(it) } ?: YourValue.NotAnswered
            }
            val node = branches.find { b ->
                val (bop, bargs) = (b as? Map<*, *>)?.entries?.firstOrNull() ?: return@find false
                bop == c.op && bargs is List<*> && ((bargs[0] as? Map<*, *>)?.get("var") == c.variable) && bargs.getOrNull(1) == c.limit
            }
            val own = if (node == null) Outcome.UNKNOWN else outcome(node)
            val decisive = when (op) {
                "or" -> if (state == CriterionState.PASS) own == Outcome.TRUE else state == CriterionState.FAIL || own != Outcome.FALSE
                "and" -> if (state == CriterionState.FAIL) own == Outcome.FALSE else state == CriterionState.PASS || own != Outcome.TRUE
                else -> true
            }
            Comparison(c.variable, c.op, (value as? Double)?.takeIf { it.isFinite() }, yours, decisive, capped(c.limit))
        }
        var metBy: MetBy? = null
        if (op == "or" && state == CriterionState.PASS && comparisons.none { it.decisive }) {
            branches.find { comparisonsOf(it).isEmpty() && outcome(it) == Outcome.TRUE }?.let { metBy = answerIn(it) }
        }
        var exception: List<String>? = null
        if (state == CriterionState.MIXED && criterion.hasUncertainIf && outcome(criterion.logic) == Outcome.FALSE) {
            exception = varsRead(criterion.uncertainIf).distinct()
        }
        CriterionReason(criterion.id, state, comparisons, metBy, exception)
    }
}
