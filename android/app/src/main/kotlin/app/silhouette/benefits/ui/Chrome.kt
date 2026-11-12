package app.silhouette.benefits.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.intl.LocaleList
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.data.OutboundLog
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.ui.theme.LocalDimens
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors

/** Top bar: wordmark (back to start) and the language menu. */
@Composable
fun TopBar(strings: Strings, onHome: () -> Unit, onLanguage: (AppLanguage) -> Unit) {
    val d = LocalDimens.current
    var open by rememberSaveable { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = d.xs, vertical = d.xxs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            Modifier
                .heightIn(min = d.minTapTarget)
                .clickable(role = Role.Button, onClickLabel = null, onClick = onHome)
                .semantics(mergeDescendants = true) { contentDescription = strings("nav.home") }
                .padding(horizontal = d.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(d.xs),
        ) {
            SilhouetteMark(MarkKind.Brand, 28.dp)
            Text("Silhouette", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
        }
        Box {
            TextButton(
                onClick = { open = true },
                modifier = Modifier
                    .heightIn(min = d.minTapTarget)
                    .testTag("language-button")
                    .semantics { contentDescription = "${strings("nav.language")}: ${strings.language.nativeName}" },
            ) {
                Text(
                    strings.language.nativeName + " ▾",
                    style = MaterialTheme.typography.labelLarge.merge(TextStyle(localeList = LocaleList(strings.language.tag))),
                )
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                for (language in AppLanguage.entries) {
                    DropdownMenuItem(
                        text = {
                            Text(
                                language.nativeName,
                                style = MaterialTheme.typography.bodyLarge.merge(TextStyle(localeList = LocaleList(language.tag))),
                                fontWeight = if (language == strings.language) FontWeight.Bold else FontWeight.Normal,
                            )
                        },
                        onClick = {
                            open = false
                            onLanguage(language)
                        },
                        modifier = Modifier
                            .heightIn(min = d.minTapTarget)
                            .testTag("language-${language.tag}")
                            .semantics { selected = language == strings.language },
                    )
                }
            }
        }
    }
    HorizontalDivider(color = LocalSilhouetteColors.current.border)
}

/** Shown whenever a synthetic rule pack is active. */
@Composable
fun DemoBanner(strings: Strings, modifier: Modifier = Modifier) {
    val c = LocalSilhouetteColors.current
    val d = LocalDimens.current
    val shape = RoundedCornerShape(d.radiusControl)
    Row(
        modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .background(c.notice, shape)
            .testTag("demo-banner")
            .semantics(mergeDescendants = true) {},
    ) {
        // Hatched edge: a "caution" cue that does not depend on color.
        Canvas(Modifier.width(10.dp).fillMaxHeight()) {
            clipRect {
                var x = -size.height
                while (x < size.width) {
                    drawLine(c.onNotice, Offset(x, size.height), Offset(x + size.height, 0f), strokeWidth = 3.dp.toPx())
                    x += 8.dp.toPx()
                }
            }
        }
        Column(Modifier.padding(horizontal = d.sm, vertical = d.sm), verticalArrangement = Arrangement.spacedBy(d.xxs)) {
            Text(strings("demo.title"), style = MaterialTheme.typography.titleSmall, color = c.onNotice)
            Text(strings("demo.body"), style = MaterialTheme.typography.bodyMedium, color = c.onNotice)
        }
    }
}

/**
 * The persistent "Leaving your device" bar. It reads only [OutboundLog], which every outbound call
 * records into, so it says "nothing has left" only while that is true.
 */
@Composable
fun LeavingBar(strings: Strings, log: OutboundLog) {
    val c = LocalSilhouetteColors.current
    val d = LocalDimens.current
    val entries by log.entries.collectAsState()
    val left = entries.filter { it.status != OutboundLog.Status.KEPT_ON_DEVICE }
    var open by rememberSaveable { mutableStateOf(false) }
    val fieldName = { f: String -> strings.lookup("outbound.field.$f")?.let { strings("outbound.field.$f") } ?: f }
    Column(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .testTag("leaving-bar")
            .animateContentSize(),
    ) {
        HorizontalDivider(color = c.borderStrong)
        if (open) {
            Column(
                Modifier
                    .fillMaxWidth()
                    .heightInMaxFraction()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = d.md, vertical = d.sm),
                verticalArrangement = Arrangement.spacedBy(d.xs),
            ) {
                Text(strings("leaving.body"), style = MaterialTheme.typography.bodyMedium)
                for (e in entries) {
                    var showPayload by rememberSaveable(e.id) { mutableStateOf(false) }
                    Column(Modifier.testTag("outbound-entry"), verticalArrangement = Arrangement.spacedBy(d.xxs)) {
                        val keptHere = e.status == OutboundLog.Status.KEPT_ON_DEVICE
                        val status = when (e.status) {
                            OutboundLog.Status.ATTEMPTED -> strings("outbound.status.attempted")
                            OutboundLog.Status.SENT -> strings("outbound.status.sent", "status" to (e.responseStatus ?: "—"))
                            OutboundLog.Status.FAILED -> strings("outbound.status.failed", "reason" to (e.failureReason ?: "—"))
                            OutboundLog.Status.KEPT_ON_DEVICE -> strings("outbound.status.answeredOnDevice")
                        }
                        Text(e.fields.joinToString(", ") { fieldName(it) } + " · " + status, style = MaterialTheme.typography.titleSmall)
                        // A request answered on this device went nowhere, so it has no destination line.
                        if (!keptHere) {
                            Text(strings("outbound.requestTo", "destination" to e.destination, "path" to (e.path ?: "")), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                        }
                        e.model?.let { Text(strings("outbound.model", "model" to it), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
                        if (e.payload != null) {
                            TextButton(onClick = { showPayload = !showPayload }, modifier = Modifier.heightIn(min = d.minTapTarget)) {
                                Text(strings(if (keptHere) "outbound.showSilhouette" else "outbound.showPayload"), style = MaterialTheme.typography.labelLarge)
                            }
                            if (showPayload) {
                                Text(
                                    e.payload,
                                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
                                    softWrap = false,
                                    modifier = Modifier.horizontalScroll(rememberScrollState()).testTag("outbound-payload"),
                                )
                            }
                        }
                    }
                }
                if (left.isNotEmpty()) Text(strings("leaving.network"), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(start = d.md, end = d.xs, top = d.xxs, bottom = d.xxs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(d.xs),
        ) {
            // Only what left, or may have left, the device counts here.
            val status = if (left.isEmpty()) {
                strings("leaving.none")
            } else {
                strings("outbound.count", "count" to left.size, "list" to left.flatMap { it.fields }.distinct().joinToString(", ") { fieldName(it) })
            }
            // Title and status share one paragraph so the bar stays short at large font sizes.
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)) {
                        append(strings("leaving.title"))
                    }
                    append("  ")
                    append(status)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = c.textMuted,
                modifier = Modifier
                    .weight(1f)
                    .testTag("leaving-status")
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
            TextButton(
                onClick = { open = !open },
                modifier = Modifier
                    .heightIn(min = d.minTapTarget)
                    .testTag("leaving-details"),
            ) { Text(if (open) strings("leaving.hide") else strings("leaving.details"), style = MaterialTheme.typography.labelLarge) }
        }
    }
}

private fun Modifier.heightInMaxFraction(): Modifier = this.heightIn(max = 280.dp)

/** Footer: the not-a-government-service line and "Delete everything" with a confirmation dialog. */
@Composable
fun Footer(strings: Strings, onDelete: () -> Unit) {
    val d = LocalDimens.current
    var confirming by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().padding(top = d.lg),
        verticalArrangement = Arrangement.spacedBy(d.xs),
    ) {
        HorizontalDivider(color = LocalSilhouetteColors.current.border)
        Meta(strings("promise.line3"))
        TextButton(
            onClick = { confirming = true },
            modifier = Modifier.heightIn(min = d.minTapTarget).widthIn(min = d.minTapTarget).testTag("delete-everything"),
        ) { Text(strings("delete.all"), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelLarge) }
    }
    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = { Text(strings("delete.title"), modifier = Modifier.semantics { heading() }) },
            text = { Text(strings("delete.body"), style = MaterialTheme.typography.bodyLarge) },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirming = false
                        onDelete()
                    },
                    modifier = Modifier.heightIn(min = d.minTapTarget).testTag("delete-confirm"),
                ) { Text(strings("delete.confirm"), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelLarge) }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }, modifier = Modifier.heightIn(min = d.minTapTarget)) {
                    Text(strings("delete.cancel"), style = MaterialTheme.typography.labelLarge)
                }
            },
        )
    }
}
