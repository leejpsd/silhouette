// Review: each value next to the document line it came from (on a paper slip, the value circled),
// confirmed or changed; values not found can be typed. What decides the yearly income comes first;
// everything else is under "More values". Then the yearly income with its arithmetic and the checks of
// shared/validation/SPEC.md in plain words. "Use this income" is the block's action, and shows how
// the results changed.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct DocumentReviewScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @State private var moreOpen = false
    @State private var scrollTarget: String?

    /// What decides the yearly income: shown first. The date is the pay date, or the period end without one.
    static let leadFields = ["grossPay", "ytdGross", "payDate", "payFrequency"]
    /// The values each check compares; a value a check flags is shown with the leading values.
    static let checkFields: [String: [String]] = [
        "net-sum": ["grossPay", "netPay", "deductions"],
        "rate-hours": ["hoursWorked", "hourlyRate", "grossPay"],
        "period-length": ["periodStart", "periodEnd", "payFrequency"],
        "pay-date": ["payDate", "periodEnd"],
        "ytd-gross": ["ytdGross", "grossPay"],
        "ytd-periods": ["ytdGross", "payDate", "payFrequency"],
        "dates-parsed": ["payDate", "periodStart", "periodEnd"],
    ]

    var body: some View {
        if model.document.foundNothing { notADocument } else { review }
    }

    // MARK: Not a paystub

    private var notADocument: some View {
        Screen {
            BackLink(label: model.t("q.back")) { if !model.path.isEmpty { model.path.removeLast() } }
                .padding(.bottom, -8)
            if let silhouette = model.silhouette {
                let segments = Array(DocumentSession.segments(of: silhouette).prefix(24))
                DocumentPaper(segments: segments, leave: true, hidden: []) { _ in }
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                    .frame(maxHeight: 180, alignment: .top)
                    .clipped()
                    .padding(.horizontal, 10)
            }
            DisplayHeadline(text: model.t("review.notDocument.title"), role: .title, size: 50, maxLines: 3)
                .accessibilityIdentifier("review.title")
            if let extraction = model.document.extraction {
                ProvenanceBadge(source: extraction.source, reason: extraction.reason)
            }
            Para(model.t("review.notDocument.body"))
                .accessibilityIdentifier("review.notDocument")
        } actions: {
            BlockAction(label: model.t("review.notDocument.typeIn"), id: "review.typeIn") { model.typeNumbers() }
            Button(model.t("review.notDocument.another")) { model.anotherDocument() }
                .buttonStyle(TextLinkStyle())
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("review.another")
        }
    }

    // MARK: Review

    private var review: some View {
        let doc = model.document
        let validation = model.documentValidation
        let current = validation?.checks.last ?? []
        let flagged = Set(current.filter { $0.status == .warn }.flatMap { Self.checkFields[$0.id] ?? [] })
        let dateField = doc.fieldsForDisplay.first { $0.name == "payDate" }?.value == nil ? "periodEnd" : "payDate"
        let leadOrder = Self.leadFields.map { $0 == "payDate" ? dateField : $0 }
            + doc.fieldsForDisplay.map(\.name).filter { flagged.contains($0) }
        var seen = Set<String>()
        let leadNames = leadOrder.filter { seen.insert($0).inserted }
        let leadRows = leadNames.compactMap { n in doc.fieldsForDisplay.first { $0.name == n } }
        let restRows = doc.fieldsForDisplay.filter { !seen.contains($0.name) }
        return Screen(scrollTo: $scrollTarget) {
            BackLink(label: model.t("q.back")) { if !model.path.isEmpty { model.path.removeLast() } }
                .padding(.bottom, -8)
            DisplayHeadline(text: model.t("review.title"), role: .title, size: 50, maxLines: 3)
                .accessibilityIdentifier("review.title")
                .appear(.rise)
            if let extraction = doc.extraction {
                ProvenanceBadge(source: extraction.source, reason: extraction.reason)
                if extraction.reason == .onDeviceFailed { Para(model.t("answers.retried"), .small) }
            }
            Para(model.t(doc.extraction == nil ? "review.manualLead" : "review.lead"), .small)
            if doc.pendingCount > 0 {
                VStack(alignment: .leading, spacing: 6) {
                    Button(model.t("review.confirmAllCount", ["count": String(doc.pendingCount)])) {
                        model.editDocument { $0.confirmAll() }
                    }
                    .buttonStyle(OutlineStyle(fullWidth: true))
                    .accessibilityIdentifier("review.confirmAll")
                    Para(model.t("review.pending", ["count": String(doc.pendingCount)]), .small)
                        .accessibilityIdentifier("review.pending")
                }
            }

            ForEach(Array(leadRows.enumerated()), id: \.element.id) { i, field in
                FieldRow(field: field, flagged: flagged.contains(field.name), index: i)
            }

            if let validation { income(validation) }
            if let validation { checks(validation) }

            Disclosure(label: model.t("review.moreValues", ["count": String(restRows.count + doc.deductionsForDisplay.count)]),
                       open: Binding(get: { moreOpen || flagged.contains("deductions") }, set: { moreOpen = $0 }), id: "review.more") {
                VStack(alignment: .leading, spacing: theme.space("md")) {
                    ForEach(Array(restRows.enumerated()), id: \.element.id) { i, field in
                        FieldRow(field: field, flagged: false, index: i + 1)
                    }
                    deductions
                }
            }
            .padding(.top, 4)

            changes
        } actions: {
            blockAction(validation)
        }
    }

    @ViewBuilder private func blockAction(_ validation: ValidationResult?) -> some View {
        if model.incomeChange != nil {
            BlockAction(label: model.t("q.finish"), id: "review.results") { model.showResults() }
        } else if let a = validation?.annualization {
            BlockAction(label: model.t("review.useIncome", ["amount": model.money(Double(a.annualIncome))]), id: "review.useIncome") {
                model.useIncome(a.annualIncome)
                scrollTarget = "review.changes"
            }
            .disabled(model.document.pendingCount > 0)
            Button(model.t("review.addAnother")) { model.addAnotherPaystub() }
                .buttonStyle(TextLinkStyle())
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("review.addAnother")
        } else {
            BlockAction(label: model.t("review.continue"), id: "review.continue") { scrollTarget = "review.annual" }
                .disabled(model.document.pendingCount > 0)
        }
    }

    // MARK: Yearly income and checks

    private func income(_ validation: ValidationResult) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionHeading(text: model.t("review.annualTitle"))
            if let a = validation.annualization {
                DisplayLabel(text: model.money(Double(a.annualIncome)), role: .amount, size: 64, maxLines: 1)
                    .accessibilityLabel(model.money(Double(a.annualIncome)))
                    .appear(.pop)
                Text(basisText(a))
                    .type(.monoValue, size: 13)
                    .foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("review.basis")
                if case .ytd = a.basis {
                    // Which date the yearly income was worked out from: the end of the pay period, else the pay date.
                    let periodEnd = model.document.fieldsForDisplay.first { $0.name == "periodEnd" }?.value != nil
                    Para(model.t(periodEnd ? "review.basis.dateIsPeriodEnd" : "review.basis.dateIsPayDate"), .small, muted: true)
                        .accessibilityIdentifier("review.basisDate")
                }
                if case .average(_, _, _, let used) = a.basis, used.count > 1 {
                    Para(model.t("review.stubsCount", ["count": String(used.count)]), .small, muted: true)
                }
            } else if let failure = validation.failure {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle").accessibilityHidden(true)
                    Text(model.t("review.failure.\(failure)")).fixedSize(horizontal: false, vertical: true)
                }
                .type(.label, size: 13.5)
                .foregroundStyle(theme.ink)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("review.failure")
            }
        }
        .padding(.top, theme.space("sm"))
        .id("review.annual")
    }

    @ViewBuilder private func checks(_ validation: ValidationResult) -> some View {
        // Deductions not read on this device: the net-sum check is not shown while none has been added.
        let deductionsNotRead = model.document.notRead.contains("deductions") && model.document.deductionsForDisplay.isEmpty
        let shown = (validation.checks.last ?? []).filter { $0.status != .skipped && !(deductionsNotRead && $0.id == "net-sum") }
        if !shown.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                SectionHeading(text: model.t("review.checksTitle")).padding(.bottom, 6)
                ForEach(shown, id: \.id) { check in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Group {
                            if check.status == .ok { StateIcon(state: .pass) } else {
                                Image(systemName: "exclamationmark.triangle").font(.system(size: 15, weight: .semibold))
                            }
                        }
                        .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
                        Text(model.t("check.\(check.id)")).type(.small).foregroundStyle(theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(model.t("check.status.\(check.status.rawValue)")).type(.label, size: 12).foregroundStyle(theme.ink)
                            .multilineTextAlignment(.trailing)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: 110, alignment: .trailing)
                    }
                    .foregroundStyle(theme.ink)
                    .padding(.vertical, 6)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("check.\(check.id)")
                }
            }
        }
    }

    @ViewBuilder private var changes: some View {
        if let change = model.incomeChange {
            InvertedCard {
                Text(model.t("review.changesTitle")).type(.heading).accessibilityAddTraits(.isHeader)
                if change.isEmpty { Para(model.t("review.noChange")) }
                ForEach(change, id: \.program) { c in
                    VStack(alignment: .leading, spacing: 4) {
                        DisplayLabel(text: model.programName(c.program), role: .listItem, size: 26, color: theme.onBlock)
                        MarkerLine(kind: .verdict(c.after), text: model.t("verdict.\(c.after.rawValue)"))
                        Text(model.t("review.before", ["verdict": model.t("verdict.\(c.before.rawValue)")]))
                            .type(.caption).foregroundStyle(theme.onBlockMuted)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(model.t("review.change", ["program": model.programName(c.program),
                                                                  "before": model.t("verdict.\(c.before.rawValue)"),
                                                                  "after": model.t("verdict.\(c.after.rawValue)")]))
                    .accessibilityIdentifier("review.change.\(c.program)")
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("review.changes")
            .id("review.changes")
        }
    }

    private var deductions: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(text: model.t("field.paystub.deductions"))
            if model.document.notRead.contains("deductions") && model.document.deductionsForDisplay.isEmpty {
                Para(model.t("review.deductionsNotRead"), .small, muted: true).accessibilityIdentifier("review.deductionsNotRead")
            }
            ForEach(model.document.deductionsForDisplay) { row in
                DeductionRowView(row: row)
            }
            Button(model.t("review.addDeduction")) { model.editDocument { $0.addDeduction() } }
                .buttonStyle(TextLinkStyle())
                .accessibilityIdentifier("review.addDeduction")
        }
    }

    private func basisText(_ a: ValidationResult.Annualization) -> String {
        switch a.basis {
        case .ytd(let cents, let date, let num, let den, _):
            let months = CopyBook.formatAmount((Double(num) / Double(den) * 100).rounded() / 100, model.locale)
            return model.t("review.basis.ytd", ["ytd": model.money(Double(cents) / 100, cents: true), "date": date, "months": months,
                                                "amount": model.money(Double(a.annualIncome))])
        case .average(let avg, let periods, _, _):
            return model.t("review.basis.average", ["average": model.money(Double(avg) / 100, cents: true), "periods": String(periods),
                                                    "amount": model.money(Double(a.annualIncome))])
        }
    }
}

// MARK: - Rows

/// Fields that are amounts of money (typed values are confirmed as money in the pack's currency).
private let moneyFields: Set<String> = ["grossPay", "netPay", "ytdGross", "hourlyRate"]

/// A source line on a paper slip, the found value circled (dashed when a check flags it).
private struct SourceSlip: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let source: String
    let value: String?
    let flagged: Bool
    let index: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(model.t("review.source")).type(.caption, size: 12).foregroundStyle(theme.onPaperMuted)
            ForEach(Array(source.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                FlowLayout(spacing: 0, lineSpacing: 2) {
                    ForEach(Array(Self.chunks(line).enumerated()), id: \.offset) { _, chunk in
                        let ringed = value.map { chunk.trimmingCharacters(in: .whitespaces) == $0 } ?? false
                        Text(verbatim: chunk)
                            .type(.monoValue)
                            .foregroundStyle(theme.onPaper)
                            .padding(.horizontal, ringed ? 6 : 0)
                            .overlay {
                                if ringed {
                                    Capsule()
                                        .strokeBorder(theme.onPaper, style: StrokeStyle(lineWidth: theme.border, dash: flagged ? [4, 3] : []))
                                        .rotationEffect(theme.rotation("ring"))
                                        .padding(.vertical, -2)
                                }
                            }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paper(tilt: .degrees(theme.tokens.numbers("rotation.paperSmall")[safe: index % 2] ?? -1), size: .small)
        .accessibilityElement(children: .combine)
    }

    /// Runs of spaces and runs of other characters, so a line can wrap and a value can be circled alone.
    static func chunks(_ line: String) -> [String] {
        var out: [String] = [], chunk = ""
        for ch in line {
            if let last = chunk.last, (last == " ") != (ch == " ") { out.append(chunk); chunk = "" }
            chunk.append(ch)
        }
        if !chunk.isEmpty { out.append(chunk) }
        return out
    }
}

private struct FieldRow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let field: ReviewField
    let flagged: Bool
    let index: Int
    @State private var editing = false
    @State private var text = ""
    @State private var choice = ""
    @State private var invalid = false

    private var label: String { model.t("field.paystub.\(field.name)") }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).type(.label).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                Spacer()
                if field.confirmed && !editing {
                    Text(model.t("review.confirmed")).type(.label, size: 12).foregroundStyle(theme.ink)
                }
            }
            if editing { editor } else { display }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("field.\(field.name)")
    }

    private var valueText: String? {
        switch field.value {
        // A found value is shown as the document writes it.
        case .number(let n)?: model.documentAmount(n)
        case .text(let s)?: s
        case .choice(let c)?: model.t("option.\(field.name).\(c)")
        case nil: nil
        }
    }

    @ViewBuilder private var display: some View {
        HStack(alignment: .center, spacing: 12) {
            if let source = field.source {
                SourceSlip(source: source, value: valueText, flagged: flagged, index: index)
                    .frame(maxWidth: 240, alignment: .leading)
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                Text(valueText ?? model.t(model.document.notRead.contains(field.name) ? "review.fieldNotRead" : "review.notFound"))
                    .type(valueText == nil ? .small : .monoDocument)
                    .foregroundStyle(valueText == nil ? theme.inkMuted : theme.ink)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("field.\(field.name).value")
                if field.confirmed { StateIcon(state: .pass) }
            }
            .layoutPriority(1)
        }
        HStack(spacing: 14) {
            if field.found && !field.confirmed {
                Button(model.t("review.confirm")) { model.editDocument { $0.confirm(field.name) } }
                    .buttonStyle(OutlineStyle())
                    .accessibilityLabel("\(model.t("review.confirm")): \(label)")
                    .accessibilityIdentifier("field.\(field.name).confirm")
            }
            Button(model.t("review.edit")) { startEditing() }
                .buttonStyle(TextLinkStyle())
                .accessibilityLabel("\(model.t("review.edit")): \(label)")
                .accessibilityIdentifier("field.\(field.name).edit")
        }
    }

    @ViewBuilder private var editor: some View {
        switch field.kind {
        case .choice(let values):
            Menu {
                Button(model.t("option.none")) { choice = "" }
                ForEach(values, id: \.self) { v in Button(model.t("option.\(field.name).\(v)")) { choice = v } }
            } label: {
                HStack {
                    Text(choice.isEmpty ? model.t("option.none") : model.t("option.\(field.name).\(choice)")).type(.body)
                    Spacer()
                    Image(systemName: "chevron.down").font(.system(size: 13, weight: .bold)).accessibilityHidden(true)
                }
                .foregroundStyle(theme.ink)
                .fieldStyle(mono: false)
            }
            .accessibilityLabel(label)
            .accessibilityIdentifier("field.\(field.name).input")
        default:
            TextField("", text: $text)
                .keyboardType(field.kind == .number ? .decimalPad : .default)
                .autocorrectionDisabled()
                .fieldStyle(error: invalid)
                .accessibilityLabel(label)
                .accessibilityIdentifier("field.\(field.name).input")
                .toolbar {
                    // The number pad has no return key.
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button(model.t("review.save")) { save() }
                            .accessibilityIdentifier("field.\(field.name).keyboardSave")
                    }
                }
            if field.kind == .number, let n = Rehydrator.parseTypedAmount(text) {
                HStack(spacing: 6) {
                    Circle().fill(theme.ink).frame(width: 10, height: 10).accessibilityHidden(true)
                    Text(model.t("review.understood", ["amount": moneyFields.contains(field.name) ? model.money(n, cents: true)
                                                                                                    : model.documentAmount(n)]))
                }
                .type(.label, size: 13.5)
                .foregroundStyle(theme.ink)
                .accessibilityElement(children: .combine)
            }
        }
        if invalid {
            Label(model.t("review.invalidNumber"), systemImage: "exclamationmark.triangle").type(.label, size: 13.5).foregroundStyle(theme.ink)
        }
        HStack(spacing: 10) {
            Button(model.t("review.save")) { save() }
                .buttonStyle(ChipStyle(selected: true))
                .accessibilityIdentifier("field.\(field.name).save")
            Button(model.t("review.cancel")) { editing = false; invalid = false }
                .buttonStyle(OutlineStyle())
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
        VStack(alignment: .leading, spacing: 8) {
            if editing || row.amount == nil && !row.found {
                TextField("", text: $text)
                    .keyboardType(.decimalPad)
                    .fieldStyle(error: invalid)
                    .accessibilityLabel(model.t("field.deduction.amount"))
                Menu {
                    Button(model.t("option.none")) { kind = "" }
                    ForEach(Self.kinds, id: \.self) { k in Button(model.t("option.deduction.\(k)")) { kind = k } }
                } label: {
                    HStack {
                        Text(kind.isEmpty ? model.t("field.deduction.kind") : model.t("option.deduction.\(kind)")).type(.body)
                        Spacer()
                        Image(systemName: "chevron.down").font(.system(size: 13, weight: .bold)).accessibilityHidden(true)
                    }
                    .foregroundStyle(theme.ink)
                    .fieldStyle(mono: false)
                }
                .accessibilityLabel(model.t("field.deduction.kind"))
                if invalid {
                    Label(model.t("review.invalidNumber"), systemImage: "exclamationmark.triangle").type(.label, size: 13.5).foregroundStyle(theme.ink)
                }
                Button(model.t("review.save")) {
                    guard let n = Rehydrator.parseTypedAmount(text) else { invalid = true; return }
                    model.editDocument { $0.setDeduction(row.id, amount: n, kind: kind.isEmpty ? nil : kind) }
                    editing = false
                }
                .buttonStyle(ChipStyle(selected: true))
            } else {
                HStack(alignment: .center, spacing: 12) {
                    if let source = row.source {
                        SourceSlip(source: source, value: row.amount.map(model.documentAmount), flagged: false, index: 0)
                            .frame(maxWidth: 240, alignment: .leading)
                    }
                    Spacer(minLength: 0)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(row.kind.map { model.t("option.deduction.\($0)") } ?? model.t("field.deduction.amount")).type(.label, size: 12)
                        Text(row.amount.map(model.documentAmount) ?? model.t("review.notFound")).type(.monoDocument)
                    }
                    .foregroundStyle(theme.ink)
                    .layoutPriority(1)
                }
                HStack(spacing: 14) {
                    if row.found && !row.confirmed {
                        Button(model.t("review.confirm")) { model.editDocument { $0.confirmDeduction(row.id) } }.buttonStyle(OutlineStyle())
                    } else if row.confirmed {
                        Text(model.t("review.confirmed")).type(.label, size: 12).foregroundStyle(theme.ink)
                    }
                    Button(model.t("review.edit")) {
                        text = row.amount.map { $0.rounded() == $0 ? String(Int($0)) : String($0) } ?? ""
                        kind = row.kind ?? ""
                        editing = true
                    }
                    .buttonStyle(TextLinkStyle())
                    Button(model.t("review.removeDeduction")) { model.editDocument { $0.removeDeduction(row.id) } }
                        .buttonStyle(TextLinkStyle())
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}
