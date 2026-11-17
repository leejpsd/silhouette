package app.silhouette.benefits.ai

import app.silhouette.benefits.core.ModelSchema
import app.silhouette.benefits.core.Public
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
    /** The bundled prompt version in effect for a Remote Config value. */
    fun resolve(version: Int?): Int = prompts.resolve(version)

    fun build(request: PointerRequest, mode: CallMode, promptVersion: Int?): ModelCall {
        val prompt = prompts.forVersion(promptVersion)
        val pointerSchema = pointerSchemas.getValue(request.docType.schemaFile)
        val cloudSchema = ModelSchema.toModelSchema(pointerSchema, requiredNullable = true, dialect = SchemaDialect.OPENAPI)
        val deviceSchema = ModelSchema.toModelSchema(pointerSchema, requiredNullable = true, dialect = SchemaDialect.JSONSCHEMA)
        val content = CloudText.fill(Public.of(prompt.user), mapOf("docType" to Public.of(request.docType.wire), "skeleton" to request.skeleton))
        // A cloud request carries the prompt alone; the schema goes in its generation config. A
        // device-first request may run on the device, which takes text only, so it carries the schema too.
        val user = if (mode == CallMode.PREFER_ON_DEVICE) {
            CloudText.join(listOf(content, CloudText.of(Public.of("${DeviceReadingTask.SCHEMA_LINE}\n$deviceSchema"))))
        } else {
            content
        }
        return ModelCall(
            task = TASK,
            mode = mode,
            system = CloudText.of(Public.of(prompt.system)),
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
