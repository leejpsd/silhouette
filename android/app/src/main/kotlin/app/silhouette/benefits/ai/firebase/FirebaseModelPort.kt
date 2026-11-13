package app.silhouette.benefits.ai.firebase

import app.silhouette.benefits.ai.CallMode
import app.silhouette.benefits.ai.FailureClassifier
import app.silhouette.benefits.ai.FailureKind
import app.silhouette.benefits.ai.ModelCall
import app.silhouette.benefits.ai.ModelFailure
import app.silhouette.benefits.ai.ModelPort
import app.silhouette.benefits.ai.ModelReply
import app.silhouette.benefits.ai.SchemaNode
import com.google.firebase.Firebase
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import java.util.concurrent.ConcurrentHashMap
import app.silhouette.benefits.ai.InferenceSource as Source
import com.google.firebase.ai.InferenceSource as SdkSource

/**
 * [ModelPort] on Firebase AI Logic (Gemini Developer API backend) with hybrid inference.
 *
 * One `GenerativeModel` per task, mode, system instruction and schema, created once and reused,
 * because a model's configuration is fixed for its lifetime. The response's `inferenceSource`
 * tells where it ran. The cloud answer is constrained by `responseSchema`; the on-device model has
 * no schema parameter, so the request text carries the schema as well (see PointerRequestBuilder).
 */
@OptIn(PublicPreviewAPI::class)
class FirebaseModelPort(private val cloudModel: String = CLOUD_MODEL) : ModelPort {
    private val models = ConcurrentHashMap<String, GenerativeModel>()

    override suspend fun generate(call: ModelCall): ModelReply {
        val model = models.getOrPut("${call.task}|${call.mode}|${call.system.hashCode()}|${call.schema.hashCode()}|${call.maxOutputTokens}") { create(call) }
        val response = try {
            model.generateContent(call.user.text)
        } catch (e: Exception) {
            throw FailureClassifier.classify(e)
        }
        val text = response.text ?: throw ModelFailure(FailureKind.CLOUD, "empty-response")
        val source = if (response.inferenceSource == SdkSource.ON_DEVICE) Source.ON_DEVICE else Source.IN_CLOUD
        return ModelReply(text, source, cloudModel)
    }

    private fun create(call: ModelCall): GenerativeModel = Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
        modelName = cloudModel,
        generationConfig = generationConfig {
            maxOutputTokens = call.maxOutputTokens
            if (call.schema != null) {
                responseMimeType = "application/json"
                responseSchema = toSchema(call.schema)
            }
        },
        systemInstruction = content { text(call.system.text) },
        onDeviceConfig = OnDeviceConfig(
            mode = when (call.mode) {
                CallMode.PREFER_ON_DEVICE -> InferenceMode.PREFER_ON_DEVICE
                CallMode.PREFER_IN_CLOUD -> InferenceMode.PREFER_IN_CLOUD
                CallMode.ONLY_IN_CLOUD -> InferenceMode.ONLY_IN_CLOUD
                CallMode.ONLY_ON_DEVICE -> InferenceMode.ONLY_ON_DEVICE
            },
            maxOutputTokens = DEVICE_MAX_OUTPUT_TOKENS,
        ),
    )

    companion object {
        /** The cloud model of `document.pointer.extract`, the same as the Web app's. */
        const val CLOUD_MODEL: String = "gemini-3.5-flash-lite"

        /** Firebase AI Logic's endpoint, for the outbound log. */
        const val HOST: String = "firebasevertexai.googleapis.com"

        /** Output above 256 tokens is discouraged on device; a full pointer answer needs a little more. */
        const val DEVICE_MAX_OUTPUT_TOKENS: Int = 512

        /** The request path without the project id, for the outbound log. */
        fun pathFor(model: String): String = "/…/models/$model:generateContent"

        /** Maps the SDK-free schema tree onto the SDK's schema builders. */
        fun toSchema(node: SchemaNode): Schema = when (node) {
            is SchemaNode.Obj -> Schema.obj(
                properties = node.properties.mapValues { (_, v) -> toSchema(v) },
                optionalProperties = node.properties.keys.filter { it !in node.required },
                description = node.description,
                nullable = node.nullable,
            )
            is SchemaNode.Arr -> Schema.array(toSchema(node.items), description = node.description, nullable = node.nullable)
            is SchemaNode.Str -> Schema.string(description = node.description, nullable = node.nullable)
            is SchemaNode.Enum -> Schema.enumeration(node.values, description = node.description, nullable = node.nullable)
            is SchemaNode.AnyOf -> Schema.anyOf(node.options.map(::toSchema))
            is SchemaNode.Num -> if (node.integer) Schema.integer(description = node.description, nullable = node.nullable) else Schema.double(description = node.description, nullable = node.nullable)
            is SchemaNode.Bool -> Schema.boolean(description = node.description, nullable = node.nullable)
        }
    }
}
