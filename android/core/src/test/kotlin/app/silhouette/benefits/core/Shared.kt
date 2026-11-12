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

    /** Names of the files in a folder, sorted. Hidden files (".DS_Store") are not fixtures. */
    fun listFiles(dir: File): List<String> =
        (dir.listFiles() ?: error("not a folder: $dir")).filter { it.isFile && !it.name.startsWith(".") }.map { it.name }.sorted()

    /** SPEC.md section 4: the app locale's allowlist ∪ en. */
    fun allowlist(locale: String): Allowlist =
        Allowlist.fromFiles(listOf(json("skeleton/allowlist/en.json"), json("skeleton/allowlist/$locale.json")))
}
