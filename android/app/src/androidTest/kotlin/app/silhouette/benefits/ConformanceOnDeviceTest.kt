package app.silhouette.benefits

import android.icu.util.VersionInfo
import android.os.Build
import android.util.Log
import androidx.test.platform.app.InstrumentationRegistry
import app.silhouette.benefits.core.conformance.ConformanceCase
import app.silhouette.benefits.core.conformance.ConformanceSuite
import app.silhouette.benefits.core.conformance.FixtureSource
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/**
 * The shared conformance suite on an Android runtime. Here java.util.regex, Unicode properties and
 * case mapping come from the platform's ICU, not from the JDK used by the JVM unit tests.
 * The fixtures are packaged into the test APK by the `syncConformanceFixtures` task.
 */
@RunWith(Parameterized::class)
class ConformanceOnDeviceTest(private val case: ConformanceCase) {

    @Test
    fun run() = case.run()

    companion object {
        private val source = object : FixtureSource {
            private val assets = InstrumentationRegistry.getInstrumentation().context.assets

            override fun list(dir: String): List<String> = assets.list("shared/$dir")?.toList() ?: emptyList()

            override fun text(path: String): String = assets.open("shared/$path").use { it.readBytes().toString(Charsets.UTF_8) }
        }

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun cases(): List<ConformanceCase> {
            Log.i(
                "Conformance",
                "API ${Build.VERSION.SDK_INT}, ICU ${VersionInfo.ICU_VERSION}, Unicode ${android.icu.lang.UCharacter.getUnicodeVersion()}",
            )
            return ConformanceSuite.cases(source)
        }
    }
}
