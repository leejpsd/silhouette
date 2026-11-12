package app.silhouette.benefits.core

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonUnquotedLiteral
import kotlinx.serialization.json.booleanOrNull
import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import kotlin.math.abs
import kotlin.math.floor

// JSON values as the engine sees them. The contracts are defined against JavaScript semantics, so
// a JSON tree is converted once into plain Kotlin values with the same shape:
//
//   null → null, true/false → Boolean, number → Double (IEEE-754), string → String,
//   array → List<Any?>, object → Map<String, Any?> (insertion order kept).
//
// Kotlin maps have no prototype, so every lookup is an own-property lookup by construction.

/** Converts a JSON tree into engine values. Every number becomes a Double. */
internal fun JsonElement.toValue(): Any? = when (this) {
    is JsonNull -> null
    is JsonPrimitive -> when {
        isString -> content
        else -> booleanOrNull ?: content.toDouble()
    }
    is JsonArray -> map { it.toValue() }
    is JsonObject -> LinkedHashMap<String, Any?>(size).also { out -> for ((k, v) in this) out[k] = v.toValue() }
}

/** Converts an engine value back into a JSON tree. Numbers use the JavaScript number format. */
@OptIn(ExperimentalSerializationApi::class)
internal fun valueToJson(value: Any?): JsonElement = when (value) {
    null -> JsonNull
    is Boolean -> JsonPrimitive(value)
    is String -> JsonPrimitive(value)
    is Double -> JsonUnquotedLiteral(jsNumberToString(value))
    is Int -> JsonUnquotedLiteral(value.toString())
    is List<*> -> JsonArray(value.map { valueToJson(it) })
    is Map<*, *> -> JsonObject(value.entries.associate { (k, v) -> k as String to valueToJson(v) })
    else -> throw IllegalArgumentException("not a JSON value: ${value::class.simpleName}")
}

/** A JSON number in the JavaScript number format. */
internal fun jsonNumber(value: Double): JsonElement = valueToJson(value)

/** Number.isSafeInteger */
internal fun isSafeInteger(x: Any?): Boolean =
    x is Double && x.isFinite() && floor(x) == x && abs(x) <= MAX_SAFE_INTEGER

private const val MAX_SAFE_INTEGER = 9007199254740991.0

/**
 * ECMAScript Number::toString(10) for finite values, which is also what JSON.stringify writes.
 * Integer-valued doubles print without a fraction ("3000", not "3000.0"); exponents use "e+21" /
 * "e-7". The shortest round-tripping digits come from Double.toString, which is the shortest
 * representation from JDK 19 on (JDK-4511638).
 */
internal fun jsNumberToString(x: Double): String {
    require(x.isFinite()) { "not a finite number" }
    if (x == 0.0) return "0" // also -0
    val decimal = shortestDecimal(abs(x))
    val digits = decimal.unscaledValue().toString()
    val k = digits.length
    val n = k - decimal.scale() // x = 0.d1d2…dk × 10^n
    val body = when {
        n in k..21 -> digits + "0".repeat(n - k)
        n in 1..21 -> digits.substring(0, n) + "." + digits.substring(n)
        n in -5..0 -> "0." + "0".repeat(-n) + digits
        else -> {
            val e = n - 1
            val mantissa = if (k == 1) digits else digits[0] + "." + digits.substring(1)
            mantissa + "e" + (if (e < 0) "-" else "+") + abs(e)
        }
    }
    return if (x < 0) "-$body" else body
}

/**
 * The shortest decimal that rounds to [x] (positive, finite), closest to [x] among those.
 *
 * Double.toString is shortest with one exception: when a single digit would do, the JDK picks the
 * closest decimal with two digits (Double.MIN_VALUE prints as 4.9E-324, JavaScript prints 5e-324).
 * In that case the one-digit neighbours are tried and used when they round to [x].
 */
private fun shortestDecimal(x: Double): BigDecimal {
    val java = BigDecimal(x.toString()).stripTrailingZeros()
    if (java.precision() != 2) return java
    val exact = BigDecimal(x)
    val oneDigit = listOf(RoundingMode.FLOOR, RoundingMode.CEILING)
        .map { java.round(MathContext(1, it)) }
        .filter { it.toDouble() == x }
        .minByOrNull { it.subtract(exact).abs() }
    return oneDigit?.stripTrailingZeros() ?: java
}

/**
 * JSON.stringify for a string: escapes `"`, `\`, control characters and lone surrogates exactly as
 * ECMAScript does (well-formed JSON.stringify).
 */
internal fun jsonQuote(s: String): String {
    val out = StringBuilder(s.length + 2).append('"')
    var i = 0
    while (i < s.length) {
        val c = s[i]
        when {
            c == '"' -> out.append("\\\"")
            c == '\\' -> out.append("\\\\")
            c == '\b' -> out.append("\\b")
            c == '\u000C' -> out.append("\\f")
            c == '\n' -> out.append("\\n")
            c == '\r' -> out.append("\\r")
            c == '\t' -> out.append("\\t")
            c < ' ' -> out.append("\\u").append(c.code.toString(16).padStart(4, '0'))
            c.isHighSurrogate() && i + 1 < s.length && s[i + 1].isLowSurrogate() -> {
                out.append(c).append(s[i + 1])
                i++
            }
            c.isSurrogate() -> out.append("\\u").append(c.code.toString(16).padStart(4, '0'))
            else -> out.append(c)
        }
        i++
    }
    return out.append('"').toString()
}
