package app.silhouette.benefits.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.quickcheck.firstOpenStep
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.BulletList
import app.silhouette.benefits.ui.Lead
import app.silhouette.benefits.ui.MarkKind
import app.silhouette.benefits.ui.Meta
import app.silhouette.benefits.ui.Panel
import app.silhouette.benefits.ui.PrimaryButton
import app.silhouette.benefits.ui.ScreenHeading
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.SilhouetteMark
import app.silhouette.benefits.ui.theme.LocalDimens

/** Start: the promise, the rules in use, and the way in. */
@Composable
fun StartContent(app: AppController) {
    val t = app.strings
    val d = LocalDimens.current
    app.notice?.let { key ->
        Panel(Modifier.testTag("notice").semantics { liveRegion = LiveRegionMode.Polite }) {
            Text(t(key), style = MaterialTheme.typography.bodyLarge)
            // After "Delete everything": what was erased, without claiming the SDK's own caches.
            if (key == "delete.done") Text(t("delete.erasedDevice"), style = MaterialTheme.typography.bodyMedium)
        }
    }
    SilhouetteMark(MarkKind.Brand, 88.dp)
    ScreenHeading(t("start.title"))
    Lead(t("start.lead"))
    Text(t("start.promise"), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.testTag("start-promise"))
    Meta(t("start.rules", "name" to t("pack.${app.content.pack.jurisdiction}.name")))
    Column(verticalArrangement = Arrangement.spacedBy(d.sm)) {
        PrimaryButton(
            when {
                !app.started -> t("start.begin")
                // Some questions are still open: resume them; otherwise go straight to the results.
                firstOpenStep(app.steps, app.answers) < app.steps.size -> t("start.resume")
                else -> t("start.continue")
            },
            onClick = app::begin,
            modifier = Modifier.testTag("start-begin"),
        )
        SecondaryButton(t("start.sample"), onClick = app::openDocument, modifier = Modifier.testTag("start-document"))
        if (app.started) SecondaryButton(t("start.restart"), onClick = app::restart, modifier = Modifier.testTag("start-restart"))
    }
}
