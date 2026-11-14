// A program's page: the result by shape, the name and the estimated amount, why (from the rules),
// what the result depends on (each opens the question and comes back), things to know, official
// information, then the model-written parts. The count block is compact.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct ProgramScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let programId: String

    var body: some View {
        Screen {
            BackLink(label: model.t("detail.back")) { if !model.path.isEmpty { model.path.removeLast() } }
                .padding(.bottom, -8)
            if let program = model.bundle.packInfo.program(programId), let result = model.result(programId) {
                MarkerLine(kind: .verdict(result.verdict), text: model.t("verdict.\(result.verdict.rawValue)"))
                    .accessibilityIdentifier("detail.verdict")
                    .accessibilityValue(result.verdict.rawValue)
                DisplayHeadline(text: model.programName(programId), role: .display, maxLines: 2)
                    .appear(.rise)
                if let amount = result.estimatedAmount, amount > 0 {
                    VStack(alignment: .leading, spacing: 4) {
                        DisplayLabel(text: model.money(amount), role: .amount, maxLines: 1)
                            .accessibilityHidden(true)
                            .appear(.pop)
                        Para(model.t("detail.amount", ["amount": model.money(amount)]), .small)
                    }
                }

                WhySection(programId: programId).padding(.top, theme.space("xs"))

                if !result.dependsOn.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(model.t("detail.dependsOn")).type(.label).foregroundStyle(theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                        FlowLayout {
                            ForEach(result.dependsOn, id: \.self) { variable in
                                Button(model.t("detail.answer", ["question": model.variableName(variable)])) {
                                    model.answerDependency(variable, program: programId)
                                }
                                .buttonStyle(ChipStyle())
                                .accessibilityIdentifier("depends.\(variable)")
                            }
                        }
                    }
                }
                if let period = program.period {
                    Para(model.t("detail.period", ["period": period]), .small)
                }

                VStack(alignment: .leading, spacing: 6) {
                    SectionHeading(text: model.t("detail.caveats"))
                    ForEach(program.caveats, id: \.self) { key in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(verbatim: "–").type(.small).accessibilityHidden(true)
                            Para(model.t("caveat.\(key)"), .small)
                        }
                    }
                    Para(model.bundle.packInfo.verifiedOn.map { model.t("rules.verifiedOn", ["date": $0]) } ?? model.t("detail.unverified"), .small)
                }
                .padding(.top, theme.space("sm"))

                VStack(alignment: .leading, spacing: 6) {
                    SectionHeading(text: model.t("official.title"))
                    if let url = program.applyUrl.flatMap(URL.init(string:)) {
                        Link(model.t("official.apply"), destination: url)
                            .buttonStyle(TextLinkStyle())
                    } else {
                        Para(model.t("official.none"), .small)
                    }
                }

                AboutSection(programId: programId).padding(.top, theme.space("sm"))
                FreeTextSection(programId: programId).padding(.top, theme.space("sm"))
            } else {
                DisplayHeadline(text: model.t("results.title"), role: .title)
            }
        }
    }
}
