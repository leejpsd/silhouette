package app.silhouette.benefits.ui.screens

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.core.ProgramVerdict
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.quickcheck.groupByVerdict
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.Lead
import app.silhouette.benefits.ui.MarkKind
import app.silhouette.benefits.ui.Meta
import app.silhouette.benefits.ui.Panel
import app.silhouette.benefits.ui.PrimaryButton
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.INCOME_STEP
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.ui.ScreenHeading
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.SilhouetteMark
import app.silhouette.benefits.ui.theme.LocalDimens
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors

/** Results: programs grouped by verdict, each opening its verdict card. */
@Composable
fun ResultsContent(app: AppController) {
    val t = app.strings
    val d = LocalDimens.current
    ScreenHeading(t("results.title"))
    val entries by app.outbound.entries.collectAsState()
    // Once anything has left the device, the lead points at the list of what left.
    Lead(t(if (entries.any { it.status != OutboundLog.Status.KEPT_ON_DEVICE }) "results.leadAfterSend" else "results.lead"))
    (app.answers[INCOME_STEP] as? AnswerValue.ExactIncome)?.takeIf { it.fromDocument }?.let {
        Panel(Modifier.testTag("income-from-document")) {
            Text(t("results.fromDocument", "amount" to t.money(it.amount)), style = MaterialTheme.typography.bodyLarge)
        }
    }
    for ((verdict, programs) in groupByVerdict(app.results)) {
        Column(
            Modifier.testTag("group-${verdict.wire}"),
            verticalArrangement = Arrangement.spacedBy(d.xs),
        ) {
            Row(
                Modifier.padding(top = d.sm).semantics(mergeDescendants = true) { heading() },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(d.sm),
            ) {
                SilhouetteMark(MarkKind.Of(verdict), 36.dp)
                Text(t("verdict.${verdict.wire}"), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
            }
            for (result in programs) ProgramCard(app, t, verdict, result)
        }
    }
    if (app.results.any { it.verdict == Verdict.MAYBE }) Meta(t("results.maybeHint"))
    PrimaryButton(t("results.addDocument"), onClick = app::openDocument, modifier = Modifier.testTag("results-add-document"))
    SecondaryButton(t("results.edit"), onClick = { app.navigate(Route.Question(app.steps.first().id)) }, modifier = Modifier.testTag("results-edit"))
}

@Composable
private fun ProgramCard(app: AppController, t: Strings, verdict: Verdict, result: ProgramVerdict) {
    val d = LocalDimens.current
    val c = LocalSilhouetteColors.current
    val info = app.content.pack.programInfo.first { it.id == result.programId }
    val shape = RoundedCornerShape(d.radiusPanel)
    Surface(
        shape = shape,
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, c.border, shape)
            .clickable(role = Role.Button) { app.navigate(Route.Program(result.programId)) }
            .testTag("program-${result.programId}")
            .semantics(mergeDescendants = true) {},
    ) {
        Row(Modifier.heightIn(min = d.comfortableTapTarget).padding(d.md), horizontalArrangement = Arrangement.spacedBy(d.sm)) {
            // Each card repeats a small mark, so the verdict is visible even when the card is reached by scrolling.
            SilhouetteMark(MarkKind.Of(verdict), 24.dp, Modifier.padding(top = 2.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(d.xxs)) {
                Text(t.programName(info.id, info.name), style = MaterialTheme.typography.titleMedium)
                if (result.dependsOn.isNotEmpty()) {
                    Text(
                        t("results.dependsOn", "list" to result.dependsOn.joinToString(", ") { t("variable.$it") }),
                        style = MaterialTheme.typography.bodyMedium,
                        color = c.textMuted,
                    )
                }
                val amount = result.estimatedAmount
                if (amount != null && amount > 0) {
                    Text(t("results.estimate", "amount" to t.money(amount)), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                }
                Text(t("results.open") + " ›", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
