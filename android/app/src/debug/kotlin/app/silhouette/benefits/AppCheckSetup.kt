package app.silhouette.benefits

import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory

/**
 * Debug builds use the App Check debug provider. On first run it prints a debug token to logcat
 * ("Firebase App Check debug token: …"); register it in the Firebase console under App Check.
 * The token is never stored in the repository. Tokens are fetched only when a request needs one
 * (no automatic refresh), so the app makes no request at start-up.
 */
object AppCheckSetup {
    fun install() = FirebaseAppCheck.getInstance().installAppCheckProviderFactory(DebugAppCheckProviderFactory.getInstance(), false)
}
