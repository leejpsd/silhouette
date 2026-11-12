package app.silhouette.benefits.core

import org.jetbrains.kotlin.cli.common.ExitCode
import org.jetbrains.kotlin.cli.jvm.K2JVMCompiler
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicNode
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.PrintStream
import java.nio.file.Files

/**
 * Compile-time proof of the routing rule (shared/DATA_TYPES.md, "Enforcing it in code").
 *
 * Every snippet in src/routingProof/ is compiled with the Kotlin compiler against the compiled
 * :core classes, in its own module, exactly like app code would be. Snippets marked with a
 * diagnostic name must fail with that diagnostic; the COMPILES snippet must succeed.
 */
class RoutingProofTest {
    private val dir = File(System.getProperty("silhouette.routingProof.dir") ?: error("silhouette.routingProof.dir is not set"))
    private val classpath = System.getProperty("silhouette.routingProof.classpath") ?: error("silhouette.routingProof.classpath is not set")

    @TestFactory
    fun snippets(): List<DynamicNode> {
        val files = dir.listFiles { f -> f.name.endsWith(".kt") }!!.sortedBy { it.name }
        return listOf(
            dynamicTest("there is a compiling control snippet and at least five rejected snippets") {
                val expectations = files.map(::expectation)
                assertEquals(1, expectations.count { it == COMPILES })
                assertTrue(expectations.count { it != COMPILES } >= 5)
            },
        ) + files.map { file ->
            val expected = expectation(file)
            dynamicTest("${file.name}: $expected") {
                val (exit, output) = compile(file)
                if (expected == COMPILES) {
                    assertEquals(ExitCode.OK, exit, output)
                } else {
                    assertEquals(ExitCode.COMPILATION_ERROR, exit, output)
                    assertTrue(output.contains("[$expected]"), "expected diagnostic $expected, got:\n$output")
                }
            }
        }
    }

    private fun expectation(file: File): String =
        file.useLines { it.first() }.removePrefix("// EXPECT:").trim().also { require(it.isNotEmpty()) { "${file.name}: no EXPECT line" } }

    private fun compile(file: File): Pair<ExitCode, String> {
        val out = Files.createTempDirectory("routing-proof").toFile()
        try {
            val messages = ByteArrayOutputStream()
            val exit = PrintStream(messages, true, Charsets.UTF_8).use { stream ->
                K2JVMCompiler().exec(
                    stream,
                    "-no-stdlib", "-no-reflect",
                    "-classpath", classpath,
                    "-module-name", "routing-proof",
                    "-Xrender-internal-diagnostic-names",
                    "-d", out.absolutePath,
                    file.absolutePath,
                )
            }
            return exit to messages.toString(Charsets.UTF_8)
        } finally {
            out.deleteRecursively()
        }
    }

    private companion object {
        const val COMPILES = "COMPILES"
    }
}
