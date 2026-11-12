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
class OutboundLog(private val onChange: (List<Entry>) -> Unit = {}) {

    enum class Channel { AI_CLOUD, APP_CHECK, FIRESTORE, REMOTE_CONFIG, OTHER }

    enum class Status {
        /** Recorded before the call; the outcome is not known yet. */
        ATTEMPTED,

        /** The request left the device. */
        SENT,

        /** The request could not be completed; treat what it carried as possibly sent. */
        FAILED,

        /** Answered on this device; nothing left it. */
        KEPT_ON_DEVICE,
    }

    /** One outbound request. [fields] names kinds of content (copy keys `outbound.field.*`), never values. */
    data class Entry(
        val id: Long,
        val channel: Channel,
        val destination: String,
        val fields: List<String>,
        val payload: String?,
        val status: Status,
    )

    private val state = MutableStateFlow<List<Entry>>(emptyList())

    val entries: StateFlow<List<Entry>> = state.asStateFlow()

    /** Entries whose content may have left the device. */
    val leftDevice: List<Entry> get() = state.value.filter { it.status == Status.SENT || it.status == Status.FAILED || it.status == Status.ATTEMPTED }

    fun begin(channel: Channel, destination: String, fields: List<String>, payload: CloudSafe?): Long {
        var id = 0L
        state.update { list ->
            id = (list.maxOfOrNull { it.id } ?: 0) + 1
            list + Entry(id, channel, destination, fields, payload?.toString(), Status.ATTEMPTED)
        }
        onChange(state.value)
        return id
    }

    fun finish(id: Long, status: Status) {
        state.update { list -> list.map { if (it.id == id) it.copy(status = status) else it } }
        onChange(state.value)
    }

    /** Replaces the entries with persisted ones (at start-up). */
    fun restore(entries: List<Entry>) {
        state.value = entries
    }

    fun clear() {
        state.value = emptyList()
    }

    companion object {
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
                    ),
                )
            },
        )

        /** Reads a persisted ledger; an unreadable one gives an empty list. */
        fun decode(text: String?): List<Entry> = runCatching {
            Json.parseToJsonElement(text ?: return emptyList()).jsonArray.map { element ->
                val o = element.jsonObject
                Entry(
                    id = o["id"]!!.jsonPrimitive.long,
                    channel = Channel.valueOf(o["channel"]!!.jsonPrimitive.content),
                    destination = o["destination"]!!.jsonPrimitive.content,
                    fields = o["fields"]!!.jsonArray.map { it.jsonPrimitive.content },
                    payload = (o["payload"] as? JsonPrimitive)?.takeIf { it.isString }?.content,
                    // An entry still "attempted" when the app stopped may have been sent.
                    status = Status.valueOf(o["status"]!!.jsonPrimitive.content).let { if (it == Status.ATTEMPTED) Status.FAILED else it },
                )
            }
        }.getOrDefault(emptyList())
    }
}
