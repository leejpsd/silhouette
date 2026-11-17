package app.silhouette.benefits.ai

/** A prompt file of shared/prompts/: the system instruction and the user content template. */
class PromptTemplate(val id: String, val system: String, val user: String) {
    fun fill(values: Map<String, String>): String =
        Regex("\\{(\\w+)\\}").replace(user) { m -> values[m.groupValues[1]] ?: m.value }

    companion object {
        /** Splits a prompt file into its "System instruction" text and the fenced "User content" template. */
        fun parse(id: String, markdown: String): PromptTemplate {
            fun section(title: String): String {
                val start = markdown.indexOf("## $title")
                require(start >= 0) { "$id: missing section \"$title\"" }
                val body = markdown.substring(start + title.length + 3)
                val end = Regex("\n## ").find(body)?.range?.first ?: body.length
                return body.substring(0, end).trim()
            }
            val user = Regex("```\n([\\s\\S]*?)\n```").find(section("User content"))?.groupValues?.get(1)
                ?: throw IllegalArgumentException("$id: \"User content\" has no fenced template")
            return PromptTemplate(id, section("System instruction"), user)
        }
    }
}

/**
 * Bundled versions of the pointer prompt (shared/prompts/pointer-extract.v{n}.md). Remote Config
 * `prompt_pointer_extract_v` picks one; an unknown version gets the newest bundled one.
 */
class PointerPrompts(private val versions: Map<Int, PromptTemplate>) {
    init {
        require(versions.isNotEmpty()) { "no bundled pointer prompt" }
    }

    fun forVersion(version: Int?): PromptTemplate = versions.getValue(resolve(version))

    /** The bundled version Remote Config names, or the newest bundled one for a value the app does not bundle. */
    fun resolve(version: Int?): Int = if (version != null && version in versions) version else versions.keys.max()

    companion object {
        val BUNDLED: List<Int> = listOf(2, 3, 4, 5)

        /** From this version on, a paystub is read in parts on a device whose model is available (DEVICE_READING.md). */
        const val READS_IN_PARTS_FROM: Int = 5
    }
}

/**
 * The texts of shared/prompts/pointer-extract-device.v1.md, one per part of the on-device reading.
 * Each is added to the pointer-extract system instruction after a blank line. They are exact and
 * value-free.
 */
class DevicePartPrompts(val core: String, val gross: String, val deductions: String, val deductionsAgain: String) {
    fun forPart(part: app.silhouette.benefits.core.DevicePart): String = when (part) {
        app.silhouette.benefits.core.DevicePart.CORE -> core
        app.silhouette.benefits.core.DevicePart.GROSS -> gross
        app.silhouette.benefits.core.DevicePart.DEDUCTIONS -> deductions
        app.silhouette.benefits.core.DevicePart.DEDUCTIONS_AGAIN -> deductionsAgain
        app.silhouette.benefits.core.DevicePart.WHOLE -> ""
    }

    companion object {
        fun parse(markdown: String): DevicePartPrompts {
            fun section(title: String): String {
                val start = markdown.indexOf("\n## $title\n")
                require(start >= 0) { "pointer-extract-device: missing section \"$title\"" }
                val body = markdown.substring(start + title.length + 5)
                val end = body.indexOf("\n## ").let { if (it < 0) body.length else it }
                return body.substring(0, end).trim()
            }
            val deductions = section("Deductions part")
            // "The text of the deductions part, a line break, then:" followed by a blank line and the added sentence.
            val again = section("Deductions part, asked again").substringAfter("\n\n").trim()
            return DevicePartPrompts(section("Core part"), section("Gross part"), deductions, "$deductions\n$again")
        }
    }
}
