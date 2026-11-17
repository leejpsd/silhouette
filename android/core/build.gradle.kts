import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Pure Kotlin/JVM library: Skeletonizer, Rehydrator, Generalizer and rules engine.
// No Android dependencies, so every contract test runs as a plain JVM unit test.
plugins {
    alias(libs.plugins.kotlin.jvm)
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    explicitApi()
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        allWarningsAsErrors.set(true)
    }
}

dependencies {
    api(libs.kotlinx.serialization.json)
    // The on-device reading asks the device part by part (suspending calls).
    api(libs.kotlinx.coroutines.core)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
    // Compiles the snippets in src/routingProof/ to prove that Raw values do not type-check
    // where CloudSafe is required (RoutingProofTest).
    testImplementation(libs.kotlin.compiler.embeddable)
}

// The contract lives in ../shared and is read in place at test time, never copied.
val sharedDir: Directory = layout.settingsDirectory.dir("../shared")
val routingProofDir: Directory = layout.projectDirectory.dir("src/routingProof")

tasks.test {
    useJUnitPlatform()
    maxHeapSize = "2g"

    inputs.dir(sharedDir.dir("fixtures")).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("sharedFixtures")
    inputs.dir(sharedDir.dir("skeleton")).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("sharedSkeleton")
    inputs.dir(sharedDir.dir("schemas")).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("sharedSchemas")
    inputs.dir(sharedDir.dir("rulepacks")).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("sharedRulepacks")
    inputs.dir(sharedDir.dir("bands")).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("sharedBands")
    inputs.dir(sharedDir.dir("prompts")).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("sharedPrompts")
    inputs.dir(sharedDir.dir("samples")).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("sharedSamples")
    inputs.dir(sharedDir.dir("reference")).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("sharedReference")
    inputs.dir(routingProofDir).withPathSensitivity(PathSensitivity.RELATIVE).withPropertyName("routingProofSnippets")

    val proofClasspath = sourceSets.main.get().runtimeClasspath
    val sharedPath = sharedDir.asFile.absolutePath
    val proofPath = routingProofDir.asFile.absolutePath
    systemProperty("silhouette.shared", sharedPath)
    systemProperty("silhouette.routingProof.dir", proofPath)
    jvmArgumentProviders.add(CommandLineArgumentProvider {
        listOf("-Dsilhouette.routingProof.classpath=${proofClasspath.asPath}")
    })

    testLogging {
        events("failed")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
    addTestListener(object : TestListener {
        override fun beforeSuite(suite: TestDescriptor) {}
        override fun beforeTest(testDescriptor: TestDescriptor) {}
        override fun afterTest(testDescriptor: TestDescriptor, result: TestResult) {}
        override fun afterSuite(suite: TestDescriptor, result: TestResult) {
            if (suite.parent == null) {
                println(
                    "Tests: ${result.testCount} run, ${result.successfulTestCount} passed, " +
                        "${result.failedTestCount} failed, ${result.skippedTestCount} skipped (${result.resultType})",
                )
            }
        }
    })
}
