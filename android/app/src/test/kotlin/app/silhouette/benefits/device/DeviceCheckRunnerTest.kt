package app.silhouette.benefits.device

import app.silhouette.benefits.TestContent
import app.silhouette.benefits.ai.DeviceReadingTask
import app.silhouette.benefits.ai.FakeModelPort
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.ModelPointerExtractor
import app.silhouette.benefits.ai.ModelSettings
import app.silhouette.benefits.ai.OnDeviceText
import app.silhouette.benefits.ai.PersonalRequest
import app.silhouette.benefits.ai.PersonalTasks
import app.silhouette.benefits.ai.PointerRequestBuilder
import app.silhouette.benefits.core.DeviceCheck
import app.silhouette.benefits.core.DevicePart
import app.silhouette.benefits.devicecheck.CheckDocuments
import app.silhouette.benefits.devicecheck.CheckEnvironment
import app.silhouette.benefits.devicecheck.DeviceCheckRunner
import app.silhouette.benefits.devicecheck.PhotoCase
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The on-device check with a fake device model: every case, the run file and its figures. */
class DeviceCheckRunnerTest {
    private val content = TestContent.california
    private val runSchema = Json.parseToJsonElement(File(TestContent.sharedDir, "schemas/device-check-run.v3.json").readText()) as JsonObject
    private val env = CheckEnvironment("Silhouette 0.1.0", "Android 16", "Silhouette/0.1.0 (Pixel 9; Android 16; firebase-ai 18.2.0)", null)

    private fun runner(device: FakeDevice, available: Boolean = true, cloud: FakeModelPort = FakeModelPort()): DeviceCheckRunner {
        val settings = object : ModelSettings {
            override val pointerPromptVersion: Int? = 5
            override val onDeviceLocales: Set<String> = setOf("en")
        }
        val extractor = ModelPointerExtractor(
            cloud, PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas), settings, reachable = { true },
            deviceReading = DeviceReadingTask(device, content.pointerPrompts, content.devicePartPrompts, content.pointerSchemas, available = { available }),
            deviceAvailable = { available },
        )
        val personal = PersonalTasks(object : OnDeviceText {
            override suspend fun generate(request: PersonalRequest) = "The rules on this phone show this result."
        }, content.prompts, content.outputChecks)
        val photo = object : PhotoCase {
            override fun unsupported() = "unsupported: the on-device model does not take images here"
            override suspend fun read() = error("not run")
        }
        return DeviceCheckRunner(
            content, CheckDocuments.load(content), { r, o -> extractor.extract(r, o) }, null, personal, photo,
            availability = { mapOf("onDeviceModel" to if (available) "available" else "unavailable") },
            now = { "2026-11-17T10:00:00.000Z" },
        )
    }

    private fun cases(file: JsonObject) = (file["cases"] as JsonArray).map { it as JsonObject }

    @Test
    fun `right readings everywhere give five extraction cases on the device with every income input right and no wrong value`() = runBlocking {
        val file = runner(FakeDevice()).run(1, env)
        assertEquals(emptyList<String>(), DeviceCheck.validate(runSchema, file))
        val all = cases(file)
        assertEquals(14, all.size)
        val summary = DeviceCheck.summarize(all, 3)
        assertEquals(5, (summary["extractionCases"] as JsonPrimitive).content.toInt())
        assertEquals(JsonObject(mapOf("allRight" to JsonPrimitive(5), "notFound" to JsonPrimitive(0), "wrong" to JsonPrimitive(0))), summary["income"])
        assertEquals(0, (summary["wrongReachedPerson"] as JsonPrimitive).content.toInt())
        val extraction = all.take(5)
        assertTrue(extraction.all { (it["ran"] as JsonPrimitive).content == "ON_DEVICE" })
        assertEquals(listOf("pointers: bundled sample", "pointers: evaluation paystub L01", "pointers: evaluation paystub L04", "pointers: evaluation paystub L07", "pointers: evaluation paystub L10"), extraction.map { (it["id"] as JsonPrimitive).content })
        // The person's own result ran on the device; this build has no cloud tasks; the photo cannot run here and says why.
        assertEquals("ON_DEVICE", (all[11]["ran"] as JsonPrimitive).content)
        assertTrue((all[13]["note"] as JsonPrimitive).content.startsWith("unsupported:"))
        assertEquals("device-check-2026-11-17T1000-silhouette0-android16.json", DeviceCheckRunner.fileName(file))
    }

    @Test
    fun `three repetitions run the extraction cases first, each recorded with its repetition`() = runBlocking {
        val file = runner(FakeDevice()).run(3, env)
        assertEquals(emptyList<String>(), DeviceCheck.validate(runSchema, file))
        val all = cases(file)
        assertEquals(15 + 9, all.size)
        assertEquals(listOf(1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3), all.take(15).map { (it["repetition"] as JsonPrimitive).content.toInt() })
        assertEquals(3, (file["repetitions"] as JsonPrimitive).content.toInt())
    }

    @Test
    fun `a reading that does not hold up is repeated in the cloud and recorded with the device's diagnosis`() = runBlocking {
        val cloud = FakeModelPort(*Array(5) { FakeModelPort.reply("{}", InferenceSource.IN_CLOUD) })
        val file = runner(FakeDevice(override = { part, _ -> if (part == DevicePart.CORE) "not json" else null }), cloud = cloud).run(1, env)
        assertEquals(emptyList<String>(), DeviceCheck.validate(runSchema, file))
        val sample = cases(file).first()
        assertEquals("IN_CLOUD", (sample["ran"] as JsonPrimitive).content)
        val final = sample["final"] as JsonObject
        assertEquals("true", (final["retried"] as JsonPrimitive).content)
        val device = sample["device"] as JsonObject
        assertEquals(listOf("not-json"), (device["problems"] as JsonArray).map { (it as JsonPrimitive).content })
        assertEquals(5, (DeviceCheck.summarize(cases(file), 3)["inCloudAfterDevice"] as JsonPrimitive).content.toInt())
    }

    @Test
    fun `with no device model every on-device case is stopped by the guard and the error says so`() = runBlocking {
        val cloud = FakeModelPort(*Array(5) { FakeModelPort.reply("{}", InferenceSource.IN_CLOUD) })
        val device = FakeDevice()
        val guarded = DeviceCheckRunner(
            content, CheckDocuments.load(content), { r, o ->
                ModelPointerExtractor(
                    cloud, PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas),
                    object : ModelSettings {
                        override val pointerPromptVersion: Int? = 5
                        override val onDeviceLocales: Set<String> = setOf("en")
                    },
                    reachable = { true }, deviceAvailable = { false },
                ).extract(r, o)
            },
            null,
            PersonalTasks(app.silhouette.benefits.ai.GuardedOnDeviceText(object : OnDeviceText {
                override suspend fun generate(request: PersonalRequest): String = error("must not be called")
            }) { false }, content.prompts, content.outputChecks),
            null, availability = { mapOf("onDeviceModel" to "unavailable") }, now = { "2026-11-17T10:00:00.000Z" },
        )
        val file = guarded.run(1, env)
        assertTrue(device.asked.isEmpty())
        val own = cases(file)[11]
        assertEquals("not-run", (own["ran"] as JsonPrimitive).content)
        assertTrue((own["error"] as JsonPrimitive).content, (own["error"] as JsonPrimitive).content.startsWith("guard: guard:model-not-available"))
        assertEquals(emptyList<String>(), DeviceCheck.validate(runSchema, file))
    }

    @Test
    fun `the bundled reference recording validates and is never a phone run`() {
        val dir = File(TestContent.sharedDir, CheckDocuments.RUNS_DIR)
        val files = dir.listFiles { f -> f.name.endsWith(".json") }!!
        assertTrue(files.isNotEmpty())
        for (f in files) {
            val run = Json.parseToJsonElement(f.readText()) as JsonObject
            assertEquals(emptyList<String>(), DeviceCheck.validate(runSchema, run))
            // A recording keeps its own client and platform, shown with it.
            assertTrue((run["browser"] as JsonPrimitive).content.isNotEmpty())
        }
    }
}
