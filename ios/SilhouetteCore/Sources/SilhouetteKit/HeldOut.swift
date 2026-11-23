// The held-out paystubs read on this device (web/eval/heldout/, frozen before measuring: its FROZEN.md):
// the 24 paystubs `hp-*`, each read as the app reads a document, and the run file in the shape the web's
// held-out run writes (web/eval/heldout-device.ts), so web/eval/heldout-score.mjs scores it unchanged.
// The documents and their answer keys are synthetic, so the run file records the values the person would
// be shown, as the web's does; no other reading records a value. The figures of a run are scored here the
// way heldout-score.mjs scores them: names word for word, every other field by value.

import Foundation
import SilhouetteCore

/// One held-out paystub: its text (kept as Raw like any document) and its answer key.
public struct HeldOutDocument: Sendable {
    public let id: String
    public let layout: String
    public let text: Raw<String>
    /// The answer key as written in `<id>.gold.json` (names as printed).
    public let gold: JSON
}

public enum HeldOut {
    public static let kind = "silhouette-heldout-device"
    public static let set = "heldout"
    public static let paystubFields = ["employerName", "employeeName", "payFrequency", "payDate", "periodStart", "periodEnd",
                                       "grossPay", "netPay", "ytdGross", "hoursWorked", "hourlyRate", "deductions"]
    static let names: Set<String> = ["employerName", "employeeName"]

    // MARK: The set

    /// The paystubs of a held-out folder (`hp-*.txt` with `hp-*.gold.json`), in file order. The W-2s (`hw-*`)
    /// are not part of it: their checks were changed after they were read, so they are no longer held out.
    public static func load(directory: URL) -> [HeldOutDocument] {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "txt" && $0.lastPathComponent.hasPrefix("hp-") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { url in
                let id = url.deletingPathExtension().lastPathComponent
                guard let text = try? String(contentsOf: url, encoding: .utf8),
                      let gold = (try? Data(contentsOf: directory.appendingPathComponent("\(id).gold.json"))).flatMap({ try? JSON.parse($0) })
                else { return nil }
                let layout = id.replacingOccurrences(of: #"-\d+$"#, with: "", options: .regularExpression)
                return HeldOutDocument(id: id, layout: layout, text: Raw(text), gold: gold)
            }
    }

    /// The answer keys by document id, for scoring a run file.
    public static func golds(_ documents: [HeldOutDocument]) -> [String: JSON] {
        Dictionary(documents.map { ($0.id, $0.gold) }, uniquingKeysWith: { a, _ in a })
    }

    // MARK: One reading

    /// Everything the device answered, part by part, merged (deductions then left out as not read included).
    static func deviceAnswer(_ attempt: DeviceAttempt) -> JSON? {
        let parts = attempt.passes.compactMap(\.value)
        guard !parts.isEmpty else { return nil }
        var merged = JSONObject()
        for p in parts { for (k, v) in p.objectValue?.entries ?? [] { merged[k] = v } }
        return .object(merged)
    }

    /// The values the review would show for a pointer answer, field by field (null when empty; the
    /// deductions as their items). Synthetic documents only.
    static func values(schema: JSON, pointers: JSON, map: Raw<PlaceholderMap>) -> JSON {
        let rehydrated = Rehydrator.rehydrate(schema: schema, pointers: pointers, map: map).value
        var out = JSONObject()
        for field in schema["properties"]?.objectValue?.keys ?? [] {
            let isList = schema["properties"]?[field]?["x-kind"]?.stringValue == "list"
            out[field] = rehydrated[field] ?? (isList ? .array([]) : .null)
        }
        return .object(out)
    }

    static func statusObject(_ statuses: [(field: String, status: ReadingScore.Status)]) -> JSON {
        .object(JSONObject(statuses.map { ($0.field, JSON.string($0.status.rawValue)) }))
    }

    static func fieldsObject(_ s: (correct: Int, total: Int)) -> JSON {
        .object(JSONObject([("correct", .number(Double(s.correct))), ("total", .number(Double(s.total)))]))
    }

    /// The record of one reading, as web/eval/heldout-device.ts writes it: where it was answered, whether the
    /// device's answer failed its checks and was read again in the cloud, the time, the device's first answer
    /// and what the person is shown, each with statuses, fields right and values.
    public static func record(_ doc: HeldOutDocument, schema: JSON, map: Raw<PlaceholderMap>, outcome: PointerOutcome, latencyMs: Double) -> JSON {
        let gold = Raw(doc.gold)
        let statusesOf = { (pointers: JSON) in ReadingScore.statuses(schema: schema, pointers: pointers, map: map, gold: gold) }
        var o = JSONObject([("id", .string(doc.id)), ("docType", .string("paystub")), ("layout", .string(doc.layout))])
        o["ran"] = .string(outcome.source == .onDevice ? "ON_DEVICE" : "IN_CLOUD")
        o["retried"] = .bool(outcome.reason == .onDeviceFailed)
        o["latencyMs"] = .number(latencyMs.rounded())
        o["device"] = outcome.attempt.map { device($0, statusesOf: statusesOf, schema: schema, map: map, gold: gold) } ?? .null
        let finalStatuses = statusesOf(outcome.pointers)
        var final = JSONObject()
        final["statuses"] = statusObject(finalStatuses)
        final["values"] = values(schema: schema, pointers: outcome.pointers, map: map)
        final["fields"] = fieldsObject(ReadingScore.score(finalStatuses, gold: gold))
        final["leftOut"] = .array([])
        final["wrongFields"] = .array(DeviceCheck.wrongFields(finalStatuses).map(JSON.string))
        final["notRead"] = .array(outcome.notRead.map(JSON.string))
        final["deductionsNotRead"] = .bool(outcome.notRead.contains("deductions"))
        o["final"] = .object(final)
        o["note"] = .string(outcome.reason.rawValue)
        return .object(o)
    }

    /// The record of a reading that did not run to the end: the error, and the device's answer when it gave one.
    public static func failed(_ doc: HeldOutDocument, schema: JSON, map: Raw<PlaceholderMap>, error: String, attempt: DeviceAttempt?, latencyMs: Double) -> JSON {
        let gold = Raw(doc.gold)
        let statusesOf = { (pointers: JSON) in ReadingScore.statuses(schema: schema, pointers: pointers, map: map, gold: gold) }
        var o = JSONObject([("id", .string(doc.id)), ("docType", .string("paystub")), ("layout", .string(doc.layout))])
        o["ran"] = .string("not-run")
        o["retried"] = .bool(false)
        o["latencyMs"] = .number(latencyMs.rounded())
        o["error"] = .string(String(error.prefix(600)))
        o["device"] = attempt.map { device($0, statusesOf: statusesOf, schema: schema, map: map, gold: gold) } ?? .null
        return .object(o)
    }

    private static func device(_ attempt: DeviceAttempt, statusesOf: (JSON) -> [(field: String, status: ReadingScore.Status)],
                               schema: JSON, map: Raw<PlaceholderMap>, gold: Raw<JSON>) -> JSON {
        let first = deviceAnswer(attempt)
        var d = JSONObject()
        d["answered"] = .bool(first != nil)
        d["problems"] = .array(attempt.problems.map(JSON.string))
        d["statuses"] = first.map { statusObject(statusesOf($0)) } ?? .null
        d["fields"] = first.map { fieldsObject(ReadingScore.score(statusesOf($0), gold: gold)) } ?? .null
        d["values"] = first.map { values(schema: schema, pointers: $0, map: map) } ?? .null
        d["passes"] = .array(attempt.passes.map(DeviceCheck.passRecord))
        return .object(d)
    }

    // MARK: The run file

    public static func runFile(date: String, browser: String, platform: String, userAgent: String, availability: [(String, String)],
                               device: JSON, documents: [JSON]) -> JSON {
        .object(JSONObject([
            ("kind", .string(kind)), ("set", .string(set)), ("date", .string(date)), ("browser", .string(browser)),
            ("platform", .string(platform)), ("userAgent", .string(userAgent)),
            ("availability", .object(JSONObject(availability.map { ($0.0, JSON.string($0.1)) }))),
            ("device", device), ("documents", .array(documents)),
        ]))
    }

    /// `heldout-device-2026-11-23T1030-silhouette0-ios2652.json`: the on-device check's name with its own prefix.
    public static func fileName(_ file: JSON) -> String {
        "heldout-" + DeviceCheck.fileName(file).replacingOccurrences(of: "device-check-", with: "device-")
    }

    public static func isRunFile(_ json: JSON) -> Bool {
        json["kind"]?.stringValue == kind && json["documents"]?.arrayValue != nil && json["date"]?.stringValue != nil
    }

    // MARK: Scoring (web/eval/heldout-score.mjs)

    static let notWord = try! NSRegularExpression(pattern: #"[^\p{L}\p{N}\s'-]"#)
    static let spaces = try! NSRegularExpression(pattern: #"\s+"#)

    /// A name as words: punctuation that is not part of a word removed ("INC." and "INC" are the same).
    static func words(_ s: String) -> String {
        let r = { (re: NSRegularExpression, s: String) in re.stringByReplacingMatches(in: s, range: NSRange(s.startIndex..., in: s), withTemplate: " ") }
        return r(spaces, r(notWord, s)).trimmingCharacters(in: .whitespaces)
    }

    static func empty(_ v: JSON?) -> Bool {
        switch v {
        case nil, .null?: true
        case .array(let a)?: a.isEmpty
        case .string(let s)?: s.isEmpty
        default: false
        }
    }

    /// One field's status, names word for word (heldout-score.mjs `status` with `wordForm`).
    static func status(_ field: String, gold: JSON?, got: JSON?) -> ReadingScore.Status {
        if empty(gold) { return empty(got) ? .absent : .spurious }
        if empty(got) { return .missing }
        if field == "deductions" {
            let want = (gold?.arrayValue ?? []).map { $0.numberValue ?? $0["amount"]?.numberValue }
            let have = (got?.arrayValue ?? []).map { $0.numberValue ?? $0["amount"]?.numberValue }
            let amounts = have.compactMap { $0 }
            let right = want.count == have.count && want.allSatisfy { w in
                guard let w else { return false }
                return amounts.contains { abs($0 - w) < 0.005 }
            }
            return right ? .correct : .wrong
        }
        if case .number(let g)? = gold { return got?.numberValue.map { abs($0 - g) < 0.005 } == true ? .correct : .wrong }
        if names.contains(field), let g = gold?.stringValue, let h = got?.stringValue { return words(h) == words(g) ? .correct : .wrong }
        return got?.stringValue != nil && got?.stringValue == gold?.stringValue ? .correct : .wrong
    }

    static func ok(_ s: ReadingScore.Status) -> Bool { s == .correct || s == .absent }

    /// The figures of a run, paystubs only, as heldout-score.mjs reports them.
    public struct Figures: Sendable {
        /// One paystub's line: where it was answered, the time, fields right first and as shown, and the
        /// fields shown wrong (names word for word).
        public struct Row: Sendable {
            public let id: String, layout: String, ran: String, retried: Bool
            public let latencyMs: Double?
            public let first: (correct: Int, total: Int)?
            public let shown: (correct: Int, total: Int)
            public let wrong: [String]
        }
        public var rows: [Row] = []
        public var documents = 0
        public var onDevice = 0, inCloud = 0, retried = 0, notRun = 0
        /// What the person is shown: readings with every yearly-income input right, with any of them wrong,
        /// with any value wrong; fields right of the fields the answer keys have.
        public var incomeAllRight = 0, incomeWrong = 0, wrongShown = 0, allRight = 0
        public var finalCorrect = 0, finalTotal = 0
        /// The device's first answer, before its checks.
        public var firstCorrect = 0, firstTotal = 0, firstIncomeWrong = 0
        /// Time per paystub from start to the answer shown, retries included (milliseconds).
        public var medianMs: Double?, minMs: Double?, maxMs: Double?
    }

    public static func figures(_ file: JSON, golds: [String: JSON]) -> Figures {
        let docs = (file["documents"]?.arrayValue ?? []).filter { $0["docType"]?.stringValue == "paystub" }
        var f = Figures()
        f.documents = docs.count
        var times: [Double] = []
        for d in docs {
            let ran = d["ran"]?.stringValue
            if ran == "ON_DEVICE" { f.onDevice += 1 }
            if ran == "IN_CLOUD" { f.inCloud += 1 }
            if ran == "not-run" { f.notRun += 1 }
            if d["retried"]?.boolValue == true { f.retried += 1 }
            if let t = d["latencyMs"]?.numberValue { times.append(t) }
            let gold = golds[d["id"]?.stringValue ?? ""] ?? .object(JSONObject())
            func statuses(_ values: JSON?) -> [String: ReadingScore.Status] {
                Dictionary(uniqueKeysWithValues: paystubFields.map { field in
                    (field, values.map { v in status(field, gold: gold[field], got: v[field]) } ?? (empty(gold[field]) ? .absent : .missing))
                })
            }
            // As the scorer does: no values at all means every field is missing.
            let final = d["final"]?["values"].flatMap { $0.isNull ? nil : $0 }
            let first = d["device"]?["values"].flatMap { $0.isNull ? nil : $0 }
            let fs = final.map { statuses($0) } ?? Dictionary(uniqueKeysWithValues: paystubFields.map { ($0, ReadingScore.Status.missing) })
            let ds = first.map { statuses($0) } ?? Dictionary(uniqueKeysWithValues: paystubFields.map { ($0, ReadingScore.Status.missing) })
            let wrong = { (s: ReadingScore.Status?) in s == .wrong || s == .spurious }
            if DeviceCheck.incomeInputs.allSatisfy({ ok(fs[$0] ?? .missing) }) { f.incomeAllRight += 1 }
            if DeviceCheck.incomeInputs.contains(where: { wrong(fs[$0]) }) { f.incomeWrong += 1 }
            if DeviceCheck.incomeInputs.contains(where: { wrong(ds[$0]) }) { f.firstIncomeWrong += 1 }
            if paystubFields.contains(where: { wrong(fs[$0]) }) { f.wrongShown += 1 }
            if paystubFields.allSatisfy({ ok(fs[$0] ?? .missing) }) { f.allRight += 1 }
            let expected = paystubFields.filter { !empty(gold[$0]) }
            let shown = (expected.filter { fs[$0] == .correct }.count, expected.count)
            let firstRight = (expected.filter { ds[$0] == .correct }.count, expected.count)
            f.finalCorrect += shown.0; f.finalTotal += shown.1
            f.firstCorrect += firstRight.0; f.firstTotal += firstRight.1
            f.rows.append(Figures.Row(id: d["id"]?.stringValue ?? "", layout: d["layout"]?.stringValue ?? "", ran: ran ?? "not-run",
                                      retried: d["retried"]?.boolValue == true, latencyMs: d["latencyMs"]?.numberValue,
                                      first: first == nil ? nil : firstRight, shown: shown, wrong: paystubFields.filter { wrong(fs[$0]) }))
        }
        if !times.isEmpty {
            let sorted = times.sorted()
            let mid = sorted.count / 2
            f.medianMs = sorted.count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
            f.minMs = sorted.first
            f.maxMs = sorted.last
        }
        return f
    }

    // MARK: The scripted model of UI tests

    /// Right pointers for a held-out paystub, built from its answer key, for the scripted model of UI tests
    /// and snapshots: each amount and date at the first placeholder that holds it. The names are left out (a
    /// name is several words, and the scripted model needs none). Returns the silhouette text the prompt
    /// carries, to find the document by.
    public static func scriptedAnswer(_ doc: HeldOutDocument, allowlist: Allowlist) -> (skeleton: String, pointers: JSON) {
        let result = Skeletonizer.skeletonize(doc.text, allowlist: allowlist)
        let map = result.map.value
        func number(_ n: Double) -> JSON? {
            map.entries.first { $0.id.hasPrefix("N") && (Rehydrator.parseNumber($0.value).map { abs($0 - n) < 0.005 } ?? false) }.map { .string($0.id) }
        }
        var o = JSONObject()
        for (field, value) in doc.gold.objectValue?.entries ?? [] where !names.contains(field) {
            switch value {
            case .number(let n): o[field] = number(n)
            case .string(let s):
                if field == "payFrequency" { o[field] = .string(s) } else {
                    o[field] = map.entries.first { $0.id.hasPrefix("D") && $0.value == s }.map { .string($0.id) }
                }
            case .array(let items):
                o[field] = .array(items.compactMap { item in
                    item["amount"]?.numberValue.flatMap(number).map { .object(JSONObject([("amount", $0), ("kind", item["kind"] ?? .null)])) }
                })
            default: break
            }
        }
        return (result.skeleton.text, .object(o))
    }
}
