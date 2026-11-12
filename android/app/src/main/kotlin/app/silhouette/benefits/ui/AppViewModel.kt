package app.silhouette.benefits.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.silhouette.benefits.SilhouetteApplication
import app.silhouette.benefits.data.LanguageSetting

/** Keeps the [AppController] across configuration changes (rotation, language change). */
class AppViewModel(application: Application) : AndroidViewModel(application) {
    val controller: AppController = (application as SilhouetteApplication).let { app ->
        AppController(
            content = app.content,
            repository = app.repository,
            languageStore = LanguageSetting(app),
            outbound = app.outbound,
            scope = viewModelScope,
            io = app.storeDispatcher,
            extraction = app.extraction,
        )
    }

    init {
        controller.load()
    }
}
