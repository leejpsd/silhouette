package app.silhouette.benefits.data

import android.content.Context
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import androidx.annotation.ChecksSdkIntAtLeast
import androidx.annotation.RequiresApi

/**
 * Reads the text layer of a PDF on this device with the platform's PdfRenderer
 * (`PdfRenderer.Page.getTextContents()`, Android 15 and later). No library, no model, no network.
 * A scanned PDF has no text layer and gives an empty string.
 */
object PdfText {
    @get:ChecksSdkIntAtLeast(api = 35)
    val supported: Boolean get() = Build.VERSION.SDK_INT >= 35

    @RequiresApi(35)
    fun extract(context: Context, uri: Uri): String {
        return context.contentResolver.openFileDescriptor(uri, "r")!!.use { fd -> extract(PdfRenderer(fd)) }
    }

    @RequiresApi(35)
    fun extract(renderer: PdfRenderer): String = renderer.use { pdf ->
        (0 until pdf.pageCount).joinToString("\n") { index ->
            pdf.openPage(index).use { page -> page.textContents.joinToString("\n") { it.text } }
        }
    }
}
