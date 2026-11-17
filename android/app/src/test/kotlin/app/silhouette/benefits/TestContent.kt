package app.silhouette.benefits

import app.silhouette.benefits.content.AppContent
import app.silhouette.benefits.content.ContentSource
import java.io.File

/** The app content read from the shared folder in place (the path comes from the Gradle test task). */
object TestContent {
    val sharedDir: File = File(
        System.getProperty("silhouette.shared") ?: error("system property silhouette.shared is not set; run the tests through Gradle"),
    )

    val source = ContentSource { path -> File(sharedDir, path).takeIf { it.isFile }?.readText(Charsets.UTF_8) }

    /** The invented zz-test pack: the tests' fixed programs and limits. */
    val content: AppContent by lazy { AppContent.load(source, "zz-test") }

    /** The pack people see: the California draft. */
    val california: AppContent by lazy { AppContent.load(source) }
}
