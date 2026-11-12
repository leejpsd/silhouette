package app.silhouette.benefits.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.core.CriterionState
import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors

// Drawn marks. Decorative only: every mark is shown next to text that says the same thing, so
// none of them carries meaning through color alone (WCAG 1.4.1) and none has a content description.

private const val HEAD = "M24 6a8.5 8.5 0 1 1 0 17a8.5 8.5 0 0 1 0-17z"
private const val BODY = "M7 42c0-9.4 7.6-15 17-15s17 5.6 17 15z"

/** What the silhouette mark shows: a verdict, or the brand (solid, primary color). */
sealed interface MarkKind {
    data class Of(val verdict: Verdict) : MarkKind

    data object Brand : MarkKind
}

/**
 * Head-and-shoulders silhouette whose fill encodes the verdict: likely = solid, maybe = half
 * filled, depends = dashed outline, unlikely = faint thin outline. Drawn on a 48-unit grid.
 */
@Composable
fun SilhouetteMark(kind: MarkKind, size: Dp, modifier: Modifier = Modifier) {
    val colors = LocalSilhouetteColors.current
    val color = when (kind) {
        MarkKind.Brand -> MaterialTheme.colorScheme.primary
        is MarkKind.Of -> colors.verdict(kind.verdict)
    }
    val path = remember {
        Path().apply {
            addPath(PathParser().parsePathString(HEAD).toPath())
            addPath(PathParser().parsePathString(BODY).toPath())
        }
    }
    Canvas(modifier.size(size)) {
        scale(this.size.width / 48f, this.size.height / 48f, pivot = Offset.Zero) {
            val outline = Stroke(width = 2f, join = StrokeJoin.Round)
            when (kind) {
                MarkKind.Brand -> drawPath(path, color, style = Fill)
                is MarkKind.Of -> when (kind.verdict) {
                    Verdict.LIKELY -> drawPath(path, color, style = Fill)
                    Verdict.MAYBE -> {
                        clipRect(0f, 0f, 24f, 48f) { drawPath(path, color, style = Fill) }
                        drawPath(path, color, style = outline)
                    }
                    Verdict.DEPENDS -> drawPath(
                        path,
                        color,
                        style = Stroke(width = 2f, join = StrokeJoin.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 3.2f))),
                    )
                    Verdict.UNLIKELY -> drawPath(path, color.copy(alpha = 0.75f), style = Stroke(width = 1.5f, join = StrokeJoin.Round))
                }
            }
        }
    }
}

/** Criterion state icon on a 24-unit grid: met = filled with a check, not met = cross, mixed = half, unknown = dashed. */
@Composable
fun StateIcon(state: CriterionState, color: Color, background: Color, modifier: Modifier = Modifier, size: Dp = 24.dp) {
    Canvas(modifier.size(size)) {
        scale(this.size.width / 24f, this.size.height / 24f, pivot = Offset.Zero) {
            val ring = Stroke(width = 2f)
            when (state) {
                CriterionState.PASS -> {
                    drawCircle(color, radius = 10f, center = Offset(12f, 12f))
                    val check = Path().apply {
                        moveTo(7f, 12.5f)
                        lineTo(10.2f, 15.7f)
                        lineTo(17f, 9f)
                    }
                    drawPath(check, background, style = Stroke(width = 2.2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
                CriterionState.FAIL -> {
                    drawCircle(color, radius = 9.5f, center = Offset(12f, 12f), style = ring)
                    val cross = Stroke(width = 2f, cap = StrokeCap.Round)
                    drawLine(color, Offset(8.5f, 8.5f), Offset(15.5f, 15.5f), strokeWidth = cross.width, cap = StrokeCap.Round)
                    drawLine(color, Offset(15.5f, 8.5f), Offset(8.5f, 15.5f), strokeWidth = cross.width, cap = StrokeCap.Round)
                }
                CriterionState.MIXED -> {
                    drawCircle(color, radius = 9.5f, center = Offset(12f, 12f), style = ring)
                    drawArc(color, startAngle = 90f, sweepAngle = 180f, useCenter = true, topLeft = Offset(2.5f, 2.5f), size = Size(19f, 19f))
                }
                CriterionState.UNKNOWN -> drawCircle(
                    color,
                    radius = 9.5f,
                    center = Offset(12f, 12f),
                    style = Stroke(width = 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.2f, 2.6f))),
                )
            }
        }
    }
}

/** Padlock for "stays on this device" notes, on a 20-unit grid. */
@Composable
fun LockIcon(color: Color, modifier: Modifier = Modifier, size: Dp = 20.dp) {
    Canvas(modifier.size(size)) {
        scale(this.size.width / 20f, this.size.height / 20f, pivot = Offset.Zero) { drawLock(color) }
    }
}

private fun DrawScope.drawLock(color: Color) {
    drawRoundRect(color, topLeft = Offset(4f, 9f), size = Size(12f, 8.5f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(2f))
    val shackle = Path().apply {
        moveTo(6.75f, 9f)
        lineTo(6.75f, 6.5f)
        cubicTo(6.75f, 2.2f, 13.25f, 2.2f, 13.25f, 6.5f)
        lineTo(13.25f, 9f)
    }
    drawPath(shackle, color, style = Stroke(width = 1.8f))
}
