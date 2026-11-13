package app.silhouette.benefits.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.ai.Destination
import app.silhouette.benefits.ai.ExplainLength
import app.silhouette.benefits.ai.PersonalAnswer
import app.silhouette.benefits.ai.RouteBasis
import app.silhouette.benefits.ai.RoutingReason
import app.silhouette.benefits.ai.TextAnswer
import app.silhouette.benefits.ai.TextPlan
import app.silhouette.benefits.answers.AnswerSession
import app.silhouette.benefits.answers.ProgramContext
import app.silhouette.benefits.answers.RequestState
import app.silhouette.benefits.core.CriterionState
import app.silhouette.benefits.core.ProgramVerdict
import app.silhouette.benefits.core.Public
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.InferenceBadge
import app.silhouette.benefits.ui.Meta
import app.silhouette.benefits.ui.Panel
import app.silhouette.benefits.ui.PrimaryButton
import app.silhouette.benefits.ui.PrivateNote
import app.silhouette.benefits.ui.QuietButton
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.SectionHeading
import app.silhouette.benefits.ui.StateIcon
import app.silhouette.benefits.ui.theme.LocalDimens
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors

// The parts of a program's page below the result. Nothing here is requested until the person taps.

/** Prepared questions (copy keys `ask.chip.*`). */
private val CHIPS = listOf("apply", "documents", "change", "offer")

/** "Why this result": always shown, from the rules on this device, with no model. */
@Composable
fun WhySection(app: AppController, result: ProgramVerdict) {
    val t = app.strings
    val d = LocalDimens.current
    val reasons = app.programs.reasons(app.steps, app.answers, result.programId)
    val rows = ProgramContext.whyRows(t, result.programId, reasons)
    SectionHeading(t("why.title"))
    Meta(t("why.lead"))
    Column(verticalArrangement = Arrangement.spacedBy(d.sm)) {
        for (row in rows) {
            Row(Modifier.testTag("why-${row.id}").semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(d.sm)) {
                StateIcon(row.state, stateColor(row.state), MaterialTheme.colorScheme.surface, Modifier.padding(top = 2.dp))
                Column(Modifier.weight(1f)) {
                    Text(row.label, style = MaterialTheme.typography.bodyLarge)
                    for ((limit, yours) in row.limits) {
                        Text(t("why.limitYours", "limit" to limit, "value" to yours), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("why-limit"))
                    }
                    Text(t("state.${row.state.wire}"), style = MaterialTheme.typography.bodyMedium, color = LocalSilhouetteColors.current.textMuted)
                }
            }
        }
    }
    if (app.personalAvailable) {
        val key = AnswerSession.key("explain-personal", t.language.tag, result.programId, app.answers.hashCode().toString())
        val state = app.requests.state(key)
        if (state is RequestState.Idle || state is RequestState.Failed || state is RequestState.Cancelled) {
            SecondaryButton(t("why.explain"), onClick = {
                val personal = app.personalTasks ?: return@SecondaryButton
                val input = app.programs.personalResult(t, result.programId, result.verdict, reasons)
                app.requests.startPersonal(key) { personal.explain(input) }
            }, modifier = Modifier.testTag("why-explain"))
        }
        RequestRegion(app, key, state, lines = emptyList(), notListed = false, onRetry = null)
    } else {
        Meta(t("why.unavailable"), Modifier.testTag("why-unavailable"))
    }
}

/** "About this program": the general explanation and prepared questions, from the silhouette only. */
@Composable
fun AboutSection(app: AppController, result: ProgramVerdict) {
    val t = app.strings
    val d = LocalDimens.current
    val tasks = app.textTasks ?: return
    val silhouette = app.silhouette ?: return
    val input = app.programs.explainInput(t, silhouette, result.programId)
    val content = silhouette.canonical.value
    val baseLines = ProgramContext.silhouetteLines(t, app.content, silhouette.profile.value) + t("send.line.program", "value" to input.program.name.value)
    // When the silhouette alone gives a different verdict, the answer says it only knows the silhouette.
    val differs = silhouette.verdicts.value.find { it.programId == result.programId }?.verdict != result.verdict

    SectionHeading(t("about.title"))
    Meta(t("about.lead"), Modifier.testTag("about-lead"))
    val shortKey = AnswerSession.key("explain-short", t.language.tag, content, result.programId)
    val longKey = AnswerSession.key("explain-long", t.language.tag, content, result.programId)
    val short = app.requests.state(shortKey)
    val long = app.requests.state(longKey)
    fun ask(key: String, length: ExplainLength) = app.requests.startText(key, tasks.planExplain(input, length), content)
    if (short.canStart()) SecondaryButton(t("about.explain"), onClick = { ask(shortKey, ExplainLength.SHORT) }, modifier = Modifier.testTag("about-explain"))
    RequestRegion(app, shortKey, short, baseLines, notListed = true, onRetry = { ask(shortKey, ExplainLength.SHORT) }, silhouetteNote = differs)
    if (short is RequestState.Done && long.canStart()) {
        QuietButton(t("answers.explainLong"), onClick = { ask(longKey, ExplainLength.LONG) }, modifier = Modifier.testTag("about-long"))
    }
    if (long !is RequestState.Idle) RequestRegion(app, longKey, long, baseLines, notListed = true, onRetry = { ask(longKey, ExplainLength.LONG) }, silhouetteNote = differs)

    SectionHeading(t("ask.chips"))
    Column(verticalArrangement = Arrangement.spacedBy(d.xs)) {
        for (chip in CHIPS) {
            val question = t("ask.chip.$chip")
            val key = AnswerSession.key("ask-chip", t.language.tag, content, result.programId, chip)
            val state = app.requests.state(key)
            fun askChip() = app.requests.startText(key, tasks.planAskChip(input, Public.of(question)), content)
            SecondaryButton(question, onClick = { if (state !is RequestState.Loading) askChip() }, modifier = Modifier.testTag("chip-$chip"))
            RequestRegion(app, key, state, baseLines + t("send.line.question", "value" to question), notListed = true, onRetry = ::askChip, silhouetteNote = differs)
        }
    }
}

/** A typed question: answered on this device only, because what is typed may be personal. */
@Composable
fun FreeTextQuestion(app: AppController, result: ProgramVerdict) {
    val t = app.strings
    SectionHeading(t("ask.title"))
    if (!app.personalAvailable) {
        Meta(t("ask.free.unavailable"), Modifier.testTag("ask-free-unavailable"))
        return
    }
    // What is typed may be personal: kept in memory only, never in saved instance state.
    var question by remember(result.programId) { mutableStateOf("") }
    var empty by remember(result.programId) { mutableStateOf(false) }
    var asked by remember(result.programId) { mutableStateOf("") }
    OutlinedTextField(
        value = question,
        onValueChange = {
            question = it
            empty = false
        },
        label = { Text(t("ask.free.label")) },
        modifier = Modifier.fillMaxWidth().testTag("ask-free-field"),
    )
    PrivateNote(t("ask.free.help"))
    if (empty) Text(t("ask.free.empty"), color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
    PrimaryButton(t("ask.free.send"), onClick = {
        if (question.isBlank()) {
            empty = true
            return@PrimaryButton
        }
        asked = question
        val personal = app.personalTasks ?: return@PrimaryButton
        val reasons = app.programs.reasons(app.steps, app.answers, result.programId)
        val input = app.programs.personalResult(t, result.programId, result.verdict, reasons)
        val typed = question
        app.requests.startPersonal(AnswerSession.key("ask-free", t.language.tag, result.programId, typed.hashCode().toString())) { personal.ask(typed, input) }
    }, modifier = Modifier.testTag("ask-free-send"))
    if (asked.isNotEmpty()) {
        val key = AnswerSession.key("ask-free", t.language.tag, result.programId, asked.hashCode().toString())
        RequestRegion(app, key, app.requests.state(key), emptyList(), notListed = false, onRetry = null)
    }
}

private fun RequestState.canStart() = this is RequestState.Idle || this is RequestState.Skipped || this is RequestState.Cancelled

/** One request: the step before sending, loading with Cancel, the answer, or what went wrong. */
@Composable
private fun RequestRegion(
    app: AppController,
    key: String,
    state: RequestState,
    lines: List<String>,
    notListed: Boolean,
    onRetry: (() -> Unit)?,
    silhouetteNote: Boolean = false,
) {
    val t = app.strings
    val d = LocalDimens.current
    when (state) {
        RequestState.Idle -> Unit
        is RequestState.Confirm -> SendPanel(t, state.plan, lines, notListed, onSend = { app.requests.send(key) }, onSkip = { app.requests.skip(key) })
        is RequestState.Loading -> Column(verticalArrangement = Arrangement.spacedBy(d.xs)) {
            Meta(t("answers.loading"), Modifier.testTag("answer-loading").semantics { liveRegion = LiveRegionMode.Polite })
            if (state.slow) Meta(t("answers.slow"), Modifier.testTag("answer-slow"))
            QuietButton(t("answers.cancel"), onClick = { app.requests.cancel(key) }, modifier = Modifier.testTag("answer-cancel"))
        }
        is RequestState.Done -> AnswerView(t, state, silhouetteNote)
        is RequestState.Failed -> Column(verticalArrangement = Arrangement.spacedBy(d.xs), modifier = Modifier.testTag("answer-error")) {
            Text(t(state.errorKey), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
            if (state.canRetry && onRetry != null) QuietButton(t("answers.retry"), onClick = onRetry)
        }
        RequestState.Skipped -> Meta(t("send.skipped"), Modifier.testTag("answer-skipped"))
        RequestState.Cancelled -> Meta(t("answers.cancelled"), Modifier.testTag("answer-cancelled"))
    }
}

@Composable
private fun AnswerView(t: Strings, state: RequestState.Done, silhouetteNote: Boolean) {
    Panel(Modifier.testTag("answer")) {
        if (state.sentBefore) Meta(t("send.once"))
        when (val a = state.answer) {
            is TextAnswer -> {
                for (para in a.text.split(Regex("\n{2,}"))) Text(para, style = MaterialTheme.typography.bodyLarge)
                InferenceBadge(t, a.source, a.reason.key, detail = provenanceDetail(t, a))
                if (a.reason == RoutingReason.ON_DEVICE_FAILED) Meta(t("answers.retried"))
                if (silhouetteNote) Meta(t("answers.silhouetteNote"))
            }
            is PersonalAnswer -> {
                for (para in a.text.split(Regex("\n{2,}"))) Text(para, style = MaterialTheme.typography.bodyLarge)
                InferenceBadge(t, a.source, a.reason.key)
            }
        }
    }
}

/** The detail after the reason: what decided where the request ran. */
fun provenanceDetail(t: Strings, a: TextAnswer): String? {
    if (a.noDeviceModel) return t("reason.detail.noDeviceModel")
    if (a.reason == RoutingReason.ON_DEVICE_FAILED) return null
    val route = a.route ?: return null
    return when (route.basis) {
        RouteBasis.LOCALE -> t("reason.detail.locale", "language" to (AppLanguage.fromTag(route.locale)?.nativeName ?: route.locale))
        RouteBasis.SHORT, RouteBasis.LONG -> t("reason.detail.words", "words" to route.words, "limit" to route.maxShortWords)
    }
}

/** The step before sending: the silhouette lines and the exact request, then Send or keep everything here. */
@Composable
private fun SendPanel(t: Strings, plan: TextPlan, lines: List<String>, notListed: Boolean, onSend: () -> Unit, onSkip: () -> Unit) {
    val d = LocalDimens.current
    val c = LocalSilhouetteColors.current
    var showJson by rememberSaveable { mutableStateOf(false) }
    Panel(Modifier.testTag("send-panel")) {
        SectionHeading(t("send.title"))
        Text(
            if (plan.destination == Destination.CLOUD) t("send.leadCloud") else t("send.lead"),
            style = MaterialTheme.typography.bodyLarge,
        )
        Column(Modifier.testTag("send-lines"), verticalArrangement = Arrangement.spacedBy(d.xxs)) {
            for (line in lines) Text("• $line", style = MaterialTheme.typography.bodyMedium)
            if (notListed) Text("• " + t("send.notListed"), style = MaterialTheme.typography.bodyMedium)
            Text("• " + t("outbound.model", "model" to plan.model), style = MaterialTheme.typography.bodyMedium)
        }
        Meta(t("send.notSent"))
        Meta(t("leaving.network"))
        QuietButton(t("send.showJson"), onClick = { showJson = !showJson }, modifier = Modifier.testTag("send-show-json"))
        if (showJson) {
            Text(
                plan.requestBody,
                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(c.surfaceSunken, RoundedCornerShape(d.radiusControl))
                    .horizontalScroll(rememberScrollState())
                    .padding(d.xs)
                    .testTag("send-payload"),
                softWrap = false,
            )
        }
        PrimaryButton(t("send.send"), onClick = onSend, modifier = Modifier.testTag("send-send"))
        SecondaryButton(t("send.skip"), onClick = onSkip, modifier = Modifier.testTag("send-skip"))
    }
}

@Composable
private fun stateColor(state: CriterionState) = with(LocalSilhouetteColors.current) {
    when (state) {
        CriterionState.PASS -> verdictLikely
        CriterionState.FAIL -> verdictUnlikely
        CriterionState.MIXED -> verdictMaybe
        CriterionState.UNKNOWN -> verdictDepends
    }
}
