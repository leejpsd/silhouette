// Review: each value next to the document line it came from, editable; values not found can be
// typed. Then the checks of shared/validation/SPEC.md in plain words, the yearly income with its
// arithmetic, and "use this income", which shows how the results changed.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct DocumentReviewScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        let doc = model.document
        ScreenScroll {
            ScreenHeading(text: model.t("review.title")).accessibilityIdentifier("review.title")
            if let extraction = doc.extraction {
                ProvenanceBadge(source: extraction.source, reason: extraction.reason)
                if extraction.reason == .onDeviceFailed { Text(model.t("answers.retried")).tokenFont(.small) }
            }
            if doc.foundNothing {
                notADocument
            } else {
                Text(model.t(doc.extraction == nil ? "review.manualLead" : "review.lead"))
                    .tokenFont(.body).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
            }

            ForEach(doc.fieldsForDisplay) { field in
                FieldRow(field: field)
            }
            deductions

            if doc.pendingCount > 0 {
                Text(model.t("review.pending", ["count": String(doc.pendingCount)])).tokenFont(.small).accessibilityIdentifier("review.pending")
                Button(model.t("review.confirmAll")) { model.editDocument { $0.confirmAll() } }
                    .buttonStyle(.secondaryAction)
                    .accessibilityIdentifier("review.confirmAll")
            }

            checksAndIncome
        }
    }

    private var notADocument: some View {
        VStack(alignment: .leading, spacing: theme.space("sm")) {
            Text(model.t("review.notDocument.title")).tokenFont(.heading).accessibilityAddTraits(.isHeader)
            Text(model.t("review.notDocument.body")).tokenFont(.body).fixedSize(horizontal: false, vertical: true)
            Button(model.t("review.notDocument.typeIn")) { model.typeNumbers() }.buttonStyle(.primaryAction)
            Button(model.t("review.notDocument.another")) { model.anotherDocument() }.buttonStyle(.secondaryAction)
        }
        .padding(theme.space("md"))
        .background(theme.notice, in: RoundedRectangle(cornerRadius: theme.radius("panel")))
        .foregroundStyle(theme.onNotice)
        .accessibilityIdentifier("review.notDocument")
    }

    private var deductions: some View {
        VStack(alignment: .leading, spacing: theme.space("sm")) {
            ScreenHeading(text: model.t("field.paystub.deductions"), style: .heading)
            ForEach(model.document.deductionsForDisplay) { row in
                DeductionRowView(row: row)
            }
            Button(model.t("review.addDeduction")) { model.editDocument { $0.addDeduction() } }
                .buttonStyle(.quietAction)
                .accessibilityIdentifier("review.addDeduction")
        }
    }

    @ViewBuilder private var checksAndIncome: some View {
        if let validation = model.documentValidation {
            let current = validation.checks.last ?? []
            let shown = current.filter { $0.status != .skipped }
            if !shown.isEmpty {
                VStack(alignment: .leading, spacing: theme.space("xs")) {
                    ScreenHeading(text: model.t("review.checksTitle"), style: .heading)
                    ForEach(shown, id: \.id) { check in
                        HStack(alignment: .firstTextBaseline, spacing: theme.space("sm")) {
                            Image(systemName: check.status == .ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                .foregroundStyle(check.status == .ok ? theme.verdict("likely") : theme.verdict("maybe"))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(model.t("check.\(check.id)")).tokenFont(.body)
                                Text(model.t("check.status.\(check.status.rawValue)")).tokenFont(.small).foregroundStyle(theme.textMuted)
                            }
                            .fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("check.\(check.id)")
                    }
                }
            }
            income(validation)
        }
    }

    @ViewBuilder private func income(_ validation: ValidationResult) -> some View {
        VStack(alignment: .leading, spacing: theme.space("sm")) {
            ScreenHeading(text: model.t("review.annualTitle"), style: .heading)
            if let a = validation.annualization {
                Text(basisText(a)).tokenFont(.body).fixedSize(horizontal: false, vertical: true).accessibilityIdentifier("review.basis")
                if case .average(_, _, _, let used) = a.basis, used.count > 1 {
                    Text(model.t("review.stubsCount", ["count": String(used.count)])).tokenFont(.small)
                }
                Button(model.t("review.useIncome", ["amount": money(Double(a.annualIncome))])) { model.useIncome(a.annualIncome) }
                    .buttonStyle(.primaryAction)
                    .disabled(model.document.pendingCount > 0)
                    .accessibilityIdentifier("review.useIncome")
            } else if let failure = validation.failure {
                Text(model.t("review.failure.\(failure)")).tokenFont(.body).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("review.failure")
            }
            if let change = model.incomeChange {
                VStack(alignment: .leading, spacing: theme.space("xs")) {
                    Text(model.t("review.changesTitle")).tokenFont(.bodyStrong).accessibilityAddTraits(.isHeader)
                    if change.isEmpty {
                        Text(model.t("review.noChange")).tokenFont(.body)
                    }
                    ForEach(change, id: \.program) { c in
                        HStack(spacing: theme.space("xs")) {
                            SilhouetteMark(style: .verdict(c.after), size: 28)
                            Text(model.t("review.change", ["program": model.programName(c.program),
                                                            "before": model.t("verdict.\(c.before.rawValue)"),
                                                            "after": model.t("verdict.\(c.after.rawValue)")]))
                                .tokenFont(.body).fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("review.change.\(c.program)")
                    }
                    Button(model.t("q.finish")) { model.showResults() }
                        .buttonStyle(.secondaryAction)
                        .accessibilityIdentifier("review.results")
                }
                .padding(theme.space("sm"))
                .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("review.changes")
            }
            Button(model.t("review.addAnother")) { model.addAnotherPaystub() }
                .buttonStyle(.quietAction)
        }
    }

    private func money(_ value: Double) -> String { CopyBook.formatAmount(value, model.locale) }

    private func basisText(_ a: ValidationResult.Annualization) -> String {
        switch a.basis {
        case .ytd(let cents, let date, let num, let den, _):
            let months = CopyBook.formatAmount((Double(num) / Double(den) * 100).rounded() / 100, model.locale)
            return model.t("review.basis.ytd", ["ytd": money(Double(cents) / 100), "date": date, "months": months,
                                                "amount": money(Double(a.annualIncome))])
        case .average(let avg, let periods, _, _):
            return model.t("review.basis.average", ["average": money(Double(avg) / 100), "periods": String(periods),
                                                    "amount": money(Double(a.annualIncome))])
        }
    }
}

// MARK: - Rows

private struct FieldRow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let field: ReviewField
    @State private var editing = false
    @State private var text = ""
    @State private var choice = ""
    @State private var invalid = false

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space("xs")) {
            Text(model.t("field.paystub.\(field.name)")).tokenFont(.bodyStrong)
            if editing { editor } else { display }
        }
        .padding(theme.space("sm"))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("field.\(field.name)")
    }

    private var valueText: String? {
        switch field.value {
        case .number(let n)?: CopyBook.formatAmount(n, model.locale)
        case .text(let s)?: s
        case .choice(let c)?: model.t("option.\(field.name).\(c)")
        case nil: nil
        }
    }

    @ViewBuilder private var display: some View {
        Text(valueText ?? model.t("review.notFound"))
            .tokenFont(.body)
            .foregroundStyle(valueText == nil ? theme.textMuted : theme.text)
            .accessibilityIdentifier("field.\(field.name).value")
        if let source = field.source {
            Text("\(model.t("review.source")): \(source)")
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        HStack(spacing: theme.space("sm")) {
            if field.found && !field.confirmed {
                Button(model.t("review.confirm")) { model.editDocument { $0.confirm(field.name) } }.buttonStyle(.quietAction)
            } else if field.confirmed {
                Label(model.t("review.confirmed"), systemImage: "checkmark").tokenFont(.small).foregroundStyle(theme.verdict("likely"))
            }
            Button(model.t("review.edit")) { startEditing() }
                .buttonStyle(.quietAction)
                .accessibilityLabel("\(model.t("review.edit")): \(model.t("field.paystub.\(field.name)"))")
                .accessibilityIdentifier("field.\(field.name).edit")
        }
    }

    @ViewBuilder private var editor: some View {
        switch field.kind {
        case .choice(let values):
            Picker(model.t("field.paystub.\(field.name)"), selection: $choice) {
                Text(model.t("option.none")).tag("")
                ForEach(values, id: \.self) { Text(model.t("option.\(field.name).\($0)")).tag($0) }
            }
            .pickerStyle(.menu)
        default:
            TextField(model.t("field.paystub.\(field.name)"), text: $text)
                .keyboardType(field.kind == .number ? .decimalPad : .default)
                .autocorrectionDisabled()
                .padding(.horizontal, theme.space("sm"))
                .frame(minHeight: theme.minTapTarget)
                .background(theme.background, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                .accessibilityIdentifier("field.\(field.name).input")
            if field.kind == .number, let n = Rehydrator.parseTypedAmount(text) {
                Text(model.t("review.understood", ["amount": CopyBook.formatAmount(n, model.locale)])).tokenFont(.small)
            }
        }
        if invalid { Text(model.t("review.invalidNumber")).tokenFont(.small).foregroundStyle(theme.danger) }
        HStack {
            Button(model.t("review.save")) { save() }.buttonStyle(.primaryAction).accessibilityIdentifier("field.\(field.name).save")
            Button(model.t("review.cancel")) { editing = false; invalid = false }.buttonStyle(.secondaryAction)
        }
    }

    private func startEditing() {
        switch field.value {
        case .number(let n)?: text = n.rounded() == n ? String(Int(n)) : String(n)
        case .text(let s)?: text = s
        case .choice(let c)?: choice = c
        case nil: text = ""; choice = ""
        }
        editing = true
    }

    private func save() {
        let value: FieldValue?
        switch field.kind {
        case .number:
            if text.trimmingCharacters(in: .whitespaces).isEmpty { value = nil }
            else {
                // The typed-amount rule (shared/skeleton/SPEC.md section 5.1); never strip separators.
                guard let n = Rehydrator.parseTypedAmount(text) else { invalid = true; return }
                value = .number(n)
            }
        case .choice: value = choice.isEmpty ? nil : .choice(choice)
        case .text, .date:
            let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
            value = t.isEmpty ? nil : .text(t)
        }
        invalid = false
        model.editDocument { $0.setField(field.name, value) }
        editing = false
    }
}

private struct DeductionRowView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let row: DeductionRow
    @State private var editing = false
    @State private var text = ""
    @State private var kind = ""
    @State private var invalid = false

    static let kinds = ["federal_tax", "state_tax", "social_security", "medicare", "retirement", "health", "other"]

    var body: some View {
        VStack(alignment: .leading, spacing: theme.space("xs")) {
            if editing || row.amount == nil && !row.found {
                TextField(model.t("field.deduction.amount"), text: $text)
                    .keyboardType(.decimalPad)
                    .padding(.horizontal, theme.space("sm"))
                    .frame(minHeight: theme.minTapTarget)
                    .background(theme.background, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                Picker(model.t("field.deduction.kind"), selection: $kind) {
                    Text(model.t("option.none")).tag("")
                    ForEach(Self.kinds, id: \.self) { Text(model.t("option.deduction.\($0)")).tag($0) }
                }
                .pickerStyle(.menu)
                if invalid { Text(model.t("review.invalidNumber")).tokenFont(.small).foregroundStyle(theme.danger) }
                Button(model.t("review.save")) {
                    guard let n = Rehydrator.parseTypedAmount(text) else { invalid = true; return }
                    model.editDocument { $0.setDeduction(row.id, amount: n, kind: kind.isEmpty ? nil : kind) }
                    editing = false
                }
                .buttonStyle(.primaryAction)
            } else {
                Text("\(row.kind.map { model.t("option.deduction.\($0)") } ?? model.t("field.deduction.amount")): "
                     + (row.amount.map { CopyBook.formatAmount($0, model.locale) } ?? model.t("review.notFound")))
                    .tokenFont(.body)
                if let source = row.source {
                    Text("\(model.t("review.source")): \(source)").font(.system(.footnote, design: .monospaced)).foregroundStyle(theme.textMuted)
                }
                HStack(spacing: theme.space("sm")) {
                    if row.found && !row.confirmed {
                        Button(model.t("review.confirm")) { model.editDocument { $0.confirmDeduction(row.id) } }.buttonStyle(.quietAction)
                    }
                    Button(model.t("review.edit")) {
                        text = row.amount.map { $0.rounded() == $0 ? String(Int($0)) : String($0) } ?? ""
                        kind = row.kind ?? ""
                        editing = true
                    }.buttonStyle(.quietAction)
                    Button(model.t("review.removeDeduction")) { model.editDocument { $0.removeDeduction(row.id) } }.buttonStyle(.quietAction)
                }
            }
        }
        .padding(theme.space("sm"))
        .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
    }
}
