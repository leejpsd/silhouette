package app.silhouette.benefits.device

import app.silhouette.benefits.TestContent
import app.silhouette.benefits.ai.CloudText
import app.silhouette.benefits.ai.DevicePartPrompts
import app.silhouette.benefits.ai.DeviceText
import app.silhouette.benefits.core.DevicePart
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.File

/**
 * A fake device model for the on-device reading: it answers each part of a check document with the
 * right answer of shared/fixtures/device-check/answers.json, found by the document's needle line.
 * [override] replaces the answer of a part (for wrong or broken readings); [fail] makes it throw.
 */
class FakeDevice(
    private val parts: DevicePartPrompts = TestContent.california.devicePartPrompts,
    private val override: (DevicePart, String) -> String? = { _, _ -> null },
    private val fail: (DevicePart) -> Throwable? = { null },
) : DeviceText {
    val asked = mutableListOf<DevicePart>()
    val requests = mutableListOf<Pair<CloudText, CloudText>>()

    override suspend fun generate(system: CloudText, user: CloudText): String {
        val part = DevicePart.entries.filter { it != DevicePart.WHOLE }.lastOrNull { system.text.endsWith(parts.forPart(it)) } ?: error("not a part request")
        asked += part
        requests += system to user
        fail(part)?.let { throw it }
        val doc = documents.firstOrNull { user.text.contains(it.needle) } ?: error("unknown document")
        override(part, doc.id)?.let { return it }
        return when (part) {
            DevicePart.CORE -> doc.core.toString()
            DevicePart.GROSS -> JsonObject(doc.core.filterKeys { it == "grossPay" || it == "ytdGross" }).toString()
            else -> doc.deductions.toString()
        }
    }

    class Document(val id: String, val needle: String, val core: JsonObject, val deductions: JsonObject)

    companion object {
        val documents: List<Document> by lazy {
            val root = Json.parseToJsonElement(File(TestContent.sharedDir, "fixtures/device-check/answers.json").readText()) as JsonObject
            (root["documents"] as JsonArray).map {
                val o = it as JsonObject
                Document((o["id"] as JsonPrimitive).content, (o["needle"] as JsonPrimitive).content, o["core"] as JsonObject, o["deductions"] as JsonObject)
            }
        }
    }
}
