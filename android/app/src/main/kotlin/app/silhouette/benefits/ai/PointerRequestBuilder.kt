package app.silhouette.benefits.ai

import app.silhouette.benefits.core.ModelSchema
import app.silhouette.benefits.core.SchemaDialect
import kotlinx.serialization.json.JsonObject

/**
 * Builds the `document.pointer.extract` call from a [PointerRequest]. Pure: the request text is
 * made from the prompt, the document type and the silhouette, nothing else.
 *
 * The cloud model receives the model schema as structured output (`openapi` dialect, every field
 * required and nullable). The on-device model has no schema parameter in Firebase AI Logic (only
 * generated `@Generable` classes), so the same schema, in the `jsonschema` dialect, is also written
 * into the user content. The answer is untrusted either way: the Rehydrator validates every pointer.
 */
class PointerRequestBuilder(private val prompts: PointerPrompts, private val pointerSchemas: Map<String, JsonObject>) {

    fun build(request: PointerRequest, mode: CallMode, promptVersion: Int?): ModelCall {
        val prompt = prompts.forVersion(promptVersion)
        val pointerSchema = pointerSchemas.getValue(request.docType.schemaFile)
        val cloudSchema = ModelSchema.toModelSchema(pointerSchema, requiredNullable = true, dialect = SchemaDialect.OPENAPI)
        val deviceSchema = ModelSchema.toModelSchema(pointerSchema, requiredNullable = true, dialect = SchemaDialect.JSONSCHEMA)
        val user = prompt.fill(mapOf("docType" to request.docType.wire, "skeleton" to request.skeleton.text)) +
            "\n\nJSON schema of the answer:\n" + deviceSchema.toString()
        return ModelCall(
            task = TASK,
            mode = mode,
            system = prompt.system,
            user = user,
            payload = request.skeleton,
            schema = SchemaNode.fromModelSchema(cloudSchema),
            maxOutputTokens = MAX_OUTPUT_TOKENS,
        )
    }

    companion object {
        const val TASK: String = "document.pointer.extract"
        const val MAX_OUTPUT_TOKENS: Int = 1024
    }
}
