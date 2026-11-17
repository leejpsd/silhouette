// Scoring a reading against expected values, for the on-device check: field by field, by value (a field
// is right when the placeholder answered holds the expected value, whichever placeholder that is).
// The values stay in the package; callers get field names, statuses and placeholder ids only.

import Foundation
import SilhouetteCore

public enum ReadingScore {
    public enum Status: String, Sendable { case correct, wrong, missing, spurious, absent }

    static func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 0.005 }

    static func same(_ value: JSON?, _ want: JSON) -> Bool {
        switch (value, want) {
        case (.number(let a)?, .number(let b)): near(a, b)
        case (.string(let a)?, .string(let b)): a.split(whereSeparator: \.isWhitespace) == b.split(whereSeparator: \.isWhitespace)
        default: false
        }
    }

    /// The deductions match as a set of amounts.
    static func sameDeductions(_ got: [JSON], _ want: [JSON]) -> Bool {
        let w = want.compactMap { $0["amount"]?.numberValue }
        let g = got.compactMap { $0["amount"]?.numberValue }
        return w.count == g.count && w.allSatisfy { a in g.contains { near($0, a) } }
    }

    /// Field-by-field outcome of an answer against the expected values (as the review would show it).
    public static func statuses(schema: JSON, pointers: JSON, map: Raw<PlaceholderMap>, gold: Raw<JSON>) -> [(field: String, status: Status)] {
        let values = Rehydrator.rehydrate(schema: schema, pointers: pointers, map: map).value
        let gold = gold.value
        return (schema["properties"]?.objectValue?.keys ?? []).map { field in
            let isList = schema["properties"]?[field]?["x-kind"]?.stringValue == "list"
            let got = values[field]
            let has = isList ? !(got?.arrayValue ?? []).isEmpty : got != nil
            guard let want = gold[field], !want.isNull, !(isList && (want.arrayValue ?? []).isEmpty) else { return (field, has ? .spurious : .absent) }
            guard has else { return (field, .missing) }
            let right = isList ? sameDeductions(got?.arrayValue ?? [], want.arrayValue ?? []) : same(got, want)
            return (field, right ? .correct : .wrong)
        }
    }

    /// Fields right out of the fields with an expected value (optionally only some fields).
    public static func score(_ statuses: [(field: String, status: Status)], only fields: Set<String>? = nil) -> (correct: Int, total: Int) {
        let counted = statuses.filter { s in (fields?.contains(s.field) ?? true) && s.status != .absent && s.status != .spurious }
        return (counted.filter { $0.status == .correct }.count, counted.count)
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
