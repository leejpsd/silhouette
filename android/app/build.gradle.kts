import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.file.FileSystemOperations
import javax.inject.Inject

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    // Reads app/google-services.json, which each developer adds locally (it is not in the repository).
    alias(libs.plugins.google.services) apply false
}

// Without google-services.json the app builds and runs without models (Firebase is not configured).
if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")

android {
    namespace = "app.silhouette.benefits"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }
    // Pinned to the installed Build Tools; the build never downloads SDK components.
    buildToolsVersion = "36.1.0"

    defaultConfig {
        applicationId = "app.silhouette.benefits"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// JVM unit tests read the shared contract in place, like :core.
val sharedPath: String = layout.settingsDirectory.dir("../shared").asFile.absolutePath

android.testOptions.unitTests.isIncludeAndroidResources = true

// Snapshots of every screen and state (src/test/.../snapshots, Robolectric): only with -Psnapshots,
// so the ordinary unit tests stay fast. Images go to app/build/snapshots/.
val snapshots = project.hasProperty("snapshots")
val snapshotDir: String = layout.buildDirectory.dir("snapshots").get().asFile.absolutePath

android.testOptions.unitTests.all { test ->
    test.systemProperty("silhouette.shared", sharedPath)
    test.systemProperty("silhouette.snapshots", snapshotDir)
    // Robolectric renders with the platform's real graphics, so Compose can capture what it drew.
    test.systemProperty("robolectric.pixelCopyRenderMode", "hardware")
    test.inputs.dir(sharedPath).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("shared")
    if (snapshots) test.filter.includeTestsMatching("*.snapshots.*") else test.exclude("**/snapshots/**")
    test.maxHeapSize = "3g"
}

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.ai)
    implementation(libs.firebase.ai.ondevice)
    implementation(libs.firebase.config)
    // App Check: Play Integrity in release builds, the debug provider in debug builds only.
    releaseImplementation(libs.firebase.appcheck.playintegrity)
    debugImplementation(libs.firebase.appcheck.debug)

    testImplementation(libs.junit4)
    testImplementation(libs.kotlinx.coroutines.test)
    // Snapshot capture on the JVM: Compose rendered by Robolectric's native graphics.
    testImplementation(libs.robolectric)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)

    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.compose.ui.test.junit4.accessibility)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.core)
    androidTestImplementation(libs.androidx.test.ext.junit)
    // Compose UI tests pull in Espresso 3.5, which calls an input API removed in Android 17.
    androidTestImplementation(libs.androidx.test.espresso.core)
    debugImplementation(libs.compose.ui.test.manifest)
}

/**
 * Copies the parts of the shared contract the app ships with into generated assets, under
 * `assets/shared/`. The source of truth stays in ../shared; nothing is copied by hand.
 */
abstract class SyncSharedContract : DefaultTask() {
    @get:Internal
    abstract val sharedDir: DirectoryProperty

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    val contractFiles: FileTree
        get() = sharedDir.get().asFileTree.matching { include(INCLUDES) }

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fileSystem: FileSystemOperations

    @TaskAction
    fun sync() {
        val source = sharedDir.get()
        for (required in REQUIRED) {
            if (!source.file(required).asFile.isFile) throw GradleException("shared contract file missing: $required")
        }
        fileSystem.sync {
            from(source) {
                include(INCLUDES)
                into("shared")
            }
            into(outputDir)
        }
    }

    companion object {
        val INCLUDES = listOf(
            "copy/*.json",
            "rulepacks/us-ca/pack.json",
            "rulepacks/us-ca/copy/*.json",
            "rulepacks/us-ca/judges-household.json",
            "bands/*.json",
            "design/tokens.json",
            "skeleton/allowlist/*.json",
            "schemas/pointer.*.json",
            "samples/*.txt",
            "prompts/*.md",
            "prompts/output-checks.json",
            "samples/answers.json",
            // The on-device check: its cases, documents, right answers and the reference recording.
            "fixtures/device-check/**",
            "schemas/device-check-run.v3.json",
        )
        val REQUIRED = listOf(
            "copy/en.json",
            "rulepacks/us-ca/pack.json",
            "bands/us-ca.json",
            "design/tokens.json",
            "skeleton/allowlist/en.json",
            "schemas/pointer.paystub.json",
            "samples/paystub-en-01.txt",
            "prompts/pointer-extract.v3.md",
            "prompts/photo-read.v1.md",
        )
    }
}

/**
 * Copies firebase/remoteconfig.template.json into generated assets, so the app's Remote Config
 * defaults are the template's values by construction.
 */
abstract class SyncRemoteConfigDefaults : DefaultTask() {
    @get:InputFile
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val template: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fileSystem: FileSystemOperations

    @TaskAction
    fun sync() {
        fileSystem.sync {
            from(template) { into("firebase") }
            into(outputDir)
        }
    }
}

val syncRemoteConfigDefaults = tasks.register<SyncRemoteConfigDefaults>("syncRemoteConfigDefaults") {
    group = "build"
    description = "Copies firebase/remoteconfig.template.json into generated assets for the in-app Remote Config defaults."
    template.set(layout.settingsDirectory.file("../firebase/remoteconfig.template.json"))
    outputDir.set(layout.buildDirectory.dir("generated/remoteConfigDefaults/assets"))
}

/**
 * Copies the conformance fixtures and everything they reference into the instrumented-test APK
 * (`assets/shared/…`), so the conformance suite also runs on an Android runtime. Test APK only.
 */
abstract class SyncConformanceFixtures : DefaultTask() {
    @get:Internal
    abstract val sharedDir: DirectoryProperty

    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    val fixtureFiles: FileTree
        get() = sharedDir.get().asFileTree.matching { include(INCLUDES) }

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fileSystem: FileSystemOperations

    @TaskAction
    fun sync() {
        fileSystem.sync {
            from(sharedDir) {
                include(INCLUDES)
                into("shared")
            }
            into(outputDir)
        }
    }

    companion object {
        val INCLUDES = listOf("fixtures/**", "schemas/**", "skeleton/**", "rulepacks/**", "bands/**", "reference/silhouette.mjs", "prompts/output-checks.json")
    }
}

val syncConformanceFixtures = tasks.register<SyncConformanceFixtures>("syncConformanceFixtures") {
    group = "build"
    description = "Copies shared/fixtures and the files they reference into the instrumented-test assets."
    sharedDir.set(layout.settingsDirectory.dir("../shared"))
    outputDir.set(layout.buildDirectory.dir("generated/conformanceFixtures/assets"))
}

val syncSharedContract = tasks.register<SyncSharedContract>("syncSharedContract") {
    group = "build"
    description = "Copies shared/copy, shared/rulepacks/us-ca, shared/bands, shared/design/tokens.json, shared/skeleton/allowlist, the pointer schemas, the sample documents and the prompts into generated assets."
    sharedDir.set(layout.settingsDirectory.dir("../shared"))
    outputDir.set(layout.buildDirectory.dir("generated/sharedContract/assets"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(syncSharedContract, SyncSharedContract::outputDir)
        variant.sources.assets?.addGeneratedSourceDirectory(syncRemoteConfigDefaults, SyncRemoteConfigDefaults::outputDir)
        variant.androidTest?.sources?.assets?.addGeneratedSourceDirectory(syncConformanceFixtures, SyncConformanceFixtures::outputDir)
    }
}
