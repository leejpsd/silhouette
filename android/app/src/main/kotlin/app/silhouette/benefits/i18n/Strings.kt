package app.silhouette.benefits.i18n

import app.silhouette.benefits.core.IncomeBand
import java.text.NumberFormat
import java.util.Locale

/** Languages the app ships copy for. */
enum class AppLanguage(val tag: String, val nativeName: String) {
    EN("en", "English"),
    ES("es", "Español"),
    KO("ko", "한국어"),
    ;

    val locale: Locale get() = Locale.forLanguageTag(tag)

    companion object {
        fun fromTag(tag: String?): AppLanguage? = entries.find { it.tag == tag }

        /** The first supported language in the user's preference list, or English. */
        fun bestMatch(preferred: List<Locale>): AppLanguage =
            preferred.firstNotNullOfOrNull { fromTag(it.language) } ?: EN
    }
}

/** A copy table: key → template. */
typealias CopyTable = Map<String, String>

/**
 * UI strings with per-key fallback (shared/README.md): for a key, the app-wide copy
 * (shared/copy), then the rule pack copy (shared/rulepacks/{jurisdiction}/copy), then the app's own
 * keys ([LocalCopy]) in the chosen language; then the same three in English.
 */
class Strings(
    val language: AppLanguage,
    private val shared: Map<AppLanguage, CopyTable>,
    private val pack: Map<AppLanguage, CopyTable>,
    private val local: Map<AppLanguage, CopyTable> = LocalCopy.tables,
) {
    private fun inLanguage(lang: AppLanguage, key: String): String? =
        shared[lang]?.get(key) ?: pack[lang]?.get(key) ?: local[lang]?.get(key)

    /** The template for [key], or null when no table has it. */
    fun lookup(key: String): String? = inLanguage(language, key) ?: inLanguage(AppLanguage.EN, key)

    fun has(key: String): Boolean = lookup(key) != null

    /** The text for [key] with `{name}` placeholders filled in. A missing key is returned as is. */
    operator fun invoke(key: String, vararg params: Pair<String, Any>): String =
        format(lookup(key) ?: key, params.toMap())

    fun withLanguage(next: AppLanguage): Strings = Strings(next, shared, pack, local)

    /** Whole numbers grouped the way the language writes them. */
    fun number(value: Number): String = NumberFormat.getIntegerInstance(language.locale).format(value)

    /** An amount grouped the way the language writes numbers: no decimals when whole, else two. */
    fun decimal(value: Double): String =
        NumberFormat.getNumberInstance(language.locale).apply {
            val whole = value == Math.floor(value)
            minimumFractionDigits = if (whole) 0 else 2
            maximumFractionDigits = if (whole) 0 else 2
        }.format(value)

    /** Money from integer cents, always with two decimals. */
    fun money(cents: Long): String =
        NumberFormat.getNumberInstance(language.locale).apply {
            minimumFractionDigits = 2
            maximumFractionDigits = 2
        }.format(java.math.BigDecimal.valueOf(cents, 2))

    /** `program.{id}.name` from the pack copy, falling back to the pack's own name. */
    fun programName(id: String, fallback: String): String = lookup("program.$id.name") ?: fallback

    fun bandLabel(band: IncomeBand): String {
        val max = band.max
        return when {
            max == null -> this("income.band.top", "amount" to number(band.min.toLong()))
            band.min == 0.0 -> this("income.band.under", "amount" to number(max.toLong() + 1))
            else -> this("income.band.range", "min" to number(band.min.toLong()), "max" to number(max.toLong()))
        }
    }

    companion object {
        private val PLACEHOLDER = Regex("\\{(\\w+)\\}")

        fun format(template: String, params: Map<String, Any>): String =
            PLACEHOLDER.replace(template) { m -> params[m.groupValues[1]]?.toString() ?: m.value }
    }
}

/**
 * App keys that shared/copy does not define yet. A unit test keeps them from shadowing shared
 * keys, so a key added to shared/copy takes over automatically.
 */
object LocalCopy {
    val tables: Map<AppLanguage, CopyTable> = mapOf(
        AppLanguage.EN to mapOf(
            "doc.pdf.unsupported" to "Reading a PDF on this device needs Android 15 or later. Paste the text or type the numbers instead.",
        ),
        AppLanguage.ES to mapOf(
            "doc.pdf.unsupported" to "Leer un PDF en este dispositivo requiere Android 15 o posterior. Pega el texto o escribe los números.",
        ),
        AppLanguage.KO to mapOf(
            "doc.pdf.unsupported" to "이 기기에서 PDF를 읽으려면 Android 15 이상이 필요합니다. 텍스트를 붙여넣거나 숫자를 직접 입력하세요.",
        ),
    )
}
