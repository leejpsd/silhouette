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
                    Para(model.t("detail.period", ["period": model.packPeriod(period)]), .small)
                        .accessibilityIdentifier("program.period")
                }

                VStack(alignment: .leading, spacing: 6) {
                    SectionHeading(text: model.t("detail.caveats"))
                    ForEach(program.caveats, id: \.self) { key in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(verbatim: "–").type(.small).accessibilityHidden(true)
                            Para(model.t("caveat.\(key)"), .small)
                        }
                    }
                    // A draft pack says it is a draft (with the date its sources were read), not "for testing".
                    let info = model.bundle.packInfo
                    Para(info.verifiedOn.map { model.t("rules.verifiedOn", ["date": $0]) }
                         ?? (info.isDraft ? model.t("pack.draft.notice", ["date": model.draftDate]) : model.t("detail.unverified")), .small)
                }
                .padding(.top, theme.space("sm"))

                OfficialInformation(program: program)

                AboutSection(programId: programId).padding(.top, theme.space("sm"))
                FreeTextSection(programId: programId).padding(.top, theme.space("sm"))
            } else {
                DisplayHeadline(text: model.t("results.title"), role: .title)
            }
        }
    }
}

/// Official information: how to apply, the usual papers and the office (the pack's copy), the apply
/// link, and each official source with the date its numbers were read (a draft pack) or confirmed.
private struct OfficialInformation: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let program: PackInfo.Program

    var body: some View {
        let copy = Dictionary(AnswerInputs.programCopy(model.bundle, programId: program.id, locale: model.locale).map { ($0.key, $0.text) },
                              uniquingKeysWith: { a, _ in a })
        let any = !program.sources.isEmpty || program.applyUrl != nil || !program.docsRequired.isEmpty
        VStack(alignment: .leading, spacing: 8) {
            SectionHeading(text: model.t("official.title"))
            if let apply = copy["apply"] { Para(apply, .small) }
            if let documents = copy["documents"] {
                Text(model.t("official.docs")).type(.label).foregroundStyle(theme.ink)
                Para(documents, .small)
            }
            if let office = copy["office"] { Text(office).type(.bodyStrong).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true) }
            if !any { Para(model.t("official.none"), .small, muted: true) }
            if let url = program.applyUrl.flatMap(URL.init(string:)) {
                Link(destination: url) {
                    Label(model.t("official.apply"), systemImage: "arrow.up.right")
                }
                .buttonStyle(OutlineStyle())
                .accessibilityIdentifier("official.apply")
            }
            if !program.sources.isEmpty {
                Text(model.t("official.source")).type(.label).foregroundStyle(theme.ink).padding(.top, 4)
                ForEach(program.sources, id: \.url) { source in
                    VStack(alignment: .leading, spacing: 2) {
                        if let url = URL(string: source.url) {
                            Link(source.title, destination: url)
                                .buttonStyle(TextLinkStyle(role: .small))
                        }
                        // A draft pack's numbers were read on a date; a confirmed source says when it was compared.
                        if let checked = source.checkedAt {
                            Para(model.t("official.confirmedOn", ["date": model.packDate(checked)]), .caption, muted: true)
                        } else if let read = model.bundle.packInfo.sourcesReadOn {
                            Para(model.t("official.readOn", ["date": model.packDate(read)]), .caption, muted: true)
                                .accessibilityIdentifier("official.readOn")
                        }
                    }
                    .accessibilityElement(children: .contain)
                }
            }
            // The pack's list is in one language; its program copy says the same in the reader's.
            if copy["documents"] == nil && !program.docsRequired.isEmpty {
                Text(model.t("official.docs")).type(.label).foregroundStyle(theme.ink)
                ForEach(program.docsRequired, id: \.self) { d in
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(verbatim: "–").type(.small).accessibilityHidden(true)
                        Para(d, .small)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("official.info")
    }
}
