package app.silhouette.benefits

import android.app.Application
import app.silhouette.benefits.content.AppContent
import app.silhouette.benefits.content.AssetContentSource
import app.silhouette.benefits.data.EncryptedStore
import app.silhouette.benefits.data.OutboundLog
import java.io.File

/** App-wide services. */
class SilhouetteApplication : Application() {
    /** The single record of everything that leaves the device. */
    val outbound: OutboundLog = OutboundLog()

    val content: AppContent by lazy { AppContent.load(AssetContentSource(assets)) }

    /** Encrypted records in the no-backup folder (also excluded because the app disallows backup). */
    val store: EncryptedStore by lazy { EncryptedStore(File(noBackupFilesDir, "store")) }
}
