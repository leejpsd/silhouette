package app.silhouette.benefits

import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.i18n.LocalCopy
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.quickcheck.Step
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Locale

class CopyTest {
    private val content = TestContent.content

    @Test
    fun `app keys never shadow shared or pack keys`() {
        val shared = content.sharedCopy.values.flatMap { it.keys } + content.packCopy.values.flatMap { it.keys }
        for ((language, table) in LocalCopy.tables) {
            assertEquals("$language", emptySet<String>(), table.keys.intersect(shared.toSet()))
            assertEquals("$language has the same keys as en", LocalCopy.tables.getValue(AppLanguage.EN).keys, table.keys)
        }
    }

    /** Every key the app can ask for exists in English, so a fallback always has something to show. */
    @Test
    fun `every key the Quick Check uses exists`() {
        val en = content.strings(AppLanguage.EN)
        val keys = mutableListOf("pack.${content.pack.jurisdiction}.name")
        for (step in content.steps) {
            keys += "question.${step.id}.label"
            when (step) {
                is Step.EnumQuestion -> step.values.forEach { keys += "option.${step.id}.$it" }
                is Step.MultiQuestion -> step.values.forEach { keys += "option.${step.id}.$it" }
                is Step.BoolQuestion -> listOf("true", "false").forEach { keys += "option.${step.id}.$it" }
                else -> Unit
            }
        }
        for (question in content.pack.questions) keys += "variable.${question.id}"
        keys += "variable.annualIncome"
        val criteria = Regex("\"(criterion\\.[^\"]+)\"").findAll(File(TestContent.sharedDir, "rulepacks/zz-test/copy/en.json").readText()).map { it.groupValues[1] }
        assertTrue(criteria.count() > 0)
        for (program in content.pack.json["programs"].toString().let { Regex("\"id\":\"([a-z-]+)\",\"name\"").findAll(it).map { m -> m.groupValues[1] } }) {
            keys += "program.$program.name".takeIf { en.has(it) } ?: continue
        }
        // Keys referenced from source files: every literal t("…") key in the app sources.
        val sources = File("src/main/kotlin").walk().filter { it.extension == "kt" }.map { it.readText() }.joinToString("\n")
        keys += Regex("""\bt\("([a-z][A-Za-z.]*[a-zA-Z])"""").findAll(sources).map { it.groupValues[1] }.filterNot { it.endsWith(".") }
        keys += listOf("leaving.title", "leaving.none", "leaving.details", "leaving.hide", "leaving.body", "nav.home", "nav.language", "demo.title", "demo.body")
        val missing = keys.distinct().filterNot { en.has(it) }
        assertEquals(emptyList<String>(), missing)
    }

    @Test
    fun `missing translations fall back to English per key`() {
        val strings = Strings(
            AppLanguage.KO,
            shared = mapOf(AppLanguage.EN to mapOf("a" to "A en", "b" to "B en"), AppLanguage.KO to mapOf("a" to "A ko")),
            pack = emptyMap(),
            local = emptyMap(),
        )
        assertEquals("A ko", strings("a"))
        assertEquals("B en", strings("b"))
        assertEquals("missing.key", strings("missing.key"))
        assertEquals("Question 2 of 8", Strings.format("Question {n} of {total}", mapOf("n" to 2, "total" to 8)))
    }

    @Test
    fun `the device language picks a supported language or English`() {
        assertEquals(AppLanguage.KO, AppLanguage.bestMatch(listOf(Locale.forLanguageTag("ko-KR"))))
        assertEquals(AppLanguage.ES, AppLanguage.bestMatch(listOf(Locale.forLanguageTag("fr-FR"), Locale.forLanguageTag("es-MX"))))
        assertEquals(AppLanguage.EN, AppLanguage.bestMatch(listOf(Locale.forLanguageTag("de-DE"))))
    }

    @Test
    fun `amounts show two decimals only when they have a fraction`() {
        val en = content.strings(AppLanguage.EN)
        assertEquals("28,000.50", en.decimal(28000.5))
        assertEquals("32,000", en.decimal(32000.0))
        assertEquals("1,271.88", en.money(127188))
        assertEquals("Understood as 28,000.50 a year.", en("q.amountUnderstood", "amount" to en.decimal(28000.5)))
    }

    @Test
    fun `band labels use the language's number format`() {
        val bands = content.bands.annualIncome
        val en = content.strings(AppLanguage.EN)
        assertEquals("Less than 15,000", en.bandLabel(bands.first()))
        assertEquals("60,000 or more", en.bandLabel(bands.last()))
        assertTrue(en.bandLabel(bands[1]).contains("15,000") && en.bandLabel(bands[1]).contains("29,999"))
    }
}
