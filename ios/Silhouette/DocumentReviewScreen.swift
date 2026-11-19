// Review: "Check what was found" under a system navigation bar; compact rows (the label,
// the value in IBM Plex Mono, an empty ring to confirm, an ink check disc once confirmed); a row opens to
// show the document line it came from and Change; what decides the yearly income comes first, the rest
// under "More values". Then the yearly income in display type with its arithmetic, "worked out on this
// iPhone, no model", the checks of shared/validation/SPEC.md in plain words, and the ink primary.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct DocumentReviewScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.pinsActions) private var pinsActions
    @State private var moreOpen = false
    @State private var scrollTarget: String?
    @State private var pendingNudges = 0
    /// "Check" was pressed while values that decide the result still waited.
    @State private var confirmFirst = false

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
        Group {
            if model.document.foundNothing { notADocument } else { review }
        }
        .background(theme.ground.ignoresSafeArea())
        .navigationTitle(model.t("review.navTitle"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func title(_ text: String) -> some View {
        Text(text).sfFont(28, weight: .bold).foregroundStyle(theme.ink)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("review.title")
    }

    // MARK: Not a paystub

    private var notADocument: some View {
        RevealingScroll {
            VStack(alignment: .leading, spacing: 16) {
                DraftLine()
                title(model.t("review.notDocument.title"))
                if let extraction = model.document.extraction {
                    ProvenanceBadge(source: extraction.source, reason: extraction.reason)
                }
                NoteText(text: model.t("review.notDocument.body"), size: 15)
                    .accessibilityIdentifier("review.notDocument")
                PrimaryButton(label: model.t("review.notDocument.typeIn"), id: "review.typeIn") { model.typeNumbers() }
                SecondaryButton(label: model.t("review.notDocument.another"), filled: false, id: "review.another") { model.anotherDocument() }
            }
            .gutter()
            .padding(.vertical, 8)
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
        let moreShown = moreOpen || flagged.contains("deductions")
        // Only the values in view are confirmed together: folded, the values that decide the result; open, all.
        let leadPending = leadRows.filter { $0.found && !$0.confirmed }.count
        let restMissing = doc.extraction == nil ? 0 : restRows.filter { $0.value == nil }.count
        let restFound = restRows.count - restMissing + doc.deductionsForDisplay.count
        let moreLabel = restMissing > 0
            ? model.t("review.moreValues.notFound", ["count": model.number(Double(restFound)), "missing": model.number(Double(restMissing))])
            : model.t("review.moreValues", ["count": model.number(Double(restRows.count + doc.deductionsForDisplay.count))])
        return ScrollViewReader { proxy in
            RevealingScroll {
                VStack(alignment: .leading, spacing: 16) {
                    DraftLine()
                    title(model.t("review.title"))
                    if let extraction = doc.extraction {
                        ProvenanceBadge(source: extraction.source, reason: extraction.reason)
                        if extraction.reason == .onDeviceFailed { NoteText(text: model.t("answers.retried")) }
                        PointerCard()
                    }
                    NoteText(text: model.t(doc.extraction == nil ? "review.manualLead" : "review.lead"), size: 15)
                    if doc.extraction != nil, moreShown ? doc.pendingCount > 0 : leadPending > 0 {
                        // The values that decide the result are confirmed with one press: they are all in
                        // view. Opened, the other values can be confirmed together too. Nothing unseen.
                        let names = Set(leadRows.map(\.name))
                        SecondaryButton(label: moreShown ? model.t("review.confirmAllCount", ["count": model.number(Double(doc.pendingCount))])
                                            : model.t("review.confirmLeadCount", ["count": model.number(Double(leadPending))]),
                                        id: "review.confirmAll") {
                            withMotion(Motion.short) {
                                if moreShown { model.editDocument { $0.confirmAll() } } else {
                                    model.editDocument { d in for n in names { d.confirm(n) } }
                                }
                            }
                        }
                        NoteText(text: moreShown ? model.t("review.pending", ["count": model.number(Double(doc.pendingCount))])
                                     : model.t("review.pendingLead", ["count": model.number(Double(leadPending))]))
                            .accessibilityIdentifier("review.pending")
                            .id("review.pending")
                            .sensoryFeedback(Haptic.error, trigger: pendingNudges)
                    }
                    if confirmFirst && leadPending > 0 {
                        NoticeCard(text: model.t("review.confirmFirst")).accessibilityIdentifier("review.confirmFirst")
                    }
                    SectionLabel(text: model.t("review.inPaystub"), large: false)
                    ListCard {
                        ForEach(Array(leadRows.enumerated()), id: \.element.id) { i, field in
                            if i > 0 { RowDivider() }
                            FieldRow(field: field, flagged: flagged.contains(field.name))
                        }
                        RowDivider()
                        Button { withMotion(Motion.reveal) { moreOpen.toggle() } } label: {
                            // "Other values, not used for the result (7)": counted as the button above counts.
                            ListRow(title: moreLabel, chevron: false, titleSize: 15, leading: { EmptyView() }) {
                                Image(systemName: moreShown ? "chevron.down" : "chevron.right").sfFont(14, weight: .semibold)
                                    .foregroundStyle(theme.icon)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(moreLabel)
                        .accessibilityIdentifier("review.more")
                        if moreShown {
                            VStack(spacing: 0) {
                                ForEach(restRows) { field in
                                    RowDivider()
                                    FieldRow(field: field, flagged: false)
                                }
                                RowDivider()
                                deductions
                            }
                            .revealsIntoView()
                            .transition(Motion.revealTransition)
                        }
                    }
                    if let validation { income(validation) }
                    if let validation { checks(validation) }
                    if model.incomeChange == nil, validation?.annualization != nil {
                        SecondaryButton(label: model.t("review.addAnother"), filled: false, id: "review.addAnother") { model.addAnotherPaystub() }
                    }
                    changes
                    // On a short iPhone and at accessibility sizes the action is part of the content.
                    if !pinsActions { VStack(spacing: 4) { blockAction(validation) } }
                }
                .gutter()
                .padding(.vertical, 8)
            }
            .onChange(of: scrollTarget) { _, target in
                guard let target else { return }
                withAnimation { proxy.scrollTo(target, anchor: .center) }
                scrollTarget = nil
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if pinsActions {
                VStack(spacing: 4) { blockAction(validation) }
                    .gutter()
                    .padding(.vertical, 8)
                    .background(theme.ground)
            }
        }
    }

    @ViewBuilder private func blockAction(_ validation: ValidationResult?) -> some View {
        if model.incomeChange != nil {
            PrimaryButton(label: model.t("q.finish"), id: "review.results") { model.showResults() }
        } else if let a = validation?.annualization {
            // Quiet while values wait for confirmation; pressed then, it shows which (never silent).
            PrimaryButton(label: model.t("review.useIncome", ["amount": model.money(Double(a.annualIncome))]), id: "review.useIncome",
                          ready: leadPending == 0) {
                guard leadPending == 0 else { return nudgePending() }
                model.useIncome(a)
            }
        } else {
            PrimaryButton(label: model.t("review.continue"), id: "review.continue",
                          ready: leadPending == 0 && anyValue) {
                guard leadPending == 0 else { return nudgePending() }
                scrollTarget = "review.annual"
            }
        }
    }

    /// Something has been read or typed (typing the numbers starts with none).
    private var anyValue: Bool { model.document.fieldsForDisplay.contains { $0.value != nil } }

    /// Values that decide the result and still wait for confirmation (what "Use" waits for).
    private var leadPending: Int {
        let names = Set(Self.leadNames(model.document, flagged: Self.flagged(model.documentValidation)))
        return model.document.fieldsForDisplay.filter { names.contains($0.name) && $0.found && !$0.confirmed }.count
    }

    static func flagged(_ validation: ValidationResult?) -> Set<String> {
        Set((validation?.checks.last ?? []).filter { $0.status == .warn }.flatMap { checkFields[$0.id] ?? [] })
    }

    /// What decides the result, then any value a check flags.
    static func leadNames(_ doc: DocumentSession, flagged: Set<String>) -> [String] {
        let dateField = doc.fieldsForDisplay.first { $0.name == "payDate" }?.value == nil ? "periodEnd" : "payDate"
        let order = leadFields.map { $0 == "payDate" ? dateField : $0 } + doc.fieldsForDisplay.map(\.name).filter { flagged.contains($0) }
        var seen = Set<String>()
        return order.filter { seen.insert($0).inserted }
    }

    /// A press while values still wait: scroll to the line that says how many, say they decide the
    /// result, read it out, and tap.
    private func nudgePending() {
        confirmFirst = true
        scrollTarget = "review.pending"
        pendingNudges += 1
        AccessibilityNotification.Announcement(model.t("review.confirmFirst")).post()
    }

    // MARK: Yearly income and checks

    private func income(_ validation: ValidationResult) -> some View {
        Card {
            Text(model.t("review.annualTitle")).sfFont(15, weight: .semibold).foregroundStyle(theme.ink)
                .accessibilityAddTraits(.isHeader)
            if let a = validation.annualization {
                Display(text: model.money(Double(a.annualIncome)), size: 64, maxLines: 1)
                    .padding(.top, 4)
                Text(model.reviewBasisText(a))
                    .monoFont(13, weight: 400)
                    .foregroundStyle(theme.note)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("review.basis")
                if case .ytd = a.basis {
                    // Which date the yearly income was worked out from: the end of the pay period, else the pay date.
                    let periodEnd = model.document.fieldsForDisplay.first { $0.name == "periodEnd" }?.value != nil
                    NoteText(text: model.t(periodEnd ? "review.basis.dateIsPeriodEnd" : "review.basis.dateIsPayDate")).padding(.top, 4)
                        .accessibilityIdentifier("review.basisDate")
                }
                if case .average(_, _, _, let used) = a.basis, used.count > 1 {
                    NoteText(text: model.t("review.stubsCount", ["count": String(used.count)])).padding(.top, 4)
                }
                HStack(spacing: 8) {
                    WhereBadge(kind: .noModel, label: model.t("badge.noModel"))
                    Text(model.t("review.workedOutHere")).sfFont(13).foregroundStyle(theme.note)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 10)
            } else if let failure = validation.failure, model.document.extraction != nil || anyValue {
                NoticeCard(text: model.t("review.failure.\(failure)"))
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("review.failure")
                    .padding(.top, 8)
            }
        }
        .id("review.annual")
    }

    @ViewBuilder private func checks(_ validation: ValidationResult) -> some View {
        // Deductions not read on this device: the net-sum check is not shown while none has been added.
        let deductionsNotRead = model.document.notRead.contains("deductions") && model.document.deductionsForDisplay.isEmpty
        let shown = (validation.checks.last ?? []).filter { $0.status != .skipped && !(deductionsNotRead && $0.id == "net-sum") }
        if !shown.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: model.t("review.checksTitle"), large: false)
                ListCard {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, check in
                        if i > 0 { RowDivider(inset: 48) }
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Group {
                                if check.status == .ok { StateMark(state: .pass) } else {
                                    Image(systemName: "exclamationmark").sfFont(12, weight: .heavy).foregroundStyle(theme.ink)
                                        .frame(width: 22, height: 22).overlay(Circle().strokeBorder(theme.ink, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])))
                                }
                            }
                            .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 5 }
                            Text(model.t("check.\(check.id)")).sfFont(15).foregroundStyle(theme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(model.t("check.status.\(check.status.rawValue)")).sfFont(12, weight: .semibold).foregroundStyle(theme.note)
                                .multilineTextAlignment(.trailing)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("check.\(check.id)")
                    }
                }
            }
        }
    }

    @ViewBuilder private var changes: some View {
        if let change = model.incomeChange {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: model.t("review.changesTitle"))
                if change.isEmpty { NoteText(text: model.t("review.noChange"), size: 15) }
                ListCard {
                    ForEach(Array(change.enumerated()), id: \.element.program) { i, c in
                        if i > 0 { RowDivider(inset: 52) }
                        ListRow(title: model.programName(c.program),
                                subtitle: "\(model.t("verdict.\(c.after.rawValue)")) · \(model.t("review.before", ["verdict": model.t("verdict.\(c.before.rawValue)")]))",
                                chevron: false, titleWeight: .semibold) { VerdictMarker(verdict: c.after) }
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(model.t("review.change", ["program": model.programName(c.program),
                                                                          "before": model.t("verdict.\(c.before.rawValue)"),
                                                                          "after": model.t("verdict.\(c.after.rawValue)")]))
                            .accessibilityIdentifier("review.change.\(c.program)")
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("review.changes")
            .id("review.changes")
        }
    }

    private var deductions: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(model.t("field.paystub.deductions")).sfFont(15, weight: .semibold).foregroundStyle(theme.ink)
            if model.document.notRead.contains("deductions") && model.document.deductionsForDisplay.isEmpty {
                NoteText(text: model.t("review.deductionsNotRead")).accessibilityIdentifier("review.deductionsNotRead")
            }
            ForEach(model.document.deductionsForDisplay) { row in
                DeductionRowView(row: row)
            }
            LinkText(label: model.t("review.addDeduction"), id: "review.addDeduction") { model.editDocument { $0.addDeduction() } }
        }
        .padding(16)
    }
}

// MARK: - Rows

/// Fields that are amounts of money (typed values are confirmed as money in the pack's currency).
private let moneyFields: Set<String> = ["grossPay", "netPay", "ytdGross", "hourlyRate"]

/// The document line a value came from, in IBM Plex Mono on raised, the value circled (dashed when a
/// check flags it).
private struct SourceLine: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let source: String
    let value: String?
    let flagged: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(model.t("review.source")).sfFont(12).foregroundStyle(theme.note)
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(source.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                        HStack(spacing: 0) {
                            ForEach(Array(Self.chunks(line).enumerated()), id: \.offset) { _, chunk in
                                let ringed = value.map { chunk.trimmingCharacters(in: .whitespaces) == $0 } ?? false
                                Text(verbatim: chunk)
                                    .font(Font(DesignFonts.uiFont(.mono, weight: ringed ? 600 : 400, size: 13)))
                                    .foregroundStyle(theme.ink)
                                    .padding(.horizontal, ringed ? 6 : 0)
                                    .overlay {
                                        if ringed {
                                            Capsule().strokeBorder(theme.ink, style: StrokeStyle(lineWidth: 1.5, dash: flagged ? [4, 3] : []))
                                                .padding(.vertical, -2)
                                        }
                                    }
                                    .fixedSize()
                            }
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(theme.raised))
        .accessibilityElement(children: .combine)
    }

    /// Runs of spaces and runs of other characters, so a value can be circled alone.
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
    @Environment(\.dynamicTypeSize) private var dynamicType
    let field: ReviewField
    let flagged: Bool
    @State private var open = false
    @State private var editing = false
    @FocusState private var fieldFocused: Bool
    /// One haptic per value confirmed by hand ("Confirm all" gives none per row).
    @State private var confirmTaps = 0
    @State private var text = ""
    @State private var choice = ""
    @State private var invalid = false

    private var label: String { model.t("field.paystub.\(field.name)") }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            let layout = dynamicType.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(spacing: 10))
            HStack(spacing: 10) {
                // Tapping the row opens where the value was found; the label is the row's button for VoiceOver.
                layout {
                    Text(label).sfFont(17).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityAddTraits(.isButton)
                        .accessibilityHint(model.t("review.source"))
                        .accessibilityAction { withMotion(Motion.reveal) { open.toggle() } }
                    // Typing the numbers: an empty row invites typing ("Type it"), it was never "not found".
                    Text(valueText ?? model.t(model.document.extraction == nil ? "review.typeIt"
                                              : model.document.notRead.contains(field.name) ? "review.fieldNotRead" : "review.notFound"))
                        .modifier(ScaledSystemFont(size: valueText == nil ? 13 : 15, weight: .regular, mono: valueText != nil))
                        .foregroundStyle(valueText == nil ? theme.note : theme.ink)
                        .multilineTextAlignment(.trailing)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("field.\(field.name).value")
                }
                .contentShape(Rectangle())
                .onTapGesture { withMotion(Motion.reveal) { open.toggle() } }
                confirmMark
                    .sensoryFeedback(Haptic.confirm, trigger: confirmTaps)
            }
            if flagged { NoteText(text: model.t("review.flagged")) }
            if open || editing {
                VStack(alignment: .leading, spacing: 10) {
                    if let source = field.source, !editing { SourceLine(source: source, value: valueText, flagged: flagged) }
                    if editing { editor } else {
                        LinkText(label: model.t(field.found ? "review.edit" : "review.typeIt"), size: 15, id: "field.\(field.name).edit") { startEditing() }
                            .accessibilityLabel("\(model.t("review.edit")): \(label)")
                    }
                }
                .revealsIntoView()
                .transition(Motion.revealTransition)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(minHeight: 52)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("field.\(field.name)")
    }

    /// An empty ring to confirm a found value; an ink check disc once confirmed.
    @ViewBuilder private var confirmMark: some View {
        if field.confirmed {
            StateMark(state: .pass)
                .transition(Motion.reduceMotion ? .opacity : .scale(scale: 0.6).combined(with: .opacity))
                .accessibilityElement()
                .accessibilityLabel(model.t("review.confirmed"))
        } else if field.found {
            Button {
                withMotion(Motion.short) { model.editDocument { $0.confirm(field.name) } }
                confirmTaps += 1
            } label: {
                Circle().strokeBorder(theme.ink, lineWidth: 1.5).frame(width: 22, height: 22).frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .padding(.vertical, -11)
            .padding(.horizontal, -11)
            .accessibilityLabel("\(model.t("review.confirm")): \(label)")
            .accessibilityIdentifier("field.\(field.name).confirm")
            .transition(.opacity)
        }
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

    @ViewBuilder private var editor: some View {
        switch field.kind {
        case .choice(let values):
            Menu {
                Button(model.t("option.none")) { choice = "" }
                ForEach(values, id: \.self) { v in Button(model.t("option.\(field.name).\(v)")) { choice = v } }
            } label: {
                HStack {
                    Text(choice.isEmpty ? model.t("option.none") : model.t("option.\(field.name).\(choice)")).sfFont(17)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").sfFont(13, weight: .semibold).accessibilityHidden(true)
                }
                .foregroundStyle(theme.ink)
                .padding(.horizontal, 14)
                .frame(minHeight: 48)
                .background(RoundedRectangle(cornerRadius: 12).fill(theme.raised))
            }
            .accessibilityLabel(label)
            .accessibilityIdentifier("field.\(field.name).input")
        default:
            TextField("", text: $text)
                .moneyOnly(field.kind == .number ? $text : .constant(""))
                .monoFont(17, weight: 500)
                .keyboardType(field.kind == .number ? .decimalPad : .default)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .textContentType(nil)
                .focused($fieldFocused)
                .padding(.horizontal, 14)
                .frame(minHeight: 48)
                .background(RoundedRectangle(cornerRadius: 12).fill(theme.raised))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(invalid ? theme.ink : .clear, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
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
                Understood(text: model.t("review.understood", ["amount": moneyFields.contains(field.name) ? model.money(n, cents: true)
                                                                                                         : model.documentAmount(n)]))
            }
        }
        if invalid { NoticeCard(text: model.t("review.invalidNumber")) }
        HStack(spacing: 10) {
            PrimaryButton(label: model.t("review.save"), id: "field.\(field.name).save") { save() }
            SecondaryButton(label: model.t("review.cancel"), filled: false) { editing = false; invalid = false }
        }
    }

    private func startEditing() {
        switch field.value {
        case .number(let n)?: text = n.rounded() == n ? String(Int(n)) : String(n)
        case .text(let s)?: text = s
        case .choice(let c)?: choice = c
        case nil: text = ""; choice = ""
        }
        withMotion(Motion.reveal) { editing = true }
        fieldFocused = true
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
                    .moneyOnly($text)
                    .monoFont(17, weight: 500)
                    .keyboardType(.decimalPad)
                    .textContentType(nil)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 14)
                    .frame(minHeight: 48)
                    .background(RoundedRectangle(cornerRadius: 12).fill(theme.raised))
                    .accessibilityLabel(model.t("field.deduction.amount"))
                Menu {
                    Button(model.t("option.none")) { kind = "" }
                    ForEach(Self.kinds, id: \.self) { k in Button(model.t("option.deduction.\(k)")) { kind = k } }
                } label: {
                    HStack {
                        Text(kind.isEmpty ? model.t("field.deduction.kind") : model.t("option.deduction.\(kind)")).sfFont(17)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").sfFont(13, weight: .semibold).accessibilityHidden(true)
                    }
                    .foregroundStyle(theme.ink)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 48)
                    .background(RoundedRectangle(cornerRadius: 12).fill(theme.raised))
                }
                .accessibilityLabel(model.t("field.deduction.kind"))
                if invalid { NoticeCard(text: model.t("review.invalidNumber")) }
                PrimaryButton(label: model.t("review.save")) {
                    guard let n = Rehydrator.parseTypedAmount(text) else { invalid = true; return }
                    model.editDocument { $0.setDeduction(row.id, amount: n, kind: kind.isEmpty ? nil : kind) }
                    editing = false
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(row.kind.map { model.t("option.deduction.\($0)") } ?? model.t("field.deduction.amount")).sfFont(15)
                        .foregroundStyle(theme.ink).frame(maxWidth: .infinity, alignment: .leading)
                    Text(row.amount.map(model.documentAmount) ?? model.t("review.notFound"))
                        .monoFont(15, weight: 500).foregroundStyle(theme.ink)
                    if row.confirmed { StateMark(state: .pass) }
                }
                if let source = row.source { SourceLine(source: source, value: row.amount.map(model.documentAmount), flagged: false) }
                HStack(spacing: 14) {
                    if row.found && !row.confirmed {
                        LinkText(label: model.t("review.confirm"), size: 15) { model.editDocument { $0.confirmDeduction(row.id) } }
                    }
                    LinkText(label: model.t("review.edit"), size: 15) {
                        text = row.amount.map { $0.rounded() == $0 ? String(Int($0)) : String($0) } ?? ""
                        kind = row.kind ?? ""
                        editing = true
                    }
                    LinkText(label: model.t("review.removeDeduction"), size: 15) { model.editDocument { $0.removeDeduction(row.id) } }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}
