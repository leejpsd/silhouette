package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Pointer rehydration. Contract: shared/skeleton/SPEC.md section 5. The model output (`pointers`) is
// untrusted; the pointer schema (shared/schemas/pointer.*.json) tells how each field is read.

private val NUMBER_FORMAT = Regex("^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\\.[0-9]+)?$")

/** SPEC.md section 5 step 2. Returns null for a token that does not match the number format. */
internal fun parseNumber(token: String): Double? {
    if (!NUMBER_FORMAT.matches(token)) return null
    return token.replace(",", "").toDouble()
}

private fun JsonElement?.stringOrNull(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun ownField(obj: JsonElement?, key: String): JsonElement? = (obj as? JsonObject)?.get(key)

/** Reads one field. Returns a String or Double, or null when the reference is dropped. */
private fun readField(spec: JsonObject, ref: JsonElement?, map: Map<String, String>): Any? {
    val kind = spec["x-kind"].stringOrNull()
    if (kind == "enum") {
        val value = ref.stringOrNull() ?: return null
        val allowed = (spec["enum"] as? JsonArray)?.mapNotNull { it.stringOrNull() } ?: return null
        return if (value in allowed) value else null
    }
    fun refOf(r: JsonElement?): String? = r.stringOrNull()?.takeIf { map.containsKey(it) }
    return when (kind) {
        "number" -> refOf(ref)?.takeIf { it[0] == 'N' }?.let { parseNumber(map.getValue(it)) }
        "date" -> {
            val single = refOf(ref)
            when {
                single != null -> if (single[0] == 'D') map.getValue(single) else null
                ref is JsonArray && ref.size == 3 -> {
                    val ids = ref.map { refOf(it)?.takeIf { id -> id[0] == 'N' } }
                    if (ids.all { it != null }) ids.joinToString("-") { map.getValue(it!!) } else null
                }
                else -> null
            }
        }
        "text" -> {
            if (ref !is JsonArray) return null
            val parts = ref.mapNotNull { refOf(it) }.map { map.getValue(it) }
            if (parts.isEmpty()) null else parts.joinToString(" ")
        }
        else -> null
    }
}

/**
 * Resolves model pointers against the placeholder map. The result holds exact document values and
 * therefore stays Raw. Fields come out in schema order; numbers are JSON numbers, dates and text
 * are strings, list fields are arrays of objects.
 */
public fun rehydrate(schema: JsonObject, pointers: JsonElement, map: Raw<Map<String, String>>): Raw<JsonObject> {
    val values = map.reveal()
    val properties = schema["properties"] as? JsonObject ?: throw IllegalArgumentException("a pointer schema needs properties")
    val out = LinkedHashMap<String, Any?>()
    for ((name, specElement) in properties) {
        val spec = specElement as? JsonObject ?: continue
        val ref = ownField(pointers, name)
        if (ref == null || ref is JsonNull) continue
        if (spec["x-kind"].stringOrNull() == "list") {
            if (ref !is JsonArray) continue
            val itemSpec = spec["items"] as? JsonObject ?: continue
            val itemProperties = itemSpec["properties"] as? JsonObject ?: continue
            val required = (itemSpec["required"] as? JsonArray)?.mapNotNull { it.stringOrNull() } ?: emptyList()
            val items = ArrayList<Map<String, Any?>>()
            for (entry in ref) {
                val item = LinkedHashMap<String, Any?>()
                for ((sub, subSpec) in itemProperties) {
                    val value = readField(subSpec as? JsonObject ?: continue, ownField(entry, sub), values)
                    if (value != null) item[sub] = value
                }
                if (required.all { item.containsKey(it) }) items.add(item)
            }
            if (items.isNotEmpty()) out[name] = items
            continue
        }
        val value = readField(spec, ref, values)
        if (value != null) out[name] = value
    }
    return Raw.of(valueToJson(out) as JsonObject)
}
