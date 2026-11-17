package app.silhouette.benefits.device

import app.silhouette.benefits.TestContent
import app.silhouette.benefits.ai.CallMode
import app.silhouette.benefits.ai.DeviceReadingTask
import app.silhouette.benefits.ai.DocType
import app.silhouette.benefits.ai.ExtractOptions
import app.silhouette.benefits.ai.FakeModelPort
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.ModelPointerExtractor
import app.silhouette.benefits.ai.ModelSettings
import app.silhouette.benefits.ai.OnDeviceUnreliable
import app.silhouette.benefits.ai.PointerRequest
import app.silhouette.benefits.ai.PointerRequestBuilder
import app.silhouette.benefits.ai.ReadingStage
import app.silhouette.benefits.core.DeviceOutcome
import app.silhouette.benefits.core.DevicePart
import app.silhouette.benefits.core.skeletonize
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** The reading in parts on the device (shared/validation/DEVICE_READING.md), with a fake device model. */
class DeviceReadingTaskTest {
    private val content = TestContent.california
    private val sample = content.samples.first { it.id == "paystub-en-01" }
    private val document = skeletonize(sample.text, content.allowlist("en"))
    private val request = PointerRequest(document.skeleton, DocType.PAYSTUB, "en")

    private fun settings(version: Int) = object : ModelSettings {
        override val pointerPromptVersion: Int? = version
        override val onDeviceLocales: Set<String> = setOf("en")
    }

    private fun task(device: FakeDevice, available: () -> Boolean = { true }) =
        DeviceReadingTask(device, content.pointerPrompts, content.devicePartPrompts, content.pointerSchemas, available)

    private fun extractor(device: FakeDevice, port: FakeModelPort, kept: MutableList<List<String>> = mutableListOf(), version: Int = 5, available: Boolean = true) =
        ModelPointerExtractor(
            port, PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas), settings(version), reachable = { true },
            deviceReading = task(device) { available }, deviceAvailable = { available }, onAnsweredOnDevice = { kept += it },
        )

    @Test
    fun `a right reading is answered on the device in parts and nothing is sent`() = runBlocking {
        val device = FakeDevice()
        val port = FakeModelPort()
        val kept = mutableListOf<List<String>>()
        val stages = mutableListOf<ReadingStage>()
        val result = extractor(device, port, kept).extract(request, ExtractOptions(document = document, onStage = { stages += it }))
        assertEquals(InferenceSource.ON_DEVICE, result.inferenceSource)
        assertEquals("document-silhouette-only", result.reason)
        assertEquals(listOf(DevicePart.CORE, DevicePart.DEDUCTIONS), device.asked)
        assertTrue(port.calls.isEmpty())
        assertEquals(listOf(listOf("document-silhouette")), kept)
        assertEquals(emptyList<String>(), result.notRead)
        assertEquals(listOf(ReadingStage.DEVICE_READING, ReadingStage.CHECKING, ReadingStage.DEVICE_DEDUCTIONS, ReadingStage.CHECKING), stages)
    }

    @Test
    fun `each part's request is v5 plus the part text, with the strict constraint written after the schema line`() {
        val (system, user) = task(FakeDevice()).requestFor(request, DevicePart.CORE)
        val prompt = content.pointerPrompts.forVersion(5)
        assertEquals("${prompt.system}\n\n${content.devicePartPrompts.core}", system.text)
        assertTrue(user.text.contains("\n\n${DeviceReadingTask.SCHEMA_LINE}\n{\"type\":\"object\""))
        assertTrue(user.text.contains("\"additionalProperties\":false"))
        val (againSystem, _) = task(FakeDevice()).requestFor(request, DevicePart.DEDUCTIONS_AGAIN)
        assertTrue(againSystem.text.endsWith("Your previous list did not add up: net pay was not gross pay minus the deductions you listed. List every deduction or tax line between gross pay and net pay, including the last one."))
    }

    @Test
    fun `a core that does not hold up is repeated once in the cloud after Send, with v5 alone`() = runBlocking {
        // Net pay above gross pay, in a core that has no other problem the gross part could repair.
        val device = FakeDevice(override = { part, _ -> if (part == DevicePart.CORE) "{\"grossPay\":\"N14\",\"netPay\":\"N22\"}" else null })
        val port = FakeModelPort(FakeModelPort.reply(FakeModelPort.POINTERS, InferenceSource.IN_CLOUD))
        val stages = mutableListOf<ReadingStage>()
        val result = extractor(device, port).extract(request, ExtractOptions(document = document, onStage = { stages += it }))
        assertEquals(InferenceSource.IN_CLOUD, result.inferenceSource)
        assertEquals("on-device-failed", result.reason)
        assertEquals(CallMode.ONLY_IN_CLOUD, port.calls.single().mode)
        assertFalse(port.calls.single().user.text.contains(DeviceReadingTask.SCHEMA_LINE))
        assertTrue(result.deviceAttempt!!.outcome is DeviceOutcome.Failed)
        assertEquals(ReadingStage.SENDING_AFTER_DEVICE, stages.last())
    }

    @Test
    fun `keeping everything on the device, a failed reading sends nothing and fills nothing in`() {
        val device = FakeDevice(override = { _, _ -> "not json" })
        val port = FakeModelPort()
        val e = assertThrows(OnDeviceUnreliable::class.java) {
            runBlocking { extractor(device, port).extract(request, ExtractOptions(deviceOnly = true, document = document)) }
        }
        assertTrue(port.calls.isEmpty())
        assertEquals(listOf("not-json"), (e.attempt!!.outcome as DeviceOutcome.Failed).problems)
    }

    @Test
    fun `a gross pay answered from an earnings line is asked again in the gross part and repaired`() = runBlocking {
        val device = FakeDevice(override = { part, _ -> if (part == DevicePart.CORE) "{\"grossPay\":\"N6\"}" else null })
        val result = extractor(device, FakeModelPort()).extract(request, ExtractOptions(document = document))
        assertEquals(listOf(DevicePart.CORE, DevicePart.GROSS, DevicePart.DEDUCTIONS), device.asked)
        assertEquals(InferenceSource.ON_DEVICE, result.inferenceSource)
    }

    @Test
    fun `deductions that do not add up are asked again, then left out and marked not read`() = runBlocking {
        val short = "{\"deductions\":[{\"amount\":\"N14\",\"kind\":\"federal_tax\"}]}"
        val device = FakeDevice(override = { part, _ -> if (part == DevicePart.DEDUCTIONS || part == DevicePart.DEDUCTIONS_AGAIN) short else null })
        val result = extractor(device, FakeModelPort()).extract(request, ExtractOptions(document = document))
        assertEquals(listOf(DevicePart.CORE, DevicePart.DEDUCTIONS, DevicePart.DEDUCTIONS_AGAIN), device.asked)
        assertEquals(InferenceSource.ON_DEVICE, result.inferenceSource)
        assertTrue(result.deductionsNotRead)
        assertFalse(result.pointers.containsKey("deductions"))
    }

    @Test
    fun `the guard stops every part before any SDK call when the device model is not available`() = runBlocking {
        val device = FakeDevice()
        val answer = task(device) { false }.ask(request, DevicePart.CORE)
        assertTrue(device.asked.isEmpty())
        assertEquals(DeviceReadingTask.GUARD_NOT_AVAILABLE, (answer as app.silhouette.benefits.core.DeviceAnswer.NoAnswer).problem)
        // The extractor never starts a device reading without a ready model.
        val port = FakeModelPort(FakeModelPort.reply(FakeModelPort.POINTERS, InferenceSource.IN_CLOUD))
        extractor(device, port, available = false).extract(request, ExtractOptions(document = document))
        assertTrue(device.asked.isEmpty())
    }

    @Test
    fun `a part that ends without an answer records where it stopped, the error type and its message`() = runBlocking {
        val device = FakeDevice(fail = { IllegalStateException("The input is too large") })
        val answer = task(device).ask(request, DevicePart.CORE) as app.silhouette.benefits.core.DeviceAnswer.NoAnswer
        assertTrue(answer.problem, answer.problem.startsWith("sdk:"))
        assertTrue(answer.problem.contains("IllegalStateException"))
        assertTrue(answer.problem.contains("The input is too large"))
    }

    @Test
    fun `with prompt version 4 the device is asked once, as before`() = runBlocking {
        val port = FakeModelPort(FakeModelPort.reply(FakeModelPort.POINTERS, InferenceSource.ON_DEVICE))
        val device = FakeDevice()
        extractor(device, port, version = 4).extract(request, ExtractOptions(document = document))
        assertTrue(device.asked.isEmpty())
        assertEquals(CallMode.PREFER_ON_DEVICE, port.calls.single().mode)
    }
}
