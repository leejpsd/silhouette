package app.silhouette.benefits.ai

import app.silhouette.benefits.core.DeviceAnswer
import app.silhouette.benefits.core.DevicePart
import app.silhouette.benefits.core.DeviceReading
import app.silhouette.benefits.core.DeviceReadingResult
import app.silhouette.benefits.core.Public
import app.silhouette.benefits.core.SkeletonResult
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonObject

// The on-device reading of a paystub in parts (shared/validation/DEVICE_READING.md, prompts
// pointer-extract.v5 and pointer-extract-device.v1). Every part is ONLY_ON_DEVICE: it runs on this
// device or gives no answer. The deterministic checks live in :core (DeviceReading).

/**
 * A model that runs a cloud-safe request on this device only (`ONLY_ON_DEVICE`), with the most
 * deterministic sampling the SDK offers. It never falls back to the cloud, and a reply that did not
 * run on the device is refused.
 */
interface DeviceText {
    suspend fun generate(system: CloudText, user: CloudText): String
}

/** Where a reading is, for the status line (`preview.stage.*`). */
enum class ReadingStage(val copyKey: String) {
    DEVICE_READING("preview.stage.deviceReading"),
    DEVICE_GROSS("preview.stage.deviceGross"),
    DEVICE_DEDUCTIONS("preview.stage.deviceDeductions"),
    CHECKING("preview.stage.checking"),
    SENDING_AFTER_DEVICE("preview.stage.sendingAfterDevice"),
}

/**
 * Reads a silhouette in parts on the device. [available] is checked before every part: when the
 * device model is not available the part is not asked at all (a hard stop before any SDK call), and
 * the pass records `guard:model-not-available`. A part that ends without an answer records where it
 * stopped and the error's type and message (placeholder ids only can appear in it).
 */
class DeviceReadingTask(
    private val model: DeviceText,
    private val prompts: PointerPrompts,
    private val parts: DevicePartPrompts,
    private val pointerSchemas: Map<String, JsonObject>,
    private val available: () -> Boolean,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    /** Whether a document type is read in parts on the device (it has a list field). */
    fun readsInParts(docType: DocType): Boolean = DeviceReading.readsInParts(pointerSchemas.getValue(docType.schemaFile))

    /** The request of one part: v5's system instruction, a blank line, the part's text; v5's user content and the strict constraint. */
    fun requestFor(request: PointerRequest, part: DevicePart): Pair<CloudText, CloudText> {
        val prompt = prompts.forVersion(PointerPrompts.READS_IN_PARTS_FROM)
        val schema = pointerSchemas.getValue(request.docType.schemaFile)
        val constraint = DeviceReading.deviceConstraint(schema, request.skeleton.text, part)
        val system = CloudText.of(Public.of("${prompt.system}\n\n${parts.forPart(part)}"))
        // Android's on-device request takes text only: the constraint is written after the line
        // shared/schemas/MODEL_SCHEMA.md names. The checks below apply to the answer either way.
        val user = CloudText.join(
            listOf(
                CloudText.fill(Public.of(prompt.user), mapOf("docType" to Public.of(request.docType.wire), "skeleton" to request.skeleton)),
                CloudText.of(Public.of("$SCHEMA_LINE\n$constraint")),
            ),
        )
        return system to user
    }

    suspend fun read(
        request: PointerRequest,
        result: SkeletonResult,
        jurisdiction: String,
        onStage: (ReadingStage) -> Unit = {},
    ): DeviceReadingResult {
        val schema = pointerSchemas.getValue(request.docType.schemaFile)
        return DeviceReading.readOnDevice(schema, result, jurisdiction, request.language) { part ->
            onStage(
                when (part) {
                    DevicePart.GROSS -> ReadingStage.DEVICE_GROSS
                    DevicePart.DEDUCTIONS, DevicePart.DEDUCTIONS_AGAIN -> ReadingStage.DEVICE_DEDUCTIONS
                    else -> ReadingStage.DEVICE_READING
                },
            )
            val answer = ask(request, part)
            onStage(ReadingStage.CHECKING)
            answer
        }
    }

    /** One part, never thrown: no answer is recorded with where and why it stopped. */
    suspend fun ask(request: PointerRequest, part: DevicePart): DeviceAnswer {
        val started = clock()
        if (!available()) return DeviceAnswer.NoAnswer(GUARD_NOT_AVAILABLE, 0)
        val (system, user) = requestFor(request, part)
        return try {
            DeviceAnswer.Text(model.generate(system, user), clock() - started)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            DeviceAnswer.NoAnswer(noAnswerReason(e), clock() - started)
        }
    }

    companion object {
        /** shared/schemas/MODEL_SCHEMA.md: the line before the schema in an on-device prompt. */
        const val SCHEMA_LINE: String = "Answer with JSON that matches this schema:"

        /** The part was not asked: the app's guard stopped it before any SDK call. */
        const val GUARD_NOT_AVAILABLE: String = "guard:model-not-available"

        /** Where a call stopped and why: the SDK's error type and message (no document values are sent, so none can appear). */
        fun noAnswerReason(e: Throwable): String {
            val failure = (e as? ModelFailure) ?: FailureClassifier.classify(e)
            val root = generateSequence(e) { it.cause }.last()
            val message = (root.message ?: "").replace(Regex("\\s+"), " ").take(160)
            return "sdk:${failure.reason}:${root.javaClass.simpleName}${if (message.isNotEmpty()) ": $message" else ""}"
        }
    }
}
