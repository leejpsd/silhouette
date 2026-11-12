package app.silhouette.benefits.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.core.CriterionState
import app.silhouette.benefits.quickcheck.stepForVariable
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.BulletList
import app.silhouette.benefits.ui.MarkKind
import app.silhouette.benefits.ui.Meta
import app.silhouette.benefits.ui.Panel
import app.silhouette.benefits.ui.QuietButton
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.ui.ScreenHeading
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.SectionHeading
import app.silhouette.benefits.ui.SilhouetteMark
import app.silhouette.benefits.ui.StateIcon
import app.silhouette.benefits.ui.theme.LocalDimens
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors

/** Verdict card: criteria with their state, what the result depends on, the amount and the pack's status. */
@Composable
fun ProgramContent(app: AppController, route: Route.Program) {
    val t = app.strings
    val d = LocalDimens.current
    val c = LocalSilhouetteColors.current
    val info = app.content.pack.programInfo.find { it.id == route.id }
    val result = app.results.find { it.programId == route.id }
    if (info == null || result == null) {
        ScreenHeading(t("results.title"))
        SecondaryButton(t("detail.back"), onClick = { app.navigate(Route.Results) })
        return
    }
    ScreenHeading(t.programName(info.id, info.name))
    Row(
        Modifier.testTag("verdict-line").semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(d.sm),
    ) {
        SilhouetteMark(MarkKind.Of(result.verdict), 48.dp)
        Text(
            t("verdict.${result.verdict.wire}"),
            style = MaterialTheme.typography.titleLarge,
            color = c.verdict(result.verdict),
            modifier = Modifier.testTag("verdict-${result.verdict.wire}"),
        )
    }
    val amount = result.estimatedAmount
    if (amount != null && amount > 0) {
        Text(t("detail.amount", "amount" to t.number(amount.toLong())), style = MaterialTheme.typography.titleMedium)
    }
    info.period?.let { Meta(t("detail.period", "period" to it)) }
    if (info.caveats.isNotEmpty()) {
        Panel {
            SectionHeading(t("detail.caveats"))
            BulletList(info.caveats.map { t("caveat.$it") })
        }
    }

    SectionHeading(t("detail.criteria"))
    Column(verticalArrangement = Arrangement.spacedBy(d.sm)) {
        for (criterion in result.criteria) {
            Row(
                Modifier.testTag("criterion-${criterion.id}").semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(d.sm),
            ) {
                StateIcon(criterion.state, stateColor(criterion.state), MaterialTheme.colorScheme.surface, Modifier.padding(top = 2.dp))
                Column(Modifier.weight(1f)) {
                    Text(t("criterion.${info.id}.${criterion.id}"), style = MaterialTheme.typography.bodyLarge)
                    Text(t("state.${criterion.state.wire}"), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                }
            }
        }
    }

    if (result.dependsOn.isNotEmpty()) {
        SectionHeading(t("detail.dependsOn"))
        for (variable in result.dependsOn) {
            SecondaryButton(
                t("detail.answer", "question" to t("variable.$variable")),
                onClick = { app.navigate(Route.Question(stepForVariable(variable), then = Route.Program(info.id))) },
                modifier = Modifier.testTag("answer-$variable"),
            )
        }
    }

    Meta(app.content.pack.verifiedOn?.let { t("rules.verifiedOn", "date" to it) } ?: t("detail.unverified"))
    QuietButton(t("detail.back"), onClick = { app.navigate(Route.Results) }, modifier = Modifier.testTag("detail-back"))
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
