package app.silhouette.benefits.ui.theme

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * shared/design/tokens.json, read as plain values (no Android or Compose types), so it can be
 * unit-tested on the JVM. Lengths are dp/sp, colors are ARGB.
 */
data class DesignTokens(
    val light: Palette,
    val dark: Palette,
    val type: Map<String, TypeStyle>,
    val spacing: Map<String, Int>,
    val radius: Map<String, Int>,
    val size: Map<String, Int>,
    val motionShortMs: Int,
    val motionMediumMs: Int,
) {
    data class TypeStyle(val size: Double, val lineHeight: Double, val weight: Int, val letterSpacing: Double)

    /** One color scheme; keys are the token names (`background`, `verdictLikely`, …). */
    data class Palette(val colors: Map<String, Long>) {
        operator fun get(name: String): Long = colors[name] ?: error("missing color token $name")
    }

    fun space(name: String): Int = spacing[name] ?: error("missing spacing token $name")

    fun typeStyle(name: String): TypeStyle = type[name] ?: error("missing type token $name")

    companion object {
        val REQUIRED_COLORS: List<String> = listOf(
            "background", "surface", "surfaceSunken", "text", "textMuted", "border", "borderStrong", "primary",
            "onPrimary", "focus", "verdictLikely", "verdictMaybe", "verdictDepends", "verdictUnlikely", "notice",
            "onNotice", "private", "onPrivate", "danger", "onDanger",
        )

        fun parse(text: String): DesignTokens {
            val root = Json.parseToJsonElement(text).jsonObject
            fun palette(name: String): Palette {
                val obj = root["color"]!!.jsonObject[name]!!.jsonObject
                val colors = obj.mapValues { (_, v) -> parseHex(v.jsonPrimitive.content) }
                REQUIRED_COLORS.forEach { require(it in colors) { "tokens.json: $name.$it is missing" } }
                return Palette(colors)
            }
            fun ints(name: String): Map<String, Int> = root[name]!!.jsonObject.mapValues { (_, v) -> v.jsonPrimitive.int }
            val scale = root["typography"]!!.jsonObject["scale"]!!.jsonObject.mapValues { (_, v) ->
                val o = v.jsonObject
                TypeStyle(o.num("size"), o.num("lineHeight"), o.num("weight").toInt(), o.num("letterSpacing"))
            }
            val duration = root["motion"]!!.jsonObject["duration"]!!.jsonObject
            return DesignTokens(
                light = palette("light"),
                dark = palette("dark"),
                type = scale,
                spacing = ints("spacing"),
                radius = ints("radius"),
                size = ints("size"),
                motionShortMs = duration["short"]!!.jsonPrimitive.int,
                motionMediumMs = duration["medium"]!!.jsonPrimitive.int,
            )
        }

        private fun JsonObject.num(key: String): Double = (this[key] as JsonPrimitive).double

        /** `#RRGGBB` → opaque ARGB. */
        fun parseHex(hex: String): Long {
            require(Regex("^#[0-9A-Fa-f]{6}$").matches(hex)) { "not a #RRGGBB color: $hex" }
            return 0xFF000000L or hex.substring(1).toLong(16)
        }

        /** WCAG 2.x contrast ratio between two opaque colors. */
        fun contrast(a: Long, b: Long): Double {
            fun channel(c: Long, shift: Int): Double {
                val s = ((c shr shift) and 0xFF) / 255.0
                return if (s <= 0.04045) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4)
            }
            fun luminance(c: Long) = 0.2126 * channel(c, 16) + 0.7152 * channel(c, 8) + 0.0722 * channel(c, 0)
            val (hi, lo) = listOf(luminance(a), luminance(b)).sortedDescending()
            return (hi + 0.05) / (lo + 0.05)
        }

    }
}
