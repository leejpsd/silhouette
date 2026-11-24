// "For judges: try it in two minutes": three numbered rows (the sample paystub read for an invented
// household, the results it sharpens, the record of what left), where each task runs, and the
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
                // The whole path in one press (contract v1.43); the three steps stay below, one at a time.
                runAll
                ListCard {
                    step(1, "judges.step1", id: "judges.sample") { model.startJudgesSample() }
                    RowDivider(inset: 60)
                    step(2, "judges.step2", id: "judges.results") { model.seeJudgesResults() }
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
                    // The latest real iPhone run, on this page: what the check measured there.
                    RecordedFigures().padding(.top, 12)
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

    /// One press: the sample paystub read on a device (on this iPhone when it has the model, otherwise the
    /// recording) and then in the cloud, now (contract v1.47: the text says its silhouette is sent; it is the
    /// invented sample and only its silhouette leaves), its values confirmed, the results opened.
    private var runAll: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.t("judges.runAll.body")).sfFont(15).foregroundStyle(theme.onHeroMuted)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("judges.runAll.body")
            Button { Task { await model.runJudgesPath() } } label: {
                HStack(spacing: 8) {
                    if model.runningJudgesPath { ProgressView().tint(Color(red: 0.055, green: 0.055, blue: 0.055)).accessibilityHidden(true) }
                    Text(model.t("judges.runAll.button")).sfFont(17, weight: .semibold)
                    Image(systemName: "arrow.right").sfFont(15, weight: .semibold).accessibilityHidden(true)
                }
                .foregroundStyle(Color(red: 0.055, green: 0.055, blue: 0.055))
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Capsule().fill(.white))
                .contentShape(Capsule())
            }
            .buttonStyle(PressScale())
            .allowsHitTesting(!model.runningJudgesPath)
            .accessibilityIdentifier("judges.runAll")
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 24).fill(theme.hero))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
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
            // The subline says what the press does, unless it would repeat the title ("Read the sample paystub").
            let subtitle = model.t("\(key).button") == model.t("\(key).title") ? nil : model.t("\(key).button")
            ListRow(title: model.t("\(key).title"), subtitle: subtitle, titleSize: 17, titleWeight: .regular) {
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
    /// The prepared household's answers (shared/rulepacks/us-ca/judges-household.json, synthetic).
    private func fillPreparedHousehold() {
        restartForDemo()
        for (id, value) in bundle.judgesHousehold?.answers ?? [] where session.step(id) != nil { answer(id, value) }
    }

    /// Judges, step 1: the invented household's answers are filled in and its paystub opens on its
    /// silhouette, so the first results a judge sees already use the income the model read.
    func startJudgesSample() {
        onJudgesPath = true
        fillPreparedHousehold()
        openSamplePreview()
    }

    /// Judges, step 2: the results (the household's own income range until the paystub has been read).
    func seeJudgesResults() {
        onJudgesPath = true
        if !session.isStarted { fillPreparedHousehold() }
        showResults()
    }

    /// The prepared household's answers, then the results. Nothing is sent.
    func runPreparedHousehold() {
        onJudgesPath = true
        fillPreparedHousehold()
        showResults()
    }

    /// The judges' path in one press (contracts v1.43, v1.44, v1.47): the prepared household, then the sample
    /// paystub's silhouette read both ways, one after the other. First on a device: on this iPhone now when it
    /// has the model (kept on this iPhone), else the on-device model's recorded answer made on an iPhone. Then in
    /// the cloud: the same silhouette read now through Firebase AI Logic (ONLY_IN_CLOUD, App Check, in the record
    /// like a Send; the button's text says it is sent), or, when that does not complete, the recorded cloud
    /// reading with the reason. The review shows both answers side by side and uses the device's; the values that decide the
    /// result are confirmed, the yearly income used, and the results opened with what the paystub changed.
    /// Without a device answer the recorded cloud reading alone is used, as before. A reading that fails stays
    /// on the silhouette screen with its notice.
    func runJudgesPath() async {
        guard !runningJudgesPath else { return }
        runningJudgesPath = true
        defer { runningJudgesPath = false }
        startJudgesSample()
        // The silhouette is seen for a moment before it goes.
        if !MotionSwitch.off { try? await Task.sleep(for: .milliseconds(600)) }
        var read = false
        if deviceModelAvailable { read = await readDocument(keepOnDevice: true, review: false) }
        if !read {
            documentError = nil
            read = await useRecordedDevice(both: recordedCloudReading != nil)
        }
        if !read, recordedCloudReading != nil {
            documentError = nil
            read = await useRecordedCloud(review: false)
        }
        if !read, !deviceModelAvailable, !isOnline { read = await readDocument(review: false) }
        guard read else { readingShow = nil; return }
        // The second half: the same silhouette read now in the cloud (the recording when that does not complete),
        // then both side by side on the review.
        let both = await readCloudHalf()
        editDocument { $0.confirmAll() }
        if both {
            paystubPath.append(.documentReview)
            try? await Task.sleep(for: .milliseconds(450))
            readingShow = nil
            // Long enough to see the two answers side by side before the results open (the review stays on the
            // paystub tab).
            try? await Task.sleep(for: .seconds(MotionSwitch.off ? 0.5 : testModel != nil ? 6 : 3.5))
        }
        guard let annualization = documentValidation?.annualization else { readingShow = nil; return }
        useIncome(annualization)
        try? await Task.sleep(for: .milliseconds(450))
        readingShow = nil
    }

    /// The bundled English sample paystub, opened at its silhouette.
    func openSamplePreview() {
        guard let sample = bundle.samples.first(where: { $0.id == "paystub-en-01" }) ?? bundle.samples.first else { return }
        useDocumentText(sample.text, source: .sample, sample: sample)
    }
}
