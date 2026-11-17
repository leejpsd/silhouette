// One question per screen: the giant question number, progress (solid = done, dotted = to come),
// the question as a display headline, and its input. Every question can be skipped; sensitive ones and
// the exact income say that the answer never leaves the device.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

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
    @State private var scrollTarget: String?
    @FocusState private var exactFocused: Bool

    private var step: Step? { model.session.step(stepId) }
    private var index: Int { model.session.index(of: stepId) ?? 0 }
    private var total: Int { model.session.steps.count }
    private var isLast: Bool { index == total - 1 && returnTo == nil }

    var body: some View {
        Screen(scrollTo: $scrollTarget) {
            if let step {
                header
                DisplayHeadline(text: model.t("question.\(step.id).label"), role: .title, maxLines: 4)
                    .accessibilityIdentifier("question.label")
                    .appear(.rise)
                let helpKey = "question.\(step.id).help"
                if model.bundle.copy.has(helpKey) {
                    Para(model.t(helpKey), .help)
                }
                input(for: step)
                if step.sensitive {
                    SensitiveNote(text: model.t("sensitive.note")).accessibilityIdentifier("question.sensitive")
                }
                if let error {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Image(systemName: "exclamationmark.triangle").accessibilityHidden(true)
                        Text(error).fixedSize(horizontal: false, vertical: true)
                    }
                    .type(.label, size: 13.5)
                    .foregroundStyle(theme.ink)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("question.error")
                    .id("question.error")
                }
            }
        } actions: {
            if let step { actionRow(step) }
        }
        .onAppear(perform: loadDraft)
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom, spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    BackLink(label: model.t("q.back")) { if !model.path.isEmpty { model.path.removeLast() } }
                    Text(model.t("q.progress", ["n": String(index + 1), "total": String(total)]))
                        .type(.caption)
                        .foregroundStyle(theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("question.progress")
                }
                Spacer(minLength: 8)
                QuestionNumber(n: index + 1, total: total)
            }
            HStack(spacing: 4) {
                ForEach(0..<total, id: \.self) { i in
                    Group {
                        if i <= index { Rectangle().fill(theme.ink) } else { DotFill(color: theme.ink) }
                    }
                    .frame(height: 8)
                    .clipShape(RoundedRectangle(cornerRadius: 1))
                }
            }
            .accessibilityHidden(true)
        }
    }

    // MARK: Actions

    @ViewBuilder private func actionRow(_ step: Step) -> some View {
        let next = BlockAction(label: isLast ? model.t("q.finish") : model.t("q.next"), id: "q.next") { submit(step) }
        let skip = Button(model.t("q.skip")) {
            model.skip(step.id)
            model.advance(from: step.id, returnTo: returnTo)
        }
        .buttonStyle(TextLinkStyle())
        .accessibilityIdentifier("q.skip")
        if dynamicType.isAccessibilitySize {
            // The row stacks: the action above, the skip link below.
            next
            skip.frame(maxWidth: .infinity)
        } else {
            HStack(spacing: 14) {
                skip.padding(.leading, 6).frame(maxWidth: 130, alignment: .leading).fixedSize(horizontal: false, vertical: true)
                next
            }
        }
    }

    // MARK: Inputs

    @ViewBuilder
    private func input(for step: Step) -> some View {
        switch step.kind {
        case .integer where AnswerInputs.isMoneyVariable(step.id):
            moneyField(step)
        case .integer(let min, let max):
            VStack(spacing: 4) {
                Counter(value: $number, min: min, max: max, label: model.t("question.\(step.id).label"),
                        decrease: model.t("q.decrease"), increase: model.t("q.increase"), error: error != nil) { error = nil }
                // The range, under the value.
                Text(model.t("q.error.integer", ["min": String(min), "max": String(max)]))
                    .type(.caption)
                    .foregroundStyle(theme.ink)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityHidden(true)
            }
        case .single(let values) where values.count == 2:
            tiles(values.map { ($0, model.t("option.\(step.id).\($0)")) })
        case .single(let values):
            rows(values.map { ($0, model.t("option.\(step.id).\($0)")) })
        case .boolean:
            tiles([("true", model.t("option.\(step.id).true")), ("false", model.t("option.\(step.id).false"))])
        case .multiple(let values):
            VStack(spacing: 10) {
                ForEach(values, id: \.self) { value in
                    let selected = picked.contains(value)
                    OptionRow(label: model.t("option.\(step.id).\(value)"), selected: selected, multiple: true, dashed: value == "none",
                              id: "choice.\(value)") {
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

    private func tiles(_ options: [(value: String, label: String)]) -> some View {
        HStack(spacing: 10) {
            ForEach(options, id: \.value) { option in
                OptionTile(word: option.label, selected: choice == option.value, error: error != nil) {
                    choice = option.value
                    error = nil
                }
                .accessibilityIdentifier("choice.\(option.value)")
            }
        }
    }

    private func rows(_ options: [(value: String, label: String)]) -> some View {
        VStack(spacing: 10) {
            ForEach(options, id: \.value) { option in
                OptionRow(label: option.label, selected: choice == option.value, error: error != nil, id: "choice.\(option.value)") {
                    choice = option.value
                    error = nil
                }
            }
        }
    }

    private func income(_ bands: [Bands.IncomeBand]) -> some View {
        let columns = dynamicType.isAccessibilitySize ? [GridItem(.flexible())] : [GridItem(.flexible(), spacing: 10), GridItem(.flexible())]
        return VStack(spacing: 10) {
            LazyVGrid(columns: columns, alignment: .leading, spacing: 10) {
                ForEach(bands, id: \.id) { band in
                    IncomeCell(label: model.bundle.copy.bandLabel(band, model.locale, currency: model.bundle.packInfo.currency,
                                                                   format: model.bundle.packInfo.numberFormat),
                               selected: choice == band.id, error: error != nil && choice == nil) {
                        choice = band.id
                        error = nil
                        exactFocused = false
                    }
                    .accessibilityIdentifier("choice.\(band.id)")
                }
            }
            OptionRow(label: model.t("income.exact.option"), selected: choice == "exact", error: error != nil && choice == nil, id: "choice.exact") {
                choice = "exact"
                error = nil
                exactFocused = true
            } extra: {
                if choice == "exact" { exactField }
            }
        }
    }

    /// An amount of money asked as a number (investment income): typed as money, kept in whole dollars.
    private func moneyField(_ step: Step) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("", text: $exactText)
                .keyboardType(.decimalPad)
                .textContentType(nil)
                .autocorrectionDisabled()
                .focused($exactFocused)
                .fieldStyle(error: error != nil)
                .accessibilityLabel(model.t("question.\(step.id).label"))
                .accessibilityIdentifier("amount.field")
                .onChange(of: exactText) { error = nil }
            if let amount = Rehydrator.parseTypedAmount(exactText) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Circle().fill(theme.ink).frame(width: 12, height: 12).accessibilityHidden(true)
                    Text(model.t("review.understood", ["amount": model.money(amount.rounded())])).fixedSize(horizontal: false, vertical: true)
                }
                .type(.label, size: 13.5)
                .foregroundStyle(theme.ink)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("amount.understood")
            }
        }
        .id("amount.field")
    }

    @ViewBuilder private var exactField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(model.t("income.exact.label")).type(.label).foregroundStyle(theme.onBlock)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                HStack(spacing: 4) {
                    Image(systemName: "lock").font(.system(size: 11, weight: .semibold)).accessibilityHidden(true)
                    Text(model.t("q.private")).type(.caption)
                }
                .foregroundStyle(theme.onBlock)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("income.private")
            }
            TextField("", text: $exactText)
                .keyboardType(.decimalPad)
                .textContentType(nil)
                .autocorrectionDisabled()
                .focused($exactFocused)
                .fieldStyle(error: error != nil)
                .accessibilityLabel(model.t("income.exact.label"))
                .accessibilityHint(model.t("q.private"))
                .accessibilityIdentifier("income.exact")
                .onChange(of: exactText) { error = nil }
            if let amount = Rehydrator.parseTypedAmount(exactText) {
                // The amount as understood, shown before the user continues.
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Circle().fill(theme.onBlock).frame(width: 12, height: 12).accessibilityHidden(true)
                    Text(model.t("q.amountUnderstood", ["amount": model.money(amount, cents: true)]))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .type(.label, size: 13.5)
                .foregroundStyle(theme.onBlock)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("income.understood")
            }
        }
        .padding(.bottom, 6)
        .id("income.exactField")
        .onChange(of: exactFocused) { _, focused in
            // Keep the field and the amount as understood above the block and the keyboard.
            if focused { Task { try? await Task.sleep(for: .milliseconds(350)); scrollTarget = "income.exactField" } }
        }
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
        scrollTarget = "question.error"
        AccessibilityNotification.Announcement(message).post()
    }
}

/// "1 /8": the giant question number (150, 80 under 700 pt) with the total at 38 and 60 % opacity.
private struct QuestionNumber: View {
    @Environment(\.theme) private var theme
    @Environment(\.compactHeight) private var compact
    @Environment(AppModel.self) private var model
    let n: Int
    let total: Int

    var body: some View {
        let size: CGFloat = compact ? CGFloat(theme.tokens.number("size.compact.questionNumber") ?? 80) : theme.spec(.giantNumber).size
        HStack(alignment: .bottom, spacing: 4) {
            TightText(text: model.number(Double(n)), role: .giantNumber, size: size)
            TightText(text: "/\(model.number(Double(total)))", role: .progressTotal, color: theme.ink.opacity(0.6))
        }
        .foregroundStyle(theme.ink)
        .accessibilityHidden(true)
    }
}

/// Display figures in a box from the baseline to the cap height (tight, like the design's 0.6 to
/// 0.7 leading); the bottom of the box is the baseline.
struct TightText: View {
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Environment(\.locale) private var locale
    let text: String
    let role: TypeRole
    var size: CGFloat? = nil
    var color: Color? = nil

    var body: some View {
        let spec = theme.spec(role)
        let points = (size ?? spec.size) * theme.scale(.display, dynamicType)
        let font = DesignFonts.uiFont(.display, weight: spec.weight, size: points, korean: locale.isKorean)
        Text(verbatim: text)
            .type(role, size: size)
            .foregroundStyle(color ?? theme.ink)
            .fixedSize()
            .alignmentGuide(.bottom) { $0[.lastTextBaseline] }
            .frame(height: font.capHeight, alignment: .bottom)
    }
}

/// − value + : the value in Darker Grotesque 180 between two 72 pt outline circles. At the minimum
/// or maximum a button turns dashed and is disabled. Unanswered shows a dash.
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
                    TightText(text: model.number(Double(value)), role: .giantNumber, size: theme.size("counter"))
                        .minimumScaleFactor(0.5)
                } else {
                    RoundedRectangle(cornerRadius: 2).fill(theme.ink).frame(width: 52, height: 16).frame(height: 120)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 130)
            .padding(.vertical, 8)
            .overlay {
                if error {
                    RoundedRectangle(cornerRadius: theme.radius("tile"))
                        .strokeBorder(theme.ink, style: StrokeStyle(lineWidth: theme.border, dash: [5, 4]))
                }
            }
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
        .frame(maxWidth: .infinity)
    }

    private func stepButton(_ symbol: String, _ a11y: String, id: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        let d = theme.size("counterButton")
        return Button {
            action()
            onChange()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(theme.ink)
                .frame(width: d, height: d)
                .overlay(Circle().strokeBorder(theme.ink, style: StrokeStyle(lineWidth: theme.border, dash: enabled ? [] : [5, 4])))
                .contentShape(Circle())
        }
        .buttonStyle(PressStyle())
        .disabled(!enabled)
        .accessibilityLabel(a11y)
        .accessibilityIdentifier(id)
    }
}

/// "This answer never leaves your device. You can skip it." with a lock; the first sentence bold.
struct SensitiveNote: View {
    @Environment(\.theme) private var theme
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "lock").font(.system(size: 14, weight: .semibold)).accessibilityHidden(true)
            Text(Self.firstSentenceBold(text)).type(.small).fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(theme.ink)
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
