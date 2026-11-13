package app.silhouette.benefits.answers

import app.silhouette.benefits.ai.AnswerBlocked
import app.silhouette.benefits.ai.CloudText
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.ModelCall
import app.silhouette.benefits.ai.OnDeviceText
import app.silhouette.benefits.ai.PersonalRequest
import app.silhouette.benefits.ai.PersonalResult
import app.silhouette.benefits.ai.PersonalTasks
import app.silhouette.benefits.ai.RoutingReason
import app.silhouette.benefits.core.CloudSafe
import app.silhouette.benefits.quickcheck.computeVerdicts
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.lang.reflect.Modifier

/** The person's own result (`explain.personal`, `ask.freeText`): on this device only. */
class PersonalTasksTest {
    private val content = People.content
    private val program = "food-help"

    private class FakeDevice(private vararg val replies: String) : OnDeviceText {
        val requests = mutableListOf<PersonalRequest>()
        override suspend fun generate(request: PersonalRequest): String {
            requests += request
            return replies.getOrNull(requests.size - 1) ?: error("unexpected request")
        }
    }

    private fun result(): PersonalResult {
        val t = People.strings()
        val verdict = computeVerdicts(content.pack, content.bands, content.steps, People.first).first { it.programId == program }
        val reasons = People.programs.reasons(content.steps, People.first, program)
        return People.programs.personalResult(t, program, verdict.verdict, reasons)
    }

    private fun tasks(device: OnDeviceText) = PersonalTasks(device, content.prompts, content.outputChecks)

    @Test
    fun `the personal request carries the result on screen and the exact comparison`() {
        val request = tasks(FakeDevice()).explainRequest(result())
        assertEquals(PersonalTasks.EXPLAIN_PERSONAL, request.task)
        assertTrue(request.user.contains("(limit 34,000, yours 30,524)"))
        assertTrue(request.user.contains(People.strings()("verdict.likely")))
        assertTrue(request.system.contains("English"))
        // Its string form never shows values.
        assertFalse(request.toString().contains("30,524"))
        assertFalse(result().toString().contains("30,524"))
    }

    @Test
    fun `answers are on this device with their own reasons`() = runBlocking {
        val device = FakeDevice("It is likely because your income is under the limit.", "Ask the county office.")
        val explained = tasks(device).explain(result())
        assertEquals(InferenceSource.ON_DEVICE, explained.source)
        assertEquals(RoutingReason.YOUR_RESULT_STAYS_ON_DEVICE, explained.reason)
        val asked = tasks(device).ask("Where do I apply?", result())
        assertEquals(RoutingReason.TYPED_TEXT_MAY_BE_PERSONAL, asked.reason)
        assertEquals(PersonalTasks.ASK_FREE_TEXT, device.requests[1].task)
        assertTrue(device.requests[1].user.contains("Where do I apply?"))
    }

    @Test
    fun `a typed question is cut to 500 characters and long facts are dropped before the input limit`() {
        val request = tasks(FakeDevice()).askRequest("x".repeat(2_000), result())
        assertTrue(request.user.contains("x".repeat(500)))
        assertFalse(request.user.contains("x".repeat(501)))
        val long = result().let { PersonalResult(it.locale, it.programName, "fact ".repeat(4_000), it.verdictLabel, it.criteriaLines) }
        val fitted = tasks(FakeDevice()).explainRequest(long)
        assertTrue(PersonalTasks.estimateTokens(fitted.system + fitted.user) <= PersonalTasks.MAX_INPUT_TOKENS)
        assertTrue(fitted.user.contains(long.criteriaLines))
    }

    @Test
    fun `a reply that states the result as fact is asked for once more, then refused`() {
        // The personal scope allows "may qualify" (the result on screen) but not a definite claim.
        val ok = FakeDevice("You may qualify, based on the rules.")
        runBlocking { assertEquals("You may qualify, based on the rules.", tasks(ok).explain(result()).text) }
        val retried = FakeDevice("You qualify.", "The rules say this is likely.")
        runBlocking { assertEquals("The rules say this is likely.", tasks(retried).explain(result()).text) }
        val blocked = FakeDevice("You qualify.", "You are eligible.")
        assertThrows(AnswerBlocked::class.java) { runBlocking { tasks(blocked).explain(result()) } }
        assertEquals(2, blocked.requests.size)
    }

    /** The type-level proof: a personal request cannot become a cloud-capable call. */
    @Test
    fun `a personal request is not cloud-safe and cannot be put into a cloud-capable call`() {
        assertFalse(CloudSafe::class.java.isAssignableFrom(PersonalRequest::class.java))
        assertFalse(CloudSafe::class.java.isAssignableFrom(PersonalResult::class.java))
        // ModelCall's text is CloudText, whose constructor is private: only prompts and cloud-safe values make it.
        assertTrue(CloudText::class.java.declaredConstructors.filter { !it.isSynthetic }.all { Modifier.isPrivate(it.modifiers) })
        val textFactories = CloudText.Companion::class.java.declaredMethods.filter { Modifier.isPublic(it.modifiers) }
        for (method in textFactories) {
            for (type in method.parameterTypes) {
                assertFalse("${method.name} takes $type", type == String::class.java || type == PersonalRequest::class.java || type == PersonalResult::class.java)
            }
        }
        val callTypes = ModelCall::class.java.constructors.flatMap { it.parameterTypes.toList() }.toSet()
        assertFalse(PersonalRequest::class.java in callTypes)
        assertFalse(PersonalResult::class.java in callTypes)
    }
}
