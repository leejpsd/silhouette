package app.silhouette.benefits.config

import app.silhouette.benefits.ai.ModelSettings
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Remote Config values used by the app: every key in shared/routing.json `remoteConfigKeys`.
 * The in-app defaults are read from firebase/remoteconfig.template.json, which the build copies into
 * the app ([parseTemplate]). Values are read through [source]; before the first fetch, or offline,
 * the defaults apply.
 */
class RemoteSettings(val defaults: Map<String, String>, private val source: (String) -> String?) : ModelSettings {

    fun string(key: String): String = source(key)?.takeIf { it.isNotEmpty() } ?: defaults[key].orEmpty()

    override val pointerPromptVersion: Int? get() = string("prompt_pointer_extract_v").trim().toIntOrNull()

    override val onDeviceLocales: Set<String>
        get() = runCatching { (Json.parseToJsonElement(string("route_ondevice_locales_android")) as JsonArray).map { (it as JsonPrimitive).content }.toSet() }
            .getOrElse { emptySet() }

    companion object {
        /** The default value of every parameter of a Remote Config template, as strings. */
        fun parseTemplate(text: String): Map<String, String> {
            val parameters = (Json.parseToJsonElement(text) as JsonObject)["parameters"] as JsonObject
            return parameters.mapValues { (_, p) -> (((p as JsonObject)["defaultValue"] as JsonObject)["value"] as JsonPrimitive).content }
        }
    }
}
