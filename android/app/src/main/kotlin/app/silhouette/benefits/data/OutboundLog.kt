package app.silhouette.benefits.data

import app.silhouette.benefits.core.CloudSafe
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

/**
 * Ledger of everything that leaves, or tries to leave, the device. The "Leaving your device" bar
 * reads only this ledger. Every outbound call records an entry *before* it starts ([begin]) and
 * updates it when it ends ([finish]), so the bar can never show less than was attempted.
 *
 * Payloads are typed [CloudSafe]: only a skeleton, a generalized profile or public content can be
 * recorded, which is also all that may be sent. [onChange] persists the ledger (encrypted).
 */
class OutboundLog(
    private val onChange: (OutboundLog) -> Unit = {},
    private val clock: () -> Long = System::currentTimeMillis,
) {

    enum class Channel { AI_CLOUD, APP_CHECK, FIRESTORE, REMOTE_CONFIG, OTHER, ON_DEVICE }

    enum class Status {
        /** Recorded before the call; the outcome is not known yet. */
        ATTEMPTED,

        /** The request left the device. */
        SENT,

        /** The request could not be completed; treat what it carried as possibly sent. */
        FAILED,

        /**
         * Stopped before it left (shared/RECORD.md): by the app because no cloud request was expected
         * ([failureReason] `blocked`), or because App Check could not confirm the app (`no-app-check`).
         * Never counted as sent.
         */
        BLOCKED,

        /** Answered on this device; nothing left it. Counted as kept. */
        KEPT_ON_DEVICE,
    }

    /**
     * One outbound request. [fields] names kinds of content (copy keys `outbound.field.*`), never
     * values. [path] is the request path without project ids; [responseStatus] is set when the
     * request was answered, [failureReason] when it failed (a short code, never a user value).
     */
    data class Entry(
        val id: Long,
        val channel: Channel,
        val destination: String,
        val fields: List<String>,
        val payload: String?,
        val status: Status,
        val path: String? = null,
        val model: String? = null,
        val responseStatus: String? = null,
        val failureReason: String? = null,
        /** When it was recorded (ms since the epoch). */
        val at: Long = 0,
    ) {
        override fun toString(): String = "Entry($id, $channel, $status)"
    }

    private val state = MutableStateFlow<List<Entry>>(emptyList())

    val entries: StateFlow<List<Entry>> = state.asStateFlow()

    private val cleared = MutableStateFlow<Long?>(null)

    /** When the person last deleted the record with "Delete everything", if ever. */
    val clearedAt: StateFlow<Long?> = cleared.asStateFlow()

    /** Entries whose content may have left the device (`attempted`, `sent`, `failed`). */
    val leftDevice: List<Entry> get() = leftDevice(state.value)

    /** Records an answer written by the on-device model: no destination, no body, never counted as sent. */
    fun recordAnswered(fields: List<String>) {
        state.update { list ->
            val id = (list.maxOfOrNull { it.id } ?: 0) + 1
            list + Entry(id, Channel.ON_DEVICE, "", fields, null, Status.KEPT_ON_DEVICE, at = clock())
        }
        onChange(this)
    }

    /** Records a request the app stopped before it left (no cloud request expected, or no App Check token). */
    fun recordBlocked(channel: Channel, destination: String, fields: List<String>, reason: String, path: String? = null, model: String? = null) {
        state.update { list ->
            val id = (list.maxOfOrNull { it.id } ?: 0) + 1
            list + Entry(id, channel, destination, fields, null, Status.BLOCKED, path, model, failureReason = reason, at = clock())
        }
        onChange(this)
    }

    fun begin(
        channel: Channel,
        destination: String,
        fields: List<String>,
        payload: CloudSafe?,
        path: String? = null,
        model: String? = null,
    ): Long {
        var id = 0L
        state.update { list ->
            id = (list.maxOfOrNull { it.id } ?: 0) + 1
            list + Entry(id, channel, destination, fields, payload?.toString(), Status.ATTEMPTED, path, model, at = clock())
        }
        onChange(this)
        return id
    }

    fun finish(id: Long, status: Status, responseStatus: String? = null, failureReason: String? = null) {
        state.update { list ->
            list.map { e ->
                when {
                    e.id != id -> e
                    // A later network error never turns a stopped request into a failed one.
                    e.status == Status.BLOCKED -> e
                    // Answered on this device: nothing left, so no host, path or body is kept.
                    status == Status.KEPT_ON_DEVICE -> e.copy(channel = Channel.ON_DEVICE, destination = "", path = null, payload = null, status = status)
                    else -> e.copy(status = status, responseStatus = responseStatus, failureReason = failureReason)
                }
            }
        }
        onChange(this)
    }

    /** Replaces the entries with persisted ones (at start-up). */
    fun restore(entries: List<Entry>, clearedAt: Long? = null) {
        state.value = entries
        cleared.value = clearedAt
    }

    /** Deletes the record; [clearedAt] lets the bar say the record was deleted rather than that nothing ever left. */
    fun clear(clearedAt: Long? = null) {
        state.value = emptyList()
        cleared.value = clearedAt
        onChange(this)
    }

    /** The record as stored: its entries and when it was last deleted. */
    fun encodeState(): JsonElement = JsonObject(
        linkedMapOf("entries" to encode(state.value), "clearedAt" to (cleared.value?.let { JsonPrimitive(it) } ?: JsonNull)),
    )

    /** Restores a stored record (also an older one stored as a plain list of entries). */
    fun restoreState(text: String?) {
        val root = runCatching { Json.parseToJsonElement(text ?: return) }.getOrNull() ?: return
        if (root is JsonArray) return restore(decode(text))
        val o = root as? JsonObject ?: return
        restore(decode(o["entries"]?.toString()), (o["clearedAt"] as? JsonPrimitive)?.content?.toLongOrNull())
    }

    companion object {
        /** Entries for requests that left the device, or may have. */
        fun leftDevice(entries: List<Entry>): List<Entry> = entries.filter { it.status == Status.SENT || it.status == Status.FAILED || it.status == Status.ATTEMPTED }

        /** The reason of a request stopped because App Check could not confirm the app. */
        const val NO_APP_CHECK: String = "no-app-check"

        /** The reason of a request stopped because no cloud request was expected. */
        const val NOT_EXPECTED: String = "blocked"

        /** Fields that carry something of the person's (shared/RECORD.md section 4). */
        val PERSONAL_FIELDS: Set<String> = setOf("document-silhouette", "profile-silhouette", "county-area", "inline-file")

        /** Fields of technical checks and settings (no personal data, no question). */
        val TECHNICAL_FIELDS: Set<String> = setOf("app-check-token-request", "recaptcha-check", "installation", "remote-config", "other-request")

        /**
         * The line under the count (shared/RECORD.md section 4): copy keys with their counts, which
         * add up to the requests that left. Empty when nothing left.
         */
        fun split(entries: List<Entry>): List<Pair<String, Int>> {
            val left = leftDevice(entries)
            if (left.isEmpty()) return emptyList()
            val personal = left.filter { e -> e.fields.any { it in PERSONAL_FIELDS } }
            val rest = left - personal.toSet()
            val first = when {
                personal.isEmpty() -> "leaving.split.nothingOfYours" to 0
                personal.all { e -> e.fields.filter { it in PERSONAL_FIELDS }.all { it == "document-silhouette" } } -> "leaving.split.document" to personal.size
                else -> "leaving.split.personal" to personal.size
            }
            val second = when {
                rest.isEmpty() -> null
                rest.all { e -> e.fields.all { it in TECHNICAL_FIELDS } } -> "leaving.split.technical" to rest.size
                else -> "leaving.split.general" to rest.size
            }
            return listOfNotNull(first, second)
        }

        fun encode(entries: List<Entry>): JsonElement = JsonArray(
            entries.map { e ->
                JsonObject(
                    linkedMapOf(
                        "id" to JsonPrimitive(e.id),
                        "channel" to JsonPrimitive(e.channel.name),
                        "destination" to JsonPrimitive(e.destination),
                        "fields" to JsonArray(e.fields.map { JsonPrimitive(it) }),
                        "payload" to (e.payload?.let { JsonPrimitive(it) } ?: JsonNull),
                        "status" to JsonPrimitive(e.status.name),
                        "path" to (e.path?.let { JsonPrimitive(it) } ?: JsonNull),
                        "model" to (e.model?.let { JsonPrimitive(it) } ?: JsonNull),
                        "responseStatus" to (e.responseStatus?.let { JsonPrimitive(it) } ?: JsonNull),
                        "failureReason" to (e.failureReason?.let { JsonPrimitive(it) } ?: JsonNull),
                        "at" to JsonPrimitive(e.at),
                    ),
                )
            },
        )

        /** Reads a persisted ledger; an unreadable one gives an empty list. */
        fun decode(text: String?): List<Entry> = runCatching {
            Json.parseToJsonElement(text ?: return emptyList()).jsonArray.map { element ->
                val o = element.jsonObject
                fun opt(key: String) = (o[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
                val stored = Status.valueOf(o["status"]!!.jsonPrimitive.content)
                Entry(
                    id = o["id"]!!.jsonPrimitive.long,
                    channel = Channel.valueOf(o["channel"]!!.jsonPrimitive.content),
                    destination = o["destination"]!!.jsonPrimitive.content,
                    fields = o["fields"]!!.jsonArray.map { it.jsonPrimitive.content },
                    payload = (o["payload"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
                    // An entry still "attempted" when the app stopped may have been sent.
                    status = if (stored == Status.ATTEMPTED) Status.FAILED else stored,
                    path = opt("path"),
                    model = opt("model"),
                    responseStatus = opt("responseStatus"),
                    failureReason = opt("failureReason") ?: if (stored == Status.ATTEMPTED) "interrupted" else null,
                    at = (o["at"] as? JsonPrimitive)?.content?.toLongOrNull() ?: 0,
                )
            }
        }.getOrDefault(emptyList())
    }
}
