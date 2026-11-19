// The on-device check (reached from the draft-rules sheet): runs the fixed synthetic cases through
// Firebase AI Logic on this iPhone, shows where each was finally answered, and shares the run file.
// Without a device model it says so plainly and can show a bundled recording, labelled as one.

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UniformTypeIdentifiers

struct DeviceCheckScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @State private var run: DeviceCheckRun?
    @State private var repeatCases = false
    /// A recording being shown (bundled or opened), instead of the live run.
    @State private var recording: (file: JSON, name: String)?
    @State private var opening = false
    @State private var badFile = false

    private var available: Bool { model.deviceModelAvailable }

    /// Runs recorded on an iPhone and bundled with the app (eval/on-device/: the baseline and the
    /// latest), newest first.
    static var bundledRecordings: [(name: String, file: JSON)] {
        let urls = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: "Shared/recordings") ?? []
        return urls.filter { $0.lastPathComponent.hasPrefix("device-check-") }
            .compactMap { url in (try? JSON.parse(Data(contentsOf: url))).flatMap { DeviceCheck.isRunFile($0) ? (url.lastPathComponent, $0) : nil } }
            .sorted { ($0.file["date"]?.stringValue ?? "") > ($1.file["date"]?.stringValue ?? "") }
    }

    /// The baseline: the earliest bundled run (eval/on-device/README.md keeps it with the latest).
    static func isBaseline(_ name: String) -> Bool {
        let bundled = bundledRecordings
        return bundled.count > 1 && bundled.last?.name == name
    }

    /// The file being shown: a recording, the finished run, or the run so far.
    private var shownFile: JSON? {
        recording?.file ?? run?.file ?? run.map { r in
            .object(JSONObject([("version", .number(3)), ("platform", .string("iOS")), ("cases", .array(r.cases))]))
        }
    }

    /// The iPhone a run file was made on ("iPhone 17 Pro"), from its device block or user agent.
    static func deviceName(_ file: JSON) -> String {
        let id = file["device"]?["model"]?.stringValue
            ?? file["userAgent"]?.stringValue.flatMap { ua in ua.firstMatch(of: /iPhone\d+,\d+/).map { String($0.output) } }
        let names = ["iPhone18,1": "iPhone 17 Pro", "iPhone18,2": "iPhone 17 Pro Max", "iPhone17,1": "iPhone 16 Pro", "iPhone17,2": "iPhone 16 Pro Max"]
        return id.map { names[$0] ?? $0 } ?? (file["browser"]?.stringValue ?? "")
    }

    /// The run's date written as a date in the interface language ("November 17, 2026").
    static func recordedDate(_ file: JSON, _ model: AppModel) -> String {
        let iso = String((file["date"]?.stringValue ?? "").prefix(10))
        return model.packDate(iso)
    }

    /// "05:05 UTC" from an ISO date-time, when it has a time.
    static func recordedTime(_ iso: String?) -> String? {
        guard let iso, let t = iso.firstIndex(of: "T"), iso.count >= iso.distance(from: iso.startIndex, to: t) + 6 else { return nil }
        let start = iso.index(after: t)
        return String(iso[start..<iso.index(start, offsetBy: 5)]) + " UTC"
    }

    /// The run and share actions (or back to the live run from a recording).
    private var actions: some View {
            VStack(spacing: 6) {
            if recording != nil {
                PrimaryButton(label: model.t("deviceCheck.live"), id: "deviceCheck.live") { recording = nil }
            } else {
                if let file = run?.file, let url = run?.savedURL ?? Self.write(file) {
                    ShareLink(item: url) {
                        Label(model.t("deviceCheck.download"), systemImage: "square.and.arrow.up")
                            .sfFont(17, weight: .semibold)
                            .foregroundStyle(theme.ink)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Capsule().fill(theme.sheet))
                    }
                    .accessibilityIdentifier("deviceCheck.share")
                }
                PrimaryButton(label: model.t("deviceCheck.run"), id: "deviceCheck.run", busy: run?.running == true) { start() }
                    .disabled(!available || run?.running == true)
            }
        }
    }

    var body: some View {
        let shown = shownFile
        GroundScroll {
          VStack(alignment: .leading, spacing: 16) {
            DraftLine()
            Display(text: model.t(recording == nil ? "deviceCheck.title" : "deviceCheck.titleRecording"), size: 50)
                .accessibilityIdentifier("deviceCheck.title")
            if let recording {
                // Whose run it is: the iPhone and the system it was made on, and when.
                Text(model.t("deviceCheck.recordingMeta", ["date": Self.recordedDate(recording.file, model),
                                                           "browser": Self.deviceName(recording.file),
                                                           "platform": recording.file["platform"]?.stringValue ?? ""]))
                    .sfFont(15, weight: .semibold).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("deviceCheck.recordingMeta")
            }
            if let recording {
                NoticeCard(text: model.t("deviceCheck.recordingNote"), systemImage: "record.circle").accessibilityIdentifier("deviceCheck.recordingNote")
                // The first run is kept as the baseline: said where its figures are shown.
                if Self.isBaseline(recording.name) {
                    NoteText(text: model.t("deviceCheck.baselineNote"), size: 15).accessibilityIdentifier("deviceCheck.baselineNote")
                }
            }
            NoteText(text: model.t("deviceCheck.lead"), size: 15)
            NoteText(text: model.t("deviceCheck.cloudNote"))
            // A recording made elsewhere is not about this iPhone: no "no model here" card over it.
            if !available && recording == nil {
                NoticeCard(text: model.t("deviceCheck.noModel"), systemImage: "iphone.slash").accessibilityIdentifier("deviceCheck.noModel")
            }
            if recording == nil && available {
                Toggle(model.t("deviceCheck.repeat"), isOn: $repeatCases)
                    .sfFont(15)
                    .tint(theme.ink)
                    .disabled(run?.running == true)
                    .padding(16)
                    .background(RoundedRectangle(cornerRadius: 20).fill(theme.sheet))
                    .accessibilityIdentifier("deviceCheck.repeat")
            }
            // The actions sit in the content, under what they act on: pinned, they covered the
            // switch and the results as they arrived. A recording's figures come first.
            if recording == nil { actions }
            if let run, recording == nil {
                Group {
                    if run.running {
                        SpinnerLine(text: model.t("deviceCheck.running", ["n": String(run.current), "total": String(run.total)]))
                    } else {
                        NoteText(text: model.t("deviceCheck.done"), size: 15)
                    }
                }
                .accessibilityIdentifier("deviceCheck.status")
                if let saved = run.savedURL, !run.running {
                    NoteText(text: model.t("deviceCheck.saved", ["file": saved.lastPathComponent]))
                        .accessibilityIdentifier("deviceCheck.saved")
                }
            }
            // Results arrive below the status line; nothing above them moves while a run streams in.
            if let shown, !(shown["cases"]?.arrayValue ?? []).isEmpty { headlines(shown); summary(shown); caseList(shown) }
            // Back to a live run, only where one can run.
            if recording != nil && available { actions }
            recordings
          }
          .gutter()
          .padding(.top, 8)
        }
        .navigationTitle(model.t("deviceCheck.title"))
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // The fast snapshot capture opens this screen running, or showing the bundled recording.
            if model.snapshotDeviceCheck == "run" { start() }
            if model.snapshotDeviceCheck == "recording", let r = Self.bundledRecordings.first { recording = (r.file, r.name) }
            model.snapshotDeviceCheck = nil
            if let repetitions = model.autoRunDeviceCheck {
                model.autoRunDeviceCheck = nil
                if available {
                    repeatCases = repetitions > 1
                    start()
                }
            }
            // Where the check cannot run, the screen opens on the latest recording (labelled as one), not on
            // a button that cannot be pressed.
            if !available, run == nil, recording == nil, let latest = Self.bundledRecordings.first {
                recording = (latest.file, latest.name)
            }
        }
        .fileImporter(isPresented: $opening, allowedContentTypes: [.json]) { result in
            guard case .success(let url) = result else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            if let json = try? JSON.parse(Data(contentsOf: url)), DeviceCheck.isRunFile(json) {
                badFile = false
                recording = (json, url.lastPathComponent)
            } else {
                badFile = true
            }
        }
    }

    private func start() {
        let r = run ?? DeviceCheckRun(model: model)
        run = r
        Task { await r.run(repetitions: repeatCases ? 3 : 1) }
    }

    /// Writes a run file to a temporary file, for the share sheet when it could not be saved in Documents.
    static func write(_ file: JSON) -> URL? {
        let name = DeviceCheck.fileName(file)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        guard (try? Data((file.jsonText + "\n").utf8).write(to: url)) != nil else { return nil }
        return url
    }

    // MARK: Parts

    /// The figures shown: every case but those this platform cannot run (the photo case on iOS).
    private func counted(_ file: JSON) -> DeviceCheck.Summary {
        DeviceCheck.summarize(DeviceCheck.countedCases(file), version: Int(file["version"]?.numberValue ?? 3))
    }

    private func headlines(_ file: JSON) -> some View {
        let s = counted(file)
        return VStack(alignment: .leading, spacing: 10) {
            headline("\(s.onDevice) / \(s.total)", model.t(recording == nil ? "deviceCheck.headline.onDevice" : "deviceCheck.headline.onRecordingDevice"))
            if s.extractionCases > 0, let income = s.income {
                headline("\(income.allRight) / \(s.extractionCases)", model.t("deviceCheck.headline.incomeRight")
                         + (income.notFound > 0 ? " " + model.t("deviceCheck.headline.notFound", ["count": String(income.notFound)]) : ""))
            }
            if s.extractionCases > 0, let wrong = s.wrongReachedPerson {
                headline("\(wrong) / \(s.extractionCases)", model.t(wrong == 0 ? "deviceCheck.headline.wrongNone" : "deviceCheck.headline.wrong"))
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("deviceCheck.headlines")
    }

    private func headline(_ figure: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(verbatim: figure).font(Font(DesignFonts.uiFont(.display, weight: 900, size: 34))).foregroundStyle(theme.ink)
            Text(text).sfFont(15).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private func summary(_ file: JSON) -> some View {
        let s = counted(file)
        let notAvailable = (file["cases"]?.arrayValue?.count ?? 0) - DeviceCheck.countedCases(file).count
        let repetitions = Int(file["repetitions"]?.numberValue ?? 1)
        return VStack(alignment: .leading, spacing: 6) {
            NoteText(text: model.t("deviceCheck.summary", ["onDevice": String(s.onDevice), "total": String(s.total), "afterDevice": String(s.inCloudAfterDevice),
                                                 "inCloud": String(s.inCloud), "notRun": String(s.notRun)]))
            if notAvailable > 0 {
                NoteText(text: model.t("deviceCheck.notCounted", ["count": String(notAvailable)]))
                    .accessibilityIdentifier("deviceCheck.notCounted")
            }
            if s.extractionCases > 0 {
                if repetitions > 1 { NoteText(text: model.t("deviceCheck.summaryRepetitions", ["repetitions": String(repetitions)])) }
                if let income = s.income {
                    NoteText(text: model.t("deviceCheck.summaryIncomeSplit", ["total": String(s.extractionCases), "right": String(income.allRight),
                                                                    "notFound": String(income.notFound), "wrong": String(income.wrong)]))
                }
                if let wrong = s.wrongReachedPerson {
                    NoteText(text: model.t("deviceCheck.summaryWrong", ["wrong": String(wrong), "total": String(s.extractionCases)]))
                }
                if s.deductionsNotRead > 0 { NoteText(text: model.t("deviceCheck.summaryNotRead", ["count": String(s.deductionsNotRead)])) }
                NoteText(text: model.t("deviceCheck.wrongMustBeZero"), size: 12)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("deviceCheck.summary")
    }

    private func ranLabel(_ c: JSON, version: Int) -> String {
        if let file = shownFile, DeviceCheck.notAvailableHere(c, file: file) { return model.t("deviceCheck.ran.notAvailable") }
        let ran = DeviceCheck.finalRan(c, version: version)
        if ran == "IN_CLOUD" && c["final"]?["retried"]?.boolValue == true { return model.t("deviceCheck.ran.afterDevice") }
        return model.t("deviceCheck.ran.\(ran)")
    }

    private func caseList(_ file: JSON) -> some View {
        let version = Int(file["version"]?.numberValue ?? 3)
        let cases = file["cases"]?.arrayValue ?? []
        return ListCard {
            ForEach(Array(cases.enumerated()), id: \.offset) { i, c in
                if i > 0 { RowDivider(inset: 0) }
                VStack(alignment: .leading, spacing: 4) {
                    let rep = c["repetition"]?.numberValue.map { " · " + model.t("deviceCheck.repetition", ["n": String(Int($0)), "of": String(Int(file["repetitions"]?.numberValue ?? 1))]) } ?? ""
                    Text((c["id"]?.stringValue ?? "") + rep).sfFont(15, weight: .semibold).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    Text("\(model.t("deviceCheck.col.mode")): \(c["mode"]?.stringValue ?? "") · \(model.t("deviceCheck.col.ran")): \(ranLabel(c, version: version))")
                        .sfFont(13).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
                    let time = c["latencyMs"]?.numberValue.map { String(format: "%.1f s", $0 / 1000) } ?? "–"
                    let check = c["outputCheck"]?.stringValue ?? "–"
                    let fields = c["final"]?["fields"].map { "\(Int($0["correct"]?.numberValue ?? 0)) / \(Int($0["total"]?.numberValue ?? 0))" } ?? "–"
                    Text("\(model.t("deviceCheck.col.time")): \(time) · \(model.t("deviceCheck.col.check")): \(check) · \(model.t("deviceCheck.col.fields")): \(fields)")
                        .sfFont(13).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
                    ForEach(Array((c["device"]?["passes"]?.arrayValue ?? []).enumerated()), id: \.offset) { _, p in
                        let seconds = String(format: "%.1f", (p["latencyMs"]?.numberValue ?? 0) / 1000)
                        let problems = (p["problems"]?.arrayValue ?? []).compactMap(\.stringValue)
                        let marked = (p["marked"]?.arrayValue ?? []).compactMap(\.stringValue)
                        Text(model.t("deviceCheck.pass", ["part": p["part"]?.stringValue ?? "", "time": seconds])
                             + (problems.isEmpty ? "" : " " + problems.joined(separator: ", "))
                             + (marked.isEmpty ? "" : " · " + model.t("deviceCheck.marked", ["problems": marked.joined(separator: ", ")])))
                            .monoFont(11.5, weight: 400).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    if let notRead = c["final"]?["notRead"]?.arrayValue, notRead.contains(where: { $0.stringValue == "deductions" }) {
                        Text(model.t("deviceCheck.deductionsNotRead")).sfFont(13).foregroundStyle(theme.note)
                    }
                    if let note = c["error"]?.stringValue ?? c["note"]?.stringValue {
                        Text("\(model.t("deviceCheck.col.note")): \(note)").sfFont(13).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
            }
        }
        .accessibilityIdentifier("deviceCheck.cases")
    }

    private var recordings: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionLabel(text: model.t("deviceCheck.recordings"), large: false)
            let bundled = Self.bundledRecordings
            if bundled.isEmpty { NoteText(text: model.t("deviceCheck.noRecording")) }
            ListCard {
                ForEach(Array(bundled.enumerated()), id: \.element.name) { i, r in
                    if i > 0 { RowDivider(inset: 64) }
                    // The latest first; the first run is the baseline; any other is an earlier run.
                    let key = i == 0 ? "deviceCheck.recordingLatest" : Self.isBaseline(r.name) ? "deviceCheck.recordingBaseline" : "deviceCheck.recordingEarlier"
                    let shown = recording?.name == r.name
                    Button { recording = (r.file, r.name) } label: {
                        ListRow(title: model.t(key, ["date": Self.recordedDate(r.file, model)]),
                                subtitle: [Self.deviceName(r.file), r.file["platform"]?.stringValue, Self.recordedTime(r.file["date"]?.stringValue)]
                                    .compactMap { $0 }.joined(separator: " · "),
                                chevron: !shown, titleSize: 15, titleWeight: .semibold) {
                            IconTile(systemImage: "record.circle")
                        } trailing: {
                            // The recording on the screen now.
                            if shown { Image(systemName: "checkmark").sfFont(15, weight: .semibold).foregroundStyle(theme.ink).accessibilityHidden(true) }
                        }
                    }
                    .accessibilityAddTraits(shown ? .isSelected : [])
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("deviceCheck.recording")
                }
                if !bundled.isEmpty { RowDivider(inset: 64) }
                Button { opening = true } label: {
                    ListRow(title: model.t("deviceCheck.open"), titleSize: 15, titleWeight: .semibold) { IconTile(systemImage: "folder") }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("deviceCheck.open")
            }
            if badFile { NoteText(text: model.t("deviceCheck.badFile")) }
        }
        .padding(.top, 8)
    }
}

/// The three figures of the latest recorded run on a real iPhone, for the judges' page: answered on
/// that device, yearly-income inputs right, wrong values that reached the person. Labelled as a
/// recording, with the device and the date.
struct RecordedFigures: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        if let latest = DeviceCheckScreen.bundledRecordings.first?.file {
            let s = DeviceCheck.summarize(DeviceCheck.countedCases(latest), version: Int(latest["version"]?.numberValue ?? 3))
            VStack(alignment: .leading, spacing: 8) {
                Text(model.t("judges.recordedFigures", ["device": DeviceCheckScreen.deviceName(latest), "date": DeviceCheckScreen.recordedDate(latest, model)]))
                    .sfFont(13, weight: .semibold).foregroundStyle(theme.note)
                    .accessibilityIdentifier("judges.recordedFigures")
                figure("\(s.onDevice) / \(s.total)", model.t("deviceCheck.headline.onRecordingDevice"))
                if s.extractionCases > 0, let income = s.income {
                    figure("\(income.allRight) / \(s.extractionCases)", model.t("deviceCheck.headline.incomeRight"))
                }
                if s.extractionCases > 0, let wrong = s.wrongReachedPerson {
                    figure("\(wrong) / \(s.extractionCases)", model.t(wrong == 0 ? "deviceCheck.headline.wrongNone" : "deviceCheck.headline.wrong"))
                }
            }
            .accessibilityElement(children: .contain)
        }
    }

    private func figure(_ value: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(verbatim: value).font(Font(DesignFonts.uiFont(.display, weight: 900, size: 26))).foregroundStyle(theme.ink)
            Text(text).sfFont(13).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}
