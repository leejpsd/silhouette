package app.silhouette.benefits.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.quickcheck.AnswerError
import app.silhouette.benefits.quickcheck.Draft
import app.silhouette.benefits.quickcheck.EXACT_CHOICE
import app.silhouette.benefits.quickcheck.MAX_EXACT_INCOME
import app.silhouette.benefits.quickcheck.parseIncomeAmount
import app.silhouette.benefits.quickcheck.Step
import app.silhouette.benefits.quickcheck.draftToValue
import app.silhouette.benefits.quickcheck.incomeAmountError
import app.silhouette.benefits.quickcheck.initialDraft
import app.silhouette.benefits.quickcheck.stepCount
import app.silhouette.benefits.quickcheck.validateAnswer
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.CheckRow
import app.silhouette.benefits.ui.ChoiceRow
import app.silhouette.benefits.ui.Lead
import app.silhouette.benefits.ui.PrimaryButton
import app.silhouette.benefits.ui.PrivateNote
import app.silhouette.benefits.ui.QuietButton
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.ui.ScreenHeading
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.theme.LocalDimens
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors

/** One question per screen. Every question can be skipped; sensitive ones say the answer never leaves the device. */
@Composable
fun QuestionContent(app: AppController, route: Route.Question) {
    val t = app.strings
    val d = LocalDimens.current
    val index = app.steps.indexOfFirst { it.id == route.stepId }
    val step = app.steps.getOrNull(index) ?: return Lead(t("results.empty"))

    val initial = initialDraft(step, app.answers[step.id])
    var text by rememberSaveable(step.id) { mutableStateOf(initial.text) }
    var choice by rememberSaveable(step.id) { mutableStateOf(initial.choice) }
    // Multi-select values are slugs, so a newline-joined string is a safe saveable form.
    var picked by rememberSaveable(step.id) { mutableStateOf(initial.picked.joinToString("\n")) }
    var errorText by rememberSaveable(step.id) { mutableStateOf<String?>(null) }
    val pickedList = picked.split("\n").filter { it.isNotEmpty() }

    fun submit() {
        val value = draftToValue(step, Draft(text, choice, pickedList))
        val problem = if (value == null) {
            if (step is Step.IntQuestion) AnswerError.INTEGER else AnswerError.CHOOSE
        } else {
            validateAnswer(step, value)
        }
        if (problem != null) {
            // A refused typed income says which rule it broke.
            val shown = if (problem == AnswerError.AMOUNT && step is Step.Income && choice == EXACT_CHOICE) incomeAmountError(text) else problem
            errorText = if (step is Step.IntQuestion) t(shown.copyKey, "min" to step.min, "max" to step.max) else t(shown.copyKey)
            return
        }
        app.answer(step.id, value)
    }

    ProgressLine(t, index, app.steps.size)
    ScreenHeading(t("question.${step.id}.label"))
    t.lookup("question.${step.id}.help")?.let { Lead(t("question.${step.id}.help")) }
    if (step.sensitive) PrivateNote(t("sensitive.note"), Modifier.testTag("sensitive-note"))

    when (step) {
        is Step.IntQuestion -> Stepper(
            t = t,
            step = step,
            text = text,
            label = t("question.${step.id}.label"),
            isError = errorText != null,
            onText = {
                text = it
                errorText = null
            },
            onDone = ::submit,
        )
        is Step.EnumQuestion -> Choices(step.values.map { it to t("option.${step.id}.$it") }, choice) {
            choice = it
            errorText = null
        }
        is Step.BoolQuestion -> Choices(listOf("true", "false").map { it to t("option.${step.id}.$it") }, choice) {
            choice = it
            errorText = null
        }
        is Step.MultiQuestion -> Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(d.xs)) {
            for (value in step.values) {
                CheckRow(
                    t("option.${step.id}.$value"),
                    checked = value in pickedList,
                    onToggle = { on ->
                        picked = (if (on) pickedList + value else pickedList - value).joinToString("\n")
                        errorText = null
                    },
                    modifier = Modifier.testTag("option-$value"),
                )
            }
        }
        is Step.Income -> {
            Choices(step.bands.map { it.id to t.bandLabel(it) } + (EXACT_CHOICE to t("income.exact.option")), choice) {
                choice = it
                errorText = null
            }
            if (choice == EXACT_CHOICE) {
                OutlinedTextField(
                    value = text,
                    onValueChange = {
                        text = it
                        errorText = null
                    },
                    label = { Text(t("income.exact.label")) },
                    singleLine = true,
                    isError = errorText != null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    textStyle = MaterialTheme.typography.bodyLarge,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("exact-income")
                        .semantics { errorText?.let { error(it) } },
                )
                // Show the amount exactly as understood, so a misplaced separator is caught before continuing.
                parseIncomeAmount(text)?.takeIf { text.isNotBlank() && it <= MAX_EXACT_INCOME }?.let { amount ->
                    Text(
                        t("q.amountUnderstood", "amount" to t.decimal(amount)),
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier
                            .testTag("amount-understood")
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
                PrivateNote(t("q.private"), Modifier.testTag("exact-private-note"))
            }
        }
    }

    errorText?.let {
        Text(
            it,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier
                .testTag("question-error")
                .semantics { liveRegion = LiveRegionMode.Assertive },
        )
    }

    val isLast = index == app.steps.size - 1 && route.then == null
    PrimaryButton(if (isLast) t("q.finish") else t("q.next"), onClick = ::submit, modifier = Modifier.testTag("question-next"))
    SecondaryButton(t("q.skip"), onClick = { app.answer(step.id, null) }, modifier = Modifier.testTag("question-skip"))
    QuietButton(t("q.back"), onClick = { app.back() }, modifier = Modifier.testTag("question-back"))
}

@Composable
private fun ProgressLine(t: Strings, index: Int, total: Int) {
    val d = LocalDimens.current
    val c = LocalSilhouetteColors.current
    Column(verticalArrangement = Arrangement.spacedBy(d.xs)) {
        Text(
            t("q.progress", "n" to index + 1, "total" to total),
            style = MaterialTheme.typography.bodyMedium,
            color = c.textMuted,
            modifier = Modifier.testTag("question-progress"),
        )
        Row(Modifier.fillMaxWidth().clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(d.xxs)) {
            repeat(total) { i ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(6.dp)
                        .background(if (i <= index) MaterialTheme.colorScheme.primary else c.border, RoundedCornerShape(3.dp)),
                )
            }
        }
    }
}

@Composable
private fun Choices(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    val d = LocalDimens.current
    Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(d.xs)) {
        for ((value, label) in options) {
            ChoiceRow(label, selected = selected == value, onSelect = { onSelect(value) }, modifier = Modifier.testTag("option-$value"))
        }
    }
}

@Composable
private fun Stepper(
    t: Strings,
    step: Step.IntQuestion,
    text: String,
    label: String,
    isError: Boolean,
    onText: (String) -> Unit,
    onDone: () -> Unit,
) {
    val d = LocalDimens.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(d.sm)) {
        StepButton("−", t("q.decrease"), "stepper-decrease") { onText(stepCount(step, text, -1)) }
        OutlinedTextField(
            value = text,
            onValueChange = onText,
            singleLine = true,
            isError = isError,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onDone() }),
            textStyle = MaterialTheme.typography.headlineMedium.copy(textAlign = TextAlign.Center),
            modifier = Modifier
                .weight(1f)
                .heightIn(min = d.comfortableTapTarget)
                .testTag("stepper-value")
                .semantics { contentDescription = label },
        )
        StepButton("+", t("q.increase"), "stepper-increase") { onText(stepCount(step, text, 1)) }
    }
}

@Composable
private fun StepButton(symbol: String, description: String, tag: String, onClick: () -> Unit) {
    val d = LocalDimens.current
    FilledTonalButton(
        onClick = onClick,
        shape = RoundedCornerShape(d.radiusControl),
        modifier = Modifier
            .sizeIn(minWidth = d.comfortableTapTarget, minHeight = d.comfortableTapTarget)
            .testTag(tag)
            .semantics { contentDescription = description },
        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
    ) { Text(symbol, style = MaterialTheme.typography.titleLarge, modifier = Modifier.clearAndSetSemantics {}) }
}
