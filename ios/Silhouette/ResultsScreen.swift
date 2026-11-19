// Results: the hero says how many programs the person may qualify for (from the rules,
// "may qualify" wording) with "Checked on this iPhone" and "No AI used"; a card for each may-qualify
// program (icon tile, summary, the limit bar where the income is exact); "Worth checking" tiles for
// possible and depends-on-an-answer; probably-not rows below, dimmed. Markers by fill level.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct ResultsScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.pinsActions) private var pinsActions

    /// At least one question has an answer (skipped questions do not count).
    private var answered: Bool {
        model.session.steps.contains { step in
            if case .value? = model.session.displayAnswer(for: step.id) { true } else { false }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if answered { resultsView } else { beforeAnyAnswer }
            }
            .padding(.bottom, 24)
        }
        // The way to the paystub is on the first screen: pinned above the bars (in the content on a
        // small iPhone or at large text).
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if answered && pinsActions {
                paystubAction
                    .gutter()
                    .padding(.vertical, 8)
                    .background(theme.ground)
            }
        }
        .heroScreen(theme)
    }

    /// On the judges' path the next step: the sample paystub read by a model, or, once its income is in
    /// the results, what left this iPhone. Otherwise add a paystub.
    @ViewBuilder private var paystubAction: some View {
        if model.onJudgesPath {
            if model.currentDocumentEffect != nil {
                PrimaryButton(label: model.t("judges.step3.button"), id: "results.openRecord", showsArrow: true) { model.sheet = .record }
            } else {
                PrimaryButton(label: model.t("judges.step1.button"), id: "results.openSample", showsArrow: true) { model.openSamplePreview() }
            }
        } else {
            PrimaryButton(label: model.t("results.addDocument"), id: "results.addDocument", showsArrow: true) { model.openDocument() }
        }
    }

    private var topRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Spacer(minLength: 0)
                GlassRound(systemImage: "info.circle", label: model.rulesTitle, id: "results.info") { model.sheet = .demo }
                LanguageButton()
            }
        }
    }

    // MARK: Before any answer

    @ViewBuilder private var beforeAnyAnswer: some View {
        Hero(title: model.t("results.title"), size: 54, lead: model.t("results.empty"), titleId: "results.title") { topRow }
        VStack(alignment: .leading, spacing: 16) {
            DraftLine()
            ListCard {
                ForEach(Array(model.bundle.packInfo.programs.enumerated()), id: \.element.id) { i, program in
                    if i > 0 { RowDivider(inset: 52) }
                    ListRow(title: model.programName(program.id), subtitle: model.t("results.notAnswered"), chevron: false, dimmed: true) {
                        VerdictMarker(verdict: .unlikely)
                    }
                }
            }
            .accessibilityElement(children: .combine)
            PrimaryButton(label: model.t("start.begin"), id: "results.begin") { model.editAnswers() }
        }
        .gutter()
    }

    // MARK: Results

    @ViewBuilder private var resultsView: some View {
        let results = model.results
        // Within a verdict, programs with an estimated amount first, the largest first (contract v1.40); then
        // those with only an "up to" amount, the largest first (a ceiling is never ranked with estimates).
        let byAmount = { (list: [ProgramVerdict]) in
            list.enumerated().sorted { a, b in
                let x = a.element.estimatedAmount ?? 0, y = b.element.estimatedAmount ?? 0
                if x != y { return x > y }
                let u = a.element.upToAmount ?? 0, v = b.element.upToAmount ?? 0
                return u != v ? u > v : a.offset < b.offset
            }.map(\.element)
        }
        let likely = byAmount(results.filter { $0.verdict == .likely })
        let worth = byAmount(results.filter { $0.verdict == .maybe || $0.verdict == .depends })
        let unlikely = byAmount(results.filter { $0.verdict == .unlikely })
        let effect = model.currentDocumentEffect
        let nothingFits = !results.isEmpty && results.allSatisfy { $0.verdict == .unlikely }
        Hero(eyebrow: likely.isEmpty ? nil : model.t("results.title"),
             title: likely.isEmpty ? model.t("results.title") : model.t("results.mayQualifyCount", ["count": model.number(Double(likely.count))]),
             size: 54, titleId: "results.title") {
            topRow
        } content: {
            FlowLayout(spacing: 8, lineSpacing: 8) {
                HeroPill(label: model.t("badge.checkedHere"), systemImage: "iphone")
                HeroPill(label: model.t(effect != nil ? "badge.rulesAndPaystub" : "badge.rulesOnly"))
                    .accessibilityIdentifier("results.badge")
            }
            .padding(.top, 16)
        }
        VStack(alignment: .leading, spacing: 12) {
            DraftLine()
            if model.isSampleHousehold { SampleHouseholdCard() }
            if let effect { DocumentEffectCard(effect: effect) }
            NoteText(text: model.t(model.anythingLeft ? "results.leadAfterSend" : "results.lead"))
            if model.onJudgesPath { JudgeNext(step: effect != nil ? 3 : 1) }
            if !pinsActions { paystubAction }
            if model.isOffline {
                NoticeCard(text: model.t("state.offline"), systemImage: "wifi.slash").accessibilityIdentifier("results.offline")
            }
            if nothingFits {
                NoticeCard(text: model.t("results.none")) {
                    NoteText(text: model.t("results.noneHelp"))
                }
                .accessibilityIdentifier("results.none")
            }
            ForEach(Array(likely.enumerated()), id: \.element.programId) { i, r in
                ProgramCard(result: r).zoomSource("program.\(r.programId)").arrivesOnce("card.\(r.programId)", index: i)
            }
                .accessibilityElement(children: .contain)
            if !worth.isEmpty {
                SectionLabel(text: model.t("results.worthChecking")).padding(.top, 8)
                WorthGrid(results: worth)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("group.maybe")
            }
            if !unlikely.isEmpty {
                SectionLabel(text: model.t("verdict.unlikely")).padding(.top, 8)
                ListCard {
                    ForEach(Array(unlikely.enumerated()), id: \.element.programId) { i, result in
                        if i > 0 { RowDivider(inset: 52) }
                        UnlikelyRow(result: result).zoomSource("program.\(result.programId)")
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("group.unlikely")
            }
            LinkText(label: model.t("results.edit"), id: "results.edit") { model.editAnswers() }
        }
        .gutter()
    }
}

/// The program's icon: a symbol chosen from the kind of help (food, energy, phone, tax credit).
func programSymbol(_ id: String) -> String {
    let s = id.lowercased()
    if s.contains("fresh") || s.contains("food") || s.contains("snap") || s.contains("wic") { return "cart" }
    if s.contains("care") || s.contains("fera") || s.contains("energy") || s.contains("liheap") || s.contains("utility") { return "bolt" }
    if s.contains("lifeline") || s.contains("phone") { return "phone" }
    if s.contains("eitc") || s.contains("ctc") || s.contains("tax") || s.contains("credit") { return "dollarsign" }
    if s.contains("rent") || s.contains("housing") { return "house" }
    return "checkmark.seal"
}

/// Notes under a program's name: what it depends on, and the estimated amount.
extension AppModel {
    func resultNotes(_ result: ProgramVerdict) -> [String] {
        var out: [String] = []
        if !result.dependsOn.isEmpty {
            out.append(t("results.dependsOn", ["list": result.dependsOn.map(variableName).joined(separator: ", ")]))
        }
        if let amount = result.estimatedAmount, amount > 0 {
            out.append(t("results.estimate", ["amount": money(amount)]))
        } else if let ceiling = result.upToAmount, ceiling > 0 {
            // A ceiling, never an estimate: its note is on the program's page, one press away.
            out.append(t("results.upTo", ["amount": money(ceiling)]))
        }
        // A result the paystub changed says what it was (results.docEffect.was).
        if let change = currentDocumentEffect?.change(result.programId), change.after == result.verdict {
            out.append(t("results.docEffect.was", ["before": t("verdict.short.\(change.before.rawValue)")]))
        }
        return out
    }

    /// The income comparison of a program when the person's income is exact: limit and value as numbers.
    func incomeComparison(_ programId: String) -> (yours: String, limit: String, ratio: Double)? {
        for row in whyRows(programId) {
            guard let i = row.limitVariables.firstIndex(of: "annualIncome") else { continue }
            let l = row.limits[i]
            guard let yours = Self.amount(l.yours), let limit = Self.amount(l.limit), limit > 0 else { return nil }
            return (l.yours, l.limit, min(1, yours / limit))
        }
        return nil
    }

    /// An exact amount written in the pack's format ("$30,524"); nil for a range.
    static func amount(_ text: String) -> Double? {
        guard text.range(of: "[–-]\\s*\\$", options: .regularExpression) == nil else { return nil }
        let digits = text.filter { $0.isNumber || $0 == "." }
        return Double(digits)
    }
}

/// A may-qualify program: icon tile, name, summary, the verdict pill, the limit bar.
private struct ProgramCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    /// Two lines of the 15 pt summary at the current text size.
    @ScaledMetric(relativeTo: .subheadline) private var twoLines: CGFloat = 44
    @State private var summaryFits = true
    let result: ProgramVerdict

    var body: some View {
        let notes = model.resultNotes(result)
        // The summary's first sentence, whole (up to two lines): never a sentence cut with an ellipsis.
        let summary = model.bundle.copy.lookup("program.\(result.programId).summary", model.locale).map(Self.firstSentence)
        Button { model.openProgram(result.programId) } label: {
            VStack(alignment: .leading, spacing: 12) {
                let layout = dynamicType.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
                layout {
                    IconTile(systemImage: programSymbol(result.programId), ink: true, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        // The pill at the right of the name where the name allows, under it otherwise.
                        ViewThatFits(in: .horizontal) {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text(model.programName(result.programId)).sfFont(20, weight: .semibold).foregroundStyle(theme.ink)
                                    .lineLimit(1).fixedSize()
                                Spacer(minLength: 0)
                                pill
                            }
                            VStack(alignment: .leading, spacing: 4) {
                                Text(model.programName(result.programId)).sfFont(20, weight: .semibold).foregroundStyle(theme.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                                pill
                            }
                        }
                        if let summary {
                            // The summary's first sentence, whole, in at most two lines; a longer one is
                            // left to the program's page rather than cut with an ellipsis (any size up to
                            // the accessibility sizes, where it is shown whole).
                            let text = Text(summary).sfFont(15).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
                            if dynamicType.isAccessibilitySize || summaryFits {
                                text
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // Measures the summary at the column's width (drawn nowhere) to decide whether it
                    // fits two lines whole.
                    .background(alignment: .topLeading) {
                        if let summary {
                            Text(summary).sfFont(15).fixedSize(horizontal: false, vertical: true)
                                .hidden()
                                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { summaryFits = $0 <= twoLines }
                                .accessibilityHidden(true)
                        }
                    }
                }
                if let c = model.incomeComparison(result.programId) {
                    LimitBar(ratio: c.ratio)
                    Text(model.t("results.incomeBar", ["yours": c.yours, "limit": c.limit])).sfFont(13).foregroundStyle(theme.note)
                }
                ForEach(notes, id: \.self) { Text($0).sfFont(13).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true) }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 24).fill(theme.sheet))
            .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(theme.cardBorder, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 24))
        }
        .buttonStyle(PressScale())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(([model.programName(result.programId)] + notes).joined(separator: ", "))
        .accessibilityValue(model.t("verdict.\(result.verdict.rawValue)"))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("program.\(result.programId)")
    }

    /// "A federal tax credit for people who work and have low to moderate income. It lowers…" → the
    /// first sentence.
    static func firstSentence(_ text: String) -> String {
        guard let end = text.range(of: ". ") else { return text }
        return String(text[..<end.lowerBound]) + "."
    }
}

extension ProgramCard {
    var pill: some View { StatusPill(label: model.t("verdict.short.likely"), style: .plain, dot: true) }
}

/// The share of a limit used: an ink bar on the track, 8 pt.
struct LimitBar: View {
    @Environment(\.theme) private var theme
    let ratio: Double

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(theme.track)
                Capsule().fill(theme.ink).frame(width: max(8, g.size.width * ratio))
            }
        }
        .frame(height: 8)
        .accessibilityHidden(true)
    }
}

/// "Worth checking" tiles two to a row (one at accessibility sizes); not lazy, so every tile exists.
private struct WorthGrid: View {
    @Environment(\.dynamicTypeSize) private var dynamicType
    let results: [ProgramVerdict]

    var body: some View {
        let perRow = dynamicType.isAccessibilitySize ? 1 : 2
        let rows = stride(from: 0, to: results.count, by: perRow).map { Array(results[$0..<min($0 + perRow, results.count)]) }
        VStack(spacing: 10) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(alignment: .top, spacing: 10) {
                    ForEach(row, id: \.programId) { WorthTile(result: $0).zoomSource("program.\($0.programId)") }
                    if row.count < perRow { Color.clear.frame(maxWidth: .infinity) }
                }
            }
        }
    }
}

/// A "Worth checking" tile: marker, name, the short verdict and what it depends on.
private struct WorthTile: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let result: ProgramVerdict

    var body: some View {
        let notes = model.resultNotes(result)
        Button { model.openProgram(result.programId) } label: {
            VStack(alignment: .leading, spacing: 8) {
                VerdictMarker(verdict: result.verdict, size: 22)
                Text(model.programName(result.programId)).sfFont(17, weight: .semibold).foregroundStyle(theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(model.t("verdict.short.\(result.verdict.rawValue)")).sfFont(13, weight: .semibold).foregroundStyle(theme.ink)
                ForEach(notes, id: \.self) { Text($0).sfFont(13).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true) }
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 140, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 24).fill(theme.sheet))
            .overlay(RoundedRectangle(cornerRadius: 24).strokeBorder(theme.cardBorder, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 24))
        }
        .buttonStyle(PressScale())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(([model.programName(result.programId)] + notes).joined(separator: ", "))
        .accessibilityValue(model.t("verdict.\(result.verdict.rawValue)"))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("program.\(result.programId)")
    }
}

/// A probably-not program: a thin ring, the row dimmed to note grey.
private struct UnlikelyRow: View {
    @Environment(AppModel.self) private var model
    let result: ProgramVerdict

    var body: some View {
        let notes = model.resultNotes(result)
        Button { model.openProgram(result.programId) } label: {
            // Not a decision: the short word says how to go on (results.stillApply).
            ListRow(title: model.programName(result.programId),
                    subtitle: ([model.t("verdict.short.unlikely"), model.t("results.stillApply")] + notes).joined(separator: " · "),
                    dimmed: true, titleWeight: .semibold) {
                VerdictMarker(verdict: .unlikely)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(([model.programName(result.programId)] + notes).joined(separator: ", "))
        .accessibilityValue(model.t("verdict.\(result.verdict.rawValue)"))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("program.\(result.programId)")
    }
}

/// "Next for judges · step 2 of 3": the step the judges' path goes on to, one press away.
struct JudgeNext: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let step: Int

    var body: some View {
        Button {
            switch step {
            case 1: model.openSamplePreview()
            case 2: model.showResults()
            default: model.sheet = .record
            }
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.t("judges.next", ["n": String(step)])).sfFont(13, weight: .semibold).foregroundStyle(theme.onHeroMuted)
                    Text(model.t("judges.step\(step).title")).sfFont(17, weight: .semibold).foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").sfFont(14, weight: .semibold).foregroundStyle(theme.onHeroMuted)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 24).fill(theme.hero))
            .contentShape(RoundedRectangle(cornerRadius: 24))
        }
        .buttonStyle(PressScale())
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("judges.next")
    }
}
