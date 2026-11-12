package app.silhouette.benefits.ai

/**
 * Routing reasons shown in the reason chip next to every model result. The values are the
 * `reason` keys of shared/routing.json (tasks and `onDeviceFailure`), plus the app's own reason for
 * the sample answer key. Each has copy under `reason.{key}`.
 */
enum class RoutingReason(val key: String) {
    PHOTO_NEVER_LEAVES("photo-never-leaves"),
    DOCUMENT_SILHOUETTE_ONLY("document-silhouette-only"),
    SHORT_TEXT("short-text"),
    LONG_OR_UNSUPPORTED_LOCALE("long-or-unsupported-locale"),
    PREPARED_QUESTION("prepared-question"),
    TYPED_TEXT_MAY_BE_PERSONAL("typed-text-may-be-personal"),
    NEEDS_CURRENT_INFO("needs-current-info"),
    NEEDS_PLACES("needs-places"),
    SPEECH("speech"),

    /** A PREFER_ON_DEVICE task failed on the device and was retried once with ONLY_IN_CLOUD. */
    ON_DEVICE_FAILED("on-device-failed"),

    /** No model: the fixed answers of a built-in sample document. */
    SAMPLE_ANSWER_KEY(SampleAnswerKeyExtractor.REASON),
    ;

    companion object {
        fun fromKey(key: String): RoutingReason? = entries.find { it.key == key }
    }
}
