package app.silhouette.benefits.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.io.File

/** Reads the shared contract folder in place. Its path comes from the Gradle test task. */
internal object Shared {
    val root: File = File(
        System.getProperty("silhouette.shared")
            ?: error("system property silhouette.shared is not set; run the tests through Gradle"),
    ).canonicalFile.also { require(it.isDirectory) { "shared folder not found: $it" } }

    fun file(relative: String): File = File(root, relative)

    fun text(relative: String): String = file(relative).readText(Charsets.UTF_8)

    fun json(relative: String): JsonElement = Json.parseToJsonElement(text(relative))
}
