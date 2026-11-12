package app.silhouette.benefits.data

import android.app.LocaleManager
import android.content.Context
import android.os.Build
import android.os.LocaleList
import app.silhouette.benefits.i18n.AppLanguage
import java.util.Locale

/**
 * The app language (per-app language). On Android 13 and later it is the system per-app language,
 * so it also shows in the system settings; on older versions it is kept in app preferences.
 * Without a choice, the language follows the device.
 */
/** The stored language choice. */
interface LanguageStore {
    fun current(): AppLanguage

    fun set(language: AppLanguage)

    /** Forgets the choice, so the language follows the device again. */
    fun clear()
}

class LanguageSetting(private val context: Context) : LanguageStore {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun current(): AppLanguage {
        val chosen = if (Build.VERSION.SDK_INT >= 33) {
            context.getSystemService(LocaleManager::class.java).applicationLocales.takeIf { !it.isEmpty }?.get(0)?.language
        } else {
            prefs.getString(KEY, null)
        }
        return AppLanguage.fromTag(chosen) ?: AppLanguage.bestMatch(deviceLocales())
    }

    override fun set(language: AppLanguage) {
        if (Build.VERSION.SDK_INT >= 33) {
            context.getSystemService(LocaleManager::class.java).applicationLocales = LocaleList.forLanguageTags(language.tag)
        } else {
            prefs.edit().putString(KEY, language.tag).apply()
        }
    }

    override fun clear() {
        if (Build.VERSION.SDK_INT >= 33) {
            context.getSystemService(LocaleManager::class.java).applicationLocales = LocaleList.getEmptyLocaleList()
        }
        prefs.edit().clear().apply()
    }

    private fun deviceLocales(): List<Locale> {
        val list = if (Build.VERSION.SDK_INT >= 33) {
            context.getSystemService(LocaleManager::class.java).systemLocales
        } else {
            android.content.res.Resources.getSystem().configuration.locales
        }
        return (0 until list.size()).map { list[it] }
    }

    private companion object {
        const val PREFS = "settings"
        const val KEY = "language"
    }
}
