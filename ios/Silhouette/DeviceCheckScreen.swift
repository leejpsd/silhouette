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

    /// Run files bundled with the app (recordings made elsewhere), newest first.
    static var bundledRecordings: [(name: String, file: JSON)] {
        let urls = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: nil) ?? []
        return urls.filter { $0.lastPathComponent.hasPrefix("device-check-") }
            .compactMap { url in (try? JSON.parse(Data(contentsOf: url))).flatMap { DeviceCheck.isRunFile($0) ? (url.lastPathComponent, $0) : nil } }
            .sorted { ($0.file["date"]?.stringValue ?? "") > ($1.file["date"]?.stringValue ?? "") }
    }

    var body: some View {
        let shown: JSON? = recording?.file ?? run?.file ?? run.map { r in .object(JSONObject([("version", .number(3)), ("cases", .array(r.cases))])) }
        Screen {
            BackLink(label: model.t("nav.home"), id: "deviceCheck.home") { model.goHome() }
                .padding(.bottom, -8)
            DisplayHeadline(text: model.t(recording == nil ? "deviceCheck.title" : "deviceCheck.titleRecording"), role: .title, size: 50, maxLines: 3)
                .accessibilityIdentifier("deviceCheck.title")
            if let recording {
                Text(model.t("deviceCheck.recordingMeta", ["date": String((recording.file["date"]?.stringValue ?? "").prefix(10)),
                                                           "browser": recording.file["browser"]?.stringValue ?? "",
                                                           "platform": recording.file["platform"]?.stringValue ?? ""]))
                    .type(.bodyStrong).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("deviceCheck.recordingMeta")
            }
            if let shown, !(shown["cases"]?.arrayValue ?? []).isEmpty { headlines(shown) }
            if recording != nil {
                DashedNote { Text(model.t("deviceCheck.recordingNote")) }.accessibilityIdentifier("deviceCheck.recordingNote")
            }
            Para(model.t("deviceCheck.lead"))
            Para(model.t("deviceCheck.cloudNote"), .small)
            if !available {
                DashedNote { Text(model.t("deviceCheck.noModel")) }.accessibilityIdentifier("deviceCheck.noModel")
            }
            if recording == nil && available {
                Toggle(model.t("deviceCheck.repeat"), isOn: $repeatCases)
                    .type(.small)
                    .tint(theme.ink)
                    .disabled(run?.running == true)
                    .accessibilityIdentifier("deviceCheck.repeat")
            }
            if let run, recording == nil {
                Para(run.running ? model.t("deviceCheck.running", ["n": String(run.current), "total": String(run.total)]) : model.t("deviceCheck.done"), .small)
                    .accessibilityIdentifier("deviceCheck.status")
            }
            if let shown, !(shown["cases"]?.arrayValue ?? []).isEmpty { summary(shown); caseList(shown) }
            recordings
        } actions: {
            if recording != nil {
                BlockAction(label: model.t("deviceCheck.live"), id: "deviceCheck.live") { recording = nil }
            } else if let file = run?.file, let url = Self.write(file) {
                ShareLink(item: url) {
                    Label(model.t("deviceCheck.download"), systemImage: "square.and.arrow.up")
                }
                .buttonStyle(SecondaryStyle())
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("deviceCheck.share")
                BlockAction(label: model.t("deviceCheck.run"), id: "deviceCheck.run") { start() }
                    .disabled(!available || run?.running == true)
            } else {
                BlockAction(label: model.t("deviceCheck.run"), id: "deviceCheck.run") { start() }
                    .disabled(!available || run?.running == true)
            }
        }
        .onAppear {
            // The fast snapshot capture opens this screen running, or showing the bundled recording.
            if model.snapshotDeviceCheck == "run" { start() }
            if model.snapshotDeviceCheck == "recording", let r = Self.bundledRecordings.first { recording = (r.file, r.name) }
            model.snapshotDeviceCheck = nil
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

    /// Writes a run file to a temporary file named as the Web app names them, for the share sheet.
    static func write(_ file: JSON) -> URL? {
        let name = DeviceCheck.fileName(date: file["date"]?.stringValue ?? "", browser: file["browser"]?.stringValue ?? "",
                                        platform: file["platform"]?.stringValue ?? "")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        guard (try? Data((file.jsonText + "\n").utf8).write(to: url)) != nil else { return nil }
        return url
    }

    // MARK: Parts

    private func headlines(_ file: JSON) -> some View {
        let s = DeviceCheck.summarize(file)
        return VStack(alignment: .leading, spacing: 10) {
            headline("\(s.onDevice) / \(s.total)", model.t("deviceCheck.headline.onDevice"))
            if s.readings > 0 {
                headline("\(s.incomeRight) / \(s.readings)", model.t("deviceCheck.headline.incomeRight")
                         + (s.incomeNotFound > 0 ? " " + model.t("deviceCheck.headline.notFound", ["count": String(s.incomeNotFound)]) : ""))
                if let wrong = s.wrongReachedPerson {
                    headline("\(wrong) / \(s.readings)", model.t(wrong == 0 ? "deviceCheck.headline.wrongNone" : "deviceCheck.headline.wrong"))
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("deviceCheck.headlines")
    }

    private func headline(_ figure: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(verbatim: figure).type(.heading).foregroundStyle(theme.ink)
            Text(text).type(.small).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private func summary(_ file: JSON) -> some View {
        let s = DeviceCheck.summarize(file)
        return VStack(alignment: .leading, spacing: 6) {
            Para(model.t("deviceCheck.summary", ["onDevice": String(s.onDevice), "total": String(s.total), "afterDevice": String(s.afterDevice),
                                                 "inCloud": String(s.inCloud), "notRun": String(s.notRun)]), .small)
            if s.readings > 0 {
                if s.repetitions > 1 { Para(model.t("deviceCheck.summaryRepetitions", ["repetitions": String(s.repetitions)]), .small) }
                Para(model.t("deviceCheck.summaryIncomeSplit", ["total": String(s.readings), "right": String(s.incomeRight),
                                                                "notFound": String(s.incomeNotFound), "wrong": String(s.incomeWrong)]), .small)
                if let wrong = s.wrongReachedPerson {
                    Para(model.t("deviceCheck.summaryWrong", ["wrong": String(wrong), "total": String(s.readings)]), .small)
                }
                if s.deductionsNotRead > 0 { Para(model.t("deviceCheck.summaryNotRead", ["count": String(s.deductionsNotRead)]), .small) }
                Para(model.t("deviceCheck.wrongMustBeZero"), .small, muted: true)
            }
        }
        .accessibilityIdentifier("deviceCheck.summary")
    }

    private func ranLabel(_ c: JSON, version: Int) -> String {
        let ran = DeviceCheck.finalRan(c, version: version)
        if ran == "IN_CLOUD" && c["final"]?["retried"]?.boolValue == true { return model.t("deviceCheck.ran.afterDevice") }
        return model.t("deviceCheck.ran.\(ran)")
    }

    private func caseList(_ file: JSON) -> some View {
        let version = Int(file["version"]?.numberValue ?? 3)
        let cases = file["cases"]?.arrayValue ?? []
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(cases.enumerated()), id: \.offset) { _, c in
                Rectangle().fill(theme.line).frame(height: 1)
                VStack(alignment: .leading, spacing: 4) {
                    let rep = c["repetition"]?.numberValue.map { " · " + model.t("deviceCheck.repetition", ["n": String(Int($0)), "of": String(Int(file["repetitions"]?.numberValue ?? 1))]) } ?? ""
                    Text((c["id"]?.stringValue ?? "") + rep).type(.label).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    Text("\(model.t("deviceCheck.col.mode")): \(c["mode"]?.stringValue ?? "") · \(model.t("deviceCheck.col.ran")): \(ranLabel(c, version: version))")
                        .type(.caption).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    let time = c["latencyMs"]?.numberValue.map { String(format: "%.1f s", $0 / 1000) } ?? "–"
                    let check = c["outputCheck"]?.stringValue ?? "–"
                    let fields = c["final"]?["fields"].map { "\(Int($0["correct"]?.numberValue ?? 0)) / \(Int($0["total"]?.numberValue ?? 0))" } ?? "–"
                    Text("\(model.t("deviceCheck.col.time")): \(time) · \(model.t("deviceCheck.col.check")): \(check) · \(model.t("deviceCheck.col.fields")): \(fields)")
                        .type(.caption).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    ForEach(Array((c["device"]?["passes"]?.arrayValue ?? []).enumerated()), id: \.offset) { _, p in
                        let seconds = String(format: "%.1f", (p["latencyMs"]?.numberValue ?? 0) / 1000)
                        let problems = (p["problems"]?.arrayValue ?? []).compactMap(\.stringValue)
                        let marked = (p["marked"]?.arrayValue ?? []).compactMap(\.stringValue)
                        Text(model.t("deviceCheck.pass", ["part": p["part"]?.stringValue ?? "", "time": seconds])
                             + (problems.isEmpty ? "" : " " + problems.joined(separator: ", "))
                             + (marked.isEmpty ? "" : " · " + model.t("deviceCheck.marked", ["problems": marked.joined(separator: ", ")])))
                            .type(.monoValue, size: 11.5).foregroundStyle(theme.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    if let notRead = c["final"]?["notRead"]?.arrayValue, notRead.contains(where: { $0.stringValue == "deductions" }) {
                        Text(model.t("deviceCheck.deductionsNotRead")).type(.caption).foregroundStyle(theme.inkMuted)
                    }
                    if let note = c["error"]?.stringValue ?? c["note"]?.stringValue {
                        Text("\(model.t("deviceCheck.col.note")): \(note)").type(.caption).foregroundStyle(theme.inkMuted).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.vertical, 10)
                .accessibilityElement(children: .combine)
            }
        }
        .accessibilityIdentifier("deviceCheck.cases")
    }

    private var recordings: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionHeading(text: model.t("deviceCheck.recordings"))
            let bundled = Self.bundledRecordings
            if bundled.isEmpty { Para(model.t("deviceCheck.noRecording"), .small) }
            ForEach(bundled, id: \.name) { r in
                Button(model.t("deviceCheck.showRecording", ["date": String((r.file["date"]?.stringValue ?? "").prefix(10))])) {
                    recording = (r.file, r.name)
                }
                .buttonStyle(TextLinkStyle())
                .accessibilityIdentifier("deviceCheck.recording")
            }
            Button(model.t("deviceCheck.open")) { opening = true }
                .buttonStyle(TextLinkStyle())
                .accessibilityIdentifier("deviceCheck.open")
            if badFile { Para(model.t("deviceCheck.badFile"), .small) }
        }
        .padding(.top, 8)
    }
}
