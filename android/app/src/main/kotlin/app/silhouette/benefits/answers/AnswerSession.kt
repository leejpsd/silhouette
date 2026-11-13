package app.silhouette.benefits.answers

import app.silhouette.benefits.ai.Destination

/**
 * Answers of this session, in memory only: model answers keyed by task, language, silhouette,
 * program and question; what the person agreed to send, per content and destination; and what
 * has actually reached the cloud. Nothing is written to storage; "Delete everything" clears it.
 */
class AnswerSession {
    private val answers = HashMap<String, Any>()
    private val consents = HashSet<String>()
    private val sent = HashSet<String>()

    fun cached(key: String): Any? = answers[key]

    fun store(key: String, value: Any) {
        answers[key] = value
    }

    /**
     * Whether the step before sending must be shown for this content (a canonical silhouette) and
     * destination. Agreeing to a device-first request does not cover a cloud-first one. Once the
     * content has actually reached the cloud in this session, later requests go without the step.
     */
    fun needsConsent(content: String, destination: Destination): Boolean = content !in sent && "$content|$destination" !in consents

    fun giveConsent(content: String, destination: Destination) {
        consents += "$content|$destination"
    }

    fun markSent(content: String) {
        sent += content
    }

    fun wasSent(content: String): Boolean = content in sent

    fun clear() {
        answers.clear()
        consents.clear()
        sent.clear()
    }

    companion object {
        /** Cache key: task kind, language, canonical silhouette, program and question. */
        fun key(vararg parts: String): String = parts.joinToString("|")
    }
}
