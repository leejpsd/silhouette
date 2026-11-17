package app.silhouette.benefits.ai

import app.silhouette.benefits.TestContent
import app.silhouette.benefits.ai.FakeModelPort.Companion.POINTERS
import app.silhouette.benefits.ai.FakeModelPort.Companion.fail
import app.silhouette.benefits.ai.FakeModelPort.Companion.reply
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.skeletonize
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelPointerExtractorTest {
    private val content = TestContent.content
    private val builder = PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas)
    private val settings = object : ModelSettings {
        override val pointerPromptVersion: Int? = 3
        override val onDeviceLocales: Set<String> = setOf("en", "ko")
    }
    private val skeleton = skeletonize(Raw.of("Gross Pay 1,000.00\nNet Pay 900.00"), content.allowlist("en")).skeleton
    private val backoffs = mutableListOf<Int>()
    private var prepared = 0

    private fun extractor(port: ModelPort, available: Boolean = true) =
        ModelPointerExtractor(port, builder, settings, reachable = { true }, backoff = { backoffs += it }, beforeFirstRequest = { prepared++ }, deviceAvailable = { available })

    private fun request(language: String = "en") = PointerRequest(skeleton, DocType.PAYSTUB, language)

    @Test
    fun `an answer on the device is used as is`() = runTest {
        val port = FakeModelPort(reply(POINTERS, InferenceSource.ON_DEVICE))
        val result = extractor(port).extract(request())
        assertEquals(InferenceSource.ON_DEVICE, result.inferenceSource)
        assertEquals("document-silhouette-only", result.reason)
        assertEquals(listOf(CallMode.PREFER_ON_DEVICE), port.calls.map { it.mode })
        assertEquals(1, prepared)
    }

    @Test
    fun `without a device model a device-first document goes to the cloud, and says why`() = runTest {
        val port = FakeModelPort(reply(POINTERS, InferenceSource.IN_CLOUD))
        val result = extractor(port, available = false).extract(request())
        assertEquals(listOf(CallMode.ONLY_IN_CLOUD), port.calls.map { it.mode })
        assertEquals(InferenceSource.IN_CLOUD, result.inferenceSource)
        assertEquals("document-silhouette-only", result.reason)
        assertTrue(result.noDeviceModel)
    }

    @Test
    fun `keeping everything on the device without a device model sends nothing`() = runTest {
        val port = FakeModelPort()
        assertThrows(DeviceReadingUnavailable::class.java) {
            kotlinx.coroutines.runBlocking { extractor(port, available = false).extract(request(), ExtractOptions(deviceOnly = true)) }
        }
        assertTrue(port.calls.isEmpty())
    }

    @Test
    fun `an on-device failure is retried once in the cloud with reason on-device-failed`() = runTest {
        val port = FakeModelPort(fail(FailureKind.DEVICE_FAILED), reply(POINTERS, InferenceSource.IN_CLOUD))
        val result = extractor(port).extract(request())
        assertEquals(listOf(CallMode.PREFER_ON_DEVICE, CallMode.ONLY_IN_CLOUD), port.calls.map { it.mode })
        assertEquals(InferenceSource.IN_CLOUD, result.inferenceSource)
        assertEquals("on-device-failed", result.reason)
        // The retry sends the same silhouette, nothing more: the prompt alone, without the device's schema line.
        assertEquals(port.calls[0].payload, port.calls[1].payload)
        assertTrue(port.calls[0].user.text.startsWith(port.calls[1].user.text))
    }

    @Test
    fun `an unusable answer from the device counts as an on-device failure`() = runTest {
        val port = FakeModelPort(reply("not json", InferenceSource.ON_DEVICE), reply(POINTERS, InferenceSource.IN_CLOUD))
        assertEquals("on-device-failed", extractor(port).extract(request()).reason)
    }

    @Test
    fun `busy and over-quota device models are retried after a delay before giving up`() = runTest {
        val port = FakeModelPort(fail(FailureKind.DEVICE_BUSY), fail(FailureKind.DEVICE_QUOTA), reply(POINTERS, InferenceSource.ON_DEVICE))
        val result = extractor(port).extract(request())
        assertEquals(InferenceSource.ON_DEVICE, result.inferenceSource)
        assertEquals(listOf(0, 1), backoffs)

        backoffs.clear()
        val busy = FakeModelPort(
            fail(FailureKind.DEVICE_BUSY), fail(FailureKind.DEVICE_BUSY), fail(FailureKind.DEVICE_BUSY), reply(POINTERS, InferenceSource.IN_CLOUD),
        )
        assertEquals("on-device-failed", extractor(busy).extract(request()).reason)
        assertEquals(ModelPointerExtractor.MAX_DEVICE_RETRIES, backoffs.size)
        assertEquals(CallMode.ONLY_IN_CLOUD, busy.calls.last().mode)
    }

    @Test
    fun `a cloud failure is not retried`() = runTest {
        val port = FakeModelPort(fail(FailureKind.CLOUD, "ServerException"))
        assertThrows(ModelFailure::class.java) { kotlinx.coroutines.runBlocking { extractor(port).extract(request()) } }
        assertEquals(1, port.calls.size)
        val bad = FakeModelPort(reply("[]", InferenceSource.IN_CLOUD))
        assertThrows(ModelFailure::class.java) { kotlinx.coroutines.runBlocking { extractor(bad).extract(request()) } }
        assertEquals(1, bad.calls.size)
    }

    @Test
    fun `a language the device model is not validated for goes to the cloud directly`() = runTest {
        val port = FakeModelPort(reply(POINTERS, InferenceSource.IN_CLOUD))
        val result = extractor(port).extract(request("es"))
        assertEquals(listOf(CallMode.ONLY_IN_CLOUD), port.calls.map { it.mode })
        assertEquals("document-silhouette-only", result.reason)
        assertTrue(!result.noDeviceModel)
        assertTrue(extractor(port).prefersDevice("ko"))
    }
}
