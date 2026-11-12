package app.silhouette.benefits.config

import app.silhouette.benefits.TestContent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class RemoteSettingsTest {
    private val routing = Json.parseToJsonElement(File(TestContent.sharedDir, "routing.json").readText()) as JsonObject
    private val defaults = RemoteSettings.parseTemplate(File(TestContent.sharedDir.parentFile, "firebase/remoteconfig.template.json").readText())

    @Test
    fun `the template the app reads its defaults from covers every Remote Config key of routing json`() {
        val keys = (routing["remoteConfigKeys"] as JsonArray).map { (it as JsonPrimitive).content }
        assertEquals(keys.toSet(), defaults.keys)
        // The default prompt version is one the app bundles (otherwise the newest bundled one is used).
        assertTrue(defaults.getValue("prompt_pointer_extract_v").toInt() in app.silhouette.benefits.ai.PointerPrompts.BUNDLED)
    }

    @Test
    fun `values come from Remote Config, falling back to the template defaults`() {
        val empty = RemoteSettings(defaults) { null }
        assertEquals(defaults.getValue("prompt_pointer_extract_v").toInt(), empty.pointerPromptVersion)
        assertEquals(
            (Json.parseToJsonElement(defaults.getValue("route_ondevice_locales_android")) as JsonArray).map { (it as JsonPrimitive).content }.toSet(),
            empty.onDeviceLocales,
        )
        val remote = RemoteSettings(defaults) { key -> mapOf("prompt_pointer_extract_v" to "2", "route_ondevice_locales_android" to "[\"en\"]")[key] }
        assertEquals(2, remote.pointerPromptVersion)
        assertEquals(setOf("en"), remote.onDeviceLocales)
        // A malformed remote value never widens the on-device languages.
        assertEquals(emptySet<String>(), RemoteSettings(defaults) { key -> if (key == "route_ondevice_locales_android") "not json" else null }.onDeviceLocales)
    }
}
