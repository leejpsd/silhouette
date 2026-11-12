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
            "detail.period" to "Figures are for {period}.",
            "detail.caveats" to "Things to know",
            "outbound.count" to "{count} sent: {list}",
            "outbound.sentTo" to "Sent to {destination}",
        ),
        AppLanguage.ES to mapOf(
            "detail.period" to "Las cifras corresponden a {period}.",
            "detail.caveats" to "Ten en cuenta",
            "outbound.count" to "{count} enviados: {list}",
            "outbound.sentTo" to "Enviado a {destination}",
        ),
        AppLanguage.KO to mapOf(
            "detail.period" to "{period} 기준 금액입니다.",
            "detail.caveats" to "알아 둘 점",
            "outbound.count" to "{count}건 전송: {list}",
            "outbound.sentTo" to "{destination}(으)로 전송",
        ),
    )
}
