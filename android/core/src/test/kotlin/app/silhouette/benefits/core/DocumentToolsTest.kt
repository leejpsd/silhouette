package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The display and editing helpers around the contract: pieces, hiding words, typed amounts, review. */
class DocumentToolsTest {
    private fun allowlist(language: String) =
        Allowlist.fromFiles(listOf(Shared.json("skeleton/allowlist/en.json"), Shared.json("skeleton/allowlist/$language.json")))

    private val sample = Shared.text("samples/paystub-en-01.txt")

    @Test
    fun `pieces rebuild the skeleton and count placeholders`() {
        val result = skeletonize(Raw.of(sample), allowlist("en"))
        assertEquals(result.skeleton.text, result.pieces.joinToString("") { it.text })
        val map = result.map.reveal()
        assertEquals(map.keys.count { it.startsWith("N") }, result.counts['N'])
        assertEquals(map.keys.count { it.startsWith("W") }, result.counts['W'])
    }

    @Test
    fun `hiding a kept word masks it and its phrase, and nothing else changes`() {
        val before = skeletonize(Raw.of("Employer: Northwind   Gross Pay 10.00   Net Pay 9.00"), allowlist("en"))
        val gross = before.pieces.filterIsInstance<SkeletonPiece.KeptWord>().first { it.text == "Gross" }
        val after = skeletonize(Raw.of("Employer: Northwind   Gross Pay 10.00   Net Pay 9.00"), allowlist("en"), hide = setOf(gross.ordinal))
        assertEquals("Employer: ⟦W1⟧   ⟦W2⟧ ⟦W3⟧ ⟦N1⟧   Net Pay ⟦N2⟧", after.skeleton.text)
        assertEquals(mapOf("W1" to "Northwind", "W2" to "Gross", "W3" to "Pay", "N1" to "10.00", "N2" to "9.00"), after.map.reveal())
        // No hidden words: exactly the contract's output.
        assertEquals(before.skeleton, skeletonize(Raw.of("Employer: Northwind   Gross Pay 10.00   Net Pay 9.00"), allowlist("en"), hide = emptySet()).skeleton)
    }

    @Test
    fun `a leading introducer stays a visible, hideable label in front of a masked name`() {
        val allow = allowlist("en")
        val result = skeletonize(Raw.of("Employee Lucia Lindqvist"), allow)
        assertEquals("Employee ⟦W1⟧ ⟦W2⟧", result.skeleton.text)
        val label = result.pieces.first() as SkeletonPiece.KeptWord
        assertEquals("Employee", label.text)
        // Hiding the label masks the whole phrase: a hidden introducer is not set aside.
        val hidden = skeletonize(Raw.of("Employee Lucia Lindqvist"), allow, hide = setOf(label.ordinal))
        assertEquals("⟦W1⟧ ⟦W2⟧ ⟦W3⟧", hidden.skeleton.text)
        // Introducers come from the document language's file plus English only.
        assertEquals("Empleado ⟦W1⟧ ⟦W2⟧", skeletonize(Raw.of("Empleado Lucía Hernández"), allowlist("es")).skeleton.text)
        assertEquals("⟦W1⟧ ⟦W2⟧ ⟦W3⟧", skeletonize(Raw.of("Empleado Lucía Hernández"), allowlist("ko")).skeleton.text)
    }

    @Test
    fun `month names are matched ASCII case-insensitively only`() {
        val allow = allowlist("en")
        assertEquals("⟦D1⟧", skeletonize(Raw.of("OCTOBER 17, 2026"), allow).skeleton.text)
        // U+017F (long s) folds to "s" only under Unicode case folding; the spec asks for ASCII.
        assertEquals("⟦W1⟧ ⟦N1⟧, ⟦N2⟧", skeletonize(Raw.of("Auguſt 17, 2026"), allow).skeleton.text)
        assertNull(Dates.parse("Auguſt 17, 2026", "us-ca"))
        assertEquals(CivilDate(2026, 8, 17), Dates.parse("AUGUST 17, 2026", "us-ca"))
    }

    @Test
    fun `typed amounts accept the document number format and nothing else`() {
        assertEquals(28000.5, parseTypedAmount("28000.50"))
        assertEquals(28000.5, parseTypedAmount("  28,000.50 "))
        assertEquals(28000.5, parseTypedAmount("$28,000.50"))
        assertEquals(28000.0, parseTypedAmount("€ 28000"))
        assertEquals(2485000.0, parseTypedAmount("₩2,485,000"))
        for (bad in listOf("28.000,50", "28 000", "1e3", "-5", "", "$", "28,00", "12.", ".5", "$$5", "5$", "28000.50\n1")) {
            assertNull(parseTypedAmount(bad), bad)
        }
    }

    @Test
    fun `review shows each field with its highlighted source line`() {
        val result = skeletonize(Raw.of(sample), allowlist("en"))
        val rehydrateCase = (Shared.json("fixtures/conformance/rehydrate.json") as JsonObject)["cases"]!!.let { it as JsonArray }
            .map { it as JsonObject }.first { (it["id"] as JsonPrimitive).content == "paystub-en-01-correct" }
        val schema = Shared.json("schemas/pointer.paystub.json") as JsonObject
        val review = buildReview(schema, rehydrateCase["pointers"]!!, result)
        val gross = review.first { it.name == "grossPay" }
        assertEquals(1271.88, gross.value)
        val highlighted = gross.source.flatten().filter { it.highlight }.map { it.text }
        assertEquals(listOf("1,271.88"), highlighted)
        assertTrue(gross.source.single().joinToString("") { it.text }.startsWith("Gross Pay"))
        val deductions = review.first { it.name == "deductions" }
        assertEquals(4, deductions.items.size)
        assertEquals("federal_tax", deductions.items.first().values["kind"])
        val frequency = review.first { it.name == "payFrequency" }
        assertEquals("semimonthly", frequency.value)
        assertTrue(frequency.options.contains("monthly"))
        assertFalse(review.toString().contains("1,271.88"))
        // A null pointer is "not in the document".
        val empty = buildReview(schema, JsonObject(mapOf("grossPay" to kotlinx.serialization.json.JsonNull)), result)
        assertNull(empty.first { it.name == "grossPay" }.value)
    }
}
