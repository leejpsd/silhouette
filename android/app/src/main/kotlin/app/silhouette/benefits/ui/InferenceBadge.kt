package app.silhouette.benefits.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.ai.InferenceSource
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.ui.theme.LocalDimens
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors

/**
 * Where a model answer came from (badge) and why it was produced there (reason chip, a routing
 * reason from shared/routing.json). Shown on every model result.
 */
@Composable
fun InferenceBadge(t: Strings, source: InferenceSource, reason: String, modifier: Modifier = Modifier, detail: String? = null) {
    val d = LocalDimens.current
    val c = LocalSilhouetteColors.current
    val badge = when (source) {
        InferenceSource.ON_DEVICE -> t("badge.onDevice")
        InferenceSource.IN_CLOUD -> t("badge.cloud")
        InferenceSource.SAMPLE_ANSWER_KEY -> t("badge.sampleKey")
    }
    val shape = RoundedCornerShape(50)
    FlowRow(
        modifier.testTag("inference-badge").semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(d.xs),
        verticalArrangement = Arrangement.spacedBy(d.xs),
    ) {
        Text(
            badge,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onPrimary,
            modifier = Modifier
                .testTag("inference-source-${source.name}")
                .background(MaterialTheme.colorScheme.primary, shape)
                .padding(horizontal = d.sm, vertical = d.xxs),
        )
        Text(
            detail?.let { t("reason.$reason") + " · " + it } ?: t("reason.$reason"),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier
                .testTag("inference-reason")
                .border(1.dp, c.borderStrong, shape)
                .padding(horizontal = d.sm, vertical = d.xxs),
        )
    }
}
