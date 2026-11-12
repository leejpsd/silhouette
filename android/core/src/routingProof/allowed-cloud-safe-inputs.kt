// EXPECT: COMPILES
// The allowed path: Raw becomes cloud-safe only through skeletonize() and generalize().
import app.silhouette.benefits.core.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

fun sendToCloud(payload: CloudSafe): Int = payload.hashCode()

fun allowed(bands: Bands) {
    val document: Raw<String> = Raw.of("Gross Pay 1,284.50")
    sendToCloud(skeletonize(document, Allowlist(listOf("gross", "pay"))).skeleton)
    val exact: Raw<JsonObject> = Raw.of(JsonObject(mapOf("jurisdiction" to JsonPrimitive("zz-test"))))
    val profile = generalize(exact, bands)
    sendToCloud(profile)
    sendToCloud(canonical(profile))
    sendToCloud(Public.of("Test Food Help"))
}
