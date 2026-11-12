package app.silhouette.benefits.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import app.silhouette.benefits.ui.screens.ProgramContent
import app.silhouette.benefits.ui.screens.QuestionContent
import app.silhouette.benefits.ui.screens.ResultsContent
import app.silhouette.benefits.ui.screens.StartContent
import app.silhouette.benefits.ui.theme.SilhouetteTheme

/** The whole app: top bar, the current screen (with the demo banner and footer), and the "Leaving your device" bar. */
@Composable
fun SilhouetteApp(app: AppController) {
    val t = app.strings
    SilhouetteTheme(app.content.tokens, languageTag = t.language.tag) {
        BackHandler(enabled = app.route != Route.Start) { app.back() }
        Surface(color = MaterialTheme.colorScheme.background, contentColor = MaterialTheme.colorScheme.onBackground) {
        Column(Modifier.fillMaxSize().safeDrawingPadding()) {
            TopBar(t, onHome = { app.navigate(Route.Start) }, onLanguage = app::setLanguage)
            Box(Modifier.weight(1f).fillMaxWidth()) {
                if (app.loaded) {
                    val route = app.route
                    // A new composition per screen, so drafts and scroll position never leak between screens.
                    key(route) {
                        Screen(paneTitle = paneTitle(app, route), modifier = Modifier.testTag("screen")) {
                            if (app.content.isDemoPack) DemoBanner(t)
                            when (route) {
                                Route.Start -> StartContent(app)
                                is Route.Question -> QuestionContent(app, route)
                                Route.Results -> ResultsContent(app)
                                is Route.Program -> ProgramContent(app, route)
                            }
                            Footer(t, onDelete = { app.deleteEverything() })
                        }
                    }
                }
            }
            LeavingBar(t, app.outbound)
        }
        }
    }
}

private fun paneTitle(app: AppController, route: Route): String {
    val t = app.strings
    return when (route) {
        Route.Start -> t("start.title")
        is Route.Question -> t("question.${route.stepId}.label")
        Route.Results -> t("results.title")
        is Route.Program -> app.content.pack.programInfo.find { it.id == route.id }?.let { t.programName(it.id, it.name) } ?: t("results.title")
    }
}
