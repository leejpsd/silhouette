package app.silhouette.benefits.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusTarget
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.ui.theme.LocalDimens
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors

/**
 * A screen: scrolls vertically, keeps text at a readable width, and announces itself to screen
 * readers by [paneTitle] when it appears.
 */
@Composable
fun Screen(paneTitle: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val d = LocalDimens.current
    Box(modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier
                .widthIn(max = d.readingWidth + d.md * 2)
                .fillMaxWidth()
                .semantics { this.paneTitle = paneTitle }
                .verticalScroll(rememberScrollState())
                .padding(horizontal = d.md, vertical = d.lg),
            verticalArrangement = Arrangement.spacedBy(d.md),
            content = content,
        )
    }
}

/** The screen's title. Marked as a heading; receives input focus when the screen opens. */
@Composable
fun ScreenHeading(text: String, modifier: Modifier = Modifier) {
    val focus = androidx.compose.runtime.remember { FocusRequester() }
    Text(
        text = text,
        style = MaterialTheme.typography.headlineLarge,
        color = MaterialTheme.colorScheme.onBackground,
        modifier = modifier
            .semantics { heading() }
            .focusRequester(focus)
            .focusTarget(),
    )
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
}

@Composable
fun SectionHeading(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.onBackground,
        modifier = modifier.semantics { heading() },
    )
}

@Composable
fun Lead(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodyLarge, color = LocalSilhouetteColors.current.textMuted, modifier = modifier)
}

@Composable
fun Meta(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = LocalSilhouetteColors.current.textMuted, modifier = modifier)
}

private val buttonPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp)

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val d = LocalDimens.current
    Button(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = d.comfortableTapTarget),
        shape = RoundedCornerShape(d.radiusControl),
        contentPadding = buttonPadding,
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}

@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val d = LocalDimens.current
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = d.comfortableTapTarget),
        shape = RoundedCornerShape(d.radiusControl),
        border = BorderStroke(1.5.dp, LocalSilhouetteColors.current.borderStrong),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.primary),
        contentPadding = buttonPadding,
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}

@Composable
fun QuietButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val d = LocalDimens.current
    TextButton(
        onClick = onClick,
        modifier = modifier.heightIn(min = d.minTapTarget),
        shape = RoundedCornerShape(d.radiusControl),
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
    ) { Text(text, style = MaterialTheme.typography.labelLarge) }
}

/** "Stays on this device" style note with a padlock. */
@Composable
fun PrivateNote(text: String, modifier: Modifier = Modifier) {
    val c = LocalSilhouetteColors.current
    val d = LocalDimens.current
    Row(
        modifier
            .fillMaxWidth()
            .background(c.private, RoundedCornerShape(d.radiusControl))
            .padding(horizontal = d.sm, vertical = d.xs),
        horizontalArrangement = Arrangement.spacedBy(d.xs),
        verticalAlignment = Alignment.Top,
    ) {
        LockIcon(c.onPrivate, Modifier.padding(top = 2.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = c.onPrivate)
    }
}

/** A single-choice row: the whole row is the touch target and is announced as a radio button. */
@Composable
fun ChoiceRow(label: String, selected: Boolean, onSelect: () -> Unit, modifier: Modifier = Modifier) {
    ChoiceFrame(selected, modifier.selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)) {
        RadioButton(selected = selected, onClick = null)
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
    }
}

/** A multiple-choice row, announced as a checkbox. */
@Composable
fun CheckRow(label: String, checked: Boolean, onToggle: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    ChoiceFrame(checked, modifier.toggleable(value = checked, role = Role.Checkbox, onValueChange = onToggle)) {
        Checkbox(checked = checked, onCheckedChange = null)
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun ChoiceFrame(selected: Boolean, modifier: Modifier, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    val c = LocalSilhouetteColors.current
    val d = LocalDimens.current
    val shape = RoundedCornerShape(d.radiusControl)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = d.comfortableTapTarget)
            .background(if (selected) c.private else MaterialTheme.colorScheme.surface, shape)
            .border(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else c.border, shape)
            .padding(horizontal = d.sm, vertical = d.xs),
        horizontalArrangement = Arrangement.spacedBy(d.sm),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/** A panel on the surface color with a hairline border. */
@Composable
fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val d = LocalDimens.current
    val shape = RoundedCornerShape(d.radiusPanel)
    Column(
        modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(1.dp, LocalSilhouetteColors.current.border, shape)
            .padding(d.md),
        verticalArrangement = Arrangement.spacedBy(d.xs),
        content = content,
    )
}

@Composable
fun BulletList(items: List<String>, modifier: Modifier = Modifier) {
    val d = LocalDimens.current
    Column(modifier, verticalArrangement = Arrangement.spacedBy(d.xs)) {
        for (item in items) {
            Row(horizontalArrangement = Arrangement.spacedBy(d.xs)) {
                Text("•", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, modifier = Modifier.clearAndSetSemantics {})
                Text(item, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}
