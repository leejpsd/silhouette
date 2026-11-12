package app.silhouette.benefits

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import app.silhouette.benefits.ui.AppViewModel
import app.silhouette.benefits.ui.SilhouetteApp

class MainActivity : ComponentActivity() {
    private val model: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // The language may have been changed in the system's per-app language settings.
        model.controller.refreshLanguage()
        if (savedInstanceState == null) handleShare(intent)
        setContent { SilhouetteApp(model.controller) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    /** Text shared from another app goes to the document screen's paste box; nothing is read yet. */
    private fun handleShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type?.startsWith("text/plain") != true) return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.takeIf { it.isNotBlank() } ?: return
        model.controller.receiveSharedText(text)
        // Drop the extra so a configuration change does not deliver it again.
        intent.removeExtra(Intent.EXTRA_TEXT)
    }
}
