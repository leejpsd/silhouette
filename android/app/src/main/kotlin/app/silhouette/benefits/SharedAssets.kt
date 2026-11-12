package app.silhouette.benefits

import android.content.res.AssetManager
import app.silhouette.benefits.core.CopyStrings
import java.io.FileNotFoundException
import java.util.Locale

/** Reads the shared contract files that the build copies into `assets/shared/`. */
class SharedAssets(private val assets: AssetManager) {

    fun text(path: String): String = assets.open("shared/$path").use { it.readBytes().toString(Charsets.UTF_8) }

    private fun textOrNull(path: String): String? = try {
        text(path)
    } catch (_: FileNotFoundException) {
        null
    }

    /** UI strings for [locale], falling back to English for missing keys. */
    fun copy(locale: Locale = Locale.getDefault()): CopyStrings {
        val english = text("copy/en.json")
        val language = locale.language
        val localized = if (language == "en") null else textOrNull("copy/$language.json")
        return CopyStrings.parse(english, localized)
    }
}
