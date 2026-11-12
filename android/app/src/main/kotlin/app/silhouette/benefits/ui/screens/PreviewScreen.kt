package app.silhouette.benefits.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.core.SkeletonPiece
import app.silhouette.benefits.document.SourceKind
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.Lead
import app.silhouette.benefits.ui.Meta
import app.silhouette.benefits.ui.PrimaryButton
import app.silhouette.benefits.ui.PrivateNote
import app.silhouette.benefits.ui.QuietButton
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.ui.ScreenHeading
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.theme.LocalDimens
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors

/**
 * The silhouette exactly as it would be sent. Every word that is still visible can be tapped to
 * hide it (with undo) before anything is sent.
 */
@Composable
fun PreviewContent(app: AppController) {
    val t = app.strings
    val d = LocalDimens.current
    val c = LocalSilhouetteColors.current
    val doc = app.document
    val result = doc.skeleton
    if (result == null) {
        ScreenHeading(t("preview.missing"))
        SecondaryButton(t("doc.title"), onClick = { app.navigate(Route.Document) })
        return
    }
    val counts = result.counts
    ScreenHeading(t("preview.title"))
    Lead(t("preview.lead"))
    Meta(
        t("preview.counts", "numbers" to (counts['N'] ?: 0), "dates" to (counts['D'] ?: 0), "words" to (counts['W'] ?: 0)),
        Modifier.testTag("preview-counts"),
    )
    Meta(t("preview.hideHint"))

    val placeholderStyle = SpanStyle(background = c.private, color = c.onPrivate, fontWeight = FontWeight.SemiBold)
    val linkStyle = TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline, color = MaterialTheme.colorScheme.primary))
    val text = buildAnnotatedString {
        for (piece in result.pieces) {
            when (piece) {
                is SkeletonPiece.Separator -> append(piece.text)
                is SkeletonPiece.Placeholder -> withStyle(placeholderStyle) { append(piece.id) }
                is SkeletonPiece.KeptWord -> withLink(
                    LinkAnnotation.Clickable(tag = "hide-${piece.ordinal}", styles = linkStyle) { app.hideWord(piece.ordinal) },
                ) { append(piece.text) }
            }
        }
    }
    val shape = RoundedCornerShape(d.radiusControl)
    // Monospace and no wrapping keep the document's columns; long lines scroll sideways.
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
        softWrap = false,
        modifier = Modifier
            .fillMaxWidth()
            .background(c.surfaceSunken, shape)
            .border(1.dp, c.border, shape)
            .horizontalScroll(rememberScrollState())
            .padding(d.sm)
            .testTag("skeleton-preview")
            .semantics { contentDescription = t("preview.title") },
    )

    if (doc.hidden.isNotEmpty()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(d.xs)) {
            Text(
                t("preview.hidden", "word" to app.lastHiddenWord().orEmpty()),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier
                    .weight(1f)
                    .testTag("hidden-notice")
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
            QuietButton(t("preview.undo"), onClick = app::undoHide, modifier = Modifier.testTag("undo-hide"))
        }
    }

    // An honest sentence about where the silhouette will be read.
    val canExtract = app.canExtract
    when {
        canExtract && doc.source == SourceKind.SAMPLE -> PrivateNote(t("preview.sample"), Modifier.testTag("preview-where"))
        canExtract -> PrivateNote(t("preview.cloud"), Modifier.testTag("preview-where"))
        else -> PrivateNote(t("preview.noExtractor"), Modifier.testTag("preview-where"))
    }
    doc.error?.takeIf { it != "preview.noExtractor" }?.let {
        Text(t(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
    }
    if (doc.sending) Meta(t("preview.sending"), Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    if (canExtract) {
        PrimaryButton(
            if (doc.source == SourceKind.SAMPLE) t("preview.sampleButton") else t("leaving.send"),
            onClick = { if (!doc.sending) app.send() },
            modifier = Modifier.testTag("preview-send"),
        )
        SecondaryButton(t("leaving.skip"), onClick = app::typeInstead, modifier = Modifier.testTag("preview-type"))
    } else {
        PrimaryButton(t("doc.manual"), onClick = app::typeInstead, modifier = Modifier.testTag("preview-type"))
    }
    QuietButton(t("q.back"), onClick = { app.navigate(Route.Document) })
}
