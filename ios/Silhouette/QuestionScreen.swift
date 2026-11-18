// One question per screen: the system navigation bar with "Question n of total" and Skip,
// a thin progress bar, the question in SF bold, and its input as list rows in a white card (a counter
// for numbers, a mono field for amounts); Next is pinned above the tab bar. Every question can be
// skipped; sensitive ones and the exact income say that the answer never leaves the device.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct QuestionScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let stepId: String
    let returnTo: ReturnTo?

    /// Form state before validation.
    @State private var number: Int?
    @State private var choice: String?
    @State private var picked: [String] = []
    @State private var exactText = ""
    @State private var error: String?
    @State private var loaded = false
    @FocusState private var exactFocused: Bool

    private var step: Step? { model.session.step(stepId) }
    private var index: Int { model.session.index(of: stepId) ?? 0 }
    private var total: Int { model.session.steps.count }
    private var isLast: Bool { index == total - 1 && returnTo == nil }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let step {
                        ProgressView(value: Double(index + 1), total: Double(max(total, 1)))
                            .tint(theme.ink)
                            .accessibilityHidden(true)
                        DraftLine()
                        Text(model.t("question.\(step.id).label"))
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                            .accessibilityIdentifier("question.label")
                        let helpKey = "question.\(step.id).help"
                        if model.bundle.copy.has(helpKey) { NoteText(text: model.t(helpKey), size: 15) }
                        input(for: step)
                        if step.sensitive {
                            SensitiveNote(text: model.t("sensitive.note")).accessibilityIdentifier("question.sensitive")
                        }
                        if let error {
                            NoticeCard(text: error, systemImage: "exclamationmark.circle")
                                .accessibilityElement(children: .combine)
                                .accessibilityIdentifier("question.error")
                                .id("question.error")
                        }
                    }
                }
                .gutter()
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: error) { _, new in if new != nil { withAnimation { proxy.scrollTo("question.error", anchor: .center) } } }
            .onChange(of: exactFocused) { _, focused in
                if focused { Task { try? await Task.sleep(for: .milliseconds(350)); withAnimation { proxy.scrollTo("exactField", anchor: .center) } } }
            }
        }
        .background(theme.ground.ignoresSafeArea())
        .navigationTitle(model.t("q.progress", ["n": String(index + 1), "total": String(total)]))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(model.t("q.progress", ["n": model.number(Double(index + 1)), "total": model.number(Double(total))]))
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(theme.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("question.progress")
            }
            if let step {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(model.t("q.skipShort")) {
                        model.skip(step.id)
                        model.advance(from: step.id, returnTo: returnTo)
                    }
                    .accessibilityLabel(model.t("q.skip"))
                    .accessibilityIdentifier("q.skip")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button(isLast ? model.t("q.finish") : model.t("q.next")) { submit(step) }
                        .fontWeight(.semibold)
                        .accessibilityIdentifier("keyboard.next")
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let step {
                PrimaryButton(label: isLast ? model.t("q.finish") : model.t("q.next"), id: "q.next") { submit(step) }
                    .gutter()
                    .padding(.vertical, 8)
                    .background(theme.ground)
            }
        }
        .onAppear(perform: loadDraft)
    }

    // MARK: Inputs

    @ViewBuilder
    private func input(for step: Step) -> some View {
        switch step.kind {
        case .integer where AnswerInputs.isMoneyVariable(step.id):
            moneyField(step)
        case .integer(let min, let max):
            VStack(spacing: 6) {
                Counter(value: $number, min: min, max: max, label: model.t("question.\(step.id).label"),
                        decrease: model.t("q.decrease"), increase: model.t("q.increase"), error: error != nil) { error = nil }
                NoteText(text: model.t("q.error.integer", ["min": String(min), "max": String(max)]), size: 13)
                    .multilineTextAlignment(.center)
                    .accessibilityHidden(true)
            }
        case .single(let values):
            rows(values.map { ($0, model.t("option.\(step.id).\($0)")) })
        case .boolean:
            rows([("true", model.t("option.\(step.id).true")), ("false", model.t("option.\(step.id).false"))])
        case .multiple(let values):
            ListCard {
                ForEach(Array(values.enumerated()), id: \.element) { i, value in
                    if i > 0 { RowDivider() }
                    let selected = picked.contains(value)
                    ChoiceRow(label: model.t("option.\(step.id).\(value)"), selected: selected, multiple: true, id: "choice.\(value)") {
                        if value == "none" { picked = selected ? [] : ["none"] } else {
                            picked = selected ? picked.filter { $0 != value } : picked.filter { $0 != "none" } + [value]
                        }
                        error = nil
                    }
                }
            }
        case .income(let bands):
            income(bands)
        }
    }

    private func rows(_ options: [(value: String, label: String)]) -> some View {
        ListCard {
            ForEach(Array(options.enumerated()), id: \.element.value) { i, option in
                if i > 0 { RowDivider() }
                ChoiceRow(label: option.label, selected: choice == option.value, id: "choice.\(option.value)") {
                    choice = option.value
                    error = nil
                }
            }
        }
    }

    private func income(_ bands: [Bands.IncomeBand]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ListCard {
                ForEach(Array(bands.enumerated()), id: \.element.id) { i, band in
                    if i > 0 { RowDivider() }
                    ChoiceRow(label: model.bundle.copy.bandLabel(band, model.locale, currency: model.bundle.packInfo.currency,
                                                                 format: model.bundle.packInfo.numberFormat),
                              selected: choice == band.id, mono: true, id: "choice.\(band.id)") {
                        choice = band.id
                        error = nil
                        exactFocused = false
                    }
                }
                RowDivider()
                ChoiceRow(label: model.t("income.exact.option"), selected: choice == "exact", id: "choice.exact") {
                    choice = "exact"
                    error = nil
                    exactFocused = true
                }
            }
            if choice == "exact" { exactField }
        }
    }

    /// An amount of money asked as a number (investment income): typed as money, kept in whole dollars.
    private func moneyField(_ step: Step) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            AmountField(text: $exactText, label: model.t("question.\(step.id).label"), currency: model.currencySymbol, error: error != nil,
                        id: "amount.field", focused: $exactFocused)
                .onChange(of: exactText) { error = nil }
            if let amount = Rehydrator.parseTypedAmount(exactText) {
                Understood(text: model.t("review.understood", ["amount": model.money(amount.rounded())]))
                    .accessibilityIdentifier("amount.understood")
            }
        }
        .id("amount.field")
    }

    @ViewBuilder private var exactField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(model.t("income.exact.label")).font(.system(size: 13, weight: .semibold)).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Label(model.t("q.private"), systemImage: "lock").labelStyle(SmallIconLabel())
                    .font(.system(size: 12)).foregroundStyle(theme.note)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("income.private")
            }
            AmountField(text: $exactText, label: model.t("income.exact.label"), hint: model.t("q.private"), currency: model.currencySymbol,
                        error: error != nil, id: "income.exact", focused: $exactFocused)
                .onChange(of: exactText) { error = nil }
            if let amount = Rehydrator.parseTypedAmount(exactText) {
                // The amount as understood, shown before the user continues.
                Understood(text: model.t("q.amountUnderstood", ["amount": model.money(amount, cents: true)]))
                    .accessibilityIdentifier("income.understood")
            }
        }
        .id("exactField")
    }

    // MARK: Draft

    private func loadDraft() {
        guard !loaded, let step else { return }
        loaded = true
        guard case .value(let value)? = model.session.displayAnswer(for: step.id) else { return }
        switch value {
        case .integer(let n):
            number = n
            if AnswerInputs.isMoneyVariable(step.id) { exactText = String(n) }
        case .choice(let c): choice = c
        case .boolean(let b): choice = b ? "true" : "false"
        case .selection(let s): picked = s
        case .income(.band(let id)): choice = id
        case .income(.exact(let amount)):
            choice = "exact"
            exactText = amount.rounded() == amount ? String(Int(amount)) : String(amount)
        }
    }

    private func draftValue(_ step: Step) -> AnswerValue? {
        switch step.kind {
        case .integer where AnswerInputs.isMoneyVariable(step.id):
            guard !exactText.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
            // Typed as money (shared/skeleton/SPEC.md section 5.1), kept in whole dollars.
            guard let amount = Rehydrator.parseTypedAmount(exactText), amount < Double(Int.max) else { return .integer(Int.min) }
            return .integer(Int(amount.rounded()))
        case .integer: return number.map(AnswerValue.integer)
        case .single: return choice.map(AnswerValue.choice)
        case .boolean: return choice.map { .boolean($0 == "true") }
        case .multiple(let values):
            // Submitting with nothing ticked is the answer "none of these", not a skip.
            return .selection(values.filter(picked.contains))
        case .income:
            guard let choice else { return nil }
            guard choice == "exact" else { return .income(.band(choice)) }
            // Only the number format of shared/skeleton/SPEC.md section 5: "28,000.50" and
            // "28000.5" are valid; "28.000,50" is refused rather than misread.
            guard let amount = Rehydrator.parseTypedAmount(exactText) else { return .income(.exact(.nan)) }
            return .income(.exact(amount))
        }
    }

    private func submit(_ step: Step) {
        let problem: AnswerProblem? = if let value = draftValue(step) {
            model.answer(step.id, value)
        } else if case .integer = step.kind {
            .integer
        } else {
            .choose
        }
        guard let problem else {
            model.advance(from: step.id, returnTo: returnTo)
            return
        }
        var params: [String: String] = [:]
        var key = problem.rawValue
        if case .integer(let min, let max) = step.kind {
            if AnswerInputs.isMoneyVariable(step.id) {
                params = ["min": model.money(Double(min)), "max": model.money(Double(max))]
                // "60.000" is refused with a message that shows the accepted form.
                if exactText.range(of: #"\.[0-9]{3,}\s*$"#, options: .regularExpression) != nil { key = "q.error.amountDecimals" }
            } else {
                params = ["min": String(min), "max": String(max)]
            }
        }
        let message = model.t(key, params)
        error = message
        AccessibilityNotification.Announcement(message).post()
    }
}

/// A list row to choose: the label, and a checkmark (single) or a check box (multiple) when chosen.
struct ChoiceRow: View {
    @Environment(\.theme) private var theme
    let label: String
    let selected: Bool
    var multiple = false
    var mono = false
    var id: String = ""
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                if multiple {
                    Image(systemName: selected ? "checkmark.square.fill" : "square").font(.system(size: 20)).foregroundStyle(theme.ink)
                        .accessibilityHidden(true)
                }
                Text(label)
                    .font(mono ? Font(DesignFonts.uiFont(.mono, weight: 500, size: 15)) : .system(size: 17, weight: selected ? .semibold : .regular))
                    .foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !multiple && selected {
                    Image(systemName: "checkmark").font(.system(size: 17, weight: .semibold)).foregroundStyle(theme.ink).accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .background(selected ? theme.raised : .clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityIdentifier(id)
    }
}

/// A money amount typed in IBM Plex Mono after the currency symbol, in a white field.
struct AmountField: View {
    @Environment(\.theme) private var theme
    @Binding var text: String
    let label: String
    var hint: String? = nil
    var currency: String = "$"
    var error = false
    var id: String = ""
    var focused: FocusState<Bool>.Binding

    var body: some View {
        HStack(spacing: 6) {
            Text(currency).font(Font(DesignFonts.uiFont(.mono, weight: 500, size: 20))).foregroundStyle(theme.note).accessibilityHidden(true)
            TextField("", text: $text)
                .font(Font(DesignFonts.uiFont(.mono, weight: 500, size: 20)))
                .foregroundStyle(theme.ink)
                .keyboardType(.decimalPad)
                .textContentType(nil)
                .autocorrectionDisabled()
                .focused(focused)
                .accessibilityLabel(label)
                .accessibilityHint(hint ?? "")
                .accessibilityIdentifier(id)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 56)
        .background(RoundedRectangle(cornerRadius: 12).fill(theme.sheet))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(error ? theme.ink : theme.cardBorder, style: StrokeStyle(lineWidth: error ? 1.5 : 1, dash: error ? [5, 4] : [])))
    }
}

/// "Understood as $28,000.50 a year.": an ink check disc and the amount as read.
struct Understood: View {
    @Environment(\.theme) private var theme
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 15)).foregroundStyle(theme.ink).accessibilityHidden(true)
            Text(text).font(.system(size: 15, weight: .semibold)).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

/// − value + : the value in display type between two 44 pt round buttons, in a white card. At the
/// minimum or maximum a button is disabled. Unanswered shows a dash.
private struct Counter: View {
    @Environment(\.theme) private var theme
    @Environment(AppModel.self) private var model
    @Binding var value: Int?
    let min: Int
    let max: Int
    let label: String
    let decrease: String
    let increase: String
    let error: Bool
    let onChange: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            stepButton("minus", decrease, id: "stepper.decrease", enabled: value.map { $0 > min } ?? true) {
                value = value.map { Swift.max(min, $0 - 1) } ?? min
            }
            Group {
                if let value {
                    Text(verbatim: model.number(Double(value)))
                        .font(Font(DesignFonts.uiFont(.display, weight: 900, size: 72)))
                        .foregroundStyle(theme.ink)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                } else {
                    RoundedRectangle(cornerRadius: 2).fill(theme.ink).frame(width: 40, height: 10)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 96)
            .accessibilityElement()
            .accessibilityLabel(label)
            .accessibilityValue(value.map(String.init) ?? "")
            .accessibilityIdentifier("stepper.value")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: value = value.map { Swift.min(max, $0 + 1) } ?? min
                case .decrement: value = value.map { Swift.max(min, $0 - 1) } ?? min
                @unknown default: break
                }
                onChange()
            }
            stepButton("plus", increase, id: "stepper.increase", enabled: value.map { $0 < max } ?? true) {
                value = value.map { Swift.min(max, $0 + 1) } ?? min
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 24).fill(theme.sheet))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(error ? theme.ink : theme.cardBorder, style: StrokeStyle(lineWidth: error ? 1.5 : 1, dash: error ? [5, 4] : [])))
    }

    private func stepButton(_ symbol: String, _ a11y: String, id: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            onChange()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(enabled ? theme.ink : theme.faint)
                .frame(width: 44, height: 44)
                .background(Circle().fill(theme.raised))
                .contentShape(Circle())
        }
        .buttonStyle(PressScale())
        .disabled(!enabled)
        .accessibilityLabel(a11y)
        .accessibilityIdentifier(id)
    }
}

/// "This answer stays on this iPhone. Private questions can be skipped." with a lock, in note grey.
struct SensitiveNote: View {
    @Environment(\.theme) private var theme
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "lock").font(.system(size: 12, weight: .semibold)).accessibilityHidden(true)
            Text(Self.firstSentenceBold(text)).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(theme.note)
        .accessibilityElement(children: .combine)
    }

    static func firstSentenceBold(_ text: String) -> AttributedString {
        var out = AttributedString(text)
        if let r = text.range(of: ". ") ?? text.range(of: "。") ?? text.range(of: "다. ") {
            let head = String(text[..<r.upperBound])
            if let range = out.range(of: head) { out[range].inlinePresentationIntent = .stronglyEmphasized }
        }
        return out
    }
}
