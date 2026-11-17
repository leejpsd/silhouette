package app.silhouette.benefits.devicecheck

import app.silhouette.benefits.ai.DocType
import app.silhouette.benefits.content.AppContent
import app.silhouette.benefits.core.DeviceCheck
import app.silhouette.benefits.core.Raw
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** The check's five documents (shared/fixtures/device-check/cases.json `extraction`), read from the bundled contract. */
object CheckDocuments {
    const val CASES: String = "fixtures/device-check/cases.json"
    const val RUNS_DIR: String = "fixtures/device-check/runs"

    fun load(content: AppContent): List<CheckDocument> {
        val source = content.source ?: return emptyList()
        val cases = Json.parseToJsonElement(source.text(CASES) ?: return emptyList()) as JsonObject
        val schema = content.pointerSchemas.getValue(DocType.PAYSTUB.schemaFile)
        return (cases["extraction"] as JsonArray).map { e ->
            val o = e as JsonObject
            val id = (o["id"] as JsonPrimitive).content
            val path = (o["document"] as JsonPrimitive).content
            val text = Raw.of(source.text(path) ?: error("missing check document $path"))
            val goldPath = path.removeSuffix(".txt") + ".gold.json"
            val goldFile = source.text(goldPath)
            if (goldFile != null) {
                val gold = Raw.of(Json.parseToJsonElement(goldFile) as JsonObject)
                CheckDocument(id, text) { gold }
            } else {
                // The bundled sample: its right answer is its answer key, read through the Rehydrator.
                val pointers = content.sampleAnswers.getValue(path.substringAfterLast('/').removeSuffix(".txt"))
                CheckDocument(id, text) { skeleton -> DeviceCheck.goldFromPointers(schema, pointers, skeleton) }
            }
        }
    }
}
