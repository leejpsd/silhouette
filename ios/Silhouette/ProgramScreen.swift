// A program's page: the hero with the verdict pill, the name, its summary and "Explain this
// program" (the step before sending comes first); "Why this result" from the rules only, with the
// income bar; what the result depends on; how it works (the pack's sections as rows); things to know;
// official sources with the date they were read; prepared and typed questions.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct ProgramScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    let programId: String

    var body: some View {
        RevealingScroll {
            VStack(alignment: .leading, spacing: 16) {
                if let program = model.bundle.packInfo.program(programId), let result = model.result(programId) {
                    hero(program, result)
                    VStack(alignment: .leading, spacing: 16) {
                        if let amount = result.estimatedAmount, amount > 0 {
                            Card {
                                Display(text: model.money(amount), size: 44, maxLines: 1)
                                NoteText(text: model.t("detail.amount", ["amount": model.money(amount)])).padding(.top, 4)
                            }
                        }
                        // A "Probably not" is a first check, not a decision: said before the reasons.
                        if result.verdict == .unlikely {
                            Text(model.t("detail.unlikelyNote")).sfFont(15).foregroundStyle(theme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 16).padding(.vertical, 14)
                                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(theme.ink, style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
                                .accessibilityIdentifier("detail.unlikelyNote")
                        }
                        WhySection(programId: programId)
                        if !result.dependsOn.isEmpty { dependsOn(result) }
                        HowItWorks(program: program)
                        thingsToKnow(program)
                        OfficialInformation(program: program)
                        AskSection(programId: programId)
                        FreeTextSection(programId: programId)
                    }
                    .gutter()
                }
            }
            .padding(.bottom, 24)
        }
        .heroScreen(theme)
    }

    private func hero(_ program: PackInfo.Program, _ result: ProgramVerdict) -> some View {
        let summary = model.bundle.copy.lookup("program.\(programId).summary", model.locale)
        let pill = HeroPill(label: model.t("verdict.\(result.verdict.rawValue)"), filled: true, verdict: result.verdict)
            .accessibilityIdentifier("detail.verdict")
            .accessibilityValue(result.verdict.rawValue)
        return Hero(title: model.programName(programId), size: 54, lead: summary, badge: AnyView(pill)) {
            HStack(spacing: 8) {
                GlassRound(systemImage: "chevron.left", label: model.t("detail.back"), id: "program.back") { model.back() }
                Spacer(minLength: 0)
                if let url = program.applyUrl.flatMap(URL.init(string:)) {
                    Link(destination: url) {
                        Image(systemName: "arrow.up.right").sfFont(17, weight: .semibold).frame(width: 44, height: 44)
                    }
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
                    .accessibilityLabel(model.t("official.apply"))
                    .accessibilityIdentifier("program.applyLink")
                }
            }
        } content: {
            let key = model.aboutKey(programId, long: false)
            // At accessibility sizes the button and its note stack, and the label wraps.
            let ax = dynamicType.isAccessibilitySize
            // A result a document can confirm ("Possible") leads to the document first.
            if result.verdict == .maybe {
                Button { model.openDocument() } label: {
                    HStack(spacing: 8) {
                        Text(model.t("detail.confirmWithPaystub")).sfFont(17, weight: .semibold)
                        Image(systemName: "arrow.right").sfFont(15, weight: .semibold).accessibilityHidden(true)
                    }
                    .foregroundStyle(Color(red: 0.055, green: 0.055, blue: 0.055))
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Capsule().fill(.white))
                }
                .buttonStyle(PressScale())
                .accessibilityIdentifier("detail.confirmWithPaystub")
                .padding(.top, 16)
            }
            (ax ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(spacing: 14))) {
                Button { model.startAbout(programId, long: false) } label: {
                    Label(model.t("about.explain"), systemImage: "bubble.left")
                        .sfFont(17, weight: .semibold)
                        .lineLimit(ax ? nil : 1)
                        .fixedSize(horizontal: !ax, vertical: ax)
                        .padding(.vertical, ax ? 8 : 0)
                        .foregroundStyle(result.verdict == .maybe ? .white : Color(red: 0.055, green: 0.055, blue: 0.055))
                        .padding(.horizontal, 18)
                        .frame(minHeight: 48)
                        // Second to the paystub when that leads: an outline then.
                        .background {
                            if result.verdict == .maybe {
                                RoundedRectangle(cornerRadius: ax ? 20 : 24).strokeBorder(.white.opacity(0.6), lineWidth: 1.5)
                            } else {
                                RoundedRectangle(cornerRadius: ax ? 20 : 24).fill(.white)
                            }
                        }
                }
                .buttonStyle(PressScale())
                .accessibilityIdentifier("about.explain")
                .disabled({ if case .loading = model.state(key) { true } else { false } }())
                Text(model.t("about.seeFirst")).sfFont(13).foregroundStyle(theme.onHeroMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, result.verdict == .maybe ? 10 : 16)
        }
    }

    private func dependsOn(_ result: ProgramVerdict) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: model.t("detail.dependsOn"), large: false)
            ListCard {
                ForEach(Array(result.dependsOn.enumerated()), id: \.element) { i, variable in
                    if i > 0 { RowDivider() }
                    Button { model.answerDependency(variable, program: programId) } label: {
                        ListRow(title: model.t("detail.answer", ["question": model.variableName(variable)]), titleWeight: .semibold) {
                            VerdictMarker(verdict: .depends)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("depends.\(variable)")
                }
            }
        }
    }

    private func thingsToKnow(_ program: PackInfo.Program) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: model.t("detail.caveats"))
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(program.caveats, id: \.self) { key in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Circle().fill(theme.ink).frame(width: 5, height: 5).accessibilityHidden(true)
                            Text(model.t("caveat.\(key)")).sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if let period = program.period {
                        NoteText(text: model.t("detail.period", ["period": model.packPeriod(period)]))
                            .accessibilityIdentifier("program.period")
                    }
                    // A draft pack says it is a draft (with the date its sources were read), never both notes.
                    let info = model.bundle.packInfo
                    NoteText(text: info.verifiedOn.map { model.t("rules.verifiedOn", ["date": $0]) }
                        ?? (info.isDraft ? model.t("pack.draft.notice", ["date": model.draftDate]) : model.t("detail.unverified")))
                }
            }
        }
    }
}

/// How it works: the pack's own sections (how to apply, papers, renewal, where to go) as rows.
private struct HowItWorks: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let program: PackInfo.Program

    var body: some View {
        let copy = AnswerInputs.programCopy(model.bundle, programId: program.id, locale: model.locale).filter { $0.key != "summary" }
        if !copy.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel(text: model.t("about.title"))
                ListCard {
                    ForEach(Array(copy.enumerated()), id: \.element.key) { i, item in
                        if i > 0 { RowDivider() }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(title(item.key)).sfFont(15, weight: .semibold).foregroundStyle(theme.ink)
                            Text(item.text).sfFont(15).foregroundStyle(theme.ink2).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("program.\(item.key)")
                    }
                }
            }
        }
    }

    private func title(_ key: String) -> String {
        switch key {
        case "apply": model.t("official.howToApply")
        case "documents": model.t("official.docs")
        case "office": model.t("official.office")
        case "renewal": model.t("program.renewalTitle")
        default: key
        }
    }
}

/// Official information: the apply link and each official source with the date its numbers were read
/// (a draft pack) or confirmed; the pack's list of papers when its copy has none.
private struct OfficialInformation: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    let program: PackInfo.Program

    var body: some View {
        let hasDocsCopy = model.bundle.copy.lookup("program.\(program.id).documents", model.locale) != nil
        let any = !program.sources.isEmpty || program.applyUrl != nil || !program.docsRequired.isEmpty
        VStack(alignment: .leading, spacing: 8) {
            SectionLabel(text: model.t("official.title"))
            if !any { NoteText(text: model.t("official.none")) }
            ListCard {
                if let url = program.applyUrl.flatMap(URL.init(string:)) {
                    Link(destination: url) {
                        ListRow(title: model.t("official.apply"), titleWeight: .semibold, leading: { IconTile(systemImage: "arrow.up.right") })
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("official.apply")
                }
                ForEach(Array(program.sources.enumerated()), id: \.element.url) { i, source in
                    if i > 0 || program.applyUrl != nil { RowDivider(inset: 64) }
                    let date = source.checkedAt.map { model.t("official.confirmedOn", ["date": model.packDate($0)]) }
                        ?? model.bundle.packInfo.sourcesReadOn.map { model.t("official.readOn", ["date": model.packDate($0)]) }
                    if let url = URL(string: source.url) {
                        Link(destination: url) {
                            ListRow(title: source.title, subtitle: date, titleSize: 15, titleWeight: .semibold, leading: { IconTile(systemImage: "doc.text") })
                        }
                        .buttonStyle(.plain)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier(source.checkedAt == nil ? "official.readOn" : "official.confirmedOn")
                    }
                }
            }
            // The pack's list is in one language; its program copy says the same in the reader's.
            if !hasDocsCopy && !program.docsRequired.isEmpty {
                Card {
                    Text(model.t("official.docs")).sfFont(15, weight: .semibold).foregroundStyle(theme.ink)
                    ForEach(program.docsRequired, id: \.self) { d in
                        Text("· \(d)").sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true).padding(.top, 4)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("official.info")
    }
}
