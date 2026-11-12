package app.silhouette.benefits.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Ledger of everything that has left the device, shown in the "Leaving your device" bar.
 *
 * Every outbound call must go through one gateway that records here before it sends; the bar reads
 * only this log, so it cannot claim less than was sent. This build has no network permission and
 * no outbound calls, so the log stays empty.
 */
class OutboundLog {
    /** One outbound request. Never holds user values: [fields] names kinds of content, [payload] is CloudSafe text. */
    data class Entry(
        val channel: Channel,
        val atMillis: Long,
        val destination: String,
        val fields: List<String>,
        val payload: String? = null,
    )

    enum class Channel { AI_CLOUD, APP_CHECK, FIRESTORE, REMOTE_CONFIG, OTHER }

    private val state = MutableStateFlow<List<Entry>>(emptyList())

    val entries: StateFlow<List<Entry>> = state.asStateFlow()

    fun record(entry: Entry) = state.update { it + entry }

    fun clear() {
        state.value = emptyList()
    }
}
