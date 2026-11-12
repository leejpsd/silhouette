package app.silhouette.benefits.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.silhouette.benefits.SilhouetteApplication
import app.silhouette.benefits.data.EncryptedAnswerRepository
import app.silhouette.benefits.data.LanguageSetting
import kotlinx.coroutines.Dispatchers

/** Keeps the [AppController] across configuration changes (rotation, language change). */
class AppViewModel(application: Application) : AndroidViewModel(application) {
    val controller: AppController = (application as SilhouetteApplication).let { app ->
        AppController(
            content = app.content,
            repository = EncryptedAnswerRepository(app.store),
            languageStore = LanguageSetting(app),
            outbound = app.outbound,
            scope = viewModelScope,
            io = Dispatchers.IO.limitedParallelism(1),
        )
    }

    init {
        controller.load()
    }
}
