package app.silhouette.benefits

import app.silhouette.benefits.ui.theme.DesignTokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DesignTokensTest {
    private val tokens = TestContent.content.tokens

    @Test
    fun `tokens parse with every color the theme needs`() {
        for (palette in listOf(tokens.light, tokens.dark)) {
            DesignTokens.REQUIRED_COLORS.forEach { assertTrue(it, it in palette.colors) }
        }
        assertEquals(48, tokens.size["minTapTarget"])
        assertEquals(setOf("display", "title", "heading", "body", "bodyStrong", "small"), tokens.type.keys)
    }

    /** WCAG 1.4.3 / 1.4.11: text 4.5:1 on its background, verdict marks 3:1 against the surface. */
    @Test
    fun `token colors meet contrast minimums in light and dark`() {
        for ((name, p) in listOf("light" to tokens.light, "dark" to tokens.dark)) {
            fun ratio(a: String, b: String) = DesignTokens.contrast(p[a], p[b])
            for ((fg, bg) in listOf(
                "text" to "background", "text" to "surface", "textMuted" to "surface", "textMuted" to "background",
                "onPrimary" to "primary", "onNotice" to "notice", "onPrivate" to "private", "danger" to "surface",
                "primary" to "surface",
            )) {
                assertTrue("$name $fg on $bg: ${ratio(fg, bg)}", ratio(fg, bg) >= 4.5)
            }
            for (v in listOf("verdictLikely", "verdictMaybe", "verdictDepends", "verdictUnlikely")) {
                assertTrue("$name $v on surface", ratio(v, "surface") >= 4.5)
                assertTrue("$name $v on background", ratio(v, "background") >= 3.0)
            }
        }
    }
}
