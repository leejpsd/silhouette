package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Review model for extracted document fields: each field's rehydrated value plus the source lines
// of the document with the referenced tokens marked. Deterministic; reuses rehydrate() field by
// field, so review values are exactly what shared/skeleton/SPEC.md section 5 produces.
//
// The result holds the user's own document values for display on this device. It is plain data,
// not CloudSafe, so it cannot be passed to a cloud-capable call; its string forms are redacted.

/** A piece of a source line: plain skeleton text, or the original value of a placeholder. */
public data class SourceSegment(val text: String, val ref: String? = null, val highlight: Boolean = false) {
    override fun toString(): String = "SourceSegment(ref=$ref, highlight=$highlight)"
}

public enum class FieldKind { TEXT, NUMBER, DATE, ENUM, LIST }

/** One entry of a list field (a deduction): its rehydrated sub-values and source lines. */
public data class ReviewItem(val values: Map<String, Any>, val refs: List<String>, val source: List<List<SourceSegment>>) {
    override fun toString(): String = "ReviewItem(refs=$refs)"
}

/**
 * One field. [value] is a String or Double, or null when the model gave nothing usable
 * ("not found"). [options] are the allowed values of an enum field.
 */
public data class ReviewField(
    val name: String,
    val kind: FieldKind,
    val value: Any?,
    val options: List<String>,
    val items: List<ReviewItem>,
    val refs: List<String>,
    val source: List<List<SourceSegment>>,
) {
    override fun toString(): String = "ReviewField($name, $kind, refs=$refs)"
}

private val PLACEHOLDER = Regex("$PLACEHOLDER_OPEN([DNW][0-9]+)$PLACEHOLDER_CLOSE")

private fun kindOf(spec: JsonObject): FieldKind = when ((spec["x-kind"] as? JsonPrimitive)?.content) {
    "number" -> FieldKind.NUMBER
    "date" -> FieldKind.DATE
    "enum" -> FieldKind.ENUM
    "list" -> FieldKind.LIST
    else -> FieldKind.TEXT
}

private fun refsOf(ref: JsonElement?, map: Map<String, String>): List<String> {
    val list = if (ref is JsonArray) ref.toList() else listOfNotNull(ref)
    return list.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content?.takeIf { id -> map.containsKey(id) } }
}

/** Skeleton lines that contain one of [refs], with placeholders restored to their original text. */
internal fun sourceLines(skeleton: String, map: Map<String, String>, refs: List<String>): List<List<SourceSegment>> {
    if (refs.isEmpty()) return emptyList()
    val wanted = refs.toSet()
    val out = ArrayList<List<SourceSegment>>()
    for (line in skeleton.split('\n')) {
        val matches = PLACEHOLDER.findAll(line).toList()
        if (matches.none { it.groupValues[1] in wanted }) continue
        val segments = ArrayList<SourceSegment>()
        var last = 0
        for (m in matches) {
            val id = m.groupValues[1]
            if (m.range.first > last) segments += SourceSegment(line.substring(last, m.range.first))
            segments += SourceSegment(map[id] ?: "", ref = id, highlight = id in wanted)
            last = m.range.last + 1
        }
        if (last < line.length) segments += SourceSegment(line.substring(last))
        out += segments
    }
    return out
}

private fun JsonObject.toValueMap(): Map<String, Any> =
    mapNotNull { (k, v) -> (v as? JsonPrimitive)?.let { p -> k to (if (p.isString) p.content else p.content.toDouble()) } }.toMap()

/**
 * Builds the review for a pointer schema (`shared/schemas/pointer.*.json`) and the model's pointers.
 * A null pointer means "not in the document" (pointer schemas v2).
 */
public fun buildReview(schema: JsonObject, pointers: JsonElement, result: SkeletonResult): List<ReviewField> {
    val map = result.map.reveal()
    val skeleton = result.skeleton.text
    val properties = schema["properties"] as? JsonObject ?: throw IllegalArgumentException("a pointer schema needs properties")
    return properties.mapNotNull { (name, specElement) ->
        val spec = specElement as? JsonObject ?: return@mapNotNull null
        val kind = kindOf(spec)
        val options = (spec["enum"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content } ?: emptyList()
        val ref = (pointers as? JsonObject)?.get(name)?.takeIf { it !is JsonNull }
        fun single(value: JsonElement): JsonElement? =
            rehydrate(JsonObject(mapOf("properties" to JsonObject(mapOf(name to spec)))), JsonObject(mapOf(name to value)), result.map).reveal()[name]
        if (kind == FieldKind.LIST) {
            val itemProperties = ((spec["items"] as? JsonObject)?.get("properties") as? JsonObject) ?: JsonObject(emptyMap())
            val items = (ref as? JsonArray ?: JsonArray(emptyList())).mapNotNull { entry ->
                val rehydrated = (single(JsonArray(listOf(entry))) as? JsonArray)?.firstOrNull() as? JsonObject ?: return@mapNotNull null
                val subRefs = itemProperties.flatMap { (sub, subSpec) ->
                    if ((subSpec as? JsonObject)?.let(::kindOf) == FieldKind.ENUM) emptyList() else refsOf((entry as? JsonObject)?.get(sub), map)
                }
                ReviewItem(rehydrated.toValueMap(), subRefs, sourceLines(skeleton, map, subRefs))
            }
            return@mapNotNull ReviewField(name, kind, null, options, items, items.flatMap { it.refs }, emptyList())
        }
        val value = ref?.let(::single) as? JsonPrimitive
        val scalar: Any? = value?.let { if (it.isString) it.content else it.content.toDouble() }
        val refs = if (scalar == null || kind == FieldKind.ENUM) emptyList() else refsOf(ref, map)
        ReviewField(name, kind, scalar, options, emptyList(), refs, sourceLines(skeleton, map, refs))
    }
}
