package app.silhouette.benefits.answers

import androidx.compose.runtime.mutableStateMapOf
import app.silhouette.benefits.ai.AnswerBlocked
import app.silhouette.benefits.ai.FailureKind
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.ai.ModelFailure
import app.silhouette.benefits.ai.PersonalAnswer
import app.silhouette.benefits.ai.TextAnswer
import app.silhouette.benefits.ai.TextPlan
import app.silhouette.benefits.ai.TextTasks
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Where one request stands. */
sealed interface RequestState {
    data object Idle : RequestState

    /** The step before sending: [plan] is shown and is exactly what will be sent. */
    data class Confirm(val plan: TextPlan) : RequestState

    data class Loading(val slow: Boolean) : RequestState

    /** [answer] is a [TextAnswer] or a [PersonalAnswer]. [sentBefore]: no step was shown because this silhouette already reached the cloud. */
    data class Done(val answer: Any, val sentBefore: Boolean) : RequestState

    /** [errorKey] is a copy key; [canRetry] is false for a blocked answer and the daily limit. */
    data class Failed(val errorKey: String, val canRetry: Boolean) : RequestState

    data object Skipped : RequestState

    data object Cancelled : RequestState
}

/**
 * Runs explanation and question requests on tap, never automatically. Cloud-capable requests pass
 * through the step before sending unless the person already agreed for this silhouette and
 * destination; a late reply after "Cancel" is never shown.
 */
class AnswersController(
    private val scope: CoroutineScope,
    private val session: AnswerSession,
    private val text: TextTasks?,
    private val slowAfterMs: Long = SLOW_AFTER_MS,
) {
    private val states = mutableStateMapOf<String, RequestState>()
    private val pending = HashMap<String, Pair<TextPlan, String>>()
    private val jobs = HashMap<String, Job>()

    fun state(key: String): RequestState = states[key] ?: session.cached(key)?.let { RequestState.Done(it, false) } ?: RequestState.Idle

    /** A cloud-capable request for [content] (the canonical silhouette). */
    fun startText(key: String, plan: TextPlan, content: String) {
        session.cached(key)?.let {
            states[key] = RequestState.Done(it, false)
            return
        }
        if (session.needsConsent(content, plan.destination)) {
            pending[key] = plan to content
            states[key] = RequestState.Confirm(plan)
            return
        }
        execute(key, sentBefore = session.wasSent(content)) { runText(plan, content) }
    }

    fun send(key: String) {
        val (plan, content) = pending.remove(key) ?: return
        session.giveConsent(content, plan.destination)
        execute(key, sentBefore = false) { runText(plan, content) }
    }

    fun skip(key: String) {
        pending.remove(key)
        states[key] = RequestState.Skipped
    }

    /** An on-device-only request: nothing can leave the device, so there is no step before it. */
    fun startPersonal(key: String, run: suspend () -> PersonalAnswer) {
        session.cached(key)?.let {
            states[key] = RequestState.Done(it, false)
            return
        }
        execute(key, sentBefore = false, run)
    }

    fun cancel(key: String) {
        jobs.remove(key)?.cancel()
        states[key] = RequestState.Cancelled
    }

    /** "Delete everything": stops every request and forgets every answer, consent and record of sending. */
    fun clear() {
        jobs.values.forEach { it.cancel() }
        jobs.clear()
        pending.clear()
        states.clear()
        session.clear()
    }

    private suspend fun runText(plan: TextPlan, content: String): TextAnswer {
        val answer = (text ?: throw IllegalStateException("no model")).run(plan)
        if (answer.source == InferenceSource.IN_CLOUD) session.markSent(content)
        return answer
    }

    private fun execute(key: String, sentBefore: Boolean, run: suspend () -> Any) {
        jobs.remove(key)?.cancel()
        states[key] = RequestState.Loading(false)
        lateinit var job: Job
        job = scope.launch(start = CoroutineStart.LAZY) {
            val slow = launch {
                delay(slowAfterMs)
                if (states[key] is RequestState.Loading) states[key] = RequestState.Loading(true)
            }
            try {
                val answer = run()
                session.store(key, answer)
                states[key] = RequestState.Done(answer, sentBefore)
            } catch (e: CancellationException) {
                throw e
            } catch (_: AnswerBlocked) {
                states[key] = RequestState.Failed("answers.blocked", canRetry = false)
            } catch (failure: ModelFailure) {
                val key2 = errorKey(failure)
                states[key] = RequestState.Failed(key2, canRetry = key2 != "error.quotaDailyAnswers")
            } catch (_: Exception) {
                states[key] = RequestState.Failed("answers.error", canRetry = true)
            } finally {
                slow.cancel()
                // A newer request for the same key may have replaced this one.
                if (jobs[key] === job) jobs.remove(key)
            }
        }
        jobs[key] = job
        job.start()
    }

    companion object {
        const val SLOW_AFTER_MS: Long = 15_000

        /** The copy key for a failed answer. Reasons are SDK error names or short codes, never user values. */
        fun errorKey(failure: ModelFailure): String = when {
            failure.reason == "quota-daily" -> "error.quotaDailyAnswers"
            failure.reason.contains("Quota", ignoreCase = true) -> "error.quota"
            failure.kind != FailureKind.CLOUD -> "error.on-device-unavailable"
            failure.reason.contains("Timeout") || failure.reason.contains("IOException") || failure.reason.contains("UnknownHost") -> "error.network"
            failure.reason.contains("Permission") || failure.reason.contains("InvalidAPIKey") -> "error.permission"
            else -> "answers.error"
        }
    }
}
