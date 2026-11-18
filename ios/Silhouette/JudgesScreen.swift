// "For judges: try it in two minutes": three numbered rows (the prepared household's Quick
// Check, the sample paystub's silhouette, the record of what left), where each task runs, and the
// on-device check behind "Run the check". Invented data only.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

struct JudgesScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.pinsActions) private var pinsActions

    @State private var showSteps = false

    var body: some View {
        GroundScroll {
            VStack(alignment: .leading, spacing: 16) {
                DraftLine()
                Display(text: model.t("judges.title"), size: 54)
                    .accessibilityIdentifier("judges.title")
                ListCard {
                    step(1, "judges.step1", id: "judges.quickCheck") { model.runPreparedHousehold() }
                    RowDivider(inset: 60)
                    step(2, "judges.step2", id: "judges.sample") { model.openSamplePreview() }
                    RowDivider(inset: 60)
                    step(3, "judges.step3", id: "judges.record") { model.sheet = .record }
                }
                Card {
                    Text(model.t("deviceCheck.title")).sfFont(17, weight: .semibold).foregroundStyle(theme.ink)
                        .accessibilityAddTraits(.isHeader)
                    NoteText(text: model.t("deviceCheck.lead"), size: 15).padding(.top, 4)
                    fact(model.t("judges.factModel"), model.t(model.deviceModelAvailable ? "judges.factAvailable" : "judges.factNotAvailable"))
                        .padding(.top, 10)
                        .accessibilityIdentifier("judges.device")
                    fact(model.t("judges.factFallback"), model.t("judges.factReplays"))
                }
                if !pinsActions { runButton }
                ListCard {
                    Button { model.path.append(.tasks) } label: {
                        ListRow(title: model.t("judges.tasks"), titleWeight: .semibold) { IconTile(systemImage: "arrow.triangle.branch") }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("judges.tasks")
                }
                // The long descriptions, for whoever wants them.
                Button { withMotion(Motion.reveal) { showSteps.toggle() } } label: {
                    HStack(spacing: 4) {
                        Text(model.t("judges.more")).sfFont(15, weight: .semibold)
                        Image(systemName: showSteps ? "chevron.up" : "chevron.down").sfFont(12, weight: .semibold)
                    }
                    .foregroundStyle(theme.ink)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("judges.more")
                if showSteps {
                    VStack(alignment: .leading, spacing: 16) {
                    NoteText(text: model.t("judges.lead"), size: 15)
                    ForEach(1...3, id: \.self) { n in
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(model.number(Double(n))). \(model.t("judges.step\(n).title"))").sfFont(15, weight: .semibold).foregroundStyle(theme.ink)
                            NoteText(text: model.t("judges.step\(n).body"))
                        }
                    }
                    NoteText(text: model.t(model.deviceModelAvailable ? "judges.withModel" : "judges.withoutModel"))
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("judges.moreText")
                    .revealsIntoView()
                    .transition(Motion.revealTransition)
                }
            }
            .gutter()
            .padding(.top, 8)
        }
        .navigationTitle(model.t("rail.judges"))
        .navigationBarTitleDisplayMode(.inline)
        // The device check's action stays in the first screen, above the pill (in the content at
        // accessibility sizes).
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if pinsActions {
                runButton
                    .gutter()
                    .padding(.top, 8)
                    .background(theme.ground)
            }
        }
    }

    private var runButton: some View {
        // It does what it says: opens the check and starts the run (when this iPhone has the model;
        // otherwise the page says why it cannot run and offers the recording).
        PrimaryButton(label: model.t("deviceCheck.run"), id: "judges.deviceCheck") {
            model.autoRunDeviceCheck = 1
            model.path.append(.deviceCheck)
        }
    }

    private func fact(_ label: String, _ value: String) -> some View {
        VStack(spacing: 0) {
            Rectangle().fill(theme.line.opacity(0.7)).frame(height: 0.5)
            HStack(alignment: .firstTextBaseline) {
                Text(label).sfFont(15).foregroundStyle(theme.note)
                Spacer(minLength: 8)
                Text(value).sfFont(15, weight: .semibold).foregroundStyle(theme.ink).multilineTextAlignment(.trailing)
            }
            .padding(.vertical, 10)
        }
        .accessibilityElement(children: .combine)
    }

    /// A numbered step: the title and a one-line subline (what the button does); the row is the button.
    private func step(_ n: Int, _ key: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ListRow(title: model.t("\(key).title"), subtitle: model.t("\(key).button"), titleSize: 17, titleWeight: .regular) {
                Text(verbatim: model.number(Double(n)))
                    .font(Font(DesignFonts.uiFont(.display, weight: 900, size: 18)))
                    .foregroundStyle(theme.color("onPrimary"))
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(theme.color("primary")))
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityHint(model.t("\(key).body"))
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
