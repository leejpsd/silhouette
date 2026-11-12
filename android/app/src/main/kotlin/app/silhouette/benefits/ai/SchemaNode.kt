package app.silhouette.benefits.ai

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * A model schema (shared/schemas/MODEL_SCHEMA.md, `openapi` dialect) as a small tree that maps
 * one to one onto the SDK's schema builders. Kept free of SDK types so it can be tested on the JVM.
 */
sealed interface SchemaNode {
    val description: String?
    val nullable: Boolean

    data class Obj(
        val properties: Map<String, SchemaNode>,
        val required: List<String>,
        override val description: String? = null,
        override val nullable: Boolean = false,
    ) : SchemaNode

    data class Arr(val items: SchemaNode, override val description: String? = null, override val nullable: Boolean = false) : SchemaNode

    data class Str(override val description: String? = null, override val nullable: Boolean = false) : SchemaNode

    data class Enum(val values: List<String>, override val description: String? = null, override val nullable: Boolean = false) : SchemaNode

    /** Exactly one of [options]. A nullable anyOf makes each option nullable (the SDK has no nullable anyOf). */
    data class AnyOf(val options: List<SchemaNode>, override val description: String? = null, override val nullable: Boolean = false) : SchemaNode

    data class Num(override val description: String? = null, override val nullable: Boolean = false, val integer: Boolean = false) : SchemaNode

    data class Bool(override val description: String? = null, override val nullable: Boolean = false) : SchemaNode

    companion object {
        /** Reads a derived model schema. Throws IllegalArgumentException for a construct the SDK cannot express. */
        fun fromModelSchema(json: JsonElement): SchemaNode {
            val o = json as? JsonObject ?: throw IllegalArgumentException("a schema node is an object")
            val description = (o["description"] as? JsonPrimitive)?.content
            val nullable = (o["nullable"] as? JsonPrimitive)?.content == "true"
            (o["anyOf"] as? JsonArray)?.let { options ->
                return AnyOf(options.map { opt -> withNullable(fromModelSchema(opt), nullable) }, description, nullable)
            }
            val enum = (o["enum"] as? JsonArray)?.map { (it as JsonPrimitive).content }
            return when (val type = (o["type"] as? JsonPrimitive)?.content) {
                "object" -> {
                    val props = (o["properties"] as? JsonObject ?: JsonObject(emptyMap())).mapValues { (_, v) -> fromModelSchema(v) }
                    val required = (o["required"] as? JsonArray)?.map { (it as JsonPrimitive).content } ?: emptyList()
                    Obj(props, required, description, nullable)
                }
                "array" -> Arr(fromModelSchema(o["items"] ?: throw IllegalArgumentException("array without items")), description, nullable)
                "string" -> if (enum != null) Enum(enum, description, nullable) else Str(description, nullable)
                "number" -> Num(description, nullable)
                "integer" -> Num(description, nullable, integer = true)
                "boolean" -> Bool(description, nullable)
                else -> throw IllegalArgumentException("unsupported schema type: $type")
            }
        }

        private fun withNullable(node: SchemaNode, nullable: Boolean): SchemaNode = if (!nullable) node else when (node) {
            is Obj -> node.copy(nullable = true)
            is Arr -> node.copy(nullable = true)
            is Str -> node.copy(nullable = true)
            is Enum -> node.copy(nullable = true)
            is AnyOf -> node.copy(nullable = true)
            is Num -> node.copy(nullable = true)
            is Bool -> node.copy(nullable = true)
        }
    }
}
