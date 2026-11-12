package app.silhouette.benefits.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * UI strings from `shared/copy/{locale}.json`. `en` is complete; other locales fall back to `en`
 * for missing keys (shared/README.md). A key missing everywhere is returned as is, so a gap is
 * visible instead of crashing.
 */
public class CopyStrings private constructor(
    private val strings: Map<String, String>,
    private val fallback: Map<String, String>,
) {
    public operator fun get(key: String): String = strings[key] ?: fallback[key] ?: key

    public companion object {
        /** [localeJson] may be null when the app locale has no copy file. */
        public fun parse(englishJson: String, localeJson: String?): CopyStrings =
            CopyStrings(localeJson?.let(::read) ?: emptyMap(), read(englishJson))

        private fun read(text: String): Map<String, String> {
            val root = Json.parseToJsonElement(text) as? JsonObject
                ?: throw IllegalArgumentException("a copy file is a JSON object")
            return root.mapNotNull { (key, value) ->
                (value as? JsonPrimitive)?.takeIf { it.isString }?.let { key to it.content }
            }.toMap()
        }
    }
}
