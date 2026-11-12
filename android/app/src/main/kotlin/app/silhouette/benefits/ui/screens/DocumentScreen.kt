package app.silhouette.benefits.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.data.PdfText
import app.silhouette.benefits.document.SourceKind
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.ChoiceRow
import app.silhouette.benefits.ui.Lead
import app.silhouette.benefits.ui.Meta
import app.silhouette.benefits.ui.Panel
import app.silhouette.benefits.ui.PrivateNote
import app.silhouette.benefits.ui.QuietButton
import app.silhouette.benefits.ui.ScreenHeading
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.SectionHeading
import app.silhouette.benefits.ui.theme.LocalDimens
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Add a document: shared or pasted text, a text PDF, a photo (only with an on-device model), typing
 * the numbers, and the built-in samples. Whatever the source, the text stays Raw and becomes a
 * silhouette before anything could be sent.
 */
@Composable
fun DocumentContent(app: AppController) {
    val t = app.strings
    val d = LocalDimens.current
    val doc = app.document
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pasted by rememberSaveable { mutableStateOf("") }
    var pdfError by rememberSaveable { mutableStateOf(false) }
    var reading by rememberSaveable { mutableStateOf(false) }
    // Text shared from another app arrives in the paste box, so the user sees it and picks the language first.
    LaunchedEffect(doc.sharedText) {
        doc.sharedText?.let {
            pasted = it
            app.sharedTextShown()
        }
    }
    val pdfPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        reading = true
        pdfError = false
        scope.launch {
            val text = withContext(Dispatchers.IO) { runCatching { PdfText.extract(context, uri) }.getOrNull() }
            reading = false
            if (text.isNullOrBlank()) pdfError = true else app.acceptText(Raw.of(text), SourceKind.PDF)
        }
    }

    ScreenHeading(t("doc.title"))
    Lead(t("doc.lead"))

    SectionHeading(t("doc.language"))
    Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(d.xs)) {
        for (language in AppLanguage.entries) {
            ChoiceRow(
                language.nativeName,
                selected = doc.language == language.tag,
                onSelect = { app.setDocumentLanguage(language.tag) },
                modifier = Modifier.testTag("doc-language-${language.tag}"),
            )
        }
    }

    Panel {
        SectionHeading(t("doc.paste"))
        if (doc.sharedReceived) Meta(t("doc.share.received"), Modifier.testTag("share-received"))
        OutlinedTextField(
            value = pasted,
            onValueChange = { pasted = it },
            label = { Text(t("doc.paste.label")) },
            minLines = 5,
            textStyle = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.fillMaxWidth().testTag("paste-text"),
        )
        SecondaryButton(
            t("doc.paste.continue"),
            onClick = { if (pasted.isNotBlank()) app.acceptText(Raw.of(pasted), if (doc.sharedReceived) SourceKind.SHARE else SourceKind.PASTE) },
            modifier = Modifier.testTag("paste-continue"),
        )
    }

    Panel {
        SectionHeading(t("doc.pdf"))
        if (PdfText.supported) {
            Meta(t("doc.pdf.help"))
            SecondaryButton(t("doc.pdf"), onClick = { pdfPicker.launch(arrayOf("application/pdf")) }, modifier = Modifier.testTag("pdf-open"))
            if (reading) Meta(t("doc.reading"), Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            if (pdfError) {
                Text(
                    t("doc.pdf.error"),
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                )
            }
        } else {
            Meta(t("doc.pdf.unsupported"))
        }
    }

    // Photos can be read only by an on-device model, which this build does not have.
    Panel(Modifier.testTag("photo-option")) {
        SectionHeading(t("doc.photo"))
        PrivateNote(t("doc.photo.unavailable"))
        OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth().heightIn(min = d.comfortableTapTarget)) {
            Text(t("doc.photo"), style = MaterialTheme.typography.labelLarge)
        }
    }

    Panel {
        SectionHeading(t("doc.manual"))
        SecondaryButton(t("doc.manual"), onClick = app::typeInstead, modifier = Modifier.testTag("doc-manual"))
    }

    Panel(Modifier.testTag("samples")) {
        SectionHeading(t("doc.samples"))
        Meta(t("doc.samples.help"))
        for (sample in app.content.samples) {
            SecondaryButton(
                t(sample.labelKey),
                onClick = { app.acceptSample(sample) },
                modifier = Modifier.testTag("sample-${sample.id}"),
            )
        }
    }
    QuietButton(t("q.back"), onClick = { app.back() })
}
