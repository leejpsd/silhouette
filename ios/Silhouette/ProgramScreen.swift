// Verdict card: criteria with their state, what the result depends on (each opens the question and
// comes back), the estimated amount, period, caveats and the pack's verification status.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct ProgramScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String

    var body: some View {
        ScreenScroll {
            if let program = model.bundle.packInfo.program(programId), let result = model.result(programId) {
                ScreenHeading(text: model.programName(programId))
                HStack(spacing: theme.space("sm")) {
                    SilhouetteMark(style: .verdict(result.verdict), size: 48)
                    Text(model.t("verdict.\(result.verdict.rawValue)"))
                        .tokenFont(.heading)
                        .foregroundStyle(theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("detail.verdict")
                .accessibilityValue(result.verdict.rawValue)

                if let amount = result.estimatedAmount, amount > 0 {
                    Text(model.t("detail.amount", ["amount": model.number(amount)])).tokenFont(.bodyStrong).foregroundStyle(theme.text)
                }
                if let period = program.period {
                    Text(model.t("detail.period", ["period": period])).tokenFont(.small).foregroundStyle(theme.textMuted)
                }
                if !program.caveats.isEmpty {
                    VStack(alignment: .leading, spacing: theme.space("xs")) {
                        Text(model.t("detail.caveats")).tokenFont(.bodyStrong).accessibilityAddTraits(.isHeader)
                        ForEach(program.caveats, id: \.self) { key in
                            Label(model.t("caveat.\(key)"), systemImage: "exclamationmark.circle")
                                .tokenFont(.body)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .foregroundStyle(theme.onNotice)
                    .padding(theme.space("sm"))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(theme.notice, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                }

                ScreenHeading(text: model.t("detail.criteria"), style: .heading).padding(.top, theme.space("sm"))
                VStack(spacing: theme.space("xs")) {
                    ForEach(result.criteria, id: \.id) { criterion in
                        HStack(alignment: .firstTextBaseline, spacing: theme.space("sm")) {
                            StateIcon(state: criterion.state).alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 6 }
                            VStack(alignment: .leading, spacing: theme.space("xxs")) {
                                Text(model.t("criterion.\(programId).\(criterion.id)")).tokenFont(.body).foregroundStyle(theme.text)
                                Text(model.t("state.\(criterion.state.rawValue)")).tokenFont(.small).foregroundStyle(theme.textMuted)
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(theme.space("sm"))
                        .background(theme.surface, in: RoundedRectangle(cornerRadius: theme.radius("control")))
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("criterion.\(criterion.id)")
                    }
                }

                if !result.dependsOn.isEmpty {
                    ScreenHeading(text: model.t("detail.dependsOn"), style: .heading).padding(.top, theme.space("sm"))
                    ForEach(result.dependsOn, id: \.self) { variable in
                        Button(model.t("detail.answer", ["question": model.variableName(variable)])) {
                            model.answerDependency(variable, program: programId)
                        }
                        .buttonStyle(.secondaryAction)
                        .accessibilityIdentifier("depends.\(variable)")
                    }
                }

                Text(model.bundle.packInfo.verifiedOn.map { model.t("rules.verifiedOn", ["date": $0]) } ?? model.t("detail.unverified"))
                    .tokenFont(.small)
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, theme.space("sm"))
            } else {
                ScreenHeading(text: model.t("results.title"))
            }
        }
    }
}
