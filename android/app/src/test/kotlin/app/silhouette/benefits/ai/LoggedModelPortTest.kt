package app.silhouette.benefits.ai

import app.silhouette.benefits.TestContent
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.data.OutboundLog
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class LoggedModelPortTest {
    private val content = TestContent.content
    private val builder = PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas)
    private val skeleton = skeletonize(Raw.of("Gross Pay 1,000.00"), content.allowlist("en")).skeleton
    private val call = builder.build(PointerRequest(skeleton, DocType.PAYSTUB, "en"), CallMode.PREFER_ON_DEVICE, 3)

    @Test
    fun `every request is recorded before it is made, then with what happened`() = runBlocking {
        val log = OutboundLog()
        var statusDuringCall: OutboundLog.Status? = null
        val port = LoggedModelPort(object : ModelPort {
            override suspend fun generate(call: ModelCall): ModelReply {
                statusDuringCall = log.entries.value.single().status
                return ModelReply("{}", InferenceSource.IN_CLOUD, "m")
            }
        }, log, "gemini-test")
        port.generate(call)
        assertEquals(OutboundLog.Status.ATTEMPTED, statusDuringCall)
        val entry = log.entries.value.single()
        assertEquals(OutboundLog.Status.SENT, entry.status)
        assertEquals("OK", entry.responseStatus)
        assertEquals(skeleton.text, entry.payload)
        assertEquals("gemini-test", entry.model)
        assertEquals("/…/models/gemini-test:generateContent", entry.path)
        assertEquals(listOf("document-silhouette"), entry.fields)
    }

    @Test
    fun `an answer from the device is recorded as answered on this device`() = runBlocking {
        val log = OutboundLog()
        LoggedModelPort(FakeModelPort(FakeModelPort.reply("{}", InferenceSource.ON_DEVICE)), log, "m").generate(call)
        assertEquals(OutboundLog.Status.KEPT_ON_DEVICE, log.entries.value.single().status)
        assertEquals(emptyList<OutboundLog.Entry>(), log.leftDevice)
    }

    @Test
    fun `a failed request is recorded with its reason`() {
        val log = OutboundLog()
        val port = LoggedModelPort(FakeModelPort(FakeModelPort.fail(FailureKind.CLOUD, "ServerException")), log, "m")
        assertThrows(ModelFailure::class.java) { runBlocking { port.generate(call) } }
        val entry = log.entries.value.single()
        assertEquals(OutboundLog.Status.FAILED, entry.status)
        assertEquals("ServerException", entry.failureReason)
        assertNull(entry.responseStatus)
    }
}
