// routing.json `recordedSample` on iOS (contract v1.44): the bundled English sample paystub read from the
// on-device model's own recorded answer, made on an iPhone by the on-device check (eval/on-device/, bundled
// under `recordings/`). The recorded answer of each part is replayed through the same reading rules as a
// live reading on this device (DEVICE_READING.md), so a value the checks would leave out is left out now too.
// The values are put back on this device; nothing is sent. Labelled as a recording with the iPhone and the date.
//
// Then the two answers, the device's and the cloud's, compared value by value after both are put back.

import Foundation
import SilhouetteCore

public struct RecordedDeviceReading: Sendable {
    /// ISO date and time of the run.
    public let date: String
    /// The run file's name (`device-check-…json`).
    public let fileName: String
    /// The device model identifier in the run (`iPhone18,1`), when it has one.
    public let deviceId: String?
    /// The on-device model named in the run.
    public let onDeviceModel: String?
    /// The case's recorded answer of each part, as the device gave it.
    let answers: [DeviceReading.Part: String]

    /// The case of the on-device check that reads the bundled sample paystub.
    public static let sampleCaseId = "pointers: bundled sample"

    /// The run's date as a calendar date (`2026-11-19`).
    public var day: String { String(date.prefix(10)) }

    /// The first reading of the bundled sample in a run file that was answered on the device, with every
    /// part's answer recorded. Nil for any other file.
    public init?(file json: JSON, fileName: String) {
        guard DeviceCheck.isRunFile(json), let date = json["date"]?.stringValue else { return nil }
        let found = (json["cases"]?.arrayValue ?? []).first { c in
            c["id"]?.stringValue == Self.sampleCaseId && c["task"]?.stringValue == "document.pointer.extract"
                && c["ran"]?.stringValue == "ON_DEVICE" && !(c["device"]?["passes"]?.arrayValue ?? []).isEmpty
        }
        guard let found else { return nil }
        var answers: [DeviceReading.Part: String] = [:]
        for p in found["device"]?["passes"]?.arrayValue ?? [] {
            guard let part = DeviceReading.Part(rawValue: p["part"]?.stringValue ?? ""), let text = p["rawText"]?.stringValue,
                  !text.isEmpty else { continue }
            answers[part] = text
        }
        guard answers[.core] != nil else { return nil }
        self.date = date
        self.fileName = fileName
        self.deviceId = json["device"]?["model"]?.stringValue
            ?? json["userAgent"]?.stringValue.flatMap { ua in ua.firstMatch(of: /iPhone\d+,\d+/).map { String($0.output) } }
        self.onDeviceModel = json["device"]?["onDeviceModel"]?.stringValue
        self.answers = answers
    }

    /// Every run in a folder with a usable reading of the sample, newest first.
    public static func load(directory: URL) -> [RecordedDeviceReading] {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" && $0.lastPathComponent.hasPrefix("device-check-") }
            .compactMap { url in
                (try? Data(contentsOf: url)).flatMap { try? JSON.parse($0) }
                    .flatMap { RecordedDeviceReading(file: $0, fileName: url.lastPathComponent) }
            }
            .sorted { $0.date > $1.date }
    }

    /// The recorded answers replayed under the reading rules on this silhouette. Nil when the rules would not
    /// keep the reading on the device (it would have gone to the cloud) or an answer the rules ask for was
    /// not recorded.
    public func replay(schema: JSON, silhouette: SkeletonResult, jurisdiction: String, language: AppLocale) async -> PointerResult? {
        var answers = self.answers
        // A part the recording does not have gets the recorded answer of the part it replaces.
        if answers[.deductionsAgain] == nil { answers[.deductionsAgain] = answers[.deductions] }
        guard let reading = try? await DeviceReading.read(schema: schema, skeleton: silhouette.skeleton.text, map: silhouette.map,
                                                          jurisdiction: jurisdiction, language: language.rawValue, answers: answers),
              case .onDevice(let pointers, let notRead) = reading.outcome else { return nil }
        return PointerResult(pointers: pointers, source: .recordedDevice, reason: .recordedOnDevice, notRead: notRead)
    }

    /// The newest recording for this silhouette, replayed: only the bundled English sample with nothing hidden
    /// (its answer key reads it), and only a reading that agrees with the key on the income fields.
    public static func matching(_ recordings: [RecordedDeviceReading], silhouette: SkeletonResult, language: AppLocale,
                                key: SampleAnswerKeyExtractor?, schema: JSON, jurisdiction: String) async
        -> (recording: RecordedDeviceReading, result: PointerResult)? {
        guard language == .en, let entry = key?.entries.first(where: { $0.sampleId == "paystub-en-01" && $0.language == .en }),
              entry.skeleton.text.exactlyEquals(silhouette.skeleton.text) else { return nil }
        for recording in recordings {
            guard let result = await recording.replay(schema: schema, silhouette: silhouette, jurisdiction: jurisdiction, language: language)
            else { continue }
            let agrees = RecordedCloudReading.coreFields.allSatisfy { f in
                (result.pointers[f] ?? .null).isIdentical(to: entry.pointers[f] ?? .null)
            }
            if agrees { return (recording, result) }
        }
        return nil
    }
}

// MARK: - Read both ways

/// The device's answer and the cloud's answer to the same silhouette, compared value by value after each was
/// put back on this device (contract v1.44, `review.both.*`).
public struct BothWaysComparison: Sendable {
    public struct Row: Sendable, Identifiable {
        /// Pointer schema property, or `deductions`.
        public let field: String
        /// The placeholder each answered for a single-valued field (`N12`), when it did.
        public let deviceRef: String?
        public let cloudRef: String?
        /// Whether both put back the same value (both answered).
        public let same: Bool
        /// Whether each answered at all (after the reading rules).
        public let deviceAnswered: Bool
        public let cloudAnswered: Bool
        public var id: String { field }
    }

    /// Every field either answered, in the review's order (schema order, deductions last).
    public let rows: [Row]

    public var total: Int { rows.count }
    public var sameCount: Int { rows.filter(\.same).count }
    public var differing: [String] { rows.filter { !$0.same }.map(\.field) }

    /// `device` and `cloud`: the same document with each reading applied.
    public init(device: DocumentSession, cloud: DocumentSession) {
        func ref(_ pointers: JSON?, _ name: String) -> String? { pointers?[name]?.stringValue.flatMap { $0.first.map { "NDW".contains($0) } == true ? $0 : nil } }
        var rows: [Row] = []
        let cloudFields = Dictionary(cloud.fieldsForDisplay.map { ($0.name, $0) }, uniquingKeysWith: { a, _ in a })
        for d in device.fieldsForDisplay {
            let c = cloudFields[d.name]
            let dv = d.found ? d.value : nil
            let cv = (c?.found ?? false) ? c?.value : nil
            guard dv != nil || cv != nil else { continue }
            rows.append(Row(field: d.name, deviceRef: dv == nil ? nil : ref(device.pointers, d.name), cloudRef: cv == nil ? nil : ref(cloud.pointers, d.name),
                            same: dv != nil && dv == cv, deviceAnswered: dv != nil, cloudAnswered: cv != nil))
        }
        let dd = device.deductionsForDisplay.filter(\.found).map { "\($0.amount.map { String($0) } ?? "")|\($0.kind ?? "")" }
        let cd = cloud.deductionsForDisplay.filter(\.found).map { "\($0.amount.map { String($0) } ?? "")|\($0.kind ?? "")" }
        if !dd.isEmpty || !cd.isEmpty {
            rows.append(Row(field: "deductions", deviceRef: nil, cloudRef: nil, same: !dd.isEmpty && dd.sorted() == cd.sorted(),
                            deviceAnswered: !dd.isEmpty, cloudAnswered: !cd.isEmpty))
        }
        self.rows = rows
    }
}

extension DocumentSession {
    /// The same layout from silhouette text that left (a request's or a recording's), placeholders only.
    public static func segments(cloudText: CloudText) -> [PreviewSegment] { segments(cloudText.text, map: nil) }

    /// Numbers, dates and words a silhouette's text replaced by placeholders (each placeholder counted once).
    public static func counts(cloudText: CloudText) -> (numbers: Int, dates: Int, words: Int) {
        let ids = DeviceReading.placeholderIds(cloudText.text)
        return (ids["N"]?.count ?? 0, ids["D"]?.count ?? 0, ids["W"]?.count ?? 0)
    }
}
