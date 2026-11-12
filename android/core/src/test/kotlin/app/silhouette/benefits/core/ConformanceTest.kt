package app.silhouette.benefits.core

import app.silhouette.benefits.core.conformance.ConformanceSuite
import app.silhouette.benefits.core.conformance.FixtureSource
import org.junit.jupiter.api.DynamicContainer.dynamicContainer
import org.junit.jupiter.api.DynamicNode
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.TestFactory

/**
 * Runs [ConformanceSuite] on the JVM against shared/fixtures, read in place from the shared folder
 * (never copied). Each fixture case is reported as its own test, grouped by file.
 */
class ConformanceTest {
    private val source = object : FixtureSource {
        override fun list(dir: String): List<String> =
            (Shared.file(dir).listFiles() ?: error("not a folder: $dir")).filter { it.isFile }.map { it.name }

        override fun text(path: String): String = Shared.text(path)
    }

    @TestFactory
    fun conformance(): List<DynamicNode> =
        ConformanceSuite.cases(source).groupBy { it.group }.map { (group, cases) ->
            dynamicContainer(group, cases.map { case -> dynamicTest(case.name) { case.run() } })
        }
}
