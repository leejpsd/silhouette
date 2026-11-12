package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Model schema derivation. Contract: shared/schemas/MODEL_SCHEMA.md, reference
// shared/reference/model-schema.mjs. Key order is preserved everywhere.

/** Thrown when a pointer schema cannot be converted (external or unresolved `$ref`, too deep). */
public class ModelSchemaError(message: String) : Exception(message)

public enum class SchemaDialect { OPENAPI, JSONSCHEMA }

public object ModelSchema {
    private val DROP = setOf("\$id", "\$schema", "\$comment", "\$defs", "x-kind", "additionalProperties", "pattern")
    private const val MAX_DEPTH = 32

    private fun resolve(root: JsonElement, ref: String): JsonObject {
        if (!ref.startsWith("#/")) throw ModelSchemaError("unsupported \$ref")
        var node: JsonElement? = root
        for (part in ref.substring(2).split('/')) {
            node = when (node) {
                is JsonObject -> node[part]
                is JsonArray -> part.toIntOrNull()?.let { node.getOrNull(it) }
                else -> null
            }
        }
        return node as? JsonObject ?: throw ModelSchemaError("unresolved \$ref")
    }

    private fun convert(node: JsonElement, root: JsonElement, depth: Int): JsonElement {
        if (depth > MAX_DEPTH) throw ModelSchemaError("schema too deep or recursive")
        if (node is JsonArray) return JsonArray(node.map { convert(it, root, depth + 1) })
        if (node !is JsonObject) return node
        val ref = (node["\$ref"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        if (ref != null) {
            // Sibling keys override keys of the referenced node; the result is resolved again.
            val merged = LinkedHashMap<String, JsonElement>(resolve(root, ref))
            for ((k, v) in node) if (k != "\$ref") merged[k] = v
            return convert(JsonObject(merged), root, depth + 1)
        }
        val out = LinkedHashMap<String, JsonElement>()
        for ((key, value) in node) {
            if (key in DROP) continue
            val target = if (key == "oneOf") "anyOf" else key
            out[target] = if (key == "properties" && value is JsonObject) {
                JsonObject(value.mapValues { (_, v) -> convert(v, root, depth + 1) })
            } else {
                convert(value, root, depth + 1)
            }
        }
        if (out["enum"] is JsonArray && !out.containsKey("type")) out["type"] = JsonPrimitive("string")
        return JsonObject(out)
    }

    private fun nullableJsonSchema(prop: JsonObject): JsonObject {
        val out = LinkedHashMap<String, JsonElement>(prop)
        val anyOf = prop["anyOf"]
        if (anyOf is JsonArray) {
            out["anyOf"] = JsonArray(anyOf + JsonObject(mapOf("type" to JsonPrimitive("null"))))
            return JsonObject(out)
        }
        out["type"] = JsonArray(listOf(prop["type"] ?: JsonNull, JsonPrimitive("null")))
        val enum = prop["enum"]
        if (enum is JsonArray) out["enum"] = JsonArray(enum + JsonNull)
        return JsonObject(out)
    }

    /**
     * Derives the schema a model accepts from a pointer schema. With [requiredNullable], every
     * top-level property becomes required and nullable in the given [dialect].
     */
    public fun toModelSchema(schema: JsonElement, requiredNullable: Boolean = false, dialect: SchemaDialect = SchemaDialect.OPENAPI): JsonElement {
        val out = convert(schema, schema, 0)
        if (!requiredNullable) return out
        val obj = out as? JsonObject ?: throw ModelSchemaError("a schema is an object")
        val props = obj["properties"] as? JsonObject ?: throw ModelSchemaError("a schema needs properties")
        val result = LinkedHashMap<String, JsonElement>(obj)
        result["properties"] = JsonObject(
            props.mapValues { (_, v) ->
                val p = v as? JsonObject ?: throw ModelSchemaError("a property is an object")
                if (dialect == SchemaDialect.OPENAPI) JsonObject(LinkedHashMap<String, JsonElement>(p).apply { put("nullable", JsonPrimitive(true)) }) else nullableJsonSchema(p)
            },
        )
        result["required"] = JsonArray(props.keys.map { JsonPrimitive(it) })
        return JsonObject(result)
    }
}
