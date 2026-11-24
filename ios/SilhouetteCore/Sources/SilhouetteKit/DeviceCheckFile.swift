// The on-device check's run file and scoring (shared/validation/DEVICE_CHECK.md, reference
// shared/reference/device-check.mjs): field statuses by value, yearly-income inputs, wrong values that
// reach the person, the summary of a run, the file name, and validation against
// shared/schemas/device-check-run.v3.json. The run itself is in the app (DeviceCheck.swift); this part
// has no UI and no model, so it is tested here against shared/fixtures/conformance/device-check.json.

import Foundation
import SilhouetteCore

public enum DeviceCheck {
    public static let kind = "silhouette-device-check"
    public static let version = 3
    /// The fields the yearly income is worked out from (validation/SPEC.md section 7).
    public static let incomeInputs = ["grossPay", "ytdGross", "payFrequency", "periodStart", "periodEnd", "payDate"]

    /// The ids a pointer answer gives for a field.
    public static func answeredIds(_ value: JSON?) -> [String] {
        switch value {
        case .string(let s)?: s.range(of: #"^[NDW][0-9]+$"#, options: .regularExpression) != nil ? [s] : []
        case .array(let items)?: items.flatMap { answeredIds($0) }
        case .object(let o)?: o.entries.flatMap { answeredIds($0.value) }
        default: []
        }
    }

    // MARK: Scoring a reading (section 2)

    /// The yearly-income inputs as right (or rightly absent), not found, or wrong.
    public static func incomeInputs(_ statuses: [(field: String, status: ReadingScore.Status)]) -> (right: [String], notFound: [String], wrong: [String]) {
        let by = Dictionary(statuses.map { ($0.field, $0.status) }, uniquingKeysWith: { a, _ in a })
        func of(_ want: [ReadingScore.Status?]) -> [String] { incomeInputs.filter { want.contains(by[$0]) } }
        return (of([.correct, .absent, nil]), of([.missing]), of([.wrong, .spurious]))
    }

    /// Fields whose value reached the person wrong (a value that is not the document's, or one where it has none).
    public static func wrongFields(_ statuses: [(field: String, status: ReadingScore.Status)]) -> [String] {
        statuses.filter { $0.status == .wrong || $0.status == .spurious }.map(\.field)
    }

    // MARK: Summary of a run (section 3)

    /// Where a case was finally answered: version 3 records it in `ran`; versions 1 and 2 in `final.ran`, else `ran`.
    public static func finalRan(_ c: JSON, version: Int) -> String {
        version >= 3 ? (c["ran"]?.stringValue ?? "not-run") : (c["final"]?["ran"]?.stringValue ?? c["ran"]?.stringValue ?? "not-run")
    }

    static func firstRan(_ c: JSON, version: Int) -> String? {
        version >= 3 ? (c["first"]?["ran"]?.stringValue ?? c["ran"]?.stringValue) : c["ran"]?.stringValue
    }

    static func firstFields(_ c: JSON, version: Int) -> JSON? { version >= 3 ? c["first"]?["fields"] : c["fields"] }

    public struct Summary: Sendable, Equatable {
        public var onDevice = 0, inCloudAfterDevice = 0, inCloud = 0, notRun = 0, total = 0
        public var firstOnDevice = 0, fieldsCorrect = 0, fieldsTotal = 0
        public var finalCorrect: Int?
        public var retriedInCloud = 0, deductionsNotRead = 0
        public var incomeInputsCorrect: Int?
        public var extractionCases = 0
        public var income: (allRight: Int, notFound: Int, wrong: Int)?
        public var wrongReachedPerson: Int?

        public static func == (a: Summary, b: Summary) -> Bool { a.json.jsonText == b.json.jsonText }

        /// As the reference writes it.
        public var json: JSON {
            func n(_ v: Int?) -> JSON { v.map { .number(Double($0)) } ?? .null }
            var o = JSONObject()
            o["onDevice"] = n(onDevice); o["inCloudAfterDevice"] = n(inCloudAfterDevice); o["inCloud"] = n(inCloud); o["notRun"] = n(notRun)
            o["total"] = n(total); o["firstOnDevice"] = n(firstOnDevice); o["fieldsCorrect"] = n(fieldsCorrect); o["fieldsTotal"] = n(fieldsTotal)
            o["finalCorrect"] = n(finalCorrect); o["retriedInCloud"] = n(retriedInCloud); o["deductionsNotRead"] = n(deductionsNotRead)
            o["incomeInputsCorrect"] = n(incomeInputsCorrect); o["extractionCases"] = n(extractionCases)
            o["income"] = income.map { .object(JSONObject([("allRight", n($0.allRight)), ("notFound", n($0.notFound)), ("wrong", n($0.wrong))])) } ?? .null
            o["wrongReachedPerson"] = n(wrongReachedPerson)
            return .object(o)
        }
    }

    /// The summary of a run's cases (reference `summarize`).
    public static func summarize(_ cases: [JSON], version: Int) -> Summary {
        var s = Summary()
        let afterDevice = { (c: JSON) in c["final"]?["retried"]?.boolValue == true && finalRan(c, version: version) == "IN_CLOUD" }
        s.total = cases.count
        for c in cases {
            let ran = finalRan(c, version: version)
            if ran == "ON_DEVICE" { s.onDevice += 1 }
            if afterDevice(c) { s.inCloudAfterDevice += 1 } else if ran == "IN_CLOUD" { s.inCloud += 1 }
            if ran == "not-run" { s.notRun += 1 }
            if firstRan(c, version: version) == "ON_DEVICE" { s.firstOnDevice += 1 }
            if let f = firstFields(c, version: version) {
                s.fieldsCorrect += Int(f["correct"]?.numberValue ?? 0)
                s.fieldsTotal += Int(f["total"]?.numberValue ?? 0)
            }
            if c["final"]?["retried"]?.boolValue == true { s.retriedInCloud += 1 }
            if c["final"]?["deductionsNotRead"]?.boolValue == true { s.deductionsNotRead += 1 }
            if c["task"]?.stringValue == "document.pointer.extract" { s.extractionCases += 1 }
        }
        if cases.contains(where: { $0["final"] != nil }) {
            s.finalCorrect = cases.reduce(0) { $0 + Int($1["final"]?["fields"]?["correct"]?.numberValue ?? 0) }
        }
        if cases.contains(where: { $0["final"]?["incomeInputsCorrect"]?.boolValue != nil }) {
            s.incomeInputsCorrect = cases.filter { $0["final"]?["incomeInputsCorrect"]?.boolValue == true }.count
        }
        if cases.contains(where: { $0["final"]?["incomeInputs"] != nil }) {
            var income = (allRight: 0, notFound: 0, wrong: 0)
            for c in cases {
                guard let i = c["final"]?["incomeInputs"] else { continue }
                let notFound = i["notFound"]?.arrayValue?.count ?? 0, wrong = i["wrong"]?.arrayValue?.count ?? 0
                if wrong > 0 { income.wrong += 1 } else if notFound > 0 { income.notFound += 1 } else { income.allRight += 1 }
            }
            s.income = income
        }
        if cases.contains(where: { $0["final"]?["wrongFields"] != nil }) {
            s.wrongReachedPerson = cases.filter { ($0["final"]?["wrongFields"]?.arrayValue?.count ?? 0) > 0 }.count
        }
        return s
    }

    /// The summary of a run file.
    public static func summarize(_ file: JSON) -> Summary {
        summarize(file["cases"]?.arrayValue ?? [], version: Int(file["version"]?.numberValue ?? 3))
    }

    /// A case this platform cannot run at all: reading a photo on iOS, where the on-device model takes
    /// text only. It stays in the file (`not-run`, with its note) and is left out of the figures shown.
    public static func notAvailableHere(_ c: JSON, file: JSON) -> Bool {
        let ios = file["device"]?["platform"]?.stringValue == "ios" || (file["platform"]?.stringValue ?? "").hasPrefix("iOS")
        return ios && c["task"]?.stringValue == "document.photo.read" && finalRan(c, version: Int(file["version"]?.numberValue ?? 3)) == "not-run"
    }

    /// The cases the figures count: every case but those the platform cannot run.
    public static func countedCases(_ file: JSON) -> [JSON] {
        (file["cases"]?.arrayValue ?? []).filter { !notAvailableHere($0, file: file) }
    }

    // MARK: The run file (section 4)

    /// "device-check-2026-11-17T1012-silhouette1-ios265.json": the UTC date and time of `date`, the client's
    /// first word and major version, and the platform (reference `runFileName`).
    public static func fileName(date: String, browser: String, platform: String) -> String {
        func slug(_ s: String) -> String { String(s.lowercased().unicodeScalars.filter { ("a"..."z").contains($0) || ("0"..."9").contains($0) }.map(Character.init)) }
        let parts = browser.split(separator: " ", omittingEmptySubsequences: false).map(String.init)
        let name = parts.first ?? "browser"
        let major = parts.count > 1 ? String(parts[1].split(separator: ".", omittingEmptySubsequences: false).first ?? "") : ""
        var stamp = String(date.prefix(10))
        if let t = date.range(of: #"T(\d{2}):(\d{2})"#, options: .regularExpression) {
            stamp += "T" + date[t].dropFirst().replacingOccurrences(of: ":", with: "")
        }
        return "device-check-\(stamp)-\(slug(name))\(major)-\(slug(platform)).json"
    }

    public static func fileName(_ file: JSON) -> String {
        fileName(date: file["date"]?.stringValue ?? "", browser: file["browser"]?.stringValue ?? "", platform: file["platform"]?.stringValue ?? "")
    }

    /// Whether a parsed JSON value is a run file the check screen can show (versions 1 to 3).
    public static func isRunFile(_ json: JSON) -> Bool {
        json["kind"]?.stringValue == kind && json["cases"]?.arrayValue != nil && json["date"]?.stringValue != nil
            && [1, 2, 3].contains(Int(json["version"]?.numberValue ?? 0))
    }

    /// One pass of a reading as the run file records it (placeholder ids and field names only). A call that
    /// gave no answer keeps why in its problems, after `error:{kind}`: `failure:{origin}:{type}: {message}`
    /// (the schema has no field of its own for it).
    public static func passRecord(_ p: DeviceReading.Pass) -> JSON {
        var r = JSONObject([("part", .string(p.part.rawValue)), ("rawText", .string(String(p.text.prefix(4000)))), ("parsed", .bool(p.parsed))])
        if let v = p.value, v.objectValue != nil { r["parsedValue"] = v }
        var problems = p.problems
        if let f = p.failure { problems.append(failureText(origin: f.origin, type: f.type, message: f.message)) }
        r["problems"] = .array(problems.map(JSON.string))
        if !p.marked.isEmpty { r["marked"] = .array(p.marked.map(JSON.string)) }
        r["extraKeys"] = .array(p.extraKeys.map(JSON.string))
        r["missingKeys"] = .array(p.missingKeys.map(JSON.string))
        r["latencyMs"] = .number(max(0, ((p.seconds ?? 0) * 1000).rounded()))
        // Whether the constraint's text was in the prompt (DeviceBudget); the constraint applied either way.
        if let inPrompt = p.schemaInPrompt { r["schemaInPrompt"] = .bool(inPrompt) }
        return .object(r)
    }

    /// Where a call stopped without an answer: the app guard or `sdk`, the error type and its message.
    public static func failureText(origin: String, type: String, message: String) -> String {
        String("failure:\(origin):\(type): \(message)".prefix(600))
    }

    /// The run file's `device` block: what ran the check, as far as the platform exposes it.
    public static func deviceBlock(os: String, osVersion: String, model: String, onDeviceModel: String?, sdk: String, appVersion: String) -> JSON {
        var d = JSONObject([("platform", .string("ios")), ("os", .string(os)), ("osVersion", .string(osVersion)), ("model", .string(model))])
        if let onDeviceModel { d["onDeviceModel"] = .string(onDeviceModel) }
        d["sdk"] = .string(sdk)
        d["appVersion"] = .string(appVersion)
        return .object(d)
    }

    /// A run file (version 3) from its parts, keys in the schema's order.
    public static func runFile(date: String, browser: String, platform: String, userAgent: String, availability: [(String, String)],
                               jurisdiction: String, repetitions: Int, device: JSON?, cases: [JSON]) -> JSON {
        var f = JSONObject()
        f["kind"] = .string(kind)
        f["version"] = .number(Double(version))
        f["date"] = .string(date)
        f["browser"] = .string(browser)
        f["platform"] = .string(platform)
        f["userAgent"] = .string(userAgent)
        f["availability"] = .object(JSONObject(availability.map { ($0.0, JSON.string($0.1)) }))
        f["jurisdiction"] = .string(jurisdiction)
        f["repetitions"] = .number(Double(max(1, repetitions)))
        if let device { f["device"] = device }
        f["cases"] = .array(cases)
        return .object(f)
    }

    // MARK: JSON Schema (the subset the run-file schema uses)

    /// Problems of `value` against `schema` (type, const, enum, required, properties, additionalProperties,
    /// items, minimum, $ref to #/$defs), as the reference `validate` reports them.
    public static func validate(_ schema: JSON, _ value: JSON, root: JSON? = nil, path: String = "$") -> [String] {
        let root = root ?? schema
        if let ref = schema["$ref"]?.stringValue, let target = root["$defs"]?[ref.replacingOccurrences(of: "#/$defs/", with: "")] {
            return validate(target, value, root: root, path: path)
        }
        var problems: [String] = []
        func typeOf(_ v: JSON) -> String {
            switch v {
            case .null: "null"
            case .array: "array"
            case .number(let n): n.rounded() == n && n.isFinite ? "integer" : "number"
            case .string: "string"
            case .bool: "boolean"
            case .object: "object"
            }
        }
        if let t = schema["type"] {
            let types = t.arrayValue?.compactMap(\.stringValue) ?? [t.stringValue ?? ""]
            let actual = typeOf(value)
            if !types.contains(actual) && !(actual == "integer" && types.contains("number")) {
                return ["\(path): expected \(types.joined(separator: " or ")), got \(actual)"]
            }
        }
        if let c = schema["const"], c.jsonText != value.jsonText { problems.append("\(path): expected \(c.jsonText)") }
        if let options = schema["enum"]?.arrayValue, !options.contains(where: { $0.jsonText == value.jsonText }) {
            problems.append("\(path): not one of \(JSON.array(options).jsonText)")
        }
        if let n = value.numberValue, let min = schema["minimum"]?.numberValue, n < min { problems.append("\(path): below \(min)") }
        if case .object(let o) = value {
            for key in schema["required"]?.arrayValue?.compactMap(\.stringValue) ?? [] where o[key] == nil { problems.append("\(path): missing \(key)") }
            for (key, v) in o.entries {
                if let sub = schema["properties"]?[key] {
                    problems += validate(sub, v, root: root, path: "\(path).\(key)")
                } else if schema["additionalProperties"]?.boolValue == false {
                    problems.append("\(path): unexpected \(key)")
                } else if let extra = schema["additionalProperties"], extra.objectValue != nil {
                    problems += validate(extra, v, root: root, path: "\(path).\(key)")
                }
            }
        }
        if case .array(let items) = value, let itemSchema = schema["items"] {
            for (i, v) in items.enumerated() { problems += validate(itemSchema, v, root: root, path: "\(path)[\(i)]") }
        }
        return problems
    }
}
