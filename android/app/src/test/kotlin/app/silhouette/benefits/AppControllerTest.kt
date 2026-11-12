package app.silhouette.benefits

import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.data.AnswerRepository
import app.silhouette.benefits.data.LanguageStore
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.INCOME_STEP
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.Route
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AppControllerTest {
    private class FakeRepository(var stored: JsonElement? = null) : AnswerRepository {
        var deleted = 0
        override fun load() = stored
        override fun save(answers: JsonObject) {
            stored = answers
        }
        override fun deleteAll() {
            stored = null
            deleted++
        }
    }

    private class FakeLanguage(var chosen: AppLanguage? = null) : LanguageStore {
        override fun current() = chosen ?: AppLanguage.EN
        override fun set(language: AppLanguage) {
            chosen = language
        }
        override fun clear() {
            chosen = null
        }
    }

    private val dispatcher = StandardTestDispatcher()
    private val scope = TestScope(dispatcher)
    private val repository = FakeRepository()
    private val language = FakeLanguage()
    private val outbound = OutboundLog()
    private val app = AppController(TestContent.content, repository, language, outbound, scope, dispatcher)
    private val steps = TestContent.content.steps

    private fun loaded(): AppController {
        app.load()
        scope.advanceUntilIdle()
        return app
    }

    @Test
    fun `walks the questions in order, then shows results`() {
        loaded()
        app.begin()
        for (step in steps) {
            assertEquals(Route.Question(step.id), app.route)
            app.answer(step.id, null)
        }
        assertEquals(Route.Results, app.route)
        scope.advanceUntilIdle()
        assertEquals(steps.size, (repository.stored as JsonObject).size)
    }

    @Test
    fun `continue resumes at the first open question and back goes to the previous one`() {
        loaded()
        app.begin()
        app.answer(steps[0].id, AnswerValue.Count(2))
        app.navigate(Route.Start)
        app.begin()
        assertEquals(Route.Question(steps[1].id), app.route)
        assertTrue(app.back())
        assertEquals(Route.Question(steps[0].id), app.route)
        assertTrue(app.back())
        assertEquals(Route.Start, app.route)
        assertFalse(app.back())
    }

    @Test
    fun `an answer opened from a program returns to that program`() {
        loaded()
        app.navigate(Route.Question("residentStatus", then = Route.Program("food-help")))
        app.answer("residentStatus", AnswerValue.Choice("eligible"))
        assertEquals(Route.Program("food-help"), app.route)
        app.navigate(Route.Question("residentStatus", then = Route.Program("food-help")))
        app.back()
        assertEquals(Route.Program("food-help"), app.route)
    }

    @Test
    fun `stored answers are loaded and feed the verdicts`() {
        repository.stored = kotlinx.serialization.json.Json.parseToJsonElement(
            """{"income":{"exact":19000},"householdSize":1,"residentStatus":"eligible"}""",
        )
        loaded()
        assertTrue(app.started)
        assertEquals(Verdict.LIKELY, app.results.first { it.programId == "food-help" }.verdict)
        app.answer(INCOME_STEP, AnswerValue.ExactIncome(90000))
        assertEquals(Verdict.UNLIKELY, app.results.first { it.programId == "food-help" }.verdict)
    }

    @Test
    fun `delete everything clears answers, store, language and the outbound log`() {
        loaded()
        app.setLanguage(AppLanguage.KO)
        app.answer(steps[0].id, AnswerValue.Count(2))
        outbound.record(OutboundLog.Entry(OutboundLog.Channel.OTHER, 0, "example.test", listOf("x")))
        scope.advanceUntilIdle()
        app.deleteEverything()
        scope.advanceUntilIdle()
        assertTrue(app.answers.isEmpty())
        assertNull(repository.stored)
        assertEquals(1, repository.deleted)
        assertNull(language.chosen)
        assertEquals(AppLanguage.EN, app.strings.language)
        assertTrue(outbound.entries.value.isEmpty())
        assertEquals(Route.Start, app.route)
        assertEquals("delete.done", app.notice)
    }

    @Test
    fun `start over forgets the answers`() {
        loaded()
        app.answer(steps[0].id, AnswerValue.Count(2))
        app.restart()
        scope.advanceUntilIdle()
        assertTrue(app.answers.isEmpty())
        assertEquals(JsonObject(emptyMap()), repository.stored)
        assertEquals(Route.Question(steps[0].id), app.route)
    }

    @Test
    fun `the language switch changes the copy immediately and is remembered`() {
        loaded()
        app.setLanguage(AppLanguage.ES)
        assertEquals(AppLanguage.ES, language.chosen)
        assertEquals(TestContent.content.sharedCopy.getValue(AppLanguage.ES)["start.begin"], app.strings("start.begin"))
    }
}
