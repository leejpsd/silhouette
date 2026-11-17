package app.silhouette.benefits.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import app.silhouette.benefits.ai.DeviceModelState
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.Lead
import app.silhouette.benefits.ui.Meta
import app.silhouette.benefits.ui.Panel
import app.silhouette.benefits.ui.QuietButton
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.ui.ScreenHeading
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.SectionHeading

/**
 * "For judges: try it in two minutes": three steps, one button each, with invented data only. Without
 * an on-device model the sample's silhouette goes to the cloud; the page says which steps run here.
 */
@Composable
fun JudgesContent(app: AppController) {
    val t = app.strings
    val state by (app.deviceModel?.state ?: kotlinx.coroutines.flow.MutableStateFlow(DeviceModelState.Unavailable)).collectAsState()
    ScreenHeading(t("judges.title"))
    Lead(t("judges.lead"))
    Meta(
        when (state) {
            DeviceModelState.Checking -> t("judges.checking")
            DeviceModelState.Available -> t("judges.withModel")
            else -> t("judges.withoutModel")
        },
        Modifier.testTag("judges-device").semantics { liveRegion = LiveRegionMode.Polite },
    )
    val steps = listOf(
        Triple("judge-quick-check", 1, app::fillPreparedHousehold),
        Triple("judge-sample", 2, app::openSamplePaystub),
        Triple("judge-record", 3, app::openRecord),
    )
    for ((tag, n, run) in steps) {
        Panel(Modifier.testTag(tag)) {
            SectionHeading("$n. " + t("judges.step$n.title"))
            Text(t("judges.step$n.body"), style = MaterialTheme.typography.bodyLarge)
            SecondaryButton(t("judges.step$n.button"), onClick = run, modifier = Modifier.testTag("$tag-button"))
        }
    }
    QuietButton(t("nav.home"), onClick = { app.navigate(Route.Start) })
}
