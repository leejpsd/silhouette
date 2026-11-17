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
import app.silhouette.benefits.document.ReadingPlace
import app.silhouette.benefits.ui.InferenceBadge
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
    Meta(t("preview.hideHelp"))

    val placeholderStyle = SpanStyle(background = c.private, color = c.onPrivate, fontWeight = FontWeight.SemiBold)
    val linkStyle = TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline, color = MaterialTheme.colorScheme.primary))
    val text = buildAnnotatedString {
        for (piece in result.pieces) {
            when (piece) {
                is SkeletonPiece.Separator -> append(piece.text)
                is SkeletonPiece.Placeholder -> withStyle(placeholderStyle) { append(piece.id) }
                is SkeletonPiece.KeptWord -> withLink(
                    // The tag doubles as the link's spoken label ("Hide “Gross”").
                    LinkAnnotation.Clickable(tag = t("preview.hideWord", "word" to piece.text), styles = linkStyle) { app.hideWord(piece.hideKey) },
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
                t("preview.hidden") + ": " + app.document.hidden.joinToString(", "),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier
                    .weight(1f)
                    .testTag("hidden-notice")
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
            QuietButton(t("preview.unhide", "word" to app.lastHiddenWord().orEmpty()), onClick = app::undoHide, modifier = Modifier.testTag("undo-hide"))
        }
    }

    doc.photoSource?.let { InferenceBadge(t, it.source, it.reason) }

    // An honest sentence about where the silhouette will be read.
    val place = app.readingPlace
    when (place) {
        ReadingPlace.DEVICE_FIRST -> PrivateNote(t("preview.onDevice"), Modifier.testTag("preview-where"))
        ReadingPlace.CLOUD -> PrivateNote(t("preview.cloud"), Modifier.testTag("preview-where"))
        ReadingPlace.SAMPLE_ANSWERS -> PrivateNote(t("preview.sample"), Modifier.testTag("preview-where"))
        ReadingPlace.NOWHERE -> PrivateNote(t("preview.noExtractor"), Modifier.testTag("preview-where"))
    }
    if (place == ReadingPlace.DEVICE_FIRST || place == ReadingPlace.CLOUD) Meta(t("leaving.network"))
    doc.error?.takeIf { it != "preview.noExtractor" }?.let {
        Text(t(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.testTag("preview-error").semantics { liveRegion = LiveRegionMode.Assertive })
    }
    // While a reading runs, the status line says which step it is on.
    if (doc.sending) Meta(doc.stage?.let { t(it.copyKey) } ?: t("preview.sending"), Modifier.testTag("preview-stage").semantics { liveRegion = LiveRegionMode.Polite })
    when {
        doc.error == "error.on-device-unreliable" -> {
            // Nothing was filled in and nothing was sent: send the silhouette, or type the numbers.
            PrimaryButton(t("preview.sendSilhouette"), onClick = { if (!doc.sending) app.send() }, modifier = Modifier.testTag("preview-send-silhouette"))
            SecondaryButton(t("error.typeInstead"), onClick = app::typeInstead, modifier = Modifier.testTag("preview-type"))
        }
        doc.error != null && doc.error != "preview.noExtractor" -> {
            // A daily limit does not recover by trying again now.
            if (doc.error != "error.quotaDaily") PrimaryButton(t("error.retry"), onClick = { if (!doc.sending) app.send() }, modifier = Modifier.testTag("preview-retry"))
            SecondaryButton(t("error.typeInstead"), onClick = app::typeInstead, modifier = Modifier.testTag("preview-type"))
        }
        place != ReadingPlace.NOWHERE -> {
            PrimaryButton(
                if (place == ReadingPlace.SAMPLE_ANSWERS) t("preview.sampleButton") else t("leaving.send"),
                onClick = { if (!doc.sending) app.send() },
                modifier = Modifier.testTag("preview-send"),
            )
            // With a device model, keeping everything here still reads the silhouette on this device.
            SecondaryButton(t("leaving.skip"), onClick = { if (!doc.sending) app.keepOnDevice() }, modifier = Modifier.testTag("preview-keep"))
        }
        else -> PrimaryButton(t("doc.manual"), onClick = app::typeInstead, modifier = Modifier.testTag("preview-type"))
    }
    QuietButton(t("q.back"), onClick = { app.navigate(Route.Document) })
}
