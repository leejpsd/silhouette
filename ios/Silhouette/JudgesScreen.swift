// "For judges: try it in two minutes": three numbered rows (the prepared household's Quick
// Check, the sample paystub's silhouette, the record of what left), where each task runs, and the
// on-device check behind "Run the check". Invented data only.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct JudgesScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        GroundScroll {
            VStack(alignment: .leading, spacing: 16) {
                DraftLine()
                Display(text: model.t("judges.title"), size: 54)
                    .accessibilityIdentifier("judges.title")
                NoteText(text: model.t("judges.lead"), size: 15)
                ListCard {
                    step(1, "judges.step1", id: "judges.quickCheck") { model.runPreparedHousehold() }
                    RowDivider(inset: 60)
                    step(2, "judges.step2", id: "judges.sample") { model.openSamplePreview() }
                    RowDivider(inset: 60)
                    step(3, "judges.step3", id: "judges.record") { model.sheet = .record }
                }
                Card {
                    Text(model.t("deviceCheck.title")).font(.system(size: 17, weight: .semibold)).foregroundStyle(theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    NoteText(text: model.t("deviceCheck.lead"), size: 15).padding(.top, 4)
                    Rectangle().fill(theme.line.opacity(0.7)).frame(height: 0.5).padding(.vertical, 12)
                    Text(model.t(model.deviceModelAvailable ? "judges.withModel" : "judges.withoutModel"))
                        .font(.system(size: 15)).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("judges.device")
                    PrimaryButton(label: model.t("deviceCheck.run"), id: "judges.deviceCheck") { model.path.append(.deviceCheck) }
                        .padding(.top, 14)
                }
                ListCard {
                    Button { model.path.append(.tasks) } label: {
                        ListRow(title: model.t("judges.tasks"), titleWeight: .semibold) { IconTile(systemImage: "arrow.triangle.branch") }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("judges.tasks")
                }
            }
            .gutter()
            .padding(.top, 8)
        }
        .navigationTitle(model.t("rail.judges"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func step(_ n: Int, _ key: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ListRow(title: model.t("\(key).title"), subtitle: model.t("\(key).body"), titleWeight: .semibold) {
                Text(verbatim: model.number(Double(n)))
                    .font(Font(DesignFonts.uiFont(.display, weight: 900, size: 18)))
                    .foregroundStyle(theme.color("onPrimary"))
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(theme.color("primary")))
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityHint(model.t("\(key).button"))
        .accessibilityIdentifier(id)
    }
}

extension AppModel {
    /// Judges, step 1: the prepared household's answers, then the results. Nothing is sent.
    func runPreparedHousehold() {
        restartForDemo()
        // The judges' household of shared/rulepacks/us-ca/judges-household.json (synthetic).
        for (id, value) in bundle.judgesHousehold?.answers ?? [] where session.step(id) != nil { answer(id, value) }
        showResults()
    }

    /// Judges, step 2: the bundled English sample paystub, opened at its silhouette.
    func openSamplePreview() {
        guard let sample = bundle.samples.first(where: { $0.id == "paystub-en-01" }) ?? bundle.samples.first else { return }
        useDocumentText(sample.text, source: .sample, sample: sample)
    }
}
