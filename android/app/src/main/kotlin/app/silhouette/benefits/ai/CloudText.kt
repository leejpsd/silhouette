package app.silhouette.benefits.ai

import app.silhouette.benefits.core.CloudSafe
import app.silhouette.benefits.core.Generalized
import app.silhouette.benefits.core.Public
import app.silhouette.benefits.core.Skeleton

/**
 * Text of a cloud-capable request. It can only be made from a bundled prompt template and
 * cloud-safe values ([Skeleton], [Generalized], [Public]), so a value that came from Raw — exact
 * income, a private answer, a typed question, a verdict on screen — cannot become request text.
 * [ModelCall] takes only this type.
 */
class CloudText private constructor(val text: String) {
    override fun toString(): String = text

    override fun equals(other: Any?): Boolean = other is CloudText && other.text == text

    override fun hashCode(): Int = text.hashCode()

    companion object {
        /** Fills `{name}` placeholders of [template] with cloud-safe values. Unknown names stay as written. */
        fun fill(template: Public<String>, values: Map<String, CloudSafe>): CloudText =
            CloudText(Regex("\\{(\\w+)\\}").replace(template.value) { m -> values[m.groupValues[1]]?.let(::textOf) ?: m.value })

        fun of(value: CloudSafe): CloudText = CloudText(textOf(value))

        /** Joins cloud texts as paragraphs. It takes no plain text, so nothing else can be slipped in. */
        fun join(parts: List<CloudText>): CloudText = CloudText(parts.joinToString("\n\n") { it.text })

        private fun textOf(value: CloudSafe): String = when (value) {
            is Skeleton -> value.text
            is Generalized<*> -> value.value as? String ?: throw IllegalArgumentException("a generalized value must be text here")
            is Public<*> -> when (val v = value.value) {
                is String -> v
                else -> v.toString()
            }
        }
    }
}
