// The document flow: add a paystub (paste, text PDF, sample or typed by hand), preview its
// silhouette and hide more words, read pointers through `PointerExtraction`, review the values,
// validate and annualize them (shared/validation/SPEC.md), and use the yearly income.
//
// The document text, the placeholder map, the values and the hidden words are exact personal
// values. They live inside `Raw<DocumentDraft>`; the only cloud-safe output is the `Skeleton`.

import Foundation
import SilhouetteCore

public enum DocumentSourceKind: String, Sendable {
    case paste, pdf, sample, manual, shared
}

// MARK: - Review values

public enum FieldKind: Sendable, Equatable {
    case text, number, date
    case choice([String])
}

public enum FieldValue: Sendable, Equatable {
    case text(String)
    case number(Double)
    case choice(String)
}

public struct ReviewField: Sendable, Identifiable {
    /// Pointer schema property (`grossPay`, `payDate` …); copy key `field.paystub.{name}`.
    public let name: String
    public let kind: FieldKind
    public var value: FieldValue?
    /// The value came from the document (not typed by the user).
    public var found: Bool
    public var confirmed: Bool
    /// The document line the value came from, as it reads on this device.
    public var source: String?
    public var id: String { name }
}

public struct DeductionRow: Sendable, Identifiable {
    public let id: UUID
    public var amount: Double?
    public var kind: String?
    public var found: Bool
    public var confirmed: Bool
    public var source: String?
}

/// Everything about the document in progress. Always wrapped in `Raw`.
public struct DocumentDraft: Sendable {
    var language: AppLocale
    var sourceKind: DocumentSourceKind?
    var sampleId: String?
    var text: String?
    var hidden: [String] = []
    var extraction: (source: InferenceSource, reason: RoutingReason)?
    var reviewed = false
    var fields: [ReviewField] = []
    var deductions: [DeductionRow] = []
    /// Paystubs already confirmed in this session, as validation input.
    var confirmedStubs: [JSON] = []

    init(language: AppLocale) { self.language = language }
}

/// A piece of the preview: plain text, a word that is still visible, or a placeholder.
public enum PreviewSegment: Sendable, Equatable {
    case text(String)
    case word(String)
    /// `kind` is `D`, `N` or `W`; `original` is set only for the on-this-device view.
    case placeholder(id: String, kind: Character, original: String?)
}

// MARK: - Session

public struct DocumentSession: Sendable {
    public private(set) var draft: Raw<DocumentDraft>

    public init(language: AppLocale) {
        draft = Raw(DocumentDraft(language: language))
    }

    init(draft: Raw<DocumentDraft>) { self.draft = draft }

    private mutating func edit(_ change: (inout DocumentDraft) -> Void) {
        draft = draft.map { var d = $0; change(&d); return d }
    }

    // MARK: Input

    public var language: AppLocale { draft.value.language }
    public var sourceKind: DocumentSourceKind? { draft.value.sourceKind }
    public var sampleId: String? { draft.value.sampleId }
    public var hasText: Bool { !(draft.value.text ?? "").isEmpty }
    public var isReviewing: Bool { draft.value.reviewed }
    public var extraction: (source: InferenceSource, reason: RoutingReason)? { draft.value.extraction }
    public var confirmedStubCount: Int { draft.value.confirmedStubs.count }

    /// The document language decides the allowlist (its language ∪ en), not the app language.
    public mutating func setLanguage(_ language: AppLocale) {
        edit { $0.language = language; $0.extraction = nil; $0.reviewed = false }
    }

    /// A new document. Hidden words and earlier review values belong to the previous one and go.
    public mutating func setText(_ text: Raw<String>, source: DocumentSourceKind, sampleId: String? = nil, language: AppLocale? = nil) {
        edit { d in
            d.text = text.value
            d.sourceKind = source
            d.sampleId = sampleId
            if let language { d.language = language }
            d.hidden = []
            d.extraction = nil
            d.reviewed = false
            d.fields = []
            d.deductions = []
        }
    }

    // MARK: Silhouette and hidden words

    public func silhouette(bundle: SharedBundle) throws -> SkeletonResult? {
        guard let text = draft.value.text, !text.isEmpty else { return nil }
        return Skeletonizer.skeletonize(Raw(text), allowlist: try bundle.allowlist(for: language), hide: Raw(draft.value.hidden))
    }

    /// Words the user hid, for showing them back (to undo).
    public var hiddenWordsForDisplay: [String] { draft.value.hidden }

    /// Hides a visible word everywhere in this document (skeleton/SPEC.md section 4.3).
    public mutating func hide(_ word: String) {
        let lower = word.lowercased()
        edit { d in
            if !d.hidden.contains(lower) { d.hidden.append(lower) }
            d.extraction = nil
            d.reviewed = false
        }
    }

    public mutating func unhide(_ word: String) {
        edit { d in
            d.hidden.removeAll { $0 == word }
            d.extraction = nil
            d.reviewed = false
        }
    }

    /// Numbers, dates and words replaced by placeholders.
    public static func counts(_ result: SkeletonResult) -> (numbers: Int, dates: Int, words: Int) {
        var n = 0, d = 0, w = 0
        for entry in result.map.value.entries {
            switch entry.id.first {
            case "N": n += 1
            case "D": d += 1
            default: w += 1
            }
        }
        return (n, d, w)
    }

    /// The silhouette as segments: placeholders, and the words that are still visible.
    public static func segments(of skeleton: Skeleton) -> [PreviewSegment] {
        segments(skeleton.text, map: nil)
    }

    /// The same layout with each placeholder's original value, for the on-this-device view.
    public static func segments(of result: SkeletonResult) -> [PreviewSegment] {
        segments(result.skeleton.text, map: result.map.value)
    }

    private static let placeholderRegex = try! NSRegularExpression(pattern: "\u{27E6}([DNW])([0-9]+)\u{27E7}")
    private static let wordRegex = try! NSRegularExpression(pattern: Skeletonizer.tokenPattern)

    private static func segments(_ text: String, map: PlaceholderMap?) -> [PreviewSegment] {
        let ns = text as NSString
        var out: [PreviewSegment] = []
        func appendText(_ s: String) {
            guard !s.isEmpty else { return }
            if case .text(let prev)? = out.last { out[out.count - 1] = .text(prev + s) } else { out.append(.text(s)) }
        }
        func appendPlain(_ s: String) {
            let sub = s as NSString
            var cursor = 0
            for m in wordRegex.matches(in: s, range: NSRange(location: 0, length: sub.length)) where m.range(at: 3).location != NSNotFound {
                appendText(sub.substring(with: NSRange(location: cursor, length: m.range.location - cursor)))
                out.append(.word(sub.substring(with: m.range(at: 3))))
                cursor = m.range.location + m.range.length
            }
            appendText(sub.substring(from: cursor))
        }
        var cursor = 0
        for m in placeholderRegex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            appendPlain(ns.substring(with: NSRange(location: cursor, length: m.range.location - cursor)))
            let kind = Character(ns.substring(with: m.range(at: 1)))
            let id = ns.substring(with: m.range(at: 1)) + ns.substring(with: m.range(at: 2))
            out.append(.placeholder(id: id, kind: kind, original: map?[id]))
            cursor = m.range.location + m.range.length
        }
        appendPlain(ns.substring(from: cursor))
        return out
    }

    // MARK: Extraction and review

    /// The fields of the pointer schema in schema order (list fields are handled as deductions).
    static func emptyFields(schema: JSON) -> [ReviewField] {
        (schema["properties"]?.objectValue?.entries ?? []).compactMap { name, spec in
            let kind: FieldKind
            switch spec["x-kind"]?.stringValue {
            case "text": kind = .text
            case "number": kind = .number
            case "date": kind = .date
            case "enum": kind = .choice((spec["enum"]?.arrayValue ?? []).compactMap(\.stringValue))
            default: return nil
            }
            return ReviewField(name: name, kind: kind, value: nil, found: false, confirmed: false, source: nil)
        }
    }

    /// Fills the review from an extractor's pointers, rehydrated against this document's map.
    public mutating func apply(_ result: PointerResult, silhouette: SkeletonResult, schema: JSON) {
        let rehydrated = Rehydrator.rehydrate(schema: schema, pointers: result.pointers, map: silhouette.map).value
        let lines = Self.sourceLines(silhouette)
        func source(_ refs: JSON?) -> String? {
            let ids: [String] = switch refs {
            case .string(let s)?: [s]
            case .array(let items)?: items.compactMap(\.stringValue)
            default: []
            }
            return ids.lazy.compactMap { lines[$0] }.first
        }
        var fields = Self.emptyFields(schema: schema)
        for i in fields.indices {
            guard let value = rehydrated[fields[i].name] else { continue }
            switch (fields[i].kind, value) {
            case (.number, .number(let n)): fields[i].value = .number(n)
            case (.choice, .string(let s)): fields[i].value = .choice(s)
            case (_, .string(let s)): fields[i].value = .text(s)
            default: continue
            }
            fields[i].found = true
            if case .choice = fields[i].kind { continue }  // a closed choice has no place in the document
            fields[i].source = source(result.pointers[fields[i].name])
        }
        // Deductions: rehydrated items keep their order; find each item's pointer for the source line.
        var rows: [DeductionRow] = []
        let pointerItems = result.pointers["deductions"]?.arrayValue ?? []
        for item in rehydrated["deductions"]?.arrayValue ?? [] {
            let amount = item["amount"]?.numberValue
            let pointer = pointerItems.first { p in
                p["amount"]?.stringValue.flatMap { silhouette.map.value[$0] }.flatMap(Rehydrator.parseNumber) == amount
            }
            rows.append(DeductionRow(id: UUID(), amount: amount, kind: item["kind"]?.stringValue, found: true, confirmed: false,
                                     source: source(pointer?["amount"])))
        }
        edit { d in
            d.extraction = (result.source, result.reason)
            d.fields = fields
            d.deductions = rows
            d.reviewed = true
        }
    }

    /// Every field empty, for typing the numbers by hand.
    public mutating func startManual(schema: JSON) {
        edit { d in
            d.extraction = nil
            d.fields = Self.emptyFields(schema: schema)
            d.deductions = []
            d.reviewed = true
            if d.sourceKind == nil { d.sourceKind = .manual }
        }
    }

    /// Placeholder id → the document line it sits on, with every placeholder on that line filled in.
    static func sourceLines(_ result: SkeletonResult) -> [String: String] {
        var out: [String: String] = [:]
        for line in result.skeleton.text.components(separatedBy: "\n") {
            let segs = segments(line, map: result.map.value)
            var original = ""
            var ids: [String] = []
            for seg in segs {
                switch seg {
                case .text(let s), .word(let s): original += s
                case .placeholder(let id, _, let value): original += value ?? ""; ids.append(id)
                }
            }
            let trimmed = original.trimmingCharacters(in: .whitespaces)
            for id in ids { out[id] = trimmed }
        }
        return out
    }

    /// The review fields, for showing the user their own values.
    public var fieldsForDisplay: [ReviewField] { draft.value.fields }
    public var deductionsForDisplay: [DeductionRow] { draft.value.deductions }

    /// Nothing was found in the document (not a paystub, or nothing readable).
    public var foundNothing: Bool {
        draft.value.extraction != nil && !draft.value.fields.contains { $0.found } && !draft.value.deductions.contains { $0.found }
    }

    /// Found values the user has not confirmed yet.
    public var pendingCount: Int {
        draft.value.fields.filter { $0.found && !$0.confirmed }.count + draft.value.deductions.filter { $0.found && !$0.confirmed }.count
    }

    public mutating func setField(_ name: String, _ value: FieldValue?) {
        edit { d in
            guard let i = d.fields.firstIndex(where: { $0.name == name }) else { return }
            d.fields[i].value = value
            d.fields[i].confirmed = value != nil
        }
    }

    public mutating func confirm(_ name: String) {
        edit { d in
            if let i = d.fields.firstIndex(where: { $0.name == name }) { d.fields[i].confirmed = true }
        }
    }

    public mutating func confirmAll() {
        edit { d in
            for i in d.fields.indices where d.fields[i].value != nil { d.fields[i].confirmed = true }
            for i in d.deductions.indices where d.deductions[i].amount != nil { d.deductions[i].confirmed = true }
        }
    }

    public mutating func addDeduction() {
        edit { $0.deductions.append(DeductionRow(id: UUID(), amount: nil, kind: nil, found: false, confirmed: false, source: nil)) }
    }

    public mutating func setDeduction(_ id: UUID, amount: Double?, kind: String?) {
        edit { d in
            guard let i = d.deductions.firstIndex(where: { $0.id == id }) else { return }
            d.deductions[i].amount = amount
            d.deductions[i].kind = kind
            d.deductions[i].confirmed = amount != nil
        }
    }

    public mutating func confirmDeduction(_ id: UUID) {
        edit { d in
            if let i = d.deductions.firstIndex(where: { $0.id == id }) { d.deductions[i].confirmed = true }
        }
    }

    public mutating func removeDeduction(_ id: UUID) {
        edit { $0.deductions.removeAll { $0.id == id } }
    }

    // MARK: Validation and annualization

    /// The current paystub as validation input (shared/validation/SPEC.md section 1).
    static func stub(_ d: DocumentDraft) -> JSON {
        var o = JSONObject()
        for f in d.fields {
            switch (f.name, f.value) {
            case ("grossPay", .number(let n)?), ("netPay", .number(let n)?), ("ytdGross", .number(let n)?),
                 ("hoursWorked", .number(let n)?), ("hourlyRate", .number(let n)?):
                o[f.name] = .number(n)
            case ("payFrequency", .choice(let c)?):
                o[f.name] = .string(c)
            case ("payDate", .text(let t)?), ("periodStart", .text(let t)?), ("periodEnd", .text(let t)?):
                o[f.name] = .string(t)
            default: break
            }
        }
        let rows = d.deductions.compactMap { row -> JSON? in
            guard let amount = row.amount else { return nil }
            var item = JSONObject([("amount", .number(amount))])
            if let kind = row.kind { item["kind"] = .string(kind) }
            return .object(item)
        }
        if !rows.isEmpty { o["deductions"] = .array(rows) }
        return .object(o)
    }

    /// Checks for every confirmed paystub plus this one, and the yearly income.
    public func validation(jurisdiction: String) throws(ValidationInputError) -> ValidationResult {
        let d = draft.value
        return try Validator.validatePaystubs(Raw(d.confirmedStubs + [Self.stub(d)]), jurisdiction: jurisdiction)
    }

    /// Keeps this paystub for annualization and starts another document.
    public mutating func addAnother() {
        edit { d in
            d.confirmedStubs.append(Self.stub(d))
            d.text = nil
            d.sourceKind = nil
            d.sampleId = nil
            d.hidden = []
            d.extraction = nil
            d.reviewed = false
            d.fields = []
            d.deductions = []
        }
    }

    public mutating func reset() {
        draft = Raw(DocumentDraft(language: language))
    }
}

// MARK: - Storage

/// The stored form of the draft. Everything in it is Raw and only ever written encrypted.
enum DocumentCodec {
    static func encode(_ d: DocumentDraft) -> JSON {
        var o = JSONObject()
        o["version"] = .number(1)
        o["language"] = .string(d.language.rawValue)
        if let s = d.sourceKind { o["source"] = .string(s.rawValue) }
        if let s = d.sampleId { o["sampleId"] = .string(s) }
        if let t = d.text { o["text"] = .string(t) }
        o["hidden"] = .array(d.hidden.map(JSON.string))
        if let e = d.extraction { o["extraction"] = .object(JSONObject([("source", .string(e.source.rawValue)), ("reason", .string(e.reason.rawValue))])) }
        o["reviewed"] = .bool(d.reviewed)
        func value(_ v: FieldValue?) -> JSON {
            switch v {
            case .text(let s)?: .object(JSONObject([("text", .string(s))]))
            case .number(let n)?: .object(JSONObject([("number", .number(n))]))
            case .choice(let c)?: .object(JSONObject([("choice", .string(c))]))
            case nil: .null
            }
        }
        o["fields"] = .array(d.fields.map { f in
            .object(JSONObject([("name", .string(f.name)), ("value", value(f.value)), ("found", .bool(f.found)),
                                ("confirmed", .bool(f.confirmed)), ("source", f.source.map(JSON.string) ?? .null)]))
        })
        o["deductions"] = .array(d.deductions.map { r in
            .object(JSONObject([("amount", r.amount.map(JSON.number) ?? .null), ("kind", r.kind.map(JSON.string) ?? .null),
                                ("found", .bool(r.found)), ("confirmed", .bool(r.confirmed)), ("source", r.source.map(JSON.string) ?? .null)]))
        })
        o["confirmedStubs"] = .array(d.confirmedStubs)
        return .object(o)
    }

    static func decode(_ json: JSON, schema: JSON) -> DocumentDraft? {
        guard let language = json["language"]?.stringValue.flatMap(AppLocale.init(rawValue:)) else { return nil }
        var d = DocumentDraft(language: language)
        d.sourceKind = json["source"]?.stringValue.flatMap(DocumentSourceKind.init(rawValue:))
        d.sampleId = json["sampleId"]?.stringValue
        d.text = json["text"]?.stringValue
        d.hidden = (json["hidden"]?.arrayValue ?? []).compactMap(\.stringValue)
        if let s = json["extraction"]?["source"]?.stringValue.flatMap(InferenceSource.init(rawValue:)),
           let r = json["extraction"]?["reason"]?.stringValue.flatMap(RoutingReason.init(rawValue:)) {
            d.extraction = (s, r)
        }
        d.reviewed = json["reviewed"]?.boolValue ?? false
        var fields = DocumentSession.emptyFields(schema: schema)
        for item in json["fields"]?.arrayValue ?? [] {
            guard let name = item["name"]?.stringValue, let i = fields.firstIndex(where: { $0.name == name }) else { continue }
            let v = item["value"]
            fields[i].value = v?["text"]?.stringValue.map(FieldValue.text) ?? v?["number"]?.numberValue.map(FieldValue.number)
                ?? v?["choice"]?.stringValue.map(FieldValue.choice)
            fields[i].found = item["found"]?.boolValue ?? false
            fields[i].confirmed = item["confirmed"]?.boolValue ?? false
            fields[i].source = item["source"]?.stringValue
        }
        d.fields = d.reviewed ? fields : []
        d.deductions = (json["deductions"]?.arrayValue ?? []).map { r in
            DeductionRow(id: UUID(), amount: r["amount"]?.numberValue, kind: r["kind"]?.stringValue, found: r["found"]?.boolValue ?? false,
                         confirmed: r["confirmed"]?.boolValue ?? false, source: r["source"]?.stringValue)
        }
        d.confirmedStubs = json["confirmedStubs"]?.arrayValue ?? []
        return d
    }
}
