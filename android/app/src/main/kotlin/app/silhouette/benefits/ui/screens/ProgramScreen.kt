package app.silhouette.benefits.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.layout.Column
import app.silhouette.benefits.core.ProgramInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
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
        Text(t("detail.amount", "amount" to t.money(amount)), style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("program-amount"))
    }
    info.period?.let { Meta(t("detail.period", "period" to t.packPeriod(it)), Modifier.testTag("program-period")) }
    if (info.caveats.isNotEmpty()) {
        Panel {
            SectionHeading(t("detail.caveats"))
            BulletList(info.caveats.map { t("caveat.$it") })
        }
    }

    // The criteria with their states and limits, from the rules on this device.
    WhySection(app, result)

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

    AboutSection(app, result)
    FreeTextQuestion(app, result)

    // A draft pack shows its notice where a confirmed pack would show the unverified note, never both.
    val pack = app.content.pack
    Meta(
        when {
            pack.verifiedOn != null -> t("rules.verifiedOn", "date" to pack.verifiedOn!!)
            pack.isDraft && pack.sourcesReadOn != null -> t("pack.draft.notice", "date" to t.packDate(pack.sourcesReadOn!!))
            else -> t("detail.unverified")
        },
        Modifier.testTag("rules-status"),
    )
    OfficialInfo(app, info)
    QuietButton(t("detail.back"), onClick = { app.navigate(Route.Results) }, modifier = Modifier.testTag("detail-back"))
}

/** The program's official information from the rule pack: where to apply, the papers, and each source with its date. */
@Composable
fun OfficialInfo(app: AppController, info: ProgramInfo) {
    val t = app.strings
    val uri = LocalUriHandler.current
    val pack = app.content.pack
    SectionHeading(t("official.title"))
    if (info.sources.isEmpty() && info.applyUrl == null && info.docsRequired.isEmpty()) {
        Meta(t("official.none"))
        return
    }
    info.applyUrl?.let { url -> SecondaryButton(t("official.apply"), onClick = { runCatching { uri.openUri(url) } }, modifier = Modifier.testTag("official-apply")) }
    for (source in info.sources) {
        Column(Modifier.testTag("official-source")) {
            QuietButton(source.title, onClick = { runCatching { uri.openUri(source.url) } })
            val date = when {
                source.checkedAt != null -> t("official.confirmedOn", "date" to t.packDate(source.checkedAt!!))
                pack.isDraft && pack.sourcesReadOn != null -> t("official.readOn", "date" to t.packDate(pack.sourcesReadOn!!))
                else -> null
            }
            date?.let { Meta(it, Modifier.testTag("source-read-on")) }
        }
    }
    if (info.docsRequired.isNotEmpty()) {
        Meta(t("official.docs"))
        BulletList(info.docsRequired)
    }
}
