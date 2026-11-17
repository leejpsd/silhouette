// "For judges: try it in two minutes": three steps, one button each, with invented data only. Reached
// from the draft-rules sheet, not from the main flow.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

/// The prepared synthetic household of the judges' path and the on-device check: an invented renter
/// household of three, a working single parent (head of household) with one child under 6, a yearly
/// income given as a range, and one private question left unanswered. Answers the pack does not ask,
/// or would not accept, are left out.
enum PreparedHousehold {
    static let answers: [(String, AnswerValue)] = [
        ("income", .income(.band("C"))),
        ("householdSize", .integer(3)),
        ("numQualifyingChildren", .integer(1)),
        ("hasChildUnder6", .choice("yes")),
        ("hasEarnedIncome", .choice("yes")),
        ("ageGroup", .choice("25-64")),
        ("housing", .choice("renter")),
        ("benefits", .selection([])),
        ("energyProvider", .choice("pge")),
        ("hasElderlyOrDisabledMember", .choice("no")),
        ("filingStatus", .choice("head-of-household")),
        ("taxIdType", .choice("ssn-valid-for-work")),
        ("investmentIncome", .integer(0)),
    ]
}

struct JudgesScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        Screen {
            BackLink(label: model.t("nav.home"), id: "judges.home") { model.goHome() }
                .padding(.bottom, -8)
            DisplayHeadline(text: model.t("judges.title"), role: .title, size: 50, maxLines: 3)
                .accessibilityIdentifier("judges.title")
                .appear(.rise)
            Para(model.t("judges.lead"))
            DashedNote { Text(model.t(model.deviceModelAvailable ? "judges.withModel" : "judges.withoutModel")) }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("judges.device")
            VStack(alignment: .leading, spacing: 0) {
                step(1, "judges.step1", id: "judges.quickCheck") { model.runPreparedHousehold() }
                step(2, "judges.step2", id: "judges.sample") { model.openSamplePreview() }
                step(3, "judges.step3", id: "judges.record") { model.sheet = .record }
            }
        }
    }

    private func step(_ n: Int, _ key: String, id: String, action: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(theme.line).frame(height: 1)
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(verbatim: model.number(Double(n))).type(.heading).foregroundStyle(theme.ink).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 8) {
                    Text(model.t("\(key).title")).type(.heading).foregroundStyle(theme.ink)
                        .fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
                    Para(model.t("\(key).body"), .small)
                    Button(action: action) {
                        HStack(spacing: 8) {
                            Text(model.t("\(key).button"))
                            Image(systemName: "arrow.right").font(.system(size: 13, weight: .bold)).accessibilityHidden(true)
                        }
                    }
                    .buttonStyle(OutlineStyle())
                    .accessibilityIdentifier(id)
                }
            }
            .padding(.vertical, 14)
        }
    }
}

extension AppModel {
    /// Judges, step 1: the prepared household's answers, then the results. Nothing is sent.
    func runPreparedHousehold() {
        restartForDemo()
        for (id, value) in PreparedHousehold.answers where session.step(id) != nil { answer(id, value) }
        showResults()
    }

    /// Judges, step 2: the bundled English sample paystub, opened at its silhouette.
    func openSamplePreview() {
        guard let sample = bundle.samples.first(where: { $0.id == "paystub-en-01" }) ?? bundle.samples.first else { return }
        path = [.documentAdd]
        useDocumentText(sample.text, source: .sample, sample: sample)
    }
}
