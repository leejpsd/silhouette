package app.silhouette.benefits.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.silhouette.benefits.SilhouetteApplication
import app.silhouette.benefits.data.LanguageSetting
import app.silhouette.benefits.devicecheck.AndroidCheck
import app.silhouette.benefits.devicecheck.DeviceCheckController

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
            deviceModel = app.deviceModel,
            photoReader = app.photoReader,
            textTasks = app.textTasks,
            personalTasks = app.personalTasks,
            explainSettings = app.remote.settings,
            deviceCheck = DeviceCheckController(
                scope = viewModelScope,
                runner = app::deviceCheckRunner,
                environment = { AndroidCheck.environment(app.appVersion, app.deviceModel.state.value) },
                save = app::saveRunFile,
                recordings = app.checkRecordings,
                runSchema = app.checkRunSchema,
            ),
        )
    }

    init {
        controller.load()
    }
}
