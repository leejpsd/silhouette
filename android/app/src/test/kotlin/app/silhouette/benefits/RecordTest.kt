package app.silhouette.benefits

import app.silhouette.benefits.ai.CallMode
import app.silhouette.benefits.ai.CloudText
import app.silhouette.benefits.ai.FakeModelPort
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.ModelCall
import app.silhouette.benefits.ai.PreparedModelPort
import app.silhouette.benefits.core.Public
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.ui.countLine
import app.silhouette.benefits.ui.statusLine
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The record of what leaves the device (shared/RECORD.md). */
class RecordTest {
    private val en = TestContent.california.strings(AppLanguage.EN)

    private fun sent(log: OutboundLog, vararg fields: String) =
        log.finish(log.begin(OutboundLog.Channel.AI_CLOUD, "host.test", fields.toList(), null), OutboundLog.Status.SENT, "OK")

    @Test
    fun `the count is what left, and kept or stopped requests are not counted as sent`() {
        val log = OutboundLog()
        log.recordAnswered(listOf("document-silhouette"))
        log.recordBlocked(OutboundLog.Channel.AI_CLOUD, "host.test", listOf("document-silhouette"), OutboundLog.NO_APP_CHECK)
        assertTrue(log.leftDevice.isEmpty())
        assertEquals("Nothing has left this device.", countLine(en, log.entries.value, null))
        val kept = log.entries.value.first()
        assertEquals("", kept.destination)
        assertEquals(null, kept.payload)
        assertEquals(en("outbound.status.answeredShort"), statusLine(en, kept))
        assertEquals(en("outbound.status.noAppCheck"), statusLine(en, log.entries.value[1]))
    }

    @Test
    fun `the line under the count splits what carried something of the person's from the rest`() {
        val log = OutboundLog()
        sent(log, "app-check-token-request")
        assertEquals(listOf("leaving.split.nothingOfYours" to 0, "leaving.split.technical" to 1), OutboundLog.split(log.entries.value))
        sent(log, "document-silhouette")
        assertEquals(listOf("leaving.split.document" to 1, "leaving.split.technical" to 1), OutboundLog.split(log.entries.value))
        sent(log, "program-facts")
        sent(log, "profile-silhouette")
        assertEquals(listOf("leaving.split.personal" to 2, "leaving.split.general" to 2), OutboundLog.split(log.entries.value))
        assertEquals(4, log.leftDevice.size)
    }

    @Test
    fun `a request that did not complete never reads as sent, and a stopped one never becomes failed`() {
        val log = OutboundLog()
        log.finish(log.begin(OutboundLog.Channel.AI_CLOUD, "host.test", listOf("document-silhouette"), null), OutboundLog.Status.FAILED, failureReason = "IOException")
        assertTrue(statusLine(en, log.entries.value.single()).startsWith("Not completed"))
        log.recordBlocked(OutboundLog.Channel.AI_CLOUD, "host.test", listOf("document-silhouette"), OutboundLog.NOT_EXPECTED)
        val stopped = log.entries.value.last()
        log.finish(stopped.id, OutboundLog.Status.FAILED, failureReason = "late")
        assertEquals(OutboundLog.Status.BLOCKED, log.entries.value.last().status)
    }

    @Test
    fun `the record survives a restart with the date it was deleted`() {
        val log = OutboundLog()
        sent(log, "document-silhouette")
        log.clear(clearedAt = 1_700_000_000_000)
        val copy = OutboundLog()
        copy.restoreState(log.encodeState().toString())
        assertEquals(1_700_000_000_000, copy.clearedAt.value)
        assertTrue(copy.entries.value.isEmpty())
        // An older record stored as a plain list still opens.
        val old = OutboundLog()
        sent(old, "document-silhouette")
        val restored = OutboundLog()
        restored.restoreState(OutboundLog.encode(old.entries.value).toString())
        assertEquals(1, restored.entries.value.size)
    }

    @Test
    fun `Remote Config is fetched only after the first request that went to the cloud`() = runBlocking {
        var fetched = 0
        val call = ModelCall("t", CallMode.PREFER_ON_DEVICE, CloudText.of(Public.of("s")), CloudText.of(Public.of("u")), Public.of("p"), null, 10, listOf("program-facts"))
        val port = PreparedModelPort(
            FakeModelPort(FakeModelPort.reply("a", InferenceSource.ON_DEVICE), FakeModelPort.reply("b", InferenceSource.IN_CLOUD), FakeModelPort.reply("c", InferenceSource.IN_CLOUD)),
        ) { fetched++ }
        port.generate(call)
        assertEquals(0, fetched)
        port.generate(call)
        port.generate(call)
        assertEquals(1, fetched)
    }
}
