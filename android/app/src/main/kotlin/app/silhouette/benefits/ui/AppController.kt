package app.silhouette.benefits.ui

import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.silhouette.benefits.content.AppContent
import app.silhouette.benefits.core.ProgramVerdict
import app.silhouette.benefits.data.AnswerRepository
import app.silhouette.benefits.data.LanguageStore
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.QuickCheckAnswers
import app.silhouette.benefits.quickcheck.Step
import app.silhouette.benefits.quickcheck.computeVerdicts
import app.silhouette.benefits.quickcheck.decodeAnswers
import app.silhouette.benefits.quickcheck.encodeAnswers
import app.silhouette.benefits.quickcheck.firstOpenStep
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Where the user is. */
sealed interface Route {
    data object Start : Route

    /** A question. [then] is where to go after it, when it was opened from a program's "Answer" button. */
    data class Question(val stepId: String, val then: Route? = null) : Route

    data object Results : Route

    data class Program(val id: String) : Route
}

/**
 * App state and navigation. Answers live in memory and in the encrypted store; every change is
 * saved right after the user acts, never from a background effect, so "Delete everything" is not
 * followed by a write that brings the data back.
 *
 * Storage calls run on [io], which must run one task at a time so saves and deletes keep their order.
 */
class AppController(
    val content: AppContent,
    private val repository: AnswerRepository,
    private val languageStore: LanguageStore,
    val outbound: OutboundLog,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher,
) {
    val steps: List<Step> get() = content.steps

    var strings: Strings by mutableStateOf(content.strings(languageStore.current()))
        private set

    var answers: QuickCheckAnswers by mutableStateOf(QuickCheckAnswers())
        private set

    var route: Route by mutableStateOf(Route.Start)
        private set

    var loaded: Boolean by mutableStateOf(false)
        private set

    /** A copy key shown once on the start screen (after "Delete everything"). */
    var notice: String? by mutableStateOf(null)
        private set

    val results: List<ProgramVerdict> by derivedStateOf {
        computeVerdicts(content.pack, content.bands, content.steps, answers)
    }

    val started: Boolean get() = !answers.isEmpty()

    fun load() {
        scope.launch {
            val stored = withContext(io) { runCatching { repository.load() }.getOrNull() }
            answers = decodeAnswers(steps, stored)
            loaded = true
        }
    }

    fun setLanguage(language: AppLanguage) {
        strings = strings.withLanguage(language)
        languageStore.set(language)
    }

    /** Picks up a language change made outside the app (system per-app language settings). */
    fun refreshLanguage() {
        val current = languageStore.current()
        if (current != strings.language) strings = strings.withLanguage(current)
    }

    fun navigate(to: Route) {
        if (to !is Route.Start) notice = null
        route = to
    }

    /** "Start" or "Continue" on the start screen. */
    fun begin() {
        if (!started) return navigate(Route.Question(steps.first().id))
        val open = firstOpenStep(steps, answers)
        navigate(if (open < steps.size) Route.Question(steps[open].id) else Route.Results)
    }

    /** "Start over": forget the answers and ask the first question. */
    fun restart() {
        answers = QuickCheckAnswers()
        persist()
        navigate(Route.Question(steps.first().id))
    }

    /** Records an answer (null = skipped) and moves on. */
    fun answer(stepId: String, value: AnswerValue?) {
        answers = answers.with(stepId, value)
        persist()
        val current = route
        navigate(nextAfter(stepId, (current as? Route.Question)?.then))
    }

    private fun nextAfter(stepId: String, then: Route?): Route {
        if (then != null) return then
        val index = steps.indexOfFirst { it.id == stepId }
        return steps.getOrNull(index + 1)?.let { Route.Question(it.id) } ?: Route.Results
    }

    /** In-app and system back. Returns false at the start screen, where back leaves the app. */
    fun back(): Boolean {
        when (val r = route) {
            Route.Start -> return false
            is Route.Question -> {
                if (r.then != null) {
                    navigate(r.then)
                } else {
                    val index = steps.indexOfFirst { it.id == r.stepId }
                    navigate(steps.getOrNull(index - 1)?.let { Route.Question(it.id) } ?: Route.Start)
                }
            }
            Route.Results -> navigate(Route.Start)
            is Route.Program -> navigate(Route.Results)
        }
        return true
    }

    fun deleteEverything(onDone: () -> Unit = {}) {
        answers = QuickCheckAnswers()
        outbound.clear()
        scope.launch {
            withContext(io) { repository.deleteAll() }
            languageStore.clear()
            strings = strings.withLanguage(languageStore.current())
            route = Route.Start
            notice = "delete.done"
            onDone()
        }
    }

    private fun persist() {
        val snapshot = encodeAnswers(answers)
        scope.launch(io) { repository.save(snapshot) }
    }
}
