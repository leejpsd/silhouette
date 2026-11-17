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
 * and deterministic code. Cloud-capable calls take a [ModelCall], whose text is [CloudText] (made
 * from bundled prompts and cloud-safe values) and whose payload is cloud-safe. The on-device-only
 * calls are the photo reader and the person's own result ([PersonalRequest]).
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
        assertEquals(CloudSafe::class.java, ModelCall::class.java.getDeclaredField("payload").type)
        assertEquals(CloudText::class.java, ModelCall::class.java.getDeclaredField("system").type)
        assertEquals(CloudText::class.java, ModelCall::class.java.getDeclaredField("user").type)
        assertEquals(Skeleton::class.java, PointerRequest::class.java.getDeclaredField("skeleton").type)
        // A ModelCall cannot be on-device-only: that mode belongs to the photo reader.
        val modes = ModelPort::class.java.declaredMethods.single { it.name == "generate" }.parameterTypes.toList()
        assertEquals(ModelCall::class.java, modes.first())
    }

    @Test
    fun `only the Firebase adapters talk to Firebase AI Logic`() {
        val users = sources.filterValues { it.contains("import com.google.firebase.ai.") }.keys.map { File(it).name }.toSet()
        assertEquals(setOf("FirebaseModelPort.kt", "FirebaseDeviceModel.kt", "FirebasePhotoReader.kt", "FirebaseOnDeviceText.kt", "FirebaseDeviceText.kt"), users)
    }

    @Test
    fun `the on-device-only mode is used only for photos and the person's own result, which never go to the cloud`() {
        val onlyOnDevice = sources.filterValues { it.contains("InferenceMode.ONLY_ON_DEVICE") }.keys.map { File(it).name }.toSet()
        assertEquals(setOf("FirebaseModelPort.kt", "FirebasePhotoReader.kt", "FirebaseOnDeviceText.kt", "FirebaseDeviceText.kt"), onlyOnDevice)
        for (name in listOf("FirebasePhotoReader.kt", "FirebaseOnDeviceText.kt", "FirebaseDeviceText.kt")) {
            val source = sources.entries.single { it.key.endsWith(name) }.value
            assertFalse(name, source.contains("PREFER_ON_DEVICE"))
            assertFalse(name, source.contains("PREFER_IN_CLOUD"))
            assertFalse(name, source.contains("ONLY_IN_CLOUD"))
        }
        // A reply reported from anywhere but the device is discarded.
        val text = sources.entries.single { it.key.endsWith("FirebaseOnDeviceText.kt") }.value
        assertTrue(text.contains("response.inferenceSource != SdkSource.ON_DEVICE"))
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

    @Test
    fun `the person's own result is carried only by on-device-only code`() {
        val users = sources.filterValues { Regex("\\bPersonalRequest\\b").containsMatchIn(it) }.keys.map { File(it).name }.toSet()
        // OnDeviceGuard.kt: the hard stop and the record around the on-device-only adapter.
        assertEquals(setOf("PersonalTasks.kt", "FirebaseOnDeviceText.kt", "OnDeviceGuard.kt"), users)
        val results = sources.filterValues { Regex("\\bPersonalResult\\b").containsMatchIn(it) }.keys.map { File(it).name }.toSet()
        assertEquals(setOf("PersonalTasks.kt", "ProgramContext.kt"), results)
        // The on-device-only adapter never builds a ModelCall.
        val text = sources.entries.single { it.key.endsWith("FirebaseOnDeviceText.kt") }.value
        assertFalse(text.contains("ModelCall"))
    }

    /**
     * Public values become cloud request text, so every place that declares one is pinned here: each
     * is a bundled prompt, rule-pack copy, a task constant or a number of words.
     */
    @Test
    fun `cloud request text is made only from prompts, copy and cloud-safe values`() {
        fun arguments(text: String): List<String> {
            val out = ArrayList<String>()
            var at = text.indexOf("Public.of(")
            while (at >= 0) {
                val start = at + "Public.of(".length
                var depth = 1
                var i = start
                while (depth > 0) {
                    when (text[i]) {
                        '(' -> depth++
                        ')' -> depth--
                    }
                    i++
                }
                out += text.substring(start, i - 1)
                at = text.indexOf("Public.of(", start)
            }
            return out
        }
        val sites = sources.flatMap { (path, text) -> arguments(text).map { "${File(path).name}: $it" } }.sorted()
        val expected = listOf(
            "ExplainTasks.kt: languageName(input.locale)",
            "ExplainTasks.kt: prompt.system",
            "ExplainTasks.kt: prompt.user",
            "ExplainTasks.kt: words.toString()",
            "PointerRequestBuilder.kt: \"${'$'}{DeviceReadingTask.SCHEMA_LINE}\\n${'$'}deviceSchema\"",
            "DeviceReadingTask.kt: \"${'$'}{prompt.system}\\n\\n${'$'}{parts.forPart(part)}\"",
            "DeviceReadingTask.kt: prompt.user",
            "DeviceReadingTask.kt: request.docType.wire",
            "DeviceReadingTask.kt: \"${'$'}SCHEMA_LINE\\n${'$'}constraint\"",
            "PointerRequestBuilder.kt: prompt.system",
            "PointerRequestBuilder.kt: prompt.user",
            "PointerRequestBuilder.kt: request.docType.wire",
            // A prepared question: copy text (`ask.chip.*`), never typed text.
            "ProgramAnswers.kt: question",
            "DeviceCheckRunner.kt: question",
            "ProgramContext.kt: lines.joinToString(\"\\n\")",
            "ProgramContext.kt: t.programName(info.id, info.name)",
        ).sorted()
        assertEquals(expected, sites)
    }
}
