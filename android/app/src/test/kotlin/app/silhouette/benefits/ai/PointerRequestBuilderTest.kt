package app.silhouette.benefits.ai

import app.silhouette.benefits.TestContent
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.skeletonize
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class PointerRequestBuilderTest {
    private val content = TestContent.content
    private val builder = PointerRequestBuilder(content.pointerPrompts, content.pointerSchemas)
    private val skeleton = skeletonize(Raw.of("Gross Pay 1,000.00\nEmployee Lucia Lindqvist"), content.allowlist("en")).skeleton

    @Test
    fun `the prompt version comes from Remote Config, unknown versions get the newest bundled`() {
        val v3 = builder.build(PointerRequest(skeleton, DocType.PAYSTUB, "en"), CallMode.PREFER_ON_DEVICE, 3)
        val v2 = builder.build(PointerRequest(skeleton, DocType.PAYSTUB, "en"), CallMode.PREFER_ON_DEVICE, 2)
        val unknown = builder.build(PointerRequest(skeleton, DocType.PAYSTUB, "en"), CallMode.PREFER_ON_DEVICE, 99)
        val unset = builder.build(PointerRequest(skeleton, DocType.PAYSTUB, "en"), CallMode.PREFER_ON_DEVICE, null)
        assertTrue(v3.system.text.contains("Gross pay is the total of all earnings"))
        assertFalse(v2.system.text.contains("Gross pay is the total of all earnings"))
        val newest = builder.build(PointerRequest(skeleton, DocType.PAYSTUB, "en"), CallMode.PREFER_ON_DEVICE, PointerPrompts.BUNDLED.max())
        assertEquals(newest.system, unknown.system)
        assertEquals(newest.system, unset.system)
        assertTrue(v3.user.text.startsWith("Document type: paystub\nDocument:\n${skeleton.text}"))
    }

    @Test
    fun `the cloud schema is the derived model schema, every field required and nullable`() {
        val call = builder.build(PointerRequest(skeleton, DocType.PAYSTUB, "en"), CallMode.ONLY_IN_CLOUD, 3)
        val schema = call.schema as SchemaNode.Obj
        val pointer = content.pointerSchemas.getValue("pointer.paystub.json")
        val fields = (pointer["properties"] as JsonObject).keys.toList()
        assertEquals(fields, schema.properties.keys.toList())
        assertEquals(fields, schema.required)
        assertTrue(schema.properties.values.all { it.nullable })
        val date = schema.properties.getValue("payDate") as SchemaNode.AnyOf
        assertTrue(date.options.all { it.nullable })
        val frequency = schema.properties.getValue("payFrequency") as SchemaNode.Enum
        assertEquals(listOf("weekly", "biweekly", "semimonthly", "monthly"), frequency.values)
        val deductions = schema.properties.getValue("deductions") as SchemaNode.Arr
        assertEquals(listOf("amount"), (deductions.items as SchemaNode.Obj).required)
        // The on-device model gets the same schema as text (JSON Schema dialect).
        val text = call.user.text.substringAfter("JSON schema of the answer:\n")
        assertEquals(JsonArray(fields.map { JsonPrimitive(it) }), (Json.parseToJsonElement(text) as JsonObject)["required"])
    }

    /** No canary string from shared/fixtures/canary/ appears anywhere in a request the app would send. */
    @Test
    fun `canary strings never appear in a request body`() {
        val dir = File(TestContent.sharedDir, "fixtures/canary")
        val fixtures = dir.listFiles { f -> f.name.endsWith(".json") }!!
        assertTrue(fixtures.isNotEmpty())
        for (file in fixtures) {
            val canary = Json.parseToJsonElement(file.readText()) as JsonObject
            val values = (canary["canaries"] as JsonArray).map { (it as JsonPrimitive).content }
            val text = File(dir, (canary["document"] as JsonPrimitive).content).readText()
            val language = (canary["locale"] as JsonPrimitive).content
            val documentSkeleton = skeletonize(Raw.of(text), content.allowlist(language)).skeleton
            for (mode in listOf(CallMode.PREFER_ON_DEVICE, CallMode.ONLY_IN_CLOUD)) {
                val call = builder.build(PointerRequest(documentSkeleton, DocType.PAYSTUB, language), mode, 3)
                val body = listOf(call.system.text, call.user.text, CloudText.of(call.payload).text, call.schema.toString(), call.task)
                for (value in values) for (part in body) assertFalse("leaked: $value", part.contains(value))
            }
        }
    }
}
