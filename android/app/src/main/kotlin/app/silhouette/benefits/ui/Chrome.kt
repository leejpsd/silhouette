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

/**
 * The notice under the header whenever the rule pack is a draft (numbers read from official sources
 * on a date, not yet all confirmed by a person; rulepacks/SPEC.md section 2) or the invented demo
 * pack. "More" opens a sheet with the whole notice, the two-minute path and the on-device check.
 */
@Composable
fun DemoBanner(
    strings: Strings,
    draft: Boolean,
    sourcesReadOn: String?,
    modifier: Modifier = Modifier,
    onJudges: (() -> Unit)? = null,
    onDeviceCheck: (() -> Unit)? = null,
    onDelete: (() -> Unit)? = null,
) {
    val c = LocalSilhouetteColors.current
    val d = LocalDimens.current
    val shape = RoundedCornerShape(d.radiusControl)
    var open by rememberSaveable { mutableStateOf(false) }
    val date = sourcesReadOn?.let { strings.packDate(it) } ?: ""
    val title = if (draft) strings("pack.draft.title") else strings("demo.title")
    Row(
        modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .background(c.notice, shape)
            .testTag("demo-banner"),
        verticalAlignment = Alignment.CenterVertically,
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
        Text(
            if (draft) strings("pack.draft.short", "date" to date) else strings("demo.short"),
            style = MaterialTheme.typography.bodyMedium,
            color = c.onNotice,
            modifier = Modifier.weight(1f).padding(horizontal = d.sm, vertical = d.xs),
        )
        TextButton(
            onClick = { open = true },
            modifier = Modifier.heightIn(min = d.minTapTarget).testTag("demo-more"),
        ) { Text(strings("demo.more"), style = MaterialTheme.typography.labelLarge) }
    }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            modifier = Modifier.testTag("demo-sheet"),
            title = { Text(title, modifier = Modifier.semantics { heading() }) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(d.sm)) {
                    if (draft) {
                        Text(strings("pack.draft.body", "date" to date), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.testTag("draft-body"))
                        Text(strings("pack.draft.notice", "date" to date), style = MaterialTheme.typography.bodyMedium)
                    } else {
                        Text(strings("demo.body"), style = MaterialTheme.typography.bodyLarge)
                    }
                    Text(strings("promise.line3"), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                    if (onJudges != null) {
                        TextButton(onClick = { open = false; onJudges() }, modifier = Modifier.heightIn(min = d.minTapTarget).testTag("judges-link")) {
                            Text(strings("demo.judges"), style = MaterialTheme.typography.labelLarge)
                        }
                    }
                    if (onDeviceCheck != null) {
                        TextButton(onClick = { open = false; onDeviceCheck() }, modifier = Modifier.heightIn(min = d.minTapTarget).testTag("device-check-link")) {
                            Text(strings("demo.deviceCheck"), style = MaterialTheme.typography.labelLarge)
                        }
                    }
                    if (onDelete != null) DeleteEverything(strings, onDelete = { open = false; onDelete() })
                }
            },
            confirmButton = {
                TextButton(onClick = { open = false }, modifier = Modifier.heightIn(min = d.minTapTarget)) {
                    Text(strings("nav.close"), style = MaterialTheme.typography.labelLarge)
                }
            },
        )
    }
}

/**
 * The persistent "Leaving your device" bar (shared/RECORD.md). It reads only [OutboundLog]. The
 * number is every request that left (attempted, sent, failed); the line under it splits that number
 * into what carried something of the person's and the rest. "Details" opens the record: what left,
 * what was answered on this device (kept), what was stopped before it left, and "Delete everything".
 */
@Composable
fun LeavingBar(strings: Strings, log: OutboundLog, onDelete: (() -> Unit)? = null, openRequest: Int = 0) {
    val c = LocalSilhouetteColors.current
    val d = LocalDimens.current
    val entries by log.entries.collectAsState()
    val clearedAt by log.clearedAt.collectAsState()
    val left = OutboundLog.leftDevice(entries)
    val kept = entries.count { it.status == OutboundLog.Status.KEPT_ON_DEVICE }
    val notCompleted = entries.count { it.status == OutboundLog.Status.FAILED }
    var open by rememberSaveable { mutableStateOf(false) }
    // The two-minute path opens the record from its own button.
    androidx.compose.runtime.LaunchedEffect(openRequest) { if (openRequest > 0) open = true }
    val fieldName = { f: String -> strings.lookup("outbound.field.$f")?.let { strings("outbound.field.$f") } ?: f }
    val locale = strings.language.locale
    val clearedDate = clearedAt?.let { java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.MEDIUM, java.text.DateFormat.SHORT, locale).format(java.util.Date(it)) }
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
                    .padding(horizontal = d.md, vertical = d.sm)
                    .testTag("record"),
                verticalArrangement = Arrangement.spacedBy(d.xs),
            ) {
                if (entries.isNotEmpty()) {
                    Text(
                        strings("leaving.sentCount", "count" to left.size) + " " + strings("leaving.keptCount", "count" to kept),
                        style = MaterialTheme.typography.titleLarge,
                        modifier = Modifier.testTag("record-headline"),
                    )
                    Text(strings("leaving.bodySent"), style = MaterialTheme.typography.bodyMedium)
                } else if (clearedDate != null) {
                    Text(strings("leaving.recordDeleted", "date" to clearedDate), style = MaterialTheme.typography.titleLarge, modifier = Modifier.testTag("record-deleted"))
                    Text(strings("leaving.cleared", "date" to clearedDate), style = MaterialTheme.typography.bodyMedium)
                } else {
                    Text(strings("leaving.body"), style = MaterialTheme.typography.bodyMedium)
                }
                if (left.isNotEmpty() && left.none { e -> e.fields.any { it in OutboundLog.PERSONAL_FIELDS } }) Meta(strings("leaving.noValues"))
                if (notCompleted > 0) Meta(strings("leaving.notCompleted", "count" to notCompleted), Modifier.testTag("record-not-completed"))
                if (entries.isNotEmpty() && clearedDate != null) Meta(strings("leaving.cleared", "date" to clearedDate))
                Meta(strings("leaving.network"))
                Meta(strings("leaving.sdkNote"))
                for (e in entries) {
                    var showPayload by rememberSaveable(e.id) { mutableStateOf(false) }
                    Column(Modifier.testTag("outbound-entry"), verticalArrangement = Arrangement.spacedBy(d.xxs)) {
                        val keptHere = e.status == OutboundLog.Status.KEPT_ON_DEVICE
                        val status = statusLine(strings, e)
                        val time = if (e.at > 0) java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT, locale).format(java.util.Date(e.at)) + " · " else ""
                        Text(time + e.fields.joinToString(", ") { fieldName(it) }, style = MaterialTheme.typography.titleSmall)
                        Text(status, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("outbound-status"))
                        // An answer written on this device went nowhere: no destination and no body.
                        if (!keptHere) {
                            Text(strings("outbound.requestTo", "destination" to e.destination, "path" to (e.path ?: "")), style = MaterialTheme.typography.bodyMedium, color = c.textMuted)
                        }
                        e.model?.let { Text(strings("outbound.model", "model" to it), style = MaterialTheme.typography.bodyMedium, color = c.textMuted) }
                        if (e.payload != null && !keptHere) {
                            TextButton(onClick = { showPayload = !showPayload }, modifier = Modifier.heightIn(min = d.minTapTarget)) {
                                Text(strings("outbound.showPayload"), style = MaterialTheme.typography.labelLarge)
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
                if (onDelete != null) DeleteEverything(strings, onDelete)
            }
        }
        Row(
            Modifier.fillMaxWidth().padding(start = d.md, end = d.xs, top = d.xxs, bottom = d.xxs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(d.xs),
        ) {
            Text(left.size.toString(), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.testTag("leaving-count"))
            Column(Modifier.weight(1f)) {
                Text(strings("leaving.title"), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    countLine(strings, entries, clearedDate),
                    style = MaterialTheme.typography.bodyMedium,
                    color = c.textMuted,
                    modifier = Modifier
                        .testTag("leaving-status")
                        .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
            TextButton(
                onClick = { open = !open },
                modifier = Modifier
                    .heightIn(min = d.minTapTarget)
                    .testTag("leaving-details"),
            ) { Text(if (open) strings("leaving.hide") else strings("leaving.details"), style = MaterialTheme.typography.labelLarge) }
        }
    }
}

/** The line under the count (shared/RECORD.md section 4). */
fun countLine(strings: Strings, entries: List<OutboundLog.Entry>, clearedDate: String?): String {
    val split = OutboundLog.split(entries)
    return when {
        split.isNotEmpty() -> split.joinToString(" · ") { (key, count) -> strings(key, "count" to count) }
        clearedDate != null -> strings("leaving.clearedShort", "date" to clearedDate)
        else -> strings("leaving.none")
    }
}

/** How an entry's status reads: a request that did not complete never reads as sent (shared/RECORD.md section 2). */
fun statusLine(strings: Strings, e: OutboundLog.Entry): String = when (e.status) {
    OutboundLog.Status.ATTEMPTED -> strings("outbound.status.attempted")
    OutboundLog.Status.SENT -> strings("outbound.status.sent", "status" to (e.responseStatus ?: "—"))
    OutboundLog.Status.FAILED -> strings("outbound.status.failed", "reason" to (e.failureReason ?: "—"))
    OutboundLog.Status.BLOCKED -> strings(if (e.failureReason == OutboundLog.NO_APP_CHECK) "outbound.status.noAppCheck" else "outbound.status.blocked")
    OutboundLog.Status.KEPT_ON_DEVICE -> strings("outbound.status.answeredShort")
}

/** The open record takes at most 60 % of the window; its content scrolls inside it, so the screen is never covered whole. */
@Composable
private fun Modifier.heightInMaxFraction(): Modifier = this.heightIn(max = (androidx.compose.ui.platform.LocalConfiguration.current.screenHeightDp * 0.6f).dp)

/** Footer: the not-a-government-service line and "Delete everything" with a confirmation. */
@Composable
fun Footer(strings: Strings, onDelete: () -> Unit) {
    val d = LocalDimens.current
    Column(
        Modifier.fillMaxWidth().padding(top = d.lg),
        verticalArrangement = Arrangement.spacedBy(d.xs),
    ) {
        HorizontalDivider(color = LocalSilhouetteColors.current.border)
        Meta(strings("promise.line3"))
        DeleteEverything(strings, onDelete)
    }
}

/** "Delete everything", behind a confirmation. Lives in the record of what left and in the draft-rules sheet. */
@Composable
fun DeleteEverything(strings: Strings, onDelete: () -> Unit) {
    val d = LocalDimens.current
    var confirming by rememberSaveable { mutableStateOf(false) }
    TextButton(
        onClick = { confirming = true },
        modifier = Modifier.heightIn(min = d.minTapTarget).widthIn(min = d.minTapTarget).testTag("delete-everything"),
    ) { Text(strings("delete.all"), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelLarge) }
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
