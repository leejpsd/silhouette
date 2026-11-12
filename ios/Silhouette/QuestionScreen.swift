// One question per screen. Every question can be skipped; sensitive ones and the exact income
// say that the answer never leaves the device.

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
        ScreenScroll {
            if let step {
                progress
                ScreenHeading(text: model.t("question.\(step.id).label"))
                    .accessibilityIdentifier("question.label")
                let helpKey = "question.\(step.id).help"
                if model.bundle.copy.has(helpKey) {
                    Text(model.t(helpKey)).tokenFont(.body).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
                }
                if step.sensitive {
                    PrivateNote(text: model.t("sensitive.note")).accessibilityIdentifier("question.sensitive")
                }
                input(for: step)
                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .tokenFont(.bodyStrong)
                        .foregroundStyle(theme.danger)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("question.error")
                }
                VStack(spacing: theme.space("sm")) {
                    Button(isLast ? model.t("q.finish") : model.t("q.next")) { submit(step) }
                        .buttonStyle(.primaryAction)
                        .accessibilityIdentifier("q.next")
                    Button(model.t("q.skip")) {
                        model.skip(step.id)
                        model.advance(from: step.id, returnTo: returnTo)
                    }
                    .buttonStyle(.secondaryAction)
                    .accessibilityIdentifier("q.skip")
                }
                .padding(.top, theme.space("xs"))
            }
        }
        .onAppear(perform: loadDraft)
    }

    private var progress: some View {
        VStack(alignment: .leading, spacing: theme.space("xs")) {
            Text(model.t("q.progress", ["n": String(index + 1), "total": String(total)]))
                .tokenFont(.small)
                .foregroundStyle(theme.textMuted)
            HStack(spacing: 4) {
                ForEach(0..<total, id: \.self) { i in
                    Capsule().fill(i <= index ? theme.primary : theme.border).frame(height: 6)
                }
            }
            .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("question.progress")
    }

    @ViewBuilder
    private func input(for step: Step) -> some View {
        switch step.kind {
        case .integer(let min, let max):
            IntegerStepper(value: $number, min: min, max: max, label: model.t("question.\(step.id).label"),
                           decrease: model.t("q.decrease"), increase: model.t("q.increase")) { error = nil }
        case .single(let values):
            choices(values.map { ($0, model.t("option.\(step.id).\($0)")) })
        case .boolean:
            choices([("true", model.t("option.\(step.id).true")), ("false", model.t("option.\(step.id).false"))])
        case .multiple(let values):
            VStack(spacing: theme.space("xs")) {
                ForEach(values, id: \.self) { value in
                    let selected = picked.contains(value)
                    ChoiceRow(label: model.t("option.\(step.id).\(value)"), selected: selected, multiple: true) {
                        picked = selected ? picked.filter { $0 != value } : picked + [value]
                        error = nil
                    }
                    .accessibilityIdentifier("choice.\(value)")
                }
            }
        case .income(let bands):
            choices(bands.map { ($0.id, model.bundle.copy.bandLabel($0, model.locale)) } + [("exact", model.t("income.exact.option"))])
            if choice == "exact" {
                VStack(alignment: .leading, spacing: theme.space("xs")) {
                    Text(model.t("income.exact.label")).tokenFont(.bodyStrong).foregroundStyle(theme.text)
                    TextField(model.t("income.exact.label"), text: $exactText)
                        .keyboardType(.numberPad)
                        .textContentType(nil)
                        .autocorrectionDisabled()
                        .focused($exactFocused)
                        .tokenFont(.body)
                        .padding(.horizontal, theme.space("sm"))
                        .frame(minHeight: theme.minTapTarget)
                        .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                        .overlay(RoundedRectangle(cornerRadius: theme.radius("control")).strokeBorder(theme.borderStrong, lineWidth: 2))
                        .accessibilityLabel(model.t("income.exact.label"))
                        .accessibilityHint(model.t("q.private"))
                        .accessibilityIdentifier("income.exact")
                        .onChange(of: exactText) { error = nil }
                        .toolbar {
                            // The number pad has no return key.
                            ToolbarItemGroup(placement: .keyboard) {
                                Spacer()
                                Button(isLast ? model.t("q.finish") : model.t("q.next")) { submit(step) }
                                    .accessibilityIdentifier("keyboard.next")
                            }
                        }
                    if let amount = Rehydrator.parseTypedAmount(exactText) {
                        // The amount as understood, shown before the user continues.
                        Text(model.t("q.amountUnderstood", ["amount": CopyBook.formatAmount(amount, model.locale)]))
                            .tokenFont(.bodyStrong)
                            .foregroundStyle(theme.text)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("income.understood")
                    }
                    PrivateNote(text: model.t("q.private")).accessibilityIdentifier("income.private")
                }
            }
        }
    }

    private func choices(_ options: [(value: String, label: String)]) -> some View {
        VStack(spacing: theme.space("xs")) {
            ForEach(options, id: \.value) { option in
                ChoiceRow(label: option.label, selected: choice == option.value, multiple: false) {
                    choice = option.value
                    error = nil
                    if option.value == "exact" { exactFocused = true }
                }
                .accessibilityIdentifier("choice.\(option.value)")
            }
        }
    }

    // MARK: Draft

    private func loadDraft() {
        guard !loaded, let step else { return }
        loaded = true
        guard case .value(let value)? = model.session.displayAnswer(for: step.id) else { return }
        switch value {
        case .integer(let n): number = n
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
        if case .integer(let min, let max) = step.kind { params = ["min": String(min), "max": String(max)] }
        let message = model.t(problem.rawValue, params)
        error = message
        AccessibilityNotification.Announcement(message).post()
    }
}

/// − value + with the pack's min and max. Unanswered shows a dash; the first tap sets the minimum.
private struct IntegerStepper: View {
    @Environment(\.theme) private var theme
    @Binding var value: Int?
    let min: Int
    let max: Int
    let label: String
    let decrease: String
    let increase: String
    let onChange: () -> Void
    @ScaledMetric(relativeTo: .largeTitle) private var valueSize: CGFloat = 40

    var body: some View {
        HStack(spacing: theme.space("md")) {
            stepButton("minus", decrease, id: "stepper.decrease", enabled: value.map { $0 > min } ?? true) {
                value = value.map { Swift.max(min, $0 - 1) } ?? min
            }
            Text(value.map(String.init) ?? "–")
                .font(.system(size: valueSize, weight: .bold).monospacedDigit())
                .foregroundStyle(theme.text)
                .frame(minWidth: valueSize * 1.6)
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
        .frame(maxWidth: .infinity)
        .padding(.vertical, theme.space("sm"))
        .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("panel")))
    }

    private func stepButton(_ symbol: String, _ a11y: String, id: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            onChange()
        } label: {
            Image(systemName: symbol)
                .font(.title2.weight(.bold))
                .frame(width: theme.minTapTarget + 8, height: theme.minTapTarget + 8)
                .foregroundStyle(theme.onPrimary)
                .background(theme.primary, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
        .accessibilityLabel(a11y)
        .accessibilityIdentifier(id)
    }
}
