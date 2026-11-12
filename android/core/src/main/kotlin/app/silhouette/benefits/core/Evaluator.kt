package app.silhouette.benefits.core

import kotlin.math.floor

// Expression evaluator. Contract: shared/rulepacks/SPEC.md section 3 (strict, typed subset of JSON
// Logic with three-valued logic). Ported from shared/reference/silhouette.mjs.
//
// Expressions and data are engine values (see JsonValues.kt): null, Boolean, Double, String,
// List<Any?>, Map<String, Any?>. The third truth value is [Unknown].

/** Thrown when an expression is malformed or its operands have the wrong type. A pack that throws is invalid. */
public class RuleError(message: String) : Exception(message)

/** The third truth value: the answer depends on something the user has not told us. */
internal object Unknown {
    override fun toString(): String = "unknown"
}

/**
 * @property unavailable top-level variable names whose value is not known. Reading one gives
 *   [Unknown] and records the name in [unknownReads].
 */
internal class EvalContext(
    val unavailable: Set<String> = emptySet(),
    val unknownReads: MutableSet<String>? = null,
)

private const val MANY = Int.MAX_VALUE

private val ARITY: Map<String, IntRange> = mapOf(
    "!" to 1..1, "==" to 2..2, "!=" to 2..2, "<" to 2..2, "<=" to 2..2, ">" to 2..2, ">=" to 2..2,
    "+" to 2..MANY, "*" to 2..MANY, "-" to 2..2, "/" to 2..2, "min" to 1..MANY, "max" to 1..MANY,
    "floor" to 1..1, "in" to 2..2, "cat" to 1..MANY,
)

private fun isNumber(x: Any?): Boolean = x is Double && x.isFinite()

private fun isPrimitive(x: Any?): Boolean = x == null || x is Double || x is String || x is Boolean

/** IEEE-754 comparison (so 0 equals -0), not Double.equals. */
private fun sameNumber(a: Double, b: Double): Boolean = a == b

/** JavaScript `===` between primitives. Different types are never equal. */
private fun strictEquals(a: Any?, b: Any?): Boolean = when (a) {
    null -> b == null
    is Double -> b is Double && sameNumber(a, b)
    is String -> b is String && a == b
    is Boolean -> b is Boolean && a == b
    else -> false
}

/** Own-property dotted lookup. A missing key, or a walk into a non-object or a list, gives null. */
private fun lookup(data: Any?, path: String): Any? {
    var node = data
    for (key in path.split('.')) {
        if (node !is Map<*, *> || !node.containsKey(key)) return null
        node = node[key]
    }
    return node
}

/**
 * Evaluates an expression with the strict, three-valued semantics of shared/rulepacks/SPEC.md
 * section 3. Returns the value or [Unknown]; violations throw [RuleError].
 */
internal fun evaluate(expr: Any?, data: Any?, ctx: EvalContext = EvalContext()): Any? {
    if (expr is List<*>) return expr.map { evaluate(it, data, ctx) }
    if (expr !is Map<*, *>) return expr
    if (expr.size != 1) throw RuleError("an expression object has exactly one operator")
    val (opKey, raw) = expr.entries.first()
    val op = opKey as String
    fun fail(why: String): Nothing = throw RuleError("$op: $why")

    if (op == "var") {
        val path = evaluate(raw, data, ctx)
        if (path === Unknown) return Unknown
        if (path !is String || path.isEmpty()) fail("path must be a non-empty string")
        val top = path.substringBefore('.')
        if (top in ctx.unavailable) {
            ctx.unknownReads?.add(top)
            return Unknown
        }
        return lookup(data, path)
    }

    val args: List<Any?> = if (raw is List<*>) raw else listOf(raw)
    fun arity(range: IntRange) {
        if (args.size !in range) fail("wrong number of arguments")
    }
    fun truth(x: Any?): Any = if (x === Unknown || x is Boolean) x else fail("operand must be a boolean")

    // Three-valued logic, left to right. `and` stops at the first false, `or` at the first true.
    if (op == "if") {
        arity(3..3)
        val condition = truth(evaluate(args[0], data, ctx))
        if (condition === Unknown) return Unknown
        return if (condition == true) evaluate(args[1], data, ctx) else evaluate(args[2], data, ctx)
    }
    if (op == "and" || op == "or") {
        arity(1..MANY)
        val decisive = op == "or"
        var sawUnknown = false
        for (a in args) {
            val value = truth(evaluate(a, data, ctx))
            if (value == decisive) return decisive
            if (value === Unknown) sawUnknown = true
        }
        return if (sawUnknown) Unknown else !decisive
    }

    val v = args.map { evaluate(it, data, ctx) }
    val range = ARITY[op] ?: fail("unsupported operator")
    arity(range)
    if (v.any { it === Unknown || (it is List<*> && it.any { e -> e === Unknown }) }) return Unknown
    fun numbers(): List<Double> = if (v.all(::isNumber)) v.map { it as Double } else fail("operands must be numbers")
    fun primitives() {
        if (!v.all(::isPrimitive)) fail("operands must be primitives")
    }
    return when (op) {
        "!" -> (v[0] as? Boolean)?.not() ?: fail("operand must be a boolean")
        "==" -> { primitives(); strictEquals(v[0], v[1]) }
        "!=" -> { primitives(); !strictEquals(v[0], v[1]) }
        "<" -> numbers().let { it[0] < it[1] }
        "<=" -> numbers().let { it[0] <= it[1] }
        ">" -> numbers().let { it[0] > it[1] }
        ">=" -> numbers().let { it[0] >= it[1] }
        "+" -> numbers().reduce { a, b -> a + b }
        "*" -> numbers().reduce { a, b -> a * b }
        "-" -> numbers().let { it[0] - it[1] }
        "/" -> numbers().let { if (it[1] == 0.0) fail("division by zero") else it[0] / it[1] }
        "min" -> numbers().reduce { a, b -> Math.min(a, b) }
        "max" -> numbers().reduce { a, b -> Math.max(a, b) }
        "floor" -> floor(numbers()[0])
        "in" -> {
            val needle = v[0]
            val haystack = v[1]
            if (!isPrimitive(needle) || haystack !is List<*> || !haystack.all(::isPrimitive)) {
                fail("expects a primitive and a list of primitives")
            }
            haystack.any { strictEquals(it, needle) }
        }
        "cat" -> {
            if (!v.all { it is String || isSafeInteger(it) }) fail("operands must be strings or integers")
            v.joinToString("") { if (it is String) it else jsNumberToString(it as Double) }
        }
        else -> fail("unsupported operator")
    }
}
