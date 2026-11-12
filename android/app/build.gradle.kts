import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.FileSystemOperations
import javax.inject.Inject

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

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

android.testOptions.unitTests.all { test ->
    test.systemProperty("silhouette.shared", sharedPath)
    test.inputs.dir(sharedPath).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("shared")
}

dependencies {
    implementation(project(":core"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.activity.compose)

    testImplementation(libs.junit4)
    testImplementation(libs.kotlinx.coroutines.test)

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
            "rulepacks/zz-test/**",
            "bands/*.json",
            "design/tokens.json",
            "skeleton/allowlist/*.json",
        )
        val REQUIRED = listOf(
            "copy/en.json",
            "rulepacks/zz-test/pack.json",
            "bands/zz-test.json",
            "design/tokens.json",
            "skeleton/allowlist/en.json",
        )
    }
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
        val INCLUDES = listOf("fixtures/**", "schemas/**", "skeleton/**", "rulepacks/**", "bands/**")
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
    description = "Copies shared/copy, shared/rulepacks/zz-test, shared/bands, shared/design/tokens.json and shared/skeleton/allowlist into generated assets."
    sharedDir.set(layout.settingsDirectory.dir("../shared"))
    outputDir.set(layout.buildDirectory.dir("generated/sharedContract/assets"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(syncSharedContract, SyncSharedContract::outputDir)
        variant.androidTest?.sources?.assets?.addGeneratedSourceDirectory(syncConformanceFixtures, SyncConformanceFixtures::outputDir)
    }
}
