package app.silhouette.benefits.ai

import app.silhouette.benefits.core.CloudSafe
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.Skeleton
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The routing rule of shared/DATA_TYPES.md for the app: Raw values reach only on-device-only calls
 * and deterministic code. Cloud-capable calls take a [ModelCall], which carries a [Skeleton] and
 * text built from it; the photo reader is the only on-device-only call.
 */
class RoutingRuleTest {
    private val sources = File("src/main/kotlin").walk().filter { it.extension == "kt" }.associate { it.path to it.readText() }

    @Test
    fun `a cloud-capable call can only carry a Skeleton`() {
        // ModelCall and PointerRequest hold no Raw, and their document content is cloud-safe.
        for (type in listOf(ModelCall::class.java, PointerRequest::class.java)) {
            for (field in type.declaredFields) {
                assertFalse("${type.simpleName}.${field.name}", Raw::class.java.isAssignableFrom(field.type))
            }
        }
        assertEquals(Skeleton::class.java, ModelCall::class.java.getDeclaredField("payload").type)
        assertTrue(CloudSafe::class.java.isAssignableFrom(ModelCall::class.java.getDeclaredField("payload").type))
        assertEquals(Skeleton::class.java, PointerRequest::class.java.getDeclaredField("skeleton").type)
        // A ModelCall cannot be on-device-only: that mode belongs to the photo reader.
        val modes = ModelPort::class.java.declaredMethods.single { it.name == "generate" }.parameterTypes.toList()
        assertEquals(ModelCall::class.java, modes.first())
    }

    @Test
    fun `only the Firebase adapters talk to Firebase AI Logic`() {
        val users = sources.filterValues { it.contains("import com.google.firebase.ai.") }.keys.map { File(it).name }.toSet()
        assertEquals(setOf("FirebaseModelPort.kt", "FirebaseDeviceModel.kt", "FirebasePhotoReader.kt"), users)
    }

    @Test
    fun `the on-device-only mode is used only for photos, and photos are never sent to the cloud`() {
        val onlyOnDevice = sources.filterValues { it.contains("InferenceMode.ONLY_ON_DEVICE") }.keys.map { File(it).name }.toSet()
        assertEquals(setOf("FirebaseModelPort.kt", "FirebasePhotoReader.kt"), onlyOnDevice)
        val photo = sources.entries.single { it.key.endsWith("FirebasePhotoReader.kt") }.value
        assertFalse(photo.contains("PREFER_ON_DEVICE"))
        assertFalse(photo.contains("PREFER_IN_CLOUD"))
        assertFalse(photo.contains("ONLY_IN_CLOUD"))
        // ModelCall refuses the on-device-only mode, so FirebaseModelPort never runs a photo task.
        val modelCall = sources.entries.single { it.key.endsWith("ModelPort.kt") && !it.key.contains("firebase") }.value
        assertTrue(modelCall.contains("require(mode != CallMode.ONLY_ON_DEVICE)"))
    }

    @Test
    fun `every model request goes through the outbound log`() {
        val app = sources.entries.single { it.key.endsWith("SilhouetteApplication.kt") }.value
        assertTrue(app.contains("LoggedModelPort(FirebaseModelPort()"))
        // FirebaseModelPort is constructed nowhere else.
        val constructions = sources.filterValues { Regex("FirebaseModelPort\\(\\)").containsMatchIn(it) }.keys.map { File(it).name }
        assertEquals(listOf("SilhouetteApplication.kt"), constructions)
    }
}
