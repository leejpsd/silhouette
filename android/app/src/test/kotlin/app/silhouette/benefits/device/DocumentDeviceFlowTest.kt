package app.silhouette.benefits.device

import app.silhouette.benefits.TestContent
import app.silhouette.benefits.ai.DeviceModel
import app.silhouette.benefits.ai.DeviceModelState
import app.silhouette.benefits.ai.DeviceReadingTask
import app.silhouette.benefits.ai.FakeModelPort
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.LoggedModelPort
import app.silhouette.benefits.ai.ModelPointerExtractor
import app.silhouette.benefits.ai.ModelSettings
import app.silhouette.benefits.ai.PointerExtraction
import app.silhouette.benefits.ai.PointerRequestBuilder
import app.silhouette.benefits.core.DevicePart
import app.silhouette.benefits.data.AnswerRepository
import app.silhouette.benefits.data.LanguageStore
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.Route
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What the person sees for each outcome of the on-device reading, and that device-only work makes
 * no request (shared/RECORD.md section 1): the fake cloud port and App Check are never reached.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DocumentDeviceFlowTest {
    private val content = TestContent.california

    private class Memory : AnswerRepository {
        override fun load(): JsonElement? = null
        override fun save(answers: JsonObject) = Unit
        override fun deleteAll() = Unit
    }

    private object English : LanguageStore {
        override fun current() = AppLanguage.EN
        override fun set(language: AppLanguage) = Unit
        override fun clear() = Unit
    }

    private class Device(state: DeviceModelState) : DeviceModel {
        override val state: StateFlow<DeviceModelState> = MutableStateFlow(state)
        override suspend fun refresh() = Unit
        override suspend fun download() = Unit
    }

    private val dispatcher = StandardTestDispatcher()
    private val scope = TestScope(dispatcher)
    private val log = OutboundLog()
    private var gated = 0
    private val cloud = FakeModelPort(FakeModelPort.reply(FakeModelPort.POINTERS, InferenceSource.IN_CLOUD))

    private fun app(device: FakeDevice, available: Boolean = true): AppController {
        val settings = object : ModelSettings {
            override val pointerPromptVersion: Int? = 5
            override val onDeviceLocales: Set<String> = setOf("en")
        }
        val port = LoggedModelPort(cloud, log, "m", gate = { gated++; true }, deviceAvailable = { available })
        val extractor = ModelPointerExtractor(
            port, PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas), settings, reachable = { true },
            deviceReading = DeviceReadingTask(device, content.pointerPrompts, content.devicePartPrompts, content.pointerSchemas, available = { available }),
            deviceAvailable = { available }, onAnsweredOnDevice = { log.recordAnswered(it) },
        )
        return AppController(
            content, Memory(), English, log, scope, dispatcher, PointerExtraction(listOf(extractor)),
            deviceModel = Device(if (available) DeviceModelState.Available else DeviceModelState.Unavailable),
        ).also {
            it.load()
            scope.advanceUntilIdle()
            it.acceptSample(content.samples.first { s -> s.id == "paystub-en-01" })
        }
    }

    @Test
    fun `keeping everything here reads on the device, with values for review, nothing sent and one kept entry`() {
        val app = app(FakeDevice())
        app.keepOnDevice()
        scope.advanceUntilIdle()
        assertEquals(Route.Review, app.route)
        assertEquals(InferenceSource.ON_DEVICE, app.document.extraction!!.source)
        assertTrue(cloud.calls.isEmpty())
        assertEquals(0, gated)
        assertEquals(OutboundLog.Status.KEPT_ON_DEVICE, log.entries.value.single().status)
        assertTrue(log.leftDevice.isEmpty())
    }

    @Test
    fun `deductions that do not hold up are left out as not read`() {
        val short = "{\"deductions\":[{\"amount\":\"N14\",\"kind\":\"federal_tax\"}]}"
        val app = app(FakeDevice(override = { part, _ -> if (part == DevicePart.DEDUCTIONS || part == DevicePart.DEDUCTIONS_AGAIN) short else null }))
        app.keepOnDevice()
        scope.advanceUntilIdle()
        assertTrue(app.review.deductionsNotRead)
        assertTrue(app.review.deductions.isEmpty())
    }

    @Test
    fun `an unreliable reading kept on the device fills nothing in and sends nothing`() {
        val app = app(FakeDevice(override = { _, _ -> "not json" }))
        app.keepOnDevice()
        scope.advanceUntilIdle()
        assertEquals(Route.Preview, app.route)
        assertEquals("error.on-device-unreliable", app.document.error)
        assertTrue(cloud.calls.isEmpty())
        assertEquals(0, gated)
        assertTrue(log.entries.value.isEmpty())
        // "Send the silhouette": now the cloud reads it once, after App Check.
        app.send()
        scope.advanceUntilIdle()
        assertEquals(1, cloud.calls.size)
        assertEquals(1, gated)
        assertEquals("on-device-failed", app.document.extraction!!.reason)
    }

    @Test
    fun `without a device model, keeping everything here means typing the numbers`() {
        val device = FakeDevice()
        val app = app(device, available = false)
        app.keepOnDevice()
        scope.advanceUntilIdle()
        assertEquals(Route.Review, app.route)
        assertTrue(app.review.manual)
        assertTrue(device.asked.isEmpty())
        assertTrue(cloud.calls.isEmpty())
        assertTrue(log.entries.value.isEmpty())
    }
}
