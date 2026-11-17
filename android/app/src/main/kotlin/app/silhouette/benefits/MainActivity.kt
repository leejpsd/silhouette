package app.silhouette.benefits

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import app.silhouette.benefits.ui.AppViewModel
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.ui.SilhouetteApp

class MainActivity : ComponentActivity() {
    private val model: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // The language may have been changed in the system's per-app language settings.
        model.controller.refreshLanguage()
        if (savedInstanceState == null) {
            handleShare(intent)
            handleCheck(intent)
        }
        setContent { SilhouetteApp(model.controller) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
        handleCheck(intent)
    }

    /**
     * `--ei deviceCheck 1` (or 3) opens the on-device check and starts it, so a run on a real phone
     * needs no tapping: `adb shell am start -n app.silhouette.benefits/.MainActivity --ei deviceCheck 3`.
     */
    private fun handleCheck(intent: Intent?) {
        val repetitions = intent?.getIntExtra(EXTRA_DEVICE_CHECK, 0) ?: 0
        if (repetitions != 1 && repetitions != 3) return
        intent?.removeExtra(EXTRA_DEVICE_CHECK)
        val controller = model.controller
        controller.navigate(Route.DeviceCheck)
        controller.deviceCheck?.run(repetitions)
    }

    companion object {
        const val EXTRA_DEVICE_CHECK: String = "deviceCheck"
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
