package app.silhouette.benefits

import androidx.test.core.app.ApplicationProvider
import app.silhouette.benefits.data.LanguageSetting
import app.silhouette.benefits.i18n.AppLanguage
import org.junit.rules.ExternalResource

/** Starts every UI test from a clean install state: no answers, no key, language following the device. */
class CleanStateRule : ExternalResource() {
    private val app: SilhouetteApplication get() = ApplicationProvider.getApplicationContext()

    override fun before() = clear()

    override fun after() = clear()

    private fun clear() {
        app.store.deleteEverything()
        app.outbound.clear()
        LanguageSetting(app).clear()
    }

    /** English copy, so assertions do not depend on the device language. */
    fun english() = app.content.strings(AppLanguage.EN)
}
