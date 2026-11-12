package app.silhouette.benefits

import app.silhouette.benefits.ai.RoutingReason
import app.silhouette.benefits.i18n.AppLanguage
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class RoutingReasonTest {
    private val routing = Json.parseToJsonElement(File(TestContent.sharedDir, "routing.json").readText()) as JsonObject

    /** Every reason in shared/routing.json, including the on-device failure retry, is known to the app. */
    @Test
    fun `every routing reason is known and has copy in every language`() {
        val tasks = (routing["tasks"] as JsonObject).values.mapNotNull { ((it as JsonObject)["reason"] as? JsonPrimitive)?.content }
        val failure = ((routing["onDeviceFailure"] as JsonObject)["reason"] as JsonPrimitive).content
        assertEquals("on-device-failed", failure)
        val shared = (tasks + failure).toSet()
        assertEquals(emptySet<String>(), shared - RoutingReason.entries.map { it.key }.toSet())
        for (language in AppLanguage.entries) {
            val strings = TestContent.content.strings(language)
            for (reason in RoutingReason.entries) assertTrue("${language.tag}: reason.${reason.key}", strings.has("reason.${reason.key}"))
        }
        assertEquals(RoutingReason.ON_DEVICE_FAILED, RoutingReason.fromKey("on-device-failed"))
    }
}
