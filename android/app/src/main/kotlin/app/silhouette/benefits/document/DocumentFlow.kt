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
enum class SourceKind { SAMPLE, PASTE, SHARE, PDF, PHOTO, MANUAL }

/** Where a silhouette will be read when the user sends it. */
enum class ReadingPlace {
    /** The on-device model first; the cloud only if it fails. */
    DEVICE_FIRST,
    CLOUD,

    /** No model can be reached: the fixed answers of a built-in sample. */
    SAMPLE_ANSWERS,

    /** Nothing can read it; the user types the numbers. */
    NOWHERE,
}

/** How a photo was read (always on this device), for the badge. */
class PhotoSource(val source: InferenceSource, val reason: String)

/** The copy key for a failed model call. Reasons are SDK error names or short codes, never user values. */
fun errorKey(failure: app.silhouette.benefits.ai.ModelFailure): String {
    val reason = failure.reason
    return when {
        reason == "quota-daily" -> "error.quotaDaily"
        reason == app.silhouette.benefits.ai.LoggedModelPort.NO_APP_CHECK -> "error.appCheckTryAgain"
        reason.contains("Quota", ignoreCase = true) -> "error.quota"
        reason == "bad-output" || reason == "empty-response" || reason.contains("Serialization") -> "error.bad-output"
        reason.contains("ServiceDisabled") || reason.contains("APINotConfigured") -> "error.api-not-enabled"
        reason.contains("Permission") || reason.contains("InvalidAPIKey") -> "error.permission"
        reason.contains("Timeout") || reason.contains("Server") || reason.contains("IOException") || reason.contains("UnknownHost") -> "error.network"
        reason.startsWith("device") -> "error.on-device-unavailable"
        else -> "error.unknown"
    }
}

/**
 * What the extractor answered, ready for review. [notRead]: fields the device left out as not read
 * (`deductions` when the deductions did not hold up). [noDeviceModel]: read in the cloud because this
 * phone has no on-device model (the reason chip says so).
 */
class Extraction(
    val fields: List<ReviewField>,
    val source: InferenceSource,
    val reason: String,
    val notRead: List<String> = emptyList(),
    val noDeviceModel: Boolean = false,
)

/**
 * The document being worked on. Holds Raw document text in memory only; it is never stored.
 * [hidden] lists the words the user hid in the preview, in the order they were hidden (for undo).
 */
data class DocumentSession(
    val language: String,
    val text: Raw<String>? = null,
    val source: SourceKind? = null,
    val hidden: List<String> = emptyList(),
    val skeleton: SkeletonResult? = null,
    val extraction: Extraction? = null,
    /** Copy key of the last error, or null. */
    val error: String? = null,
    val sending: Boolean = false,
    /** Where a reading is, while it runs (`preview.stage.*`). */
    val stage: app.silhouette.benefits.ai.ReadingStage? = null,
    val readingPhoto: Boolean = false,
    /** Set when the text was read from a photo on this device. */
    val photoSource: PhotoSource? = null,
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

/** One reviewed field. [text] is what the user sees and edits. [notRead]: left out by the device as not read. */
data class ReviewRow(
    val name: String,
    val kind: FieldKind,
    val options: List<String>,
    val text: String,
    val status: RowStatus,
    val source: List<List<SourceSegment>>,
    val notRead: Boolean = false,
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
    /** The device left the deductions out as not read: the net-sum check is not shown while none was added. */
    val deductionsNotRead: Boolean = false,
) {
    val pending: Int get() = rows.count { it.status == RowStatus.PENDING } + deductions.count { it.status == RowStatus.PENDING }

    override fun toString(): String = "ReviewState(${rows.size} rows, pending=$pending)"
}

/** Amounts in review fields follow the same rule as a typed income (see [parseTypedAmount]). */
fun parseReviewNumber(text: String): Double? = parseTypedAmount(text)

/** The rows of the paystub schema, filled from an extraction or empty for typing. */
fun initialReview(schema: JsonObject, fields: List<ReviewField>?, notRead: List<String> = emptyList()): ReviewState {
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
        rows += ReviewRow(name, kind, options, text, if (text.isEmpty()) RowStatus.EMPTY else RowStatus.PENDING, field?.source.orEmpty(), notRead = name in notRead)
    }
    return ReviewState(rows, deductions, null, manual = fields == null, deductionsNotRead = "deductions" in notRead)
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

/** What decides the yearly income: shown first. The date is the pay date, or the period end without one. */
val LEAD_FIELDS: List<String> = listOf("grossPay", "ytdGross", "payDate", "payFrequency")

/** The values each check compares; a value a check flags is shown with the leading values. */
val CHECK_FIELDS: Map<String, List<String>> = mapOf(
    "net-sum" to listOf("grossPay", "netPay", "deductions"),
    "rate-hours" to listOf("hoursWorked", "hourlyRate", "grossPay"),
    "period-length" to listOf("periodStart", "periodEnd", "payFrequency"),
    "pay-date" to listOf("payDate", "periodEnd"),
    "ytd-gross" to listOf("ytdGross", "grossPay"),
    "ytd-periods" to listOf("ytdGross", "payDate", "payFrequency"),
    "dates-parsed" to listOf("payDate", "periodStart", "periodEnd"),
)

/**
 * The review's rows split into what decides the result (shown first, with any row a check flags)
 * and the rest (folded under "More values").
 */
fun leadAndRest(state: ReviewState, flagged: Set<String>): Pair<List<ReviewRow>, List<ReviewRow>> {
    val date = if (state.rows.find { it.name == "payDate" }?.text.isNullOrEmpty()) "periodEnd" else "payDate"
    val order = (LEAD_FIELDS.map { if (it == "payDate") date else it } + state.rows.map { it.name }.filter { it in flagged }).distinct()
    val lead = order.mapNotNull { n -> state.rows.find { it.name == n } }
    return lead to state.rows.filter { it.name !in order }
}

/** Whether a reading found nothing at all (not a paystub): every field empty. */
fun nothingFound(fields: List<ReviewField>): Boolean = fields.all { it.value == null && it.items.isEmpty() }
