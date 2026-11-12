// EXPECT: ARGUMENT_TYPE_MISMATCH
// A Raw value cannot be passed where CloudSafe is required.
import app.silhouette.benefits.core.*

fun sendToCloud(payload: CloudSafe): Int = payload.hashCode()

fun leak() {
    sendToCloud(Raw.of("Zyxwanda Quillfeather 9917734"))
}
