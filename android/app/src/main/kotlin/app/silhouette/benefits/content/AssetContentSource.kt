package app.silhouette.benefits.content

import android.content.res.AssetManager
import java.io.FileNotFoundException

/** Reads the shared contract files that the build copies into `assets/shared/`. */
class AssetContentSource(private val assets: AssetManager) : ContentSource {
    override fun text(path: String): String? = try {
        assets.open("shared/$path").use { it.readBytes().toString(Charsets.UTF_8) }
    } catch (_: FileNotFoundException) {
        null
    }
}
