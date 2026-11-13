package app.silhouette.benefits.answers

import app.silhouette.benefits.ai.AnswerBlocked
import app.silhouette.benefits.ai.CallMode
import app.silhouette.benefits.ai.CloudText
import app.silhouette.benefits.ai.Destination
import app.silhouette.benefits.ai.ExplainLength
import app.silhouette.benefits.ai.FailureKind
import app.silhouette.benefits.ai.FakeModelPort
import app.silhouette.benefits.ai.FakeModelPort.Companion.fail
import app.silhouette.benefits.ai.FakeModelPort.Companion.reply
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.ModelFailure
import app.silhouette.benefits.ai.ModelPort
import app.silhouette.benefits.ai.RouteBasis
import app.silhouette.benefits.ai.RoutingReason
import app.silhouette.benefits.ai.TextPlan
import app.silhouette.benefits.ai.TextTasks
import app.silhouette.benefits.core.CriterionState
import app.silhouette.benefits.core.Public
import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.ui.screens.provenanceDetail
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** The general explanation and prepared questions: routing, the cloud retry, the output check, and what a request carries. */
class TextTasksTest {
    private val content = People.content
    private val program = "food-help"

    private fun tasks(port: ModelPort, settings: People.Settings = People.Settings(), device: Boolean = true) =
        TextTasks(port, content.prompts, content.outputChecks, settings, { device }, "cloud-model")

    private fun plan(
        length: ExplainLength = ExplainLength.SHORT,
        language: AppLanguage = AppLanguage.EN,
        settings: People.Settings = People.Settings(),
        port: ModelPort = FakeModelPort(),
        answers: app.silhouette.benefits.quickcheck.QuickCheckAnswers = People.first,
    ): TextPlan {
        val input = People.programs.explainInput(People.strings(language), People.silhouette(answers), program)
        return tasks(port, settings).planExplain(input, length)
    }

    @Test
    fun `a short explanation in a device language prefers the device, a long one or another language prefers the cloud`() {
        val short = plan()
        assertEquals(TextTasks.EXPLAIN_SHORT, short.task)
        assertEquals(CallMode.PREFER_ON_DEVICE, short.call.mode)
        assertEquals(RoutingReason.SHORT_TEXT, short.reason)
        assertEquals(Destination.DEVICE_FIRST, short.destination)

        val long = plan(ExplainLength.LONG)
        assertEquals(TextTasks.EXPLAIN_LONG, long.task)
        assertEquals(CallMode.PREFER_IN_CLOUD, long.call.mode)
        assertEquals(RoutingReason.LONG_OR_UNSUPPORTED_LOCALE, long.reason)
        assertEquals(RouteBasis.LONG, long.route!!.basis)
        assertEquals(Destination.CLOUD, long.destination)

        val spanish = plan(language = AppLanguage.ES)
        assertEquals(TextTasks.EXPLAIN_LONG, spanish.task)
        assertEquals(RouteBasis.LOCALE, spanish.route!!.basis)

        // The word limit comes from Remote Config.
        val lowLimit = plan(settings = People.Settings(shortTextMaxWords = 40))
        assertEquals(TextTasks.EXPLAIN_LONG, lowLimit.task)
        assertEquals(RouteBasis.LONG, lowLimit.route!!.basis)
    }

    @Test
    fun `a prepared question prefers the device`() {
        val input = People.programs.explainInput(People.strings(), People.silhouette(People.first), program)
        val chip = tasks(FakeModelPort()).planAskChip(input, Public.of("How do I apply?"))
        assertEquals(TextTasks.ASK_CHIP, chip.task)
        assertEquals(CallMode.PREFER_ON_DEVICE, chip.call.mode)
        assertEquals(RoutingReason.PREPARED_QUESTION, chip.reason)
        assertTrue(chip.call.user.text.contains("How do I apply?"))
    }

    @Test
    fun `a device failure is retried once in the cloud with the same request`() = runBlocking {
        val port = FakeModelPort(fail(FailureKind.DEVICE_FAILED), reply("It helps with food.", InferenceSource.IN_CLOUD))
        val p = plan(port = port)
        val answer = tasks(port).run(p)
        assertEquals(2, port.calls.size)
        assertEquals(CallMode.ONLY_IN_CLOUD, port.calls[1].mode)
        assertEquals(port.calls[0].user, port.calls[1].user)
        assertEquals(port.calls[0].system, port.calls[1].system)
        assertEquals(RoutingReason.ON_DEVICE_FAILED, answer.reason)
        assertEquals(InferenceSource.IN_CLOUD, answer.source)
        assertNull(provenanceDetail(People.strings(), answer))
    }

    @Test
    fun `a cloud failure, or any failure of a cloud-first request, is not retried`() {
        val cloud = FakeModelPort(fail(FailureKind.CLOUD, "quota-daily"))
        val failure = assertThrows(ModelFailure::class.java) { runBlocking { tasks(cloud).run(plan()) } }
        assertEquals("quota-daily", failure.reason)
        assertEquals(1, cloud.calls.size)

        val long = FakeModelPort(fail(FailureKind.DEVICE_FAILED))
        assertThrows(ModelFailure::class.java) { runBlocking { tasks(long).run(plan(ExplainLength.LONG)) } }
        assertEquals(1, long.calls.size)
    }

    @Test
    fun `an answer from the cloud on a device without a model says so`() = runBlocking {
        val none = tasks(FakeModelPort(reply("Text.", InferenceSource.IN_CLOUD)), device = false).run(plan())
        assertTrue(none.noDeviceModel)
        assertEquals(People.strings()("reason.detail.noDeviceModel"), provenanceDetail(People.strings(), none))
        val present = tasks(FakeModelPort(reply("Text.", InferenceSource.ON_DEVICE)), device = false).run(plan())
        assertFalse(present.noDeviceModel)
        assertEquals(People.strings()("reason.detail.words", "words" to 60, "limit" to 60), provenanceDetail(People.strings(), present))
        val spanish = tasks(FakeModelPort(reply("Texto.", InferenceSource.IN_CLOUD))).run(plan(language = AppLanguage.ES))
        assertTrue(provenanceDetail(People.strings(), spanish)!!.contains("Español"))
    }

    @Test
    fun `a reply that states a result is asked for once more, then refused`() = runBlocking {
        val retried = FakeModelPort(reply("Good news: you qualify.", InferenceSource.ON_DEVICE), reply("It helps with food costs.", InferenceSource.ON_DEVICE))
        assertEquals("It helps with food costs.", tasks(retried).run(plan()).text)
        assertEquals(2, retried.calls.size)

        // A model that only knows the silhouette must not state an overall result either.
        val twice = FakeModelPort(reply("You may qualify.", InferenceSource.IN_CLOUD), reply("You might qualify for this.", InferenceSource.IN_CLOUD))
        assertThrows(AnswerBlocked::class.java) { runBlocking { tasks(twice).run(plan(ExplainLength.LONG)) } }
        assertEquals(2, twice.calls.size)

        // A conditional is not a claim.
        val conditional = FakeModelPort(reply("Whether you qualify depends on your income.", InferenceSource.ON_DEVICE))
        assertEquals("Whether you qualify depends on your income.", tasks(conditional).run(plan()).text)
        assertEquals(1, conditional.calls.size)
    }

    @Test
    fun `the request carries the silhouette and silhouette-only criterion states, never a result`() {
        val p = plan()
        val text = p.call.user.text
        val verdict = People.silhouette(People.first).verdicts.value.first { it.programId == program }
        // The silhouette alone cannot settle the income limit, so it is listed as unknown.
        assertEquals(CriterionState.MIXED, verdict.criteria.first { it.id == "income-limit" }.state)
        assertTrue(text.contains(People.silhouette(People.first).canonical.value))
        assertTrue(text.contains(People.strings()("criterion.food-help.income-limit")))
        val t = People.strings()
        for (v in Verdict.entries) assertFalse(v.wire, text.contains(t("verdict.${v.wire}")))
    }

    /**
     * Canary test: two people with the same silhouette but different exact incomes, private answers
     * and results produce byte-identical cloud-capable requests, and no exact value appears in any.
     */
    @Test
    fun `cloud-capable requests are the same for everyone with the same silhouette`() {
        val onScreen = { a: app.silhouette.benefits.quickcheck.QuickCheckAnswers ->
            app.silhouette.benefits.quickcheck.computeVerdicts(content.pack, content.bands, content.steps, a).first { it.programId == program }.verdict
        }
        assertNotEquals(onScreen(People.first), onScreen(People.second))
        assertEquals(People.silhouette(People.first).canonical.value, People.silhouette(People.second).canonical.value)
        for (language in AppLanguage.entries) {
            val t = People.strings(language)
            val bodies = listOf(People.first, People.second).map { answers ->
                val input = People.programs.explainInput(t, People.silhouette(answers), program)
                val task = tasks(FakeModelPort())
                val plans = ExplainLength.entries.map { task.planExplain(input, it) } +
                    listOf("apply", "documents", "change", "offer").map { task.planAskChip(input, Public.of(t("ask.chip.$it"))) }
                plans.flatMap { listOf(it.requestBody, it.call.system.text, it.call.user.text, CloudText.of(it.call.payload).text, it.call.fields.toString()) }
            }
            assertEquals(bodies[0], bodies[1])
            for (body in bodies[0]) for (canary in People.canaries) assertFalse("$canary in $language", body.contains(canary))
        }
    }

    @Test
    fun `the step before sending shows the request it sends`() {
        val p = plan()
        val body = p.requestBody
        assertTrue(body.contains("\"systemInstruction\""))
        assertTrue(body.contains("\"contents\""))
        // Built once.
        assertTrue(body === p.requestBody)
        val json = kotlinx.serialization.json.Json.parseToJsonElement(body).jsonObject
        val user = json.getValue("contents").jsonArray[0].jsonObject.getValue("parts").jsonArray[0].jsonObject.getValue("text").jsonPrimitive.content
        val system = json.getValue("systemInstruction").jsonObject.getValue("parts").jsonArray[0].jsonObject.getValue("text").jsonPrimitive.content
        assertEquals(p.call.user.text, user)
        assertEquals(p.call.system.text, system)
    }
}
