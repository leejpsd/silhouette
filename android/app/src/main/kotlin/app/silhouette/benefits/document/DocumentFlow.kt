package app.silhouette.benefits.document

import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.core.Deduction
import app.silhouette.benefits.core.FieldKind
import app.silhouette.benefits.core.PaystubValues
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.ReviewField
import app.silhouette.benefits.core.SkeletonResult
import app.silhouette.benefits.core.SourceSegment
import app.silhouette.benefits.core.ValidationResult
import app.silhouette.benefits.core.parseTypedAmount
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// The document part of the flow: add a document → silhouette preview → review → validation and
// annualization → "use this as my yearly income". Pure logic; the screens and AppController use it.

/** Where the document text came from. */
enum class SourceKind { SAMPLE, PASTE, SHARE, PDF, MANUAL }

/** What the extractor answered, ready for review. */
class Extraction(val fields: List<ReviewField>, val source: InferenceSource, val reason: String)

/**
 * The document being worked on. Holds Raw document text in memory only; it is never stored.
 * [hidden] lists the words the user hid in the preview, in the order they were hidden (for undo).
 */
data class DocumentSession(
    val language: String,
    val text: Raw<String>? = null,
    val source: SourceKind? = null,
    val hidden: List<Int> = emptyList(),
    /** The words hidden so far, as they appeared in the silhouette (for the "hid …" notice). */
    val hiddenWords: List<String> = emptyList(),
    val skeleton: SkeletonResult? = null,
    val extraction: Extraction? = null,
    /** Copy key of the last error, or null. */
    val error: String? = null,
    val sending: Boolean = false,
    /**
     * Text shared into the app from another app, waiting to be shown in the paste box. Like pasted
     * text it is a plain string only until the user continues, when it is wrapped in Raw.
     */
    val sharedText: String? = null,
    /** The paste box holds text that came from another app. */
    val sharedReceived: Boolean = false,
    /** Paystubs already confirmed in this session ("add another paystub"). */
    val confirmedStubs: List<PaystubValues> = emptyList(),
) {
    override fun toString(): String = "DocumentSession(language=$language, source=$source, hidden=${hidden.size})"
}

enum class RowStatus { PENDING, CONFIRMED, EMPTY }

/** One reviewed field. [text] is what the user sees and edits. */
data class ReviewRow(
    val name: String,
    val kind: FieldKind,
    val options: List<String>,
    val text: String,
    val status: RowStatus,
    val source: List<List<SourceSegment>>,
) {
    override fun toString(): String = "ReviewRow($name, $status)"
}

data class DeductionRow(val amount: String, val kind: String, val status: RowStatus, val source: List<List<SourceSegment>>) {
    override fun toString(): String = "DeductionRow($status)"
}

/** The review screen's state. [result] is set by "check these values". */
data class ReviewState(
    val rows: List<ReviewRow> = emptyList(),
    val deductions: List<DeductionRow> = emptyList(),
    val result: ValidationResult? = null,
    /** True when the user types everything (no extraction). */
    val manual: Boolean = true,
) {
    val pending: Int get() = rows.count { it.status == RowStatus.PENDING } + deductions.count { it.status == RowStatus.PENDING }

    override fun toString(): String = "ReviewState(${rows.size} rows, pending=$pending)"
}

/** Amounts in review fields follow the same rule as a typed income (see [parseTypedAmount]). */
fun parseReviewNumber(text: String): Double? = parseTypedAmount(text)

/** The rows of the paystub schema, filled from an extraction or empty for typing. */
fun initialReview(schema: JsonObject, fields: List<ReviewField>?): ReviewState {
    val properties = schema["properties"] as JsonObject
    val rows = ArrayList<ReviewRow>()
    var deductions = emptyList<DeductionRow>()
    for ((name, specElement) in properties) {
        val spec = specElement as JsonObject
        val field = fields?.find { it.name == name }
        val kind = when ((spec["x-kind"] as? JsonPrimitive)?.content) {
            "number" -> FieldKind.NUMBER
            "date" -> FieldKind.DATE
            "enum" -> FieldKind.ENUM
            "list" -> FieldKind.LIST
            else -> FieldKind.TEXT
        }
        if (kind == FieldKind.LIST) {
            deductions = field?.items.orEmpty().map { item ->
                val amount = item.source.flatten().firstOrNull { it.highlight }?.text ?: (item.values["amount"]?.toString() ?: "")
                DeductionRow(amount, item.values["kind"] as? String ?: "", RowStatus.PENDING, item.source)
            }
            continue
        }
        val text = field?.let(::displayText) ?: ""
        val options = (spec["enum"] as? JsonArray)?.map { (it as JsonPrimitive).content } ?: emptyList()
        rows += ReviewRow(name, kind, options, text, if (text.isEmpty()) RowStatus.EMPTY else RowStatus.PENDING, field?.source.orEmpty())
    }
    return ReviewState(rows, deductions, null, manual = fields == null)
}

/** The text shown for a found value: the highlighted document token when there is exactly one. */
private fun displayText(field: ReviewField): String {
    val highlighted = field.source.flatten().filter { it.highlight }.map { it.text }
    if (field.kind == FieldKind.NUMBER && highlighted.size == 1) return highlighted.single()
    return when (val v = field.value) {
        null -> ""
        is Double -> app.silhouette.benefits.quickcheck.plainAmount(v)
        else -> v.toString()
    }
}

/** Confirmed values only, as validation input. */
fun toValues(state: ReviewState): PaystubValues {
    fun text(name: String) = state.rows.find { it.name == name && it.status == RowStatus.CONFIRMED && it.text.isNotEmpty() }?.text
    fun number(name: String) = text(name)?.let(::parseReviewNumber)
    return PaystubValues(
        grossPay = number("grossPay"),
        netPay = number("netPay"),
        ytdGross = number("ytdGross"),
        hourlyRate = number("hourlyRate"),
        hoursWorked = number("hoursWorked"),
        payFrequency = text("payFrequency"),
        payDate = text("payDate"),
        periodStart = text("periodStart"),
        periodEnd = text("periodEnd"),
        deductions = state.deductions.filter { it.status == RowStatus.CONFIRMED }.mapNotNull { d ->
            parseReviewNumber(d.amount)?.let { Deduction(it, d.kind.ifEmpty { null }) }
        },
    )
}
