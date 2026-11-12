package app.silhouette.benefits

import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

/**
 * Release builds attest with Play Integrity. Tokens are fetched only when a request needs one (no
 * automatic refresh), so the app makes no request at start-up.
 */
object AppCheckSetup {
    fun install() = FirebaseAppCheck.getInstance().installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance(), false)
}
