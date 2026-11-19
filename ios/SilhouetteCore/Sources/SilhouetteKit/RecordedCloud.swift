// routing.json `recordedCloud`: the bundled English sample paystub can be read from a real cloud reading
// of its silhouette, recorded with the exact request body and the response (web/eval/results/
// cloud-recording/, bundled under `recordings/cloud/`). The response's placeholder ids are the reading;
// the values are put back on this device now and nothing is sent. The record shows the request exactly
// as it was sent when it was recorded.

import Foundation
import SilhouetteCore

public struct RecordedCloudReading: Sendable {
    /// ISO date and time of the recording.
    public let date: String
    /// The request path as it was sent (`/v1beta/projects/…/models/…:generateContent`).
    public let endpoint: String
    /// The request body as it was sent, indented for reading (the same text, keys in the same order).
    public let requestBody: String
    /// The placeholder ids the cloud answered.
    public let pointers: JSON

    /// The fields the yearly income is worked out from: a recording must agree with the sample's answer
    /// key on them before it is offered.
    public static let coreFields = ["grossPay", "ytdGross", "payFrequency", "periodStart", "periodEnd", "payDate"]

    /// The cloud model named in the request path.
    public var model: String {
        guard let r = endpoint.range(of: "models/") else { return "" }
        return String(endpoint[r.upperBound...].prefix { $0 != ":" && $0 != "/" })
    }

    /// The answer as JSON text (placeholder ids only).
    public var answer: String { pointers.prettyText }

    /// The recording's date as a calendar date (`2026-11-19`).
    public var day: String { String(date.prefix(10)) }

    public init?(json: JSON) {
        guard json["kind"]?.stringValue == "silhouette-cloud-recording", let date = json["date"]?.stringValue,
              let endpoint = json["endpoint"]?.stringValue, let body = json["requestBody"]?.stringValue,
              let pointers = json["pointers"], case .object = pointers else { return nil }
        self.date = date
        self.endpoint = endpoint
        self.requestBody = (try? JSON.parse(body))?.prettyText ?? body
        self.pointers = pointers
    }

    /// Every recording in a folder, newest first.
    public static func load(directory: URL) -> [RecordedCloudReading] {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "json" }
            .compactMap { (try? Data(contentsOf: $0)).flatMap { try? JSON.parse($0) }.flatMap(RecordedCloudReading.init(json:)) }
            .sorted { $0.date > $1.date }
    }

    /// The newest recording for this silhouette: only the bundled English sample with nothing hidden
    /// (its answer key reads it), and only a recording that agrees with the key on the income fields.
    public static func matching(_ recordings: [RecordedCloudReading], skeleton: Skeleton, language: AppLocale,
                                key: SampleAnswerKeyExtractor?) -> RecordedCloudReading? {
        guard language == .en, let entry = key?.entries.first(where: { $0.sampleId == "paystub-en-01" && $0.language == .en }),
              entry.skeleton.text.exactlyEquals(skeleton.text) else { return nil }
        return recordings.first { r in
            coreFields.allSatisfy { f in (r.pointers[f] ?? .null).isIdentical(to: entry.pointers[f] ?? .null) }
        }
    }

    /// The reading, as an extractor's result.
    public var result: PointerResult { PointerResult(pointers: pointers, source: .recordedCloud, reason: .recordedInCloud) }
}

extension JSON {
    /// `JSON.stringify(value, null, 2)`: two spaces per level, keys in their order.
    public var prettyText: String {
        var out = ""
        writePretty(to: &out, indent: "")
        return out
    }

    private func writePretty(to out: inout String, indent: String) {
        let inner = indent + "  "
        switch self {
        case .array(let items) where !items.isEmpty:
            out += "[\n"
            for (i, item) in items.enumerated() {
                out += inner
                item.writePretty(to: &out, indent: inner)
                out += i < items.count - 1 ? ",\n" : "\n"
            }
            out += indent + "]"
        case .object(let object) where !object.entries.isEmpty:
            out += "{\n"
            for (i, entry) in object.entries.enumerated() {
                out += inner + JSON.string(entry.key).jsonText + ": "
                entry.value.writePretty(to: &out, indent: inner)
                out += i < object.entries.count - 1 ? ",\n" : "\n"
            }
            out += indent + "}"
        default:
            out += jsonText
        }
    }
}
