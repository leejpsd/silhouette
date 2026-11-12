package app.silhouette.benefits

import android.content.Intent
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import app.silhouette.benefits.data.PdfText
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class ShareAndPdfTest {
    private val clean = CleanStateRule()
    private val compose = createEmptyComposeRule()

    @get:Rule
    val rules: TestRule = RuleChain.outerRule(clean).around(compose)

    private val app: SilhouetteApplication get() = ApplicationProvider.getApplicationContext()

    @Test
    fun textSharedFromAnotherAppOpensThePasteBox() {
        val intent = Intent(app, MainActivity::class.java).apply {
            action = Intent.ACTION_SEND
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "Gross Pay 1,000.00")
        }
        ActivityScenario.launch<MainActivity>(intent).use {
            val t = clean.english()
            compose.waitUntil(5_000) { compose.onAllNodes(hasText(t("doc.share.received"))).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("paste-text", useUnmergedTree = true).assertExists()
            compose.waitUntil(5_000) { compose.onAllNodes(hasText("Gross Pay 1,000.00", substring = true)).fetchSemanticsNodes().isNotEmpty() }
            // Nothing is read or sent until the user continues.
            assertTrue(app.outbound.entries.value.isEmpty())
        }
    }

    /** A PDF written with a text layer on this device reads back as text, without any library. */
    @Test
    @SdkSuppress(minSdkVersion = 35)
    fun pdfTextLayerIsReadOnDevice() {
        val file = File(app.cacheDir, "text-layer.pdf")
        PdfDocument().apply {
            val page = startPage(PdfDocument.PageInfo.Builder(612, 792, 1).create())
            val paint = Paint().apply { textSize = 14f }
            page.canvas.drawText("Gross Pay 1,271.88", 72f, 100f, paint)
            page.canvas.drawText("Net Pay 1,100.92", 72f, 130f, paint)
            finishPage(page)
            file.outputStream().use { writeTo(it) }
            close()
        }
        val text = PdfText.extract(PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)))
        assertTrue(text, text.contains("Gross Pay 1,271.88"))
        assertTrue(text, text.contains("Net Pay 1,100.92"))
        file.delete()
    }
}
