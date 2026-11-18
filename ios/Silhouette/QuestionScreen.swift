// One question per screen: the system navigation bar with "Question n of total" and Skip,
// a thin progress bar, the question in SF bold, and its input as list rows in a white card (a counter
// for numbers, a mono field for amounts); Next is pinned above the tab bar. Every question can be
// skipped; sensitive ones and the exact income say that the answer never leaves the device.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

/// An unsubmitted choice on a question.
struct QuestionDraft {
    var number: Int?
    var choice: String?
    var picked: [String]
    var exactText: String
}

struct QuestionScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
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
    @AccessibilityFocusState private var errorFocused: Bool
    /// The progress bar starts at the previous question's value and moves on when the page appears.
    @State private var shownProgress: Double?
    /// Each refused Next, so a second press shows the hint again (scroll, focus, haptic).
    @State private var attempts = 0
    /// When the question appeared: a press in the first moment belongs to the question before (a
    /// double press on Next) and is ignored.
    @State private var appearedAt = Date.distantFuture
    /// Answered or skipped here: nothing to keep as an unsubmitted choice.
    @State private var settled = false

    private var step: Step? { model.session.step(stepId) }
    private var index: Int { model.session.index(of: stepId) ?? 0 }
    private var total: Int { model.session.steps.count }
    private var isLast: Bool { index == total - 1 && returnTo == nil }

    var body: some View {
        ScrollViewReader { proxy in
            RevealingScroll {
                VStack(alignment: .leading, spacing: 16) {
                    if let step {
                        ProgressView(value: shownProgress ?? Double(index), total: Double(max(total, 1)))
                            .tint(theme.ink)
                            .accessibilityHidden(true)
                        DraftLine()
                        Text(model.t("question.\(step.id).label"))
                            .sfFont(28, weight: .bold)
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
                        if let error, !rangeCarriesHint(step) {
                            NoticeCard(text: error, systemImage: "exclamationmark.circle")
                                .accessibilityElement(children: .combine)
                                .accessibilityIdentifier("question.error")
                                .accessibilityFocused($errorFocused)
                                // Scrolled only as far as needed: the question stays in view when
                                // both fit; the hint wins only when they cannot.
                                .revealsIntoView(trigger: attempts)
                                .transition(Motion.revealTransition)
                        }
                        if !pinsNext && !exactFocused { nextButton(step).padding(.top, 8) }
                    }
                }
                .gutter()
                .padding(.top, 4)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            // VoiceOver moves to the hint each time.
            .onChange(of: attempts) {
                guard error != nil else { return }
                errorFocused = true
            }
            // The exact-amount field, once open and focused, sits clear of the keyboard and Next.
            .onChange(of: exactFocused) { _, focused in
                if focused { Task { try? await Task.sleep(for: .milliseconds(350)); withMotion(Motion.reveal) { proxy.scrollTo("exactField", anchor: .bottom) } } }
            }
            .sensoryFeedback(Haptic.error, trigger: attempts)
        }
        .background(theme.ground.ignoresSafeArea())
        .navigationTitle(model.t("q.progress", ["n": String(index + 1), "total": String(total)]))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text(model.t("q.progress", ["n": model.number(Double(index + 1)), "total": model.number(Double(total))]))
                    .sfFont(17, weight: .semibold)
                    .foregroundStyle(theme.ink)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("question.progress")
            }
            if let step {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(model.t("q.skipShort")) {
                        settled = true
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
            // While a field is being typed in, Next is the keyboard's own (one Next, not two). On a
            // short iPhone and at accessibility sizes Next is in the content instead.
            if let step, !exactFocused, pinsNext {
                nextButton(step)
                    .gutter()
                    .padding(.vertical, 8)
                    .background(theme.ground)
            }
        }
        .onAppear {
            loadDraft()
            settled = false
            appearedAt = Date()
            withMotion(Motion.medium) { shownProgress = Double(index + 1) }
        }
        .onDisappear {
            // Leaving by Back keeps an unsubmitted choice; a submitted one is the stored answer.
            model.questionDrafts[stepId] = settled ? nil : QuestionDraft(number: number, choice: choice, picked: picked, exactText: exactText)
        }
    }

    /// Next stays pinned on every iPhone except at accessibility sizes: it is the screen's only action,
    /// a question is short, and what opens (the hint, the exact amount) scrolls clear of it. Inline on
    /// a small iPhone it fell half under the bars on the first screen.
    private var pinsNext: Bool { !dynamicType.isAccessibilitySize }

    /// Next (or See results). On a multi-choice question with nothing ticked it says what pressing it
    /// records: "None of these".
    private func nextButton(_ step: Step) -> some View {
        let noneTicked: Bool = { if case .multiple = step.kind { return picked.isEmpty } else { return false } }()
        let label = noneTicked ? model.t("q.noneOfThese") : isLast ? model.t("q.finish") : model.t("q.next")
        return PrimaryButton(label: label, id: "q.next", ready: draftValue(step) != nil, showsArrow: !noneTicked) { submit(step) }
    }

    /// The counter that is set with the stepper only: its range line turns into the hint (one line).
    private func rangeCarriesHint(_ step: Step) -> Bool {
        if case .integer = step.kind { return !AnswerInputs.isMoneyVariable(step.id) }
        return false
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
                // "From 1 to 20" under a counter that cannot be typed into; after a refused Next the
                // same line says what to do, in ink (one line, not a second message).
                if let error {
                    Label(error, systemImage: "exclamationmark.circle")
                        .sfFont(13, weight: .semibold).foregroundStyle(theme.ink)
                        .multilineTextAlignment(.center)
                        .accessibilityIdentifier("question.error")
                        .accessibilityFocused($errorFocused)
                        .revealsIntoView(trigger: attempts)
                } else {
                    NoteText(text: model.t("q.range", ["min": model.number(Double(min)), "max": model.number(Double(max))]), size: 13)
                        .multilineTextAlignment(.center)
                        .accessibilityHidden(true)
                }
            }
        case .single(let values):
            rows(values.map { ($0, model.t("option.\(step.id).\($0)")) })
        case .boolean:
            rows([("true", model.t("option.\(step.id).true")), ("false", model.t("option.\(step.id).false"))])
        case .multiple(let values):
            ListCard(attention: error != nil) {
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
        ListCard(attention: error != nil) {
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
            ListCard(attention: error != nil && choice == nil) {
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
                    withMotion(Motion.reveal) { choice = "exact" }
                    error = nil
                    exactFocused = true
                }
            }
            if choice == "exact" { exactField.transition(Motion.revealTransition) }
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
                Text(model.t("income.exact.label")).sfFont(13, weight: .semibold).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Label(model.t("q.private"), systemImage: "lock").labelStyle(SmallIconLabel())
                    .sfFont(12).foregroundStyle(theme.note)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("income.private")
            }
            AmountField(text: $exactText, label: model.t("income.exact.label"), hint: model.t("q.private"), currency: model.currencySymbol,
                        error: error != nil, id: "income.exact", focused: $exactFocused)
                .onChange(of: exactText) { error = nil }
            if let amount = Rehydrator.parseTypedAmount(exactText), amount <= Double(QuickCheck.maxExactIncome) {
                // The amount as understood, shown before the user continues (never a number the
                // rules would refuse: above the maximum, Next explains instead).
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
        if let draft = model.questionDrafts[step.id], draft.number != nil || draft.choice != nil || !draft.picked.isEmpty || !draft.exactText.isEmpty {
            number = draft.number; choice = draft.choice; picked = draft.picked; exactText = draft.exactText
            return
        }
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
        // A press in the first moment after the question appeared was meant for the one before.
        guard Date().timeIntervalSince(appearedAt) > 0.4 else { return }
        let problem: AnswerProblem? = if let value = draftValue(step) {
            model.answer(step.id, value)
        } else if case .integer = step.kind {
            .integer
        } else {
            .choose
        }
        guard let problem else {
            settled = true
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
        withMotion(Motion.reveal) { error = message }
        attempts += 1
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
                    Image(systemName: selected ? "checkmark.square.fill" : "square").sfFont(20).foregroundStyle(theme.ink)
                        .accessibilityHidden(true)
                }
                Text(label)
                    .modifier(ScaledSystemFont(size: mono ? 15 : 17, weight: selected ? .semibold : .regular, mono: mono))
                    .foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if !multiple && selected {
                    // The check mark grows in from its stroke weight (a fade under Reduce Motion). The
                    // symbol's draw-on effect keeps the app from settling for UI automation, so it is not used.
                    checkmark.transition(Motion.reduceMotion ? .opacity : .scale(scale: 0.4).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .background(selected && multiple ? theme.raised : .clear)
            .contentShape(Rectangle())
            .animation(Motion.named(Motion.short), value: selected)
        }
        .buttonStyle(RowPress())
        .sensoryFeedback(Haptic.selection, trigger: selected) { _, now in now }
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityIdentifier(id)
    }

    private var checkmark: some View {
        Image(systemName: "checkmark").sfFont(17, weight: .semibold).foregroundStyle(theme.ink).accessibilityHidden(true)
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
            Text(currency).monoFont(20, weight: 500).foregroundStyle(theme.note).accessibilityHidden(true)
            TextField("", text: $text)
                .moneyOnly($text)
                .monoFont(20, weight: 500)
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

extension AmountField {
    /// Money takes digits, group separators and one decimal point, on typing and on paste ("$28,000"
    /// pasted becomes "28,000"); anything else never reaches the field.

    static func moneyCharacters(_ typed: String) -> String {
        var out = ""
        var point = false
        for c in typed {
            if c.isASCII && c.isNumber { out.append(c) }
            else if c == "," { out.append(c) }
            else if c == ".", !point { out.append(c); point = true }
        }
        return out
    }
}

extension View {
    /// Keeps only what a money amount can use (`AmountField.moneyCharacters`) in `text`.
    func moneyOnly(_ text: Binding<String>) -> some View {
        onChange(of: text.wrappedValue) { _, new in
            let kept = AmountField.moneyCharacters(new)
            if kept != new { text.wrappedValue = kept }
        }
    }
}

/// "Understood as $28,000.50 a year.": an ink check disc and the amount as read.
struct Understood: View {
    @Environment(\.theme) private var theme
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "checkmark.circle.fill").sfFont(15).foregroundStyle(theme.ink).accessibilityHidden(true)
            Text(text).sfFont(15, weight: .semibold).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
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
                        .contentTransition(Motion.reduceMotion ? .opacity : .numericText(value: Double(value)))
                        .animation(Motion.named(Motion.short), value: value)
                        .foregroundStyle(theme.ink)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                } else {
                    // Unanswered: a short faint line (an ink bar read as the masked values elsewhere).
                    Capsule().fill(theme.faint).frame(width: 36, height: 4)
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
        .sensoryFeedback(Haptic.selection, trigger: value)
        .background(RoundedRectangle(cornerRadius: 24).fill(theme.sheet))
        .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(error ? theme.ink : theme.cardBorder, style: StrokeStyle(lineWidth: error ? 1.5 : 1, dash: error ? [5, 4] : [])))
    }

    private func stepButton(_ symbol: String, _ a11y: String, id: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            onChange()
        } label: {
            Image(systemName: symbol)
                .sfFont(17, weight: .bold)
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
            Image(systemName: "lock").sfFont(12, weight: .semibold).accessibilityHidden(true)
            Text(Self.firstSentenceBold(text)).sfFont(13).fixedSize(horizontal: false, vertical: true)
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
