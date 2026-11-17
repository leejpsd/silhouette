// Scoring a reading against expected values, for the on-device check: field by field, by value (a field
// is right when the placeholder answered holds the expected value, whichever placeholder that is).
// The values stay in the package; callers get field names, statuses and placeholder ids only.

import Foundation
import SilhouetteCore

public enum ReadingScore {
    public enum Status: String, Sendable { case correct, wrong, missing, spurious, absent }

    static func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 0.005 }

    /// Numbers within 0.005, anything else exactly (shared/validation/DEVICE_CHECK.md section 2).
    static func same(_ value: JSON?, _ want: JSON) -> Bool {
        switch (value, want) {
        case (.number(let a)?, .number(let b)): near(a, b)
        case (.string(let a)?, .string(let b)): a.exactlyEquals(b)
        case (.bool(let a)?, .bool(let b)): a == b
        default: false
        }
    }

    /// The deductions match as a set of amounts.
    static func sameDeductions(_ got: [JSON], _ want: [JSON]) -> Bool {
        let w = want.compactMap { $0["amount"]?.numberValue }
        let g = got.compactMap { $0["amount"]?.numberValue }
        return w.count == g.count && w.allSatisfy { a in g.contains { near($0, a) } }
    }

    /// Field-by-field status of an answer against the gold answers, by value (DEVICE_CHECK.md section 2,
    /// reference `fieldStatuses`): a gold field that is missing or null expects no value; a gold list,
    /// even an empty one, expects a list.
    public static func statuses(schema: JSON, pointers: JSON, map: Raw<PlaceholderMap>, gold: Raw<JSON>) -> [(field: String, status: Status)] {
        statuses(schema: schema, values: Rehydrator.rehydrate(schema: schema, pointers: pointers, map: map).value, gold: gold.value)
    }

    static func statuses(schema: JSON, values: JSON, gold: JSON) -> [(field: String, status: Status)] {
        (schema["properties"]?.objectValue?.keys ?? []).map { field in
            let isList = schema["properties"]?[field]?["x-kind"]?.stringValue == "list"
            let got = values[field]
            let has = isList ? !(got?.arrayValue ?? []).isEmpty : (got != nil && !(got?.isNull ?? true))
            guard let want = gold[field], !want.isNull else { return (field, has ? .spurious : .absent) }
            guard has else { return (field, .missing) }
            let right = isList ? sameDeductions(got?.arrayValue ?? [], want.arrayValue ?? []) : same(got, want)
            return (field, right ? .correct : .wrong)
        }
    }

    /// Fields right out of the fields the gold answers have (reference `scoreFields`), optionally only some fields.
    public static func score(_ statuses: [(field: String, status: Status)], gold: Raw<JSON>, only fields: Set<String>? = nil) -> (correct: Int, total: Int) {
        score(statuses, gold: gold.value, only: fields)
    }

    static func score(_ statuses: [(field: String, status: Status)], gold: JSON, only fields: Set<String>? = nil) -> (correct: Int, total: Int) {
        let expected = (gold.objectValue?.entries ?? []).filter { !$0.value.isNull && (fields?.contains($0.key) ?? true) }.map(\.key)
        let byField = Dictionary(statuses.map { ($0.field, $0.status) }, uniquingKeysWith: { a, _ in a })
        return (expected.filter { byField[$0] == .correct }.count, expected.count)
    }

    /// Every placeholder that holds the expected value of each field.
    public static func goldIds(gold rawGold: Raw<JSON>, map rawMap: Raw<PlaceholderMap>) -> [String: [String]] {
        let map = rawMap.value
        var out: [String: [String]] = [:]
        func numberIds(_ n: Double) -> [String] {
            map.entries.filter { $0.id.hasPrefix("N") && (Rehydrator.parseNumber($0.value).map { near($0, n) } ?? false) }.map(\.id)
        }
        for (field, value) in rawGold.value.objectValue?.entries ?? [] {
            switch value {
            case .number(let n): out[field] = numberIds(n)
            case .string(let s):
                let dates = map.entries.filter { $0.id.hasPrefix("D") && $0.value == s }.map(\.id)
                let words = Set(s.lowercased().split(whereSeparator: \.isWhitespace).map(String.init))
                out[field] = dates.isEmpty ? map.entries.filter { !$0.id.hasPrefix("D") && words.contains($0.value.lowercased()) }.map(\.id) : dates
            case .array(let items): out[field] = items.flatMap { $0["amount"]?.numberValue.map(numberIds) ?? [] }
            default: break
            }
        }
        return out
    }

    /// The expected values of a bundled sample: its answer key, read through the same Rehydrator.
    public static func sampleGold(_ bundle: SharedBundle, sampleId: String) -> (text: Raw<String>, gold: Raw<JSON>)? {
        guard let sample = bundle.samples.first(where: { $0.id == sampleId }),
              let key = try? SampleAnswerKeyExtractor(bundle: bundle).entries.first(where: { $0.sampleId == sampleId }),
              let allowlist = try? bundle.allowlist(for: sample.language) else { return nil }
        let result = Skeletonizer.skeletonize(sample.text, allowlist: allowlist)
        return (sample.text, Rehydrator.rehydrate(schema: bundle.paystubSchema, pointers: key.pointers, map: result.map))
    }
}
