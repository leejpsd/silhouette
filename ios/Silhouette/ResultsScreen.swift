// Results: programs grouped by verdict, each opening its verdict card.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct ResultsScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        let results = model.results
        ScreenScroll {
            ScreenHeading(text: model.t("results.title")).accessibilityIdentifier("results.title")
            Text(model.t("results.lead")).tokenFont(.body).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
            ForEach(QuickCheck.groups(results), id: \.verdict) { group in
                VStack(alignment: .leading, spacing: theme.space("sm")) {
                    HStack(spacing: theme.space("sm")) {
                        SilhouetteMark(style: .verdict(group.verdict), size: 36)
                        Text(model.t("verdict.\(group.verdict.rawValue)"))
                            .tokenFont(.heading)
                            .foregroundStyle(theme.text)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)
                    ForEach(group.programs, id: \.programId) { result in
                        ProgramCard(result: result)
                    }
                }
                .padding(.top, theme.space("sm"))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("group.\(group.verdict.rawValue)")
            }
            if results.contains(where: { $0.verdict == .maybe }) {
                Text(model.t("results.maybeHint")).tokenFont(.small).foregroundStyle(theme.textMuted).fixedSize(horizontal: false, vertical: true)
            }
            Button(model.t("results.edit")) { model.editAnswers() }
                .buttonStyle(.secondaryAction)
                .accessibilityIdentifier("results.edit")
            AppFooter()
        }
    }
}

private struct ProgramCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let result: ProgramVerdict

    var body: some View {
        Button {
            model.openProgram(result.programId)
        } label: {
            HStack(alignment: .center, spacing: theme.space("sm")) {
                Rectangle()
                    .fill(theme.verdict(result.verdict.rawValue))
                    .frame(width: 4)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: theme.space("xxs")) {
                    Text(model.programName(result.programId)).tokenFont(.bodyStrong).foregroundStyle(theme.text)
                    if !result.dependsOn.isEmpty {
                        Text(model.t("results.dependsOn", ["list": result.dependsOn.map(model.variableName).joined(separator: ", ")]))
                            .tokenFont(.small).foregroundStyle(theme.textMuted)
                    }
                    if let amount = result.estimatedAmount, amount > 0 {
                        Text(model.t("results.estimate", ["amount": model.number(amount)])).tokenFont(.small).foregroundStyle(theme.text)
                    }
                    Text(model.t("results.open")).tokenFont(.small).foregroundStyle(theme.primary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").foregroundStyle(theme.textMuted).accessibilityHidden(true)
            }
            .padding(theme.space("md"))
            .frame(minHeight: theme.minTapTarget)
            .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
            .overlay(RoundedRectangle(cornerRadius: theme.radius("control")).strokeBorder(theme.border, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: theme.radius("control")))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityValue(model.t("verdict.\(result.verdict.rawValue)"))
        .accessibilityIdentifier("program.\(result.programId)")
    }
}
