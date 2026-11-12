package app.silhouette.benefits.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.silhouette.benefits.core.Verdict

/** Token colors that Material 3 has no slot for. */
@Immutable
data class SilhouetteColors(
    val textMuted: Color,
    val border: Color,
    val borderStrong: Color,
    val surfaceSunken: Color,
    val focus: Color,
    val notice: Color,
    val onNotice: Color,
    val private: Color,
    val onPrivate: Color,
    val verdictLikely: Color,
    val verdictMaybe: Color,
    val verdictDepends: Color,
    val verdictUnlikely: Color,
) {
    fun verdict(v: Verdict): Color = when (v) {
        Verdict.LIKELY -> verdictLikely
        Verdict.MAYBE -> verdictMaybe
        Verdict.DEPENDS -> verdictDepends
        Verdict.UNLIKELY -> verdictUnlikely
    }
}

/** Spacing, radii and sizes from the tokens, in dp. */
@Immutable
data class Dimens(
    val xxs: Dp,
    val xs: Dp,
    val sm: Dp,
    val md: Dp,
    val lg: Dp,
    val xl: Dp,
    val xxl: Dp,
    val radiusControl: Dp,
    val radiusPanel: Dp,
    val minTapTarget: Dp,
    val comfortableTapTarget: Dp,
    val readingWidth: Dp,
    val focusRing: Dp,
)

val LocalSilhouetteColors = staticCompositionLocalOf<SilhouetteColors> { error("no SilhouetteTheme") }
val LocalDimens = staticCompositionLocalOf<Dimens> { error("no SilhouetteTheme") }

private fun Long.color() = Color(this)

private fun colorScheme(p: DesignTokens.Palette, dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = p["primary"].color(),
        onPrimary = p["onPrimary"].color(),
        primaryContainer = p["private"].color(),
        onPrimaryContainer = p["onPrivate"].color(),
        secondary = p["primary"].color(),
        onSecondary = p["onPrimary"].color(),
        secondaryContainer = p["surfaceSunken"].color(),
        onSecondaryContainer = p["text"].color(),
        tertiary = p["verdictLikely"].color(),
        background = p["background"].color(),
        onBackground = p["text"].color(),
        surface = p["surface"].color(),
        onSurface = p["text"].color(),
        surfaceVariant = p["surfaceSunken"].color(),
        onSurfaceVariant = p["textMuted"].color(),
        surfaceContainerLowest = p["surface"].color(),
        surfaceContainerLow = p["surface"].color(),
        surfaceContainer = p["surface"].color(),
        surfaceContainerHigh = p["surface"].color(),
        surfaceContainerHighest = p["surfaceSunken"].color(),
        outline = p["borderStrong"].color(),
        outlineVariant = p["border"].color(),
        error = p["danger"].color(),
        onError = p["onDanger"].color(),
    )
}

private fun silhouetteColors(p: DesignTokens.Palette) = SilhouetteColors(
    textMuted = p["textMuted"].color(),
    border = p["border"].color(),
    borderStrong = p["borderStrong"].color(),
    surfaceSunken = p["surfaceSunken"].color(),
    focus = p["focus"].color(),
    notice = p["notice"].color(),
    onNotice = p["onNotice"].color(),
    private = p["private"].color(),
    onPrivate = p["onPrivate"].color(),
    verdictLikely = p["verdictLikely"].color(),
    verdictMaybe = p["verdictMaybe"].color(),
    verdictDepends = p["verdictDepends"].color(),
    verdictUnlikely = p["verdictUnlikely"].color(),
)

private fun style(t: DesignTokens.TypeStyle) = TextStyle(
    fontSize = t.size.sp,
    lineHeight = t.lineHeight.sp,
    fontWeight = FontWeight(t.weight),
    letterSpacing = t.letterSpacing.sp,
)

/** Material 3 type roles mapped onto the token scale (display, title, heading, body, small). */
/**
 * Every style carries the app language, so text is shaped, broken into lines and read aloud by
 * screen readers in that language even when it differs from the device language.
 */
private fun typography(tokens: DesignTokens, languageTag: String): Typography {
    val locale = LocaleList(languageTag)
    // Phrase-based breaking keeps Korean words whole (like `word-break: keep-all` on the web);
    // it has no effect on Latin text.
    val lineBreak = LineBreak.Paragraph.copy(wordBreak = LineBreak.WordBreak.Phrase)
    fun role(name: String) = style(tokens.typeStyle(name)).copy(localeList = locale, lineBreak = lineBreak)
    val display = role("display")
    val title = role("title")
    val heading = role("heading")
    val body = role("body")
    val bodyStrong = role("bodyStrong")
    val small = role("small")
    return Typography(
        displayLarge = display, displayMedium = display, displaySmall = display,
        headlineLarge = title, headlineMedium = title, headlineSmall = heading,
        titleLarge = heading, titleMedium = bodyStrong, titleSmall = small.copy(fontWeight = FontWeight.Bold),
        bodyLarge = body, bodyMedium = small, bodySmall = small,
        labelLarge = bodyStrong, labelMedium = small, labelSmall = small,
    )
}

private fun dimens(t: DesignTokens) = Dimens(
    xxs = t.space("xxs").dp, xs = t.space("xs").dp, sm = t.space("sm").dp, md = t.space("md").dp,
    lg = t.space("lg").dp, xl = t.space("xl").dp, xxl = t.space("xxl").dp,
    radiusControl = t.radius.getValue("control").dp, radiusPanel = t.radius.getValue("panel").dp,
    minTapTarget = t.size.getValue("minTapTarget").dp, comfortableTapTarget = t.size.getValue("comfortableTapTarget").dp,
    readingWidth = t.size.getValue("readingWidth").dp, focusRing = t.size.getValue("focusRing").dp,
)

@Composable
fun SilhouetteTheme(
    tokens: DesignTokens,
    languageTag: String,
    dark: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val palette = if (dark) tokens.dark else tokens.light
    val d = dimens(tokens)
    CompositionLocalProvider(LocalSilhouetteColors provides silhouetteColors(palette), LocalDimens provides d) {
        MaterialTheme(
            colorScheme = colorScheme(palette, dark),
            typography = typography(tokens, languageTag),
            shapes = Shapes(
                small = RoundedCornerShape(d.radiusControl),
                medium = RoundedCornerShape(d.radiusControl),
                large = RoundedCornerShape(d.radiusPanel),
                extraLarge = RoundedCornerShape(d.radiusPanel),
            ),
            content = content,
        )
    }
}
