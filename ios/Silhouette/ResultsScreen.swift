// Results: programs grouped by verdict, each marked by shape and opening its page. The "possible"
// group sits in the inverted card with the limit that keeps it open and what would make it clearer.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct ResultsScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    /// At least one question has an answer (skipped questions do not count).
    private var answered: Bool {
        model.session.steps.contains { step in
            if case .value? = model.session.displayAnswer(for: step.id) { true } else { false }
        }
    }

    var body: some View {
        if answered { resultsView } else { beforeAnyAnswer }
    }

    // MARK: Before any answer

    private var beforeAnyAnswer: some View {
        Screen(mode: .standard) {
            title
            MarkerLine(kind: .unanswered, text: model.t("results.notAnswered"))
            Text(model.t("results.empty"))
                .type(.heading)
                .foregroundStyle(theme.ink)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(model.bundle.packInfo.programs, id: \.id) { program in
                    HStack(spacing: 10) {
                        Marker(kind: .unanswered)
                        DisplayLabel(text: model.programName(program.id), role: .listItem, size: 28, color: theme.ink, singleLineFirst: false)
                    }
                    .frame(minHeight: theme.size("rowHeights"))
                    .opacity(0.6)
                }
            }
            .accessibilityElement(children: .combine)
        } actions: {
            BlockAction(label: model.t("start.begin"), id: "results.begin") { model.editAnswers() }
        }
    }

    private var title: some View {
        DisplayHeadline(text: model.t("results.title"), role: .title, size: 62, maxLines: 2)
            .accessibilityIdentifier("results.title")
            .appear(.rise)
    }

    // MARK: Results

    private var resultsView: some View {
        let results = model.results
        let groups = QuickCheck.groups(results)
        let nothingFits = !results.isEmpty && results.allSatisfy { $0.verdict == .unlikely }
        return Screen {
            VStack(alignment: .leading, spacing: 6) {
                title
                Para(model.t(model.anythingLeft ? "results.leadAfterSend" : "results.lead"), .small)
            }
            if model.isOffline {
                DashedNote { Text(model.t("state.offline")) }
                    .accessibilityIdentifier("results.offline")
            }
            if nothingFits {
                InvertedCard {
                    DisplayHeadline(text: model.t("results.none"), role: .heading, size: 36, maxLines: 5, color: theme.onBlock)
                    Para(model.t("results.noneHelp"), .small)
                    HStack(spacing: 14) {
                        editAnswers
                        addPaystub(inCard: true)
                    }
                }
                .accessibilityIdentifier("results.none")
            }
            ForEach(groups, id: \.verdict) { group in
                if group.verdict == .maybe && !nothingFits {
                    InvertedCard {
                        MarkerLine(kind: .verdict(.maybe), text: model.t("verdict.maybe")).accessibilityAddTraits(.isHeader)
                        VStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(group.programs.enumerated()), id: \.element.programId) { i, result in
                                if i > 0 { Rectangle().fill(theme.blockLine).frame(height: 1) }
                                if i == 0 { FeaturedProgram(result: result) } else { ProgramRow(result: result) }
                            }
                        }
                        HStack(alignment: .center, spacing: 12) {
                            Para(model.t("results.maybeHint"), .small)
                            addPaystub(inCard: true)
                        }
                        .padding(.top, 4)
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("group.maybe")
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        MarkerLine(kind: .verdict(group.verdict), text: model.t("verdict.\(group.verdict.rawValue)"))
                            .accessibilityAddTraits(.isHeader)
                            .padding(.bottom, 4)
                        ForEach(group.programs, id: \.programId) { ProgramRow(result: $0) }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("group.\(group.verdict.rawValue)")
                }
            }
            if !nothingFits && !groups.contains(where: { $0.verdict == .maybe }) {
                addPaystub(inCard: false)
            }
            editAnswers
        }
    }

    /// "Add a paystub": the secondary action inside the inverted card, an outline on the ground.
    @ViewBuilder private func addPaystub(inCard: Bool) -> some View {
        if inCard {
            Button(model.t("results.addDocument")) { model.openDocument() }
                .buttonStyle(SecondaryStyle())
                .accessibilityIdentifier("results.addDocument")
        } else {
            Button(model.t("results.addDocument")) { model.openDocument() }
                .buttonStyle(OutlineStyle())
                .accessibilityIdentifier("results.addDocument")
        }
    }

    private var editAnswers: some View {
        Button(model.t("results.edit")) { model.editAnswers() }
            .buttonStyle(TextLinkStyle())
            .accessibilityIdentifier("results.edit")
    }
}

/// The inverted card (block colours, radius 28) on Results.
struct InvertedCard<Content: View>: View {
    @Environment(\.theme) private var theme
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .foregroundStyle(theme.onBlock)
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: theme.radius("panel")).fill(theme.block))
            .environment(\.surface, .block)
            .appear(.pop)
    }
}

/// A program: its name in Darker Grotesque 32 (two lines at most) and a chevron.
private struct ProgramRow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let result: ProgramVerdict

    var body: some View {
        Button { model.openProgram(result.programId) } label: {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    DisplayLabel(text: model.programName(result.programId), role: .listItem, color: theme.ink(on: surface), singleLineFirst: false)
                    ForEach(notes, id: \.self) { note in
                        Text(note).type(.label, size: 13).foregroundStyle(theme.muted(on: surface))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(theme.ink(on: surface))
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 6)
            .frame(minHeight: theme.size("rowHeights"))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(([model.programName(result.programId)] + notes).joined(separator: ", "))
        .accessibilityValue(model.t("verdict.\(result.verdict.rawValue)"))
        .accessibilityIdentifier("program.\(result.programId)")
    }

    private var notes: [String] {
        var out: [String] = []
        if !result.dependsOn.isEmpty {
            out.append(model.t("results.dependsOn", ["list": result.dependsOn.map(model.variableName).joined(separator: ", ")]))
        }
        if let amount = result.estimatedAmount, amount > 0 {
            out.append(model.t("results.estimate", ["amount": model.money(amount)]))
        }
        return out
    }
}

/// The first "possible" program, with the limit and the person's answer that keep it open.
private struct FeaturedProgram: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let result: ProgramVerdict

    var body: some View {
        let rows = model.whyRows(result.programId)
        let income = rows.lazy.compactMap { row in
            row.limitVariables.firstIndex(of: "annualIncome").map { row.limits[$0] }
        }.first
        let mixed = rows.contains { $0.state == .mixed }
        VStack(alignment: .leading, spacing: 6) {
            Button { model.openProgram(result.programId) } label: {
                HStack {
                    DisplayLabel(text: model.programName(result.programId), role: .listItem, color: theme.onBlock, singleLineFirst: false)
                    Image(systemName: "chevron.right").font(.system(size: 16, weight: .semibold)).accessibilityHidden(true)
                }
                .foregroundStyle(theme.onBlock)
                .frame(minHeight: theme.minTapTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityElement(children: .combine)
            .accessibilityLabel(model.programName(result.programId))
            .accessibilityValue(model.t("verdict.\(result.verdict.rawValue)"))
            .accessibilityIdentifier("program.\(result.programId)")
            if let income {
                LimitLine(label: model.t("detail.limitFamily"), value: income.limit)
                LimitLine(label: model.t("detail.yourAnswer"), value: income.yours)
            }
            if mixed {
                HStack(spacing: 8) {
                    StateIcon(state: .mixed)
                    Text(model.t("state.mixed")).type(.label)
                }
                .foregroundStyle(theme.onBlock)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.bottom, 8)
    }
}

/// "Limit  $40,000": label in text, value in DM Mono, on one line when it fits.
struct LimitLine: View {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let label: String
    let value: String
    var state: CriterionState? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label).type(.small).foregroundStyle(theme.ink(on: surface)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Text(value).type(.monoValue, size: 13.5).foregroundStyle(theme.ink(on: surface)).multilineTextAlignment(.trailing)
            if let state { StateIcon(state: state) }
        }
        .accessibilityElement(children: .combine)
    }
}
