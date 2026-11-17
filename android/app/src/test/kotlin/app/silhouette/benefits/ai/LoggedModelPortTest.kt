package app.silhouette.benefits.ai

import app.silhouette.benefits.TestContent
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.data.OutboundLog
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
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
    fun `a device-first call on a device with a model runs there only and makes no request`() = runBlocking {
        val log = OutboundLog()
        val inner = FakeModelPort(FakeModelPort.reply("{}", InferenceSource.ON_DEVICE))
        var gated = 0
        LoggedModelPort(inner, log, "m", gate = { gated++; true }, deviceAvailable = { true }).generate(call)
        assertTrue(inner.calls.single().deviceAttempt)
        assertEquals(0, gated)
        val entry = log.entries.value.single()
        assertEquals(OutboundLog.Status.KEPT_ON_DEVICE, entry.status)
        assertEquals("", entry.destination)
        assertNull(entry.payload)
        assertEquals(emptyList<OutboundLog.Entry>(), log.leftDevice)
    }

    @Test
    fun `a device failure is not repeated in the cloud by the port`() {
        val log = OutboundLog()
        val inner = FakeModelPort(FakeModelPort.fail(FailureKind.CLOUD, "IOException"))
        val failure = assertThrows(ModelFailure::class.java) { runBlocking { LoggedModelPort(inner, log, "m", deviceAvailable = { true }).generate(call) } }
        assertEquals(FailureKind.DEVICE_FAILED, failure.kind)
        assertEquals(1, inner.calls.size)
        assertTrue(log.entries.value.isEmpty())
    }

    @Test
    fun `no App Check token, no request`() {
        val log = OutboundLog()
        val inner = FakeModelPort(FakeModelPort.reply("{}", InferenceSource.IN_CLOUD))
        val port = LoggedModelPort(inner, log, "m", gate = { false })
        val failure = assertThrows(ModelFailure::class.java) { runBlocking { port.generate(call) } }
        assertEquals(LoggedModelPort.NO_APP_CHECK, failure.reason)
        assertTrue(inner.calls.isEmpty())
        val entry = log.entries.value.single()
        assertEquals(OutboundLog.Status.BLOCKED, entry.status)
        assertEquals(OutboundLog.NO_APP_CHECK, entry.failureReason)
        assertTrue(log.leftDevice.isEmpty())
    }

    @Test
    fun `a device-first call without a device model goes to the cloud through the gate`() = runBlocking {
        val log = OutboundLog()
        val inner = FakeModelPort(FakeModelPort.reply("{}", InferenceSource.IN_CLOUD))
        var gated = 0
        LoggedModelPort(inner, log, "m", gate = { gated++; true }, deviceAvailable = { false }).generate(call)
        assertEquals(1, gated)
        assertEquals(CallMode.ONLY_IN_CLOUD, inner.calls.single().mode)
        assertEquals(OutboundLog.Status.SENT, log.entries.value.single().status)
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
