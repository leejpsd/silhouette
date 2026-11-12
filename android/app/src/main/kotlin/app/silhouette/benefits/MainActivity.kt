package app.silhouette.benefits

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
        setContent { SilhouetteApp(model.controller) }
    }
}
