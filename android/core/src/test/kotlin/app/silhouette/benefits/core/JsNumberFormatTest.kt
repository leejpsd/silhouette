package app.silhouette.benefits.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Numbers must serialize exactly as JavaScript writes them, because fixtures and canonical payloads
 * are compared byte for byte. js-number-format.json holds `String(x)` from Node.js for hand-picked
 * edge cases and a few thousand pseudo-random doubles (bit patterns in hex).
 */
class JsNumberFormatTest {
    @Test
    fun `matches JavaScript Number toString`() {
        val text = javaClass.getResource("/js-number-format.json")!!.readText()
        val cases = (Json.parseToJsonElement(text) as JsonObject)["cases"] as JsonArray
        assertTrue(cases.size > 1000)
        val mismatches = cases.mapNotNull { case ->
            val (bits, expected) = (case as JsonArray).map { (it as JsonPrimitive).content }
            val x = java.lang.Double.longBitsToDouble(java.lang.Long.parseUnsignedLong(bits, 16))
            val actual = jsNumberToString(x)
            if (actual == expected) null else "$bits: expected $expected, got $actual"
        }
        assertEquals(emptyList<String>(), mismatches)
    }

    @Test
    fun `safe integers`() {
        assertTrue(isSafeInteger(9007199254740991.0))
        assertTrue(!isSafeInteger(9007199254740992.0))
        assertTrue(isSafeInteger(-0.0))
        assertTrue(!isSafeInteger(1.5))
    }

    @Test
    fun `strings are quoted like JSON stringify`() {
        assertEquals("\"a\\\"b\\\\c\\n\\u0001\"", jsonQuote("a\"b\\c\n\u0001"))
        assertEquals("\"\\ud800x\"", jsonQuote("\ud800x"))
        assertEquals("\"😀 é ⟦\"", jsonQuote("😀 é ⟦"))
    }
}
