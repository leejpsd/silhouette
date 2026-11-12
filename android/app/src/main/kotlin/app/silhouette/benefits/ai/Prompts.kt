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

    fun forVersion(version: Int?): PromptTemplate = versions[version] ?: versions.getValue(versions.keys.max())

    companion object {
        val BUNDLED: List<Int> = listOf(2, 3, 4)
    }
}
