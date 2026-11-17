package app.silhouette.benefits.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import app.silhouette.benefits.core.AnnualizationBasis
import app.silhouette.benefits.core.CheckStatus
import app.silhouette.benefits.core.FieldKind
import app.silhouette.benefits.core.SourceSegment
import app.silhouette.benefits.document.RowStatus
import app.silhouette.benefits.document.CHECK_FIELDS
import app.silhouette.benefits.document.leadAndRest
import app.silhouette.benefits.document.nothingFound
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.ChoiceRow
import app.silhouette.benefits.ui.InferenceBadge
import app.silhouette.benefits.ui.Lead
import app.silhouette.benefits.ui.Meta
import app.silhouette.benefits.ui.Panel
import app.silhouette.benefits.ui.PrimaryButton
import app.silhouette.benefits.ui.QuietButton
import app.silhouette.benefits.ui.ScreenHeading
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.SectionHeading
import app.silhouette.benefits.ui.theme.LocalDimens
import app.silhouette.benefits.ui.theme.LocalSilhouetteColors
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * Review: each field next to its source line with the referenced value highlighted. Confirm or
 * change each one, type what was not found, then the checks and the yearly income worked out
 * from the confirmed values.
 */
@Composable
fun ReviewContent(app: AppController) {
    val t = app.strings
    val d = LocalDimens.current
    val review = app.review
    val extraction = app.document.extraction

    // The device read nothing at all: this is probably not a paystub.
    if (extraction != null && !review.manual && nothingFound(extraction.fields) && !app.typingAnyway) {
        ScreenHeading(t("review.notDocument.title"))
        InferenceBadge(t, extraction.source, extraction.reason, detail = extraction.noDeviceModel.takeIf { it }?.let { t("reason.detail.noDeviceModel") })
        Lead(t("review.notDocument.body"))
        PrimaryButton(t("review.notDocument.typeIn"), onClick = app::typeAnyway, modifier = Modifier.testTag("not-document-type"))
        SecondaryButton(t("review.notDocument.another"), onClick = { app.navigate(Route.Document) })
        return
    }
    ScreenHeading(t("review.title"))
    extraction?.let { InferenceBadge(t, it.source, it.reason, detail = it.noDeviceModel.takeIf { b -> b }?.let { t("reason.detail.noDeviceModel") }) }
    Lead(if (review.manual) t("review.manualLead") else t("review.lead"))
    if (!review.manual && review.pending > 0) {
        SecondaryButton(t("review.confirmAllCount", "count" to review.pending), onClick = app::confirmAll, modifier = Modifier.testTag("confirm-all"))
        Meta(t("review.pending", "count" to review.pending))
    }
    // What decides the yearly income first; everything else behind "More values", opened when it needs attention.
    val flagged = review.result?.checks?.lastOrNull().orEmpty().filter { it.status == CheckStatus.WARN }.flatMap { CHECK_FIELDS[it.id].orEmpty() }.toSet()
    val (leadRows, restRows) = leadAndRest(review, flagged)
    var moreOpen by rememberSaveable { mutableStateOf(false) }
    for (row in leadRows) FieldRow(app, row)
    QuietButton(t("review.moreValues", "count" to restRows.size + review.deductions.size), onClick = { moreOpen = !moreOpen }, modifier = Modifier.testTag("more-values"))
    if (moreOpen || "deductions" in flagged) {
    for (row in restRows) FieldRow(app, row)
    SectionHeading(t("field.paystub.deductions"))
    if (review.deductionsNotRead && review.deductions.isEmpty()) Meta(t("review.deductionsNotRead"), Modifier.testTag("deductions-not-read"))
    review.deductions.forEachIndexed { index, deduction ->
        Panel(Modifier.testTag("deduction-$index")) {
            OutlinedTextField(
                value = deduction.amount,
                onValueChange = { app.updateDeduction(index, it, deduction.kind) },
                label = { Text(t("field.deduction.amount")) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth().testTag("deduction-amount-$index"),
            )
            DeductionKind(t, app.deductionKinds, deduction.kind) { app.updateDeduction(index, deduction.amount, it) }
            SourceLines(t, deduction.source)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(d.xs)) {
                if (deduction.status == RowStatus.PENDING) {
                    SecondaryButton(t("review.confirm"), onClick = { app.confirmDeduction(index) }, modifier = Modifier.weight(1f).testTag("deduction-confirm-$index"))
                } else {
                    Text("✓ " + t("review.confirmed"), color = LocalSilhouetteColors.current.verdictLikely, modifier = Modifier.weight(1f))
                }
                QuietButton(t("review.removeDeduction"), onClick = { app.removeDeduction(index) })
            }
        }
    }
    QuietButton(t("review.addDeduction"), onClick = app::addDeduction, modifier = Modifier.testTag("add-deduction"))
    }

    if (review.pending > 0) {
        Meta(t("review.pending", "count" to review.pending), Modifier.testTag("review-pending").semantics { liveRegion = LiveRegionMode.Polite })
    }
    PrimaryButton(t("review.continue"), onClick = { if (review.pending == 0) app.checkReview() }, modifier = Modifier.testTag("review-check"))

    review.result?.let { result ->
        // Deductions not read on this device: the net-sum check is not shown while none was added.
        val current = result.checks.lastOrNull().orEmpty()
            .filter { it.status != CheckStatus.SKIPPED }
            .filterNot { review.deductionsNotRead && review.deductions.isEmpty() && it.id == "net-sum" }
        Panel(Modifier.testTag("checks")) {
            SectionHeading(t("review.checksTitle"))
            for (check in current) {
                Row(horizontalArrangement = Arrangement.spacedBy(d.xs), modifier = Modifier.semantics(mergeDescendants = true) {}.testTag("check-${check.id}")) {
                    Text(
                        if (check.status == CheckStatus.OK) "✓" else "!",
                        fontWeight = FontWeight.Bold,
                        color = if (check.status == CheckStatus.OK) LocalSilhouetteColors.current.verdictLikely else LocalSilhouetteColors.current.verdictMaybe,
                    )
                    Column(Modifier.weight(1f)) {
                        Text(t("check.${check.id}"), style = MaterialTheme.typography.bodyMedium)
                        Text(t(if (check.status == CheckStatus.OK) "check.status.ok" else "check.status.warn"), style = MaterialTheme.typography.bodySmall, color = LocalSilhouetteColors.current.textMuted)
                    }
                }
            }
        }
        result.failure?.let { Text(t("review.failure.$it"), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.testTag("review-failure")) }
        result.annualization?.let { annual ->
            Panel(Modifier.testTag("annual")) {
                SectionHeading(t("review.annualTitle"))
                val amount = t.money(annual.annualIncome.toDouble())
                Text(amount, style = MaterialTheme.typography.headlineMedium, modifier = Modifier.testTag("annual-amount"))
                Text(basisLine(t, annual.basis, amount), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("annual-basis"))
                Meta(t("review.stubsCount", "count" to (app.document.confirmedStubs.size + 1)))
                PrimaryButton(t("review.useIncome", "amount" to amount), onClick = app::useAnnualIncome, modifier = Modifier.testTag("use-income"))
            }
        }
        SecondaryButton(t("review.addAnother"), onClick = app::addAnotherPaystub, modifier = Modifier.testTag("add-another"))
    }
    QuietButton(t("q.back"), onClick = { app.back() })
}

/** The "how this was worked out" line, with the figures actually used. */
private fun basisLine(t: Strings, basis: AnnualizationBasis, amount: String): String = when (basis) {
    is AnnualizationBasis.YearToDate -> t(
        "review.basis.ytd",
        "ytd" to t.money(basis.ytdCents),
        "date" to LocalDate.parse(basis.referenceDate).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(t.language.locale)),
        "months" to t.decimal(basis.elapsedNumerator.toDouble() / basis.elapsedDenominator),
        "amount" to amount,
    )
    is AnnualizationBasis.Average -> t(
        "review.basis.average",
        "average" to t.money(basis.averageGrossCents),
        "periods" to basis.periodsPerYear,
        "amount" to amount,
    )
}

/** The document lines a value came from, with the referenced value highlighted. */
@Composable
private fun SourceLines(t: Strings, lines: List<List<SourceSegment>>) {
    if (lines.isEmpty()) return
    val d = LocalDimens.current
    val c = LocalSilhouetteColors.current
    Column(verticalArrangement = Arrangement.spacedBy(d.xxs)) {
        Text(t("review.source"), style = MaterialTheme.typography.bodySmall, color = c.textMuted)
        for (line in lines) {
            val text = buildAnnotatedString {
                for (segment in line) {
                    if (segment.highlight) {
                        withStyle(SpanStyle(background = c.notice, color = c.onNotice, fontWeight = FontWeight.Bold)) { append(segment.text) }
                    } else {
                        append(segment.text)
                    }
                }
            }
            Box(
                Modifier
                    .fillMaxWidth()
                    .background(c.surfaceSunken, RoundedCornerShape(d.radiusControl))
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = d.xs, vertical = d.xxs),
            ) {
                Text(text, style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace), softWrap = false, modifier = Modifier.testTag("source-line"))
            }
        }
    }
}

@Composable
private fun DeductionKind(t: Strings, kinds: List<String>, selected: String, onSelect: (String) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    Box {
        SecondaryButton(
            t("field.deduction.kind") + ": " + if (selected.isEmpty()) t("option.none") else t("option.deduction.$selected"),
            onClick = { open = true },
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (kind in listOf("") + kinds) {
                DropdownMenuItem(
                    text = { Text(if (kind.isEmpty()) t("option.none") else t("option.deduction.$kind")) },
                    onClick = {
                        open = false
                        onSelect(kind)
                    },
                    modifier = Modifier.padding(vertical = 2.dp),
                )
            }
        }
    }
}

/** One reviewed value next to its source line: confirm, change, or type it. */
@Composable
private fun FieldRow(app: AppController, row: app.silhouette.benefits.document.ReviewRow) {
    val t = app.strings
    val d = LocalDimens.current
        var editing by rememberSaveable(row.name) { mutableStateOf(false) }
        var draft by rememberSaveable(row.name) { mutableStateOf(row.text) }
        var invalid by rememberSaveable(row.name) { mutableStateOf(false) }
        val label = t("field.paystub.${row.name}")
        Panel(Modifier.testTag("field-${row.name}")) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(d.xs)) {
                Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                if (row.status == RowStatus.CONFIRMED) {
                    Text(
                        "✓ " + t("review.confirmed"),
                        style = MaterialTheme.typography.bodyMedium,
                        color = LocalSilhouetteColors.current.verdictLikely,
                        modifier = Modifier.testTag("confirmed-${row.name}"),
                    )
                }
            }
            if (editing) {
                if (row.kind == FieldKind.ENUM) {
                    Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(d.xs)) {
                        for (option in listOf("") + row.options) {
                            ChoiceRow(
                                if (option.isEmpty()) t("option.none") else t("option.payFrequency.$option"),
                                selected = draft == option,
                                onSelect = { draft = option },
                                modifier = Modifier.testTag("edit-${row.name}-${option.ifEmpty { "none" }}"),
                            )
                        }
                    }
                } else {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = {
                            draft = it
                            invalid = false
                        },
                        label = { Text(label) },
                        singleLine = true,
                        isError = invalid,
                        keyboardOptions = KeyboardOptions(keyboardType = if (row.kind == FieldKind.NUMBER) KeyboardType.Decimal else KeyboardType.Text),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("edit-${row.name}")
                            .semantics { if (invalid) error(t("review.invalidNumber")) },
                    )
                }
                if (invalid) {
                    Text(
                        t("review.invalidNumber"),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                    )
                }
                PrimaryButton(t("review.save"), onClick = {
                    if (app.saveRow(row.name, draft)) editing = false else invalid = true
                }, modifier = Modifier.testTag("save-${row.name}"))
                QuietButton(t("review.cancel"), onClick = { editing = false })
            } else {
                if (row.notRead && row.text.isEmpty()) Meta(t("review.fieldNotRead"), Modifier.testTag("not-read-${row.name}"))
                Text(
                    when {
                        row.text.isEmpty() -> t("review.notFound")
                        row.kind == FieldKind.ENUM -> t("option.payFrequency.${row.text}")
                        else -> row.text
                    },
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (row.text.isEmpty()) FontWeight.Normal else FontWeight.SemiBold,
                    color = if (row.text.isEmpty()) LocalSilhouetteColors.current.textMuted else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.testTag("value-${row.name}"),
                )
                SourceLines(t, row.source)
                Row(horizontalArrangement = Arrangement.spacedBy(d.xs)) {
                    if (row.status == RowStatus.PENDING) {
                        SecondaryButton(
                            t("review.confirm"),
                            onClick = { app.confirmRow(row.name) },
                            modifier = Modifier
                                .weight(1f)
                                .testTag("confirm-${row.name}")
                                .semantics { contentDescription = "${t("review.confirm")}: $label" },
                        )
                    }
                    QuietButton(
                        t("review.edit"),
                        onClick = {
                            draft = row.text
                            invalid = false
                            editing = true
                        },
                        modifier = Modifier
                            .testTag("edit-button-${row.name}")
                            .semantics { contentDescription = "${t("review.edit")}: $label" },
                    )
                }
            }
        }
    
}
