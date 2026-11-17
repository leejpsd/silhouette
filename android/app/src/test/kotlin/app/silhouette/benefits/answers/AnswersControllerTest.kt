package app.silhouette.benefits.answers

import app.silhouette.benefits.ai.ExplainLength
import app.silhouette.benefits.ai.FailureKind
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.ModelCall
import app.silhouette.benefits.ai.ModelFailure
import app.silhouette.benefits.ai.ModelPort
import app.silhouette.benefits.ai.ModelReply
import app.silhouette.benefits.ai.PersonalAnswer
import app.silhouette.benefits.ai.RoutingReason
import app.silhouette.benefits.ai.TextPlan
import app.silhouette.benefits.ai.TextTasks
import app.silhouette.benefits.quickcheck.QuickCheckAnswers
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The step before sending, consent per silhouette and destination, cancel, slow and errors. */
@OptIn(ExperimentalCoroutinesApi::class)
class AnswersControllerTest {
    /** Answers from [source] unless a failure or a held reply is queued. */
    private class Port(var source: InferenceSource = InferenceSource.ON_DEVICE) : ModelPort {
        val calls = mutableListOf<ModelCall>()
        var failure: ModelFailure? = null
        var hold: CompletableDeferred<Unit>? = null
        var text = "It helps with food costs."

        override suspend fun generate(call: ModelCall): ModelReply {
            calls += call
            hold?.await()
            failure?.let { throw it }
            return ModelReply(text, source, "test-model")
        }
    }

    private val scope = TestScope(StandardTestDispatcher())
    private val port = Port()
    private val tasks = TextTasks(port, People.content.prompts, People.content.outputChecks, People.Settings(), { true }, "cloud-model")
    private val session = AnswerSession()
    private val controller = AnswersController(scope, session, tasks)

    private fun plan(length: ExplainLength, answers: QuickCheckAnswers = People.first): Pair<TextPlan, String> {
        val silhouette = People.silhouette(answers)
        val input = People.programs.explainInput(People.strings(), "food-help")
        return tasks.planExplain(input, length) to silhouette.canonical.value
    }

    private fun start(key: String, length: ExplainLength, answers: QuickCheckAnswers = People.first) {
        val (p, content) = plan(length, answers)
        controller.startText(key, p, content)
    }

    @Test
    fun `nothing is requested before the person agrees, and keeping it here sends nothing`() {
        start("a", ExplainLength.SHORT)
        assertTrue(controller.state("a") is RequestState.Confirm)
        controller.skip("a")
        scope.advanceUntilIdle()
        assertEquals(RequestState.Skipped, controller.state("a"))
        assertTrue(port.calls.isEmpty())
    }

    @Test
    fun `the request sent is the one shown`() {
        start("a", ExplainLength.SHORT)
        val shown = (controller.state("a") as RequestState.Confirm).plan
        controller.send("a")
        scope.advanceUntilIdle()
        assertTrue(port.calls.single() === shown.call)
        assertTrue(controller.state("a") is RequestState.Done)
    }

    @Test
    fun `agreeing to a device-first request does not cover a cloud-first one`() {
        start("short", ExplainLength.SHORT)
        controller.send("short")
        scope.advanceUntilIdle()
        // Answered on the device: nothing reached the cloud.
        assertFalse(session.wasSent(plan(ExplainLength.SHORT).second))
        start("chip", ExplainLength.SHORT)
        scope.advanceUntilIdle()
        assertTrue(controller.state("chip") is RequestState.Done)
        start("long", ExplainLength.LONG)
        assertTrue(controller.state("long") is RequestState.Confirm)
    }

    @Test
    fun `consent is per silhouette`() {
        start("a", ExplainLength.LONG)
        controller.send("a")
        scope.advanceUntilIdle()
        val other = People.answers(70_000.0, "eligible")
        start("b", ExplainLength.LONG, other)
        assertTrue(controller.state("b") is RequestState.Confirm)
    }

    @Test
    fun `once the silhouette has reached the cloud, later answers say it was sent before`() {
        port.source = InferenceSource.IN_CLOUD
        start("long", ExplainLength.LONG)
        controller.send("long")
        scope.advanceUntilIdle()
        assertFalse((controller.state("long") as RequestState.Done).sentBefore)
        assertTrue(session.wasSent(plan(ExplainLength.LONG).second))
        start("short", ExplainLength.SHORT)
        scope.advanceUntilIdle()
        assertTrue((controller.state("short") as RequestState.Done).sentBefore)
    }

    @Test
    fun `answers are kept for the session and asked for once`() {
        start("a", ExplainLength.LONG)
        controller.send("a")
        scope.advanceUntilIdle()
        start("a", ExplainLength.LONG)
        scope.advanceUntilIdle()
        assertEquals(1, port.calls.size)
        assertTrue(controller.state("a") is RequestState.Done)
    }

    @Test
    fun `a slow answer says so after 15 seconds and can be cancelled`() {
        port.hold = CompletableDeferred()
        start("a", ExplainLength.LONG)
        controller.send("a")
        scope.runCurrent()
        assertEquals(RequestState.Loading(false), controller.state("a"))
        scope.advanceTimeBy(AnswersController.SLOW_AFTER_MS + 1)
        assertEquals(RequestState.Loading(true), controller.state("a"))
        controller.cancel("a")
        port.hold!!.complete(Unit)
        scope.advanceUntilIdle()
        assertEquals(RequestState.Cancelled, controller.state("a"))
    }

    @Test
    fun `the daily limit cannot be retried, other failures can, and a refused reply is blocked`() {
        port.failure = ModelFailure(FailureKind.CLOUD, "quota-daily")
        start("a", ExplainLength.LONG)
        controller.send("a")
        scope.advanceUntilIdle()
        assertEquals(RequestState.Failed("error.quotaDailyAnswers", canRetry = false), controller.state("a"))

        port.failure = ModelFailure(FailureKind.CLOUD, "IOException")
        start("b", ExplainLength.LONG)
        scope.advanceUntilIdle()
        assertEquals(RequestState.Failed("error.network", canRetry = true), controller.state("b"))

        port.failure = null
        port.text = "You may qualify."
        start("c", ExplainLength.LONG)
        scope.advanceUntilIdle()
        assertEquals(RequestState.Failed("answers.blocked", canRetry = false), controller.state("c"))
    }

    @Test
    fun `an on-device-only request has no step before it`() {
        controller.startPersonal("p") { PersonalAnswer("Text.", RoutingReason.YOUR_RESULT_STAYS_ON_DEVICE) }
        scope.advanceUntilIdle()
        assertTrue(controller.state("p") is RequestState.Done)
    }

    @Test
    fun `delete everything forgets answers, consents and what was sent`() {
        port.source = InferenceSource.IN_CLOUD
        start("a", ExplainLength.LONG)
        controller.send("a")
        scope.advanceUntilIdle()
        controller.clear()
        assertEquals(RequestState.Idle, controller.state("a"))
        assertFalse(session.wasSent(plan(ExplainLength.LONG).second))
        start("a", ExplainLength.LONG)
        assertTrue(controller.state("a") is RequestState.Confirm)
    }
}
