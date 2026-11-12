package app.silhouette.benefits.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Where Quick Check answers are kept between sessions. */
interface AnswerRepository {
    fun load(): JsonElement?

    fun save(answers: JsonObject)

    /** Removes the answers and anything needed to read them (the encryption key). */
    fun deleteAll()
}

/** Answers encrypted at rest in [EncryptedStore]. */
class EncryptedAnswerRepository(private val store: EncryptedStore) : AnswerRepository {
    override fun load(): JsonElement? = store.read(RECORD)?.let {
        try {
            Json.parseToJsonElement(it.toString(Charsets.UTF_8))
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    override fun save(answers: JsonObject) = store.write(RECORD, answers.toString().toByteArray(Charsets.UTF_8))

    override fun deleteAll() = store.deleteEverything()

    companion object {
        const val RECORD: String = "quickcheck-answers"
    }
}
