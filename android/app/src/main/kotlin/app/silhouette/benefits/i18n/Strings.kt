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
            "q.amountUnderstood" to "Understood as {amount} a year.",
            "q.error.amountFormat" to "Enter the yearly amount in digits, like 32,000 or 32000.50.",
            "doc.share.received" to "Text shared from another app. Check it, then continue.",
            "doc.pdf.unsupported" to "Reading a PDF on this device needs Android 15 or later. Paste the text or type the numbers instead.",
            "preview.hideHint" to "Tap any word that is still visible to hide it.",
            "preview.hidden" to "Hid “{word}”.",
            "preview.hideAction" to "Hide “{word}”",
            "preview.undo" to "Undo",
            "preview.sample" to "This is a built-in sample. Its fields are filled in from fixed sample answers on this device. Nothing is sent.",
            "preview.sampleButton" to "Fill in the sample answers",
            "preview.noExtractor" to "This version of the app cannot read documents automatically yet, so nothing will be sent. Type the numbers from your paystub instead.",
            "badge.sampleKey" to "Sample answers, no AI",
            "reason.sample-answer-key" to "built-in sample",
            "outbound.status.ATTEMPTED" to "Being sent",
            "outbound.status.SENT" to "Sent",
            "outbound.status.FAILED" to "May have been sent: the request failed",
            "outbound.status.KEPT_ON_DEVICE" to "Not sent: answered on this device",
            "outbound.showSilhouette" to "Show the silhouette",
        ),
        AppLanguage.ES to mapOf(
            "q.amountUnderstood" to "Entendido como {amount} al año.",
            "q.error.amountFormat" to "Escribe el monto anual con números, por ejemplo 32,000 o 32000.50.",
            "doc.share.received" to "Texto compartido desde otra app. Revísalo y luego continúa.",
            "doc.pdf.unsupported" to "Leer un PDF en este dispositivo requiere Android 15 o posterior. Pega el texto o escribe los números.",
            "preview.hideHint" to "Toca cualquier palabra que aún se vea para ocultarla.",
            "preview.hidden" to "Se ocultó «{word}».",
            "preview.hideAction" to "Ocultar «{word}»",
            "preview.undo" to "Deshacer",
            "preview.sample" to "Este es un documento de muestra incluido. Sus campos se llenan con respuestas de muestra fijas en este dispositivo. No se envía nada.",
            "preview.sampleButton" to "Llenar con las respuestas de muestra",
            "preview.noExtractor" to "Esta versión de la app todavía no puede leer documentos automáticamente, así que no se enviará nada. Escribe los números de tu talón de pago.",
            "badge.sampleKey" to "Respuestas de muestra, sin IA",
            "reason.sample-answer-key" to "muestra incluida",
            "outbound.status.ATTEMPTED" to "Enviándose",
            "outbound.status.SENT" to "Enviado",
            "outbound.status.FAILED" to "Pudo haberse enviado: la solicitud falló",
            "outbound.status.KEPT_ON_DEVICE" to "No enviado: se respondió en este dispositivo",
            "outbound.showSilhouette" to "Ver la silueta",
        ),
        AppLanguage.KO to mapOf(
            "q.amountUnderstood" to "연 {amount}(으)로 이해했습니다.",
            "q.error.amountFormat" to "연간 금액을 숫자로 입력하세요. 예: 32,000 또는 32000.50",
            "doc.share.received" to "다른 앱에서 공유한 텍스트입니다. 확인한 뒤 계속하세요.",
            "doc.pdf.unsupported" to "이 기기에서 PDF를 읽으려면 Android 15 이상이 필요합니다. 텍스트를 붙여넣거나 숫자를 직접 입력하세요.",
            "preview.hideHint" to "아직 보이는 단어를 누르면 가려집니다.",
            "preview.hidden" to "“{word}”을(를) 가렸습니다.",
            "preview.hideAction" to "“{word}” 가리기",
            "preview.undo" to "되돌리기",
            "preview.sample" to "앱에 들어 있는 샘플 서류입니다. 이 기기에 저장된 고정 샘플 답으로 항목을 채웁니다. 아무것도 보내지 않습니다.",
            "preview.sampleButton" to "샘플 답으로 채우기",
            "preview.noExtractor" to "이 버전의 앱은 아직 서류를 자동으로 읽을 수 없어서 아무것도 보내지 않습니다. 급여명세서의 숫자를 직접 입력하세요.",
            "badge.sampleKey" to "샘플 답, AI 없음",
            "reason.sample-answer-key" to "내장 샘플",
            "outbound.status.ATTEMPTED" to "보내는 중",
            "outbound.status.SENT" to "보냄",
            "outbound.status.FAILED" to "보냈을 수 있음: 요청 실패",
            "outbound.status.KEPT_ON_DEVICE" to "보내지 않음: 이 기기에서 처리",
            "outbound.showSilhouette" to "실루엣 보기",
        ),
    )
}
