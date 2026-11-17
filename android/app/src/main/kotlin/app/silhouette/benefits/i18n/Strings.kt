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

/** The rule pack's money: ISO 4217 [currency] written with the number conventions of [numberFormat] (BCP 47). */
data class MoneyFormat(val currency: String, val numberFormat: String?) {
    val locale: Locale get() = Locale.forLanguageTag(numberFormat ?: "en-US")
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
    /** How amounts of money are written (the rule pack's currency and number format); null: plain numbers. */
    val moneyFormat: MoneyFormat? = null,
) {
    private fun inLanguage(lang: AppLanguage, key: String): String? =
        shared[lang]?.get(key) ?: pack[lang]?.get(key) ?: local[lang]?.get(key)

    /**
     * The template for [key], or null when no table has it. A key that names the platform has an
     * Android variant, `{key}.android`, which is looked up first (shared/copy/PLATFORM_VARIANTS.md).
     */
    fun lookup(key: String): String? =
        inLanguage(language, "$key.$PLATFORM") ?: inLanguage(AppLanguage.EN, "$key.$PLATFORM")
            ?: inLanguage(language, key) ?: inLanguage(AppLanguage.EN, key)

    fun has(key: String): Boolean = lookup(key) != null

    /** The text for [key] with `{name}` placeholders filled in. A missing key is returned as is. */
    operator fun invoke(key: String, vararg params: Pair<String, Any>): String =
        format(lookup(key) ?: key, params.toMap())

    fun withLanguage(next: AppLanguage): Strings = Strings(next, shared, pack, local, moneyFormat)

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
    fun money(cents: Long): String = money(java.math.BigDecimal.valueOf(cents, 2).toDouble(), cents = true)

    /**
     * An amount of money in the pack's currency, written the way the jurisdiction's own paperwork
     * writes it (the pack's `numberFormat`) in every interface language, always grouped: `$34,000`
     * in English and in Spanish. Cents only when the amount has them, or always with [cents].
     * Without a pack currency, a plain grouped number in the interface language.
     */
    fun money(value: Double, cents: Boolean = false): String {
        val fraction = if (cents || value != Math.floor(value)) 2 else 0
        val f = moneyFormat
        val format = if (f == null) {
            NumberFormat.getNumberInstance(language.locale)
        } else {
            NumberFormat.getCurrencyInstance(f.locale).apply { currency = java.util.Currency.getInstance(f.currency) }
        }
        format.minimumFractionDigits = fraction
        format.maximumFractionDigits = fraction
        format.isGroupingUsed = true
        return format.format(value)
    }

    /** A pack date (YYYY-MM-DD) in the interface language, such as "November 12, 2026". Anything else as written. */
    fun packDate(iso: String): String {
        val m = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$").find(iso) ?: return iso
        val (y, mo, d) = m.destructured
        val date = runCatching { java.time.LocalDate.of(y.toInt(), mo.toInt(), d.toInt()) }.getOrNull() ?: return iso
        return java.time.format.DateTimeFormatter.ofLocalizedDate(java.time.format.FormatStyle.LONG).withLocale(language.locale).format(date)
    }

    /**
     * A program's period as the pack writes it ("Tax year 2025", "October 1, 2026 - September 30,
     * 2027"), in the interface language. Anything else is shown as written.
     */
    fun packPeriod(period: String): String {
        Regex("^Tax year (\\d{4})$").find(period)?.let { return this("period.taxYear", "year" to it.groupValues[1]) }
        val range = Regex("^([A-Z][a-z]+ \\d{1,2}, \\d{4}) - ([A-Z][a-z]+ \\d{1,2}, \\d{4})$").find(period) ?: return period
        fun day(text: String): String = runCatching {
            val date = java.time.LocalDate.parse(text, java.time.format.DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH))
            java.time.format.DateTimeFormatter.ofLocalizedDate(java.time.format.FormatStyle.LONG).withLocale(language.locale).format(date)
        }.getOrDefault(text)
        return "${day(range.groupValues[1])} – ${day(range.groupValues[2])}"
    }

    /** `program.{id}.name` from the pack copy, falling back to the pack's own name. */
    fun programName(id: String, fallback: String): String = lookup("program.$id.name") ?: fallback

    fun bandLabel(band: IncomeBand): String {
        val max = band.max
        return when {
            max == null -> this("income.band.top", "amount" to money(band.min))
            band.min == 0.0 -> this("income.band.under", "amount" to money(max + 1))
            else -> this("income.band.range", "min" to money(band.min), "max" to money(max))
        }
    }

    companion object {
        /** The platform suffix of copy keys that name the platform. */
        const val PLATFORM: String = "android"

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
