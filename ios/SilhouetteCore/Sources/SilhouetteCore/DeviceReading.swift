// On-device reading of a paystub silhouette (shared/validation/DEVICE_READING.md): the strict
// response constraint of each part, the deterministic checks of each answer, and the order in which
// the parts are asked. Code only rejects, leaves fields out or asks again; it never picks or fills in
// a placeholder. Problem codes and records hold placeholder ids and field names only.

import Foundation

public enum DeviceReading {
    /// A part of the reading (section 2).
    public enum Part: String, Sendable, CaseIterable {
        case core, gross, deductions
        case deductionsAgain = "deductions-again"
        /// A document type without a list field is read in one request.
        case whole
    }

    /// Core checks of shared/validation/SPEC.md section 5 that never warn on a correct reading.
    public static let coreChecks = ["period-length", "pay-date", "ytd-gross", "ytd-periods", "dates-parsed"]
    public static let grossPartFields = ["grossPay", "ytdGross"]
    public static let nameFields = ["employerName", "employeeName"]

    // MARK: - Helpers

    private static let placeholder = try! NSRegularExpression(pattern: "\u{27E6}([NDW][0-9]+)\u{27E7}")
    private static let numberPlaceholder = try! NSRegularExpression(pattern: "\u{27E6}(N[0-9]+)\u{27E7}")
    // `\z`, not `$`: the text ends there, as in JavaScript without the `m` flag.
    private static let moneyWithCents = try! NSRegularExpression(pattern: "[.,][0-9]{2}\\z")

    private static func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 0.005 }

    private static func matches(_ regex: NSRegularExpression, _ text: String) -> [(id: String, range: NSRange)] {
        let ns = text as NSString
        return regex.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { (ns.substring(with: $0.range(at: 1)), $0.range) }
    }

    private static func isMoneyWithCents(_ text: String?) -> Bool {
        guard let text else { return false }
        return moneyWithCents.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)) != nil
    }

    private static func amount(_ map: PlaceholderMap, _ id: String) -> Double? { Rehydrator.parseNumber(map[id] ?? "") }

    /// Amount fields whose placeholder must be money with cents when the silhouette prints cents (section 4.1).
    public static let moneyFields = ["grossPay", "netPay", "ytdGross"]

    /// The silhouette prints amounts with cents: some N placeholder's text is money with cents.
    private static func printsCents(_ map: PlaceholderMap) -> Bool {
        map.entries.contains { $0.id.hasPrefix("N") && isMoneyWithCents($0.value) }
    }

    /// A reference to an N placeholder whose text has no cents, in a silhouette that prints cents: a ZIP
    /// code, an id, a year (section 4.1).
    private static func notMoney(_ ref: JSON, _ map: PlaceholderMap) -> Bool {
        guard let s = ref.stringValue, s.hasPrefix("N"), let text = map[s] else { return false }
        return !isMoneyWithCents(text) && printsCents(map)
    }

    private static func properties(_ schema: JSON) -> [(name: String, spec: JSON)] {
        (schema["properties"]?.objectValue?.entries ?? []).map { ($0.key, $0.value) }
    }

    private static func kind(_ spec: JSON?) -> String? { spec?["x-kind"]?.stringValue }

    // MARK: - 1. Parts and the response constraint

    /// Placeholder ids of a silhouette by kind (`N`, `D`, `W`), in order of first appearance.
    public static func placeholderIds(_ skeleton: String) -> [Character: [String]] {
        var out: [Character: [String]] = ["N": [], "D": [], "W": []]
        for m in matches(placeholder, skeleton) {
            let k = m.id.first!
            if !(out[k]!.contains { $0.exactlyEquals(m.id) }) { out[k]!.append(m.id) }
        }
        return out
    }

    /// Field names of a part, in schema order.
    public static func partFields(_ schema: JSON, _ part: Part) -> [String] {
        let props = properties(schema)
        if part == .gross {
            return grossPartFields.filter { name in kind(props.first { $0.name == name }?.spec) == "number" }
        }
        let list = part == .deductions || part == .deductionsAgain
        return props.filter { part == .whole || (kind($0.spec) == "list") == list }.map(\.name)
    }

    private static func strings(_ values: [String]) -> JSON { .array(values.map(JSON.string)) }

    private static func idOrNull(_ ids: [String]) -> JSON {
        ids.isEmpty ? .object(JSONObject([("type", .string("null"))]))
            : .object(JSONObject([("type", strings(["string", "null"])), ("enum", .array(ids.map(JSON.string) + [.null]))]))
    }

    private static func fieldConstraint(_ spec: JSON, _ ids: [Character: [String]]) -> JSON {
        switch kind(spec) {
        case "text":
            guard let w = ids["W"], !w.isEmpty else { return .object(JSONObject([("type", .string("null"))])) }
            return .object(JSONObject([("type", strings(["array", "null"])), ("minItems", .number(1)),
                                       ("items", .object(JSONObject([("type", .string("string")), ("enum", strings(w))])))]))
        case "date": return idOrNull(ids["D"] ?? [])
        case "number": return idOrNull(ids["N"] ?? [])
        case "enum":
            return .object(JSONObject([("type", strings(["string", "null"])), ("enum", .array((spec["enum"]?.arrayValue ?? []) + [.null]))]))
        case "list":
            let kinds = spec["items"]?["properties"]?["kind"]?["enum"]?.arrayValue ?? []
            let n = ids["N"] ?? []
            let amount: JSON = n.isEmpty ? .object(JSONObject([("type", .string("null"))]))
                : .object(JSONObject([("type", .string("string")), ("enum", strings(n))]))
            return .object(JSONObject([
                ("type", .string("array")),
                ("items", .object(JSONObject([
                    ("type", .string("object")),
                    ("properties", .object(JSONObject([("amount", amount),
                                                       ("kind", .object(JSONObject([("type", .string("string")), ("enum", .array(kinds))])))]))),
                    ("required", strings(["amount", "kind"])),
                    ("additionalProperties", .bool(false)),
                ]))),
            ]))
        default:
            let all = (ids["N"] ?? []) + (ids["D"] ?? []) + (ids["W"] ?? [])
            return .object(JSONObject([("type", strings(["string", "null"])), ("enum", .array(all.map(JSON.string) + [.null]))]))
        }
    }

    /// The strict response constraint (JSON Schema) of one part, for one silhouette.
    public static func constraint(schema: JSON, skeleton: String, part: Part) -> JSON {
        let ids = placeholderIds(skeleton)
        let fields = partFields(schema, part)
        let props = properties(schema)
        let fieldSpecs = fields.map { name in (name, fieldConstraint(props.first { $0.name == name }!.spec, ids)) }
        return .object(JSONObject([
            ("type", .string("object")),
            ("properties", .object(JSONObject(fieldSpecs))),
            ("required", strings(fields)),
            ("additionalProperties", .bool(false)),
        ]))
    }

    // MARK: - 2. Checks

    /// Whether a reference fits a field of this kind.
    private static func fits(_ kind: String?, _ ref: JSON, _ map: PlaceholderMap) -> Bool {
        if case .array(let refs) = ref {
            if kind == "date" {
                return refs.count == 3 && refs.allSatisfy { r in
                    guard let s = r.stringValue else { return false }
                    return s.hasPrefix("N") && map[s] != nil
                }
            }
            return !refs.isEmpty && refs.allSatisfy { fits(kind, $0, map) }
        }
        guard let s = ref.stringValue, map[s] != nil else { return false }
        switch kind {
        case "number": return s.hasPrefix("N")
        case "date": return s.hasPrefix("D")
        case "text": return s.hasPrefix("W")
        default: return true
        }
    }

    private static func values(_ schema: JSON, _ pointers: JSON, _ map: PlaceholderMap) -> JSON {
        Rehydrator.rehydrate(schema: schema, pointers: pointers, map: Raw(map)).value
    }

    private static func warnings(_ v: JSON, _ jurisdiction: String, _ which: [String]) -> [String] {
        do {
            let result = try Validator.validatePaystubs(Raw([v]), jurisdiction: jurisdiction)
            return (result.checks.first ?? []).filter { $0.status == .warn && which.contains($0.id) }.map { "check:\($0.id)" }
        } catch {
            return ["values:malformed"]
        }
    }

    /// Whether `ytd` fits as year to date for this reading's gross pay, frequency and dates (section 4.2).
    public static func fitsYtd(_ v: JSON, _ ytd: Double, jurisdiction: String) -> Bool {
        guard let gross = v["grossPay"]?.numberValue, ytd >= gross else { return false }
        var stub = JSONObject([("grossPay", .number(gross)), ("ytdGross", .number(ytd))])
        for key in ["payFrequency", "periodEnd", "payDate"] { if let x = v[key] { stub[key] = x } }
        do {
            let result = try Validator.validatePaystubs(Raw([.object(stub)]), jurisdiction: jurisdiction)
            return !(result.checks.first ?? []).contains { $0.status == .warn && ($0.id == "ytd-gross" || $0.id == "ytd-periods") }
        } catch {
            return true
        }
    }

    private static func numbersOnLine(of id: String, _ skeleton: String) -> [String] {
        guard let line = skeleton.components(separatedBy: "\n").first(where: { $0.contains("\u{27E6}\(id)\u{27E7}") }) else { return [] }
        return matches(numberPlaceholder, line).map(\.id)
    }

    /// Same-line rule (section 4.2).
    public static func sameLineYtdProblems(schema: JSON, pointers: JSON, skeleton: String, map: PlaceholderMap, jurisdiction: String) -> [String] {
        guard let gross = pointers["grossPay"]?.stringValue else { return [] }
        let v = values(schema, pointers, map)
        guard v["grossPay"]?.numberValue != nil else { return [] }
        let candidates = numbersOnLine(of: gross, skeleton).filter { id in
            guard !id.exactlyEquals(gross), let a = amount(map, id) else { return false }
            return fitsYtd(v, a, jurisdiction: jurisdiction)
        }
        guard candidates.count == 1, let ytd = v["ytdGross"]?.numberValue, let a = amount(map, candidates[0]) else { return [] }
        return near(ytd, a) ? [] : ["ytdGross:not-on-gross-line"]
    }

    /// Larger-candidate rule (section 4.3).
    public static func largerYtdProblems(schema: JSON, pointers: JSON, skeleton: String, map: PlaceholderMap, jurisdiction: String) -> [String] {
        let v = values(schema, pointers, map)
        guard let ytd = v["ytdGross"]?.numberValue, v["grossPay"]?.numberValue != nil else { return [] }
        var seen: [String] = []
        for m in matches(numberPlaceholder, skeleton) where !seen.contains(m.id) { seen.append(m.id) }
        for id in seen where isMoneyWithCents(map[id]) {
            if let n = amount(map, id), n > ytd, !near(n, ytd), fitsYtd(v, n, jurisdiction: jurisdiction) { return ["ytdGross:ambiguous"] }
        }
        return []
    }

    /// Problems of the core (deductions ignored); empty: the core may be used (section 4.1).
    public static func coreProblems(schema: JSON, pointers: JSON, skeleton: String, map: PlaceholderMap, jurisdiction: String) -> [String] {
        guard case .object(let object) = pointers else { return ["not-an-object"] }
        var problems: [String] = []
        for (name, spec) in properties(schema) {
            let k = kind(spec)
            guard k != "list", let value = object[name], !value.isNull else { continue }
            if k == "enum" {
                let options = spec["enum"]?.arrayValue ?? []
                let ok = value.stringValue.map { s in options.contains { $0.stringValue?.exactlyEquals(s) == true } } ?? false
                if !ok { problems.append("\(name):not-an-option") }
            } else if !fits(k, value, map) {
                problems.append("\(name):bad-reference")
            } else if moneyFields.contains(name), notMoney(value, map) {
                problems.append("\(name):not-money")
            }
        }
        let core = JSON.object(JSONObject(object.entries.filter { $0.key != "deductions" }.map { ($0.key, $0.value) }))
        let v = values(schema, core, map)
        let gross = v["grossPay"]?.numberValue
        if gross == nil { problems.append("grossPay:missing") }
        if let g = gross, let n = v["netPay"]?.numberValue, n > g { problems.append("netPay:above-gross") }
        problems += warnings(v, jurisdiction, coreChecks)
        problems += sameLineYtdProblems(schema: schema, pointers: core, skeleton: skeleton, map: map, jurisdiction: jurisdiction)
        problems += largerYtdProblems(schema: schema, pointers: core, skeleton: skeleton, map: map, jurisdiction: jurisdiction)
        return problems
    }

    /// Problems of the deductions, given the core (section 6).
    public static func deductionsProblems(schema: JSON, pointers: JSON, map: PlaceholderMap, jurisdiction: String) -> [String] {
        guard case .object(let object) = pointers else { return ["not-an-object"] }
        let kinds = (schema["properties"]?["deductions"]?["items"]?["properties"]?["kind"]?["enum"]?.arrayValue ?? []).compactMap(\.stringValue)
        guard let list = object["deductions"], !list.isNull else { return ["deductions:missing"] }
        guard case .array(let items) = list else { return ["deductions:not-a-list"] }
        var problems: [String] = []
        for item in items {
            if case .object(let o) = item, let amount = o["amount"], fits("number", amount, map) {
                if notMoney(amount, map) {
                    problems.append("deductions:not-money")
                } else if let k = o["kind"], !k.isNull, !(k.stringValue.map { s in kinds.contains { $0.exactlyEquals(s) } } ?? false) {
                    problems.append("deductions:not-an-option")
                }
            } else {
                problems.append("deductions:bad-reference")
            }
        }
        let v = values(schema, pointers, map)
        if v["netPay"]?.numberValue == nil || v["grossPay"]?.numberValue == nil { problems.append("deductions:cannot-check") }
        else { problems += warnings(v, jurisdiction, ["net-sum"]) }
        var unique: [String] = []
        for p in problems where !unique.contains(p) { unique.append(p) }
        return unique
    }

    private static func wordIds(_ v: JSON?) -> [String] { v?.arrayValue?.compactMap(\.stringValue) ?? [] }

    /// The two names share a placeholder.
    public static func namesProblems(_ pointers: JSON) -> [String] {
        let employer = Set(wordIds(pointers["employerName"]))
        return wordIds(pointers["employeeName"]).contains(where: employer.contains) ? ["names:shared-placeholder"] : []
    }

    /// A name cut short: next to an answered word, with only one or two spaces between, a word
    /// placeholder the answer leaves out.
    public static func incompleteNameProblems(_ pointers: JSON, skeleton: String) -> [String] {
        var out: [String] = []
        for field in nameFields {
            let answered = Set(wordIds(pointers[field]))
            if answered.isEmpty { continue }
            var cut = false
            for line in skeleton.components(separatedBy: "\n") {
                let ns = line as NSString
                let tokens = matches(placeholder, line)
                var i = 0
                while i < tokens.count && !cut {
                    defer { i += 1 }
                    guard answered.contains(tokens[i].id) else { continue }
                    for j in [i - 1, i + 1] where j >= 0 && j < tokens.count {
                        let other = tokens[j]
                        guard other.id.hasPrefix("W"), !answered.contains(other.id) else { continue }
                        let (a, b) = j < i ? (other, tokens[i]) : (tokens[i], other)
                        let start = a.range.location + a.range.length
                        let between = ns.substring(with: NSRange(location: start, length: b.range.location - start))
                        if (1...2).contains(between.utf16.count) && between.utf16.allSatisfy({ $0 == 0x20 }) { cut = true }
                    }
                }
                if cut { break }
            }
            if cut { out.append("\(field):incomplete") }
        }
        return out
    }

    /// Hours worked or hourly rate on the placeholder answered for gross pay, net pay or year to date.
    public static func sharedAmountProblems(_ pointers: JSON) -> [String] {
        let amounts = Set(["grossPay", "netPay", "ytdGross"].compactMap { pointers[$0]?.stringValue })
        return ["hoursWorked", "hourlyRate"].filter { f in pointers[f]?.stringValue.map(amounts.contains) ?? false }.map { "\($0):shares-placeholder" }
    }

    /// Fields left out as not read, and why (section 5).
    public static func notReadFields(_ pointers: JSON, skeleton: String) -> (problems: [String], fields: [String]) {
        let names = namesProblems(pointers)
        let incomplete = incompleteNameProblems(pointers, skeleton: skeleton)
        let shared = sharedAmountProblems(pointers)
        var fields: [String] = []
        for f in (names.isEmpty ? [] : nameFields) + (incomplete + shared).map({ String($0.split(separator: ":")[0]) }) where !fields.contains(f) {
            fields.append(f)
        }
        return (names + incomplete + shared, fields)
    }

    /// Year to date left out although the document has exactly one place for it (section 4.4).
    public static func ytdMissingWithCandidate(schema: JSON, pointers: JSON, skeleton: String, map: PlaceholderMap, jurisdiction: String) -> Bool {
        guard let gross = pointers["grossPay"]?.stringValue, pointers["ytdGross"] == nil || pointers["ytdGross"]!.isNull else { return false }
        let v = values(schema, pointers, map)
        guard let g = v["grossPay"]?.numberValue else { return false }
        func fitting(_ id: String) -> Bool {
            guard let n = amount(map, id) else { return false }
            return fitsYtd(v, n, jurisdiction: jurisdiction)
        }
        let onLine = numbersOnLine(of: gross, skeleton).filter { !$0.exactlyEquals(gross) && fitting($0) }
        if !onLine.isEmpty { return onLine.count == 1 }
        var amounts = Set<Double>()
        for m in matches(numberPlaceholder, skeleton) where isMoneyWithCents(map[m.id]) && fitting(m.id) {
            let n = amount(map, m.id)
            if let n, !near(n, g) { amounts.insert(n) }
        }
        return amounts.count == 1
    }

    // MARK: - Shown only when confirmed (section 5.1)

    /// Labels that mark net pay, per document language (words the Skeletonizer keeps visible).
    public static let netPayLabels: [String: [String]] = ["en": ["net", "take home"], "es": ["neto", "neta", "líquido", "liquido"],
                                                          "ko": ["실수령", "실지급", "차인지급"]]
    private static let asciiLabel = try! NSRegularExpression(pattern: "^[a-z ]+\\z")

    /// Whether the placeholder sits on a line whose visible text has a net-pay label.
    static func netLabelled(_ skeleton: String, _ id: String, language: String) -> Bool {
        guard let line = skeleton.components(separatedBy: "\n").first(where: { $0.contains("\u{27E6}\(id)\u{27E7}") }) else { return false }
        let visible = placeholder.stringByReplacingMatches(in: line, range: NSRange(location: 0, length: (line as NSString).length), withTemplate: " ")
        let text = visible.lowercased()
        let labels = (netPayLabels[language] ?? []) + (language == "en" ? [] : netPayLabels["en"]!)
        return labels.contains { label in
            if asciiLabel.firstMatch(in: label, range: NSRange(location: 0, length: (label as NSString).length)) != nil {
                let word = try! NSRegularExpression(pattern: "(^|[^a-z])" + NSRegularExpression.escapedPattern(for: label) + "([^a-z]|\\z)")
                return word.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)) != nil
            }
            return text.contains(label)
        }
    }

    /// Fields of a reading about to be used that no check confirms, and why (section 5.1).
    public static func unconfirmedFields(schema: JSON, pointers: JSON, skeleton: String, map: PlaceholderMap, jurisdiction: String,
                                         language: String) -> (problems: [String], fields: [String]) {
        let v = values(schema, pointers, map)
        var problems: [String] = []
        if pointers["hoursWorked"] != nil || pointers["hourlyRate"] != nil {
            var confirmed = false
            if let h = v["hoursWorked"]?.numberValue, let r = v["hourlyRate"]?.numberValue, let g = v["grossPay"]?.numberValue {
                confirmed = placeholderIds(skeleton)["N"]!.contains { id in
                    let text = map[id] ?? ""
                    guard isMoneyWithCents(text), let m = Rehydrator.parseNumber(text) else { return false }
                    return m <= g + 0.005 && abs(r * h - m) <= 0.01 + 1e-9
                }
            }
            if !confirmed { problems += ["hoursWorked:unconfirmed", "hourlyRate:unconfirmed"] }
        }
        if let net = pointers["netPay"]?.stringValue {
            let byDeductions = pointers["deductions"]?.arrayValue != nil
                && deductionsProblems(schema: schema, pointers: pointers, map: map, jurisdiction: jurisdiction).isEmpty
            if !byDeductions && !netLabelled(skeleton, net, language: language) { problems.append("netPay:unconfirmed") }
        }
        if let payText = v["payDate"]?.stringValue, let pay = Validator.parseDate(payText, jurisdiction: jurisdiction) {
            let start = v["periodStart"]?.stringValue.flatMap { Validator.parseDate($0, jurisdiction: jurisdiction) }
            let end = v["periodEnd"]?.stringValue.flatMap { Validator.parseDate($0, jurisdiction: jurisdiction) }
            if (start.map { pay.dayNumber <= $0.dayNumber } ?? false) || (end.map { pay.dayNumber < $0.dayNumber } ?? false) {
                problems.append("payDate:before-period-end")
            }
        }
        let kept = problems.filter { pointers[String($0.split(separator: ":")[0])] != nil }
        var fields: [String] = []
        for p in kept { let f = String(p.split(separator: ":")[0]); if !fields.contains(f) { fields.append(f) } }
        return (kept, fields)
    }

    // MARK: - 3. The reading, part by part

    /// One answer of the device: the model's text, parsed and limited to the part's fields.
    public struct Pass: Sendable {
        public let part: Part
        public let parsed: Bool
        /// The answer's fields of this part, without nulls. Placeholder ids only.
        public let value: JSON?
        public var problems: [String]
        public let extraKeys: [String]
        public let missingKeys: [String]
        /// Contradictions that left fields out (core pass only).
        public var marked: [String] = []
        /// The model's text, kept for the record (placeholder ids only).
        public var text: String = ""
        /// Seconds the part took on the device, when known.
        public var seconds: Double?
        /// Why the call gave no answer, when it gave none.
        public var failure: Failure?
        /// Whether the constraint's text was in the prompt, when known (it always constrains the answer).
        public var schemaInPrompt: Bool?
    }

    public static func readPass(schema: JSON, part: Part, text: String) -> Pass {
        let fields = partFields(schema, part)
        guard let parsed = try? JSON.parse(text), case .object(let object) = parsed else {
            return Pass(part: part, parsed: false, value: nil, problems: ["not-json"], extraKeys: [], missingKeys: [], text: text)
        }
        let keys = object.keys
        let value = JSONObject(object.entries.filter { !$0.value.isNull && fields.contains($0.key) }.map { ($0.key, $0.value) })
        return Pass(part: part, parsed: true, value: .object(value), problems: [],
                    extraKeys: keys.filter { !fields.contains($0) }, missingKeys: fields.filter { !keys.contains($0) }, text: text)
    }

    public enum Outcome: Sendable {
        /// Answered on this device: the pointers to use (without the fields not read) and the fields not read.
        case onDevice(pointers: JSON, notRead: [String])
        /// A failed on-device attempt, with the last pass's problems.
        case failed(problems: [String])
    }

    public struct Reading: Sendable {
        public let asked: [Part]
        public let passes: [Pass]
        public let outcome: Outcome
    }

    private static func isGrossProblem(_ p: String) -> Bool {
        p.hasPrefix("grossPay:") || p.hasPrefix("ytdGross:") || p == "check:ytd-gross" || p == "check:ytd-periods"
    }

    private static func merge(_ a: JSON?, _ b: JSON?) -> JSON? {
        guard case .object(var out)? = a else { return b }
        for (k, v) in b?.objectValue?.entries ?? [] { out[k] = v }
        return .object(out)
    }

    /// What the device gave for one part: its text, or the kind of error the call ended with.
    public struct PartAnswer: Sendable {
        public let text: String?
        public let error: String?
        public let seconds: Double?
        /// Why the call gave no answer: where it stopped, the error type and its message.
        public let failure: Failure?
        /// Whether the constraint's text was in the prompt (it always constrains the answer), when known.
        public let schemaInPrompt: Bool?

        public init(text: String?, error: String? = nil, seconds: Double? = nil, failure: Failure? = nil, schemaInPrompt: Bool? = nil) {
            self.schemaInPrompt = schemaInPrompt
            self.text = text
            self.error = error
            self.seconds = seconds
            self.failure = failure
        }
    }

    /// A call that ended without an answer, as recorded: the app guard or `sdk`, the error type, and
    /// the error's message (never document values).
    public struct Failure: Sendable, Equatable {
        public let origin: String
        public let type: String
        public let message: String

        public init(origin: String, type: String, message: String) {
            self.origin = origin
            self.type = type
            self.message = message
        }
    }

    /// The reading of section 3. `ask` returns the device's answer for a part; a call that failed is a
    /// pass with the problem `error:{kind}`. An error thrown by `ask` (cancellation) ends the reading.
    public static func read(schema: JSON, skeleton: String, map rawMap: Raw<PlaceholderMap>, jurisdiction: String, language: String = "en",
                            ask: (Part) async throws -> PartAnswer) async throws -> Reading {
        let map = rawMap.value
        func pass(_ part: Part) async throws -> Pass {
            let answer = try await ask(part)
            var p: Pass
            if let text = answer.text {
                p = readPass(schema: schema, part: part, text: text)
            } else {
                p = Pass(part: part, parsed: false, value: nil, problems: ["error:\(answer.error ?? "unknown")"], extraKeys: [], missingKeys: [])
            }
            p.seconds = answer.seconds
            p.failure = answer.failure
            p.schemaInPrompt = answer.schemaInPrompt
            return p
        }
        func checkCore(_ v: JSON) -> [String] { coreProblems(schema: schema, pointers: v, skeleton: skeleton, map: map, jurisdiction: jurisdiction) }

        var passes: [Pass] = []
        var core = try await pass(.core)
        if let value = core.value { core.problems = checkCore(value) }
        passes.append(core)
        var coreValue = core.value
        var remaining = core.problems
        let grossFailed = coreValue != nil && !remaining.isEmpty && remaining.allSatisfy(isGrossProblem)
        let ytdMissing = coreValue != nil && remaining.isEmpty
            && ytdMissingWithCandidate(schema: schema, pointers: coreValue!, skeleton: skeleton, map: map, jurisdiction: jurisdiction)
        if coreValue != nil && (grossFailed || ytdMissing) {
            var gross = try await pass(.gross)
            let merged = gross.value.flatMap { merge(coreValue, $0) }
            let answered = merged.map { $0["ytdGross"] != nil } ?? false
            let problems = merged.map(checkCore) ?? gross.problems
            gross.problems = ytdMissing && !answered && problems.isEmpty ? ["ytdGross:still-missing"] : problems
            passes.append(gross)
            if let merged, problems.isEmpty, grossFailed || answered {
                coreValue = merged
                remaining = []
            }
        }
        guard let usedCore = coreValue, remaining.isEmpty else {
            return Reading(asked: passes.map(\.part), passes: passes, outcome: .failed(problems: passes.last!.problems))
        }
        let contradictions = notReadFields(usedCore, skeleton: skeleton)
        var notRead = contradictions.fields
        if !contradictions.problems.isEmpty { passes[0].marked = contradictions.problems }
        // A core asked without the constraint's text (section 2, a part that does not fit the window) does not
        // ask the names: they are not read.
        if passes[0].schemaInPrompt == false {
            let names = partFields(schema, .core).filter { name in kind(properties(schema).first { $0.name == name }?.spec) == "text" }
            for name in names where !notRead.contains(name) {
                notRead.append(name)
                passes[0].marked.append("\(name):not-asked")
            }
        }
        let kept = JSON.object(JSONObject((usedCore.objectValue?.entries ?? []).filter { !notRead.contains($0.key) }.map { ($0.key, $0.value) }))

        func readDeductions(_ part: Part) async throws -> (pass: Pass, merged: JSON) {
            var p = try await pass(part)
            let merged = p.value.flatMap { merge(kept, $0) } ?? kept
            if p.value != nil { p.problems = deductionsProblems(schema: schema, pointers: merged, map: map, jurisdiction: jurisdiction) }
            passes.append(p)
            return (p, merged)
        }
        var deductions = try await readDeductions(.deductions)
        if deductions.pass.value != nil && deductions.pass.problems.contains("check:net-sum") {
            deductions = try await readDeductions(.deductionsAgain)
        }
        let deductionsNotRead = deductions.pass.value == nil || !deductions.pass.problems.isEmpty
        if deductionsNotRead { notRead.append("deductions") }
        // Shown only when confirmed (section 5.1): values that feed no result and that no check confirms are
        // left out, whatever the gross part repaired.
        let used = deductionsNotRead ? kept : deductions.merged
        let unconfirmed = unconfirmedFields(schema: schema, pointers: used, skeleton: skeleton, map: map, jurisdiction: jurisdiction, language: language)
        notRead += unconfirmed.fields
        passes[0].marked += unconfirmed.problems
        let value = JSON.object(JSONObject((used.objectValue?.entries ?? []).filter { !unconfirmed.fields.contains($0.key) }.map { ($0.key, $0.value) }))
        return Reading(asked: passes.map(\.part), passes: passes, outcome: .onDevice(pointers: value, notRead: notRead))
    }

    /// The same reading with the answers given as text per part (tests and recorded runs).
    public static func read(schema: JSON, skeleton: String, map: Raw<PlaceholderMap>, jurisdiction: String, language: String = "en",
                            answers: [Part: String]) async throws -> Reading {
        try await read(schema: schema, skeleton: skeleton, map: map, jurisdiction: jurisdiction, language: language) { part in
            guard let text = answers[part] else { throw MissingAnswer(part: part) }
            return PartAnswer(text: text)
        }
    }

    public struct MissingAnswer: Error, Sendable { public let part: Part }
    // MARK: - 9. Form W-2

    /// W-2 boxes that hold money (boxes 1, 2, 3, 5 and 16).
    public static let w2MoneyFields = ["wages", "federalIncomeTaxWithheld", "socialSecurityWages", "medicareWages", "stateWages"]

    /// Problems of a W-2 answer, from the device or the cloud (section 9): references that do not fit,
    /// money boxes answered from a number without cents, no wages, box 2 not below box 1, and a tax year
    /// that is not a year. A reference that does not fit is reported and the other boxes are still checked.
    public static func w2Problems(schema: JSON, pointers: JSON, map: PlaceholderMap) -> [String] {
        guard case .object(let object) = pointers else { return ["not-an-object"] }
        var problems: [String] = []
        var fitting = JSONObject()
        for (name, spec) in properties(schema) {
            guard let value = object[name], !value.isNull else { continue }
            guard fits(kind(spec), value, map) else {
                problems.append("\(name):bad-reference")
                continue
            }
            fitting[name] = value
            if w2MoneyFields.contains(name), notMoney(value, map) { problems.append("\(name):not-money") }
        }
        let v = values(schema, .object(fitting), map)
        if v["wages"]?.numberValue == nil { problems.append("wages:missing") }
        func money(_ f: String) -> Double? { problems.contains("\(f):not-money") ? nil : v[f]?.numberValue }
        if let wages = money("wages"), let withheld = money("federalIncomeTaxWithheld"), withheld >= wages {
            problems.append("wages:below-withheld")
        }
        if let year = v["taxYear"]?.numberValue, !(year.rounded() == year && year >= 2000 && year <= 2100) {
            problems.append("taxYear:not-a-year")
        }
        return problems
    }

    /// The fields of a W-2 answer left out as not read: a money box that is not money, a tax year that is
    /// not a year, and boxes 1 and 2 both when box 2 is not below box 1 (`not-consistent`).
    public static func w2LeftOut(schema: JSON, pointers: JSON, map: PlaceholderMap) -> (problems: [String], fields: [(field: String, problem: String)]) {
        let problems = w2Problems(schema: schema, pointers: pointers, map: map)
            .filter { $0.hasSuffix(":not-money") || $0 == "taxYear:not-a-year" || $0 == "wages:below-withheld" }
        let fields: [(field: String, problem: String)] = problems.flatMap { p -> [(field: String, problem: String)] in
            if p == "wages:below-withheld" { return [("wages", "not-consistent"), ("federalIncomeTaxWithheld", "not-consistent")] }
            let parts = p.split(separator: ":", maxSplits: 1).map(String.init)
            return [(parts[0], parts[1])]
        }
        return (problems, fields)
    }
}
