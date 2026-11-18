// The contract files the app reads at runtime. In the app they are copied into the bundle under
// `Shared/` by scripts/sync-shared.sh; tests read the repository's shared/ folder directly.
// Both use the same layout as shared/.

import Foundation
import SilhouetteCore

public struct SharedBundle: Sendable {
    public let pack: RulePack
    public let packInfo: PackInfo
    public let bands: Bands
    public let copy: CopyBook
    public let tokens: DesignTokens
    /// `skeleton/allowlist/{language}.json` per language.
    public let allowlistFiles: [AppLocale: JSON]
    /// `schemas/pointer.paystub.json`
    public let paystubSchema: JSON
    /// Bundled sample documents (`samples/*.txt`), synthetic.
    public let samples: [SampleDocument]
    /// Pointer-extraction prompts by version (`prompts/pointer-extract.v{n}.md`).
    public let pointerPrompts: [Int: String]
    /// Every bundled prompt (`prompts/*.md`).
    public let prompts: PromptLibrary
    /// `prompts/output-checks.json`
    public let outputChecks: JSON
    /// `samples/answers.json`: answer keys of the bundled samples.
    public let sampleAnswers: JSON
    /// Remote Config defaults: the bundled copy of firebase/remoteconfig.template.json, when present.
    public let remoteConfigTemplate: JSON?
    /// The judges' prepared household of this pack (`rulepacks/{jurisdiction}/judges-household.json`).
    public let judgesHousehold: JudgesHousehold?
    /// The on-device check's fixed cases (`fixtures/device-check/cases.json`).
    public let deviceCheckCases: JSON?
    /// The routing table (`routing.json`): where each task runs.
    public let routing: JSON?
    /// The folder the bundle was read from (laid out like shared/).
    public let directory: URL

    /// - Parameters:
    ///   - directory: a folder laid out like shared/ (`copy/`, `rulepacks/`, `bands/`, `design/`).
    ///   - jurisdiction: the rule pack to load.
    ///   - localCopy: app strings that are not in shared/copy yet (`{"en": {...}, "es": {...}}`).
    public init(directory: URL, jurisdiction: String = "zz-test", localCopy: JSON? = nil) throws {
        func json(_ path: String) throws -> JSON {
            let url = directory.appendingPathComponent(path)
            guard let data = try? Data(contentsOf: url) else { throw ContentError.missing(path) }
            do { return try JSON.parse(data) } catch { throw ContentError.malformed(path, error.description) }
        }
        let packJSON = try json("rulepacks/\(jurisdiction)/pack.json")
        pack = try RulePack(json: packJSON)
        packInfo = try PackInfo(json: packJSON)
        bands = try Bands(json: json("bands/\(jurisdiction).json"))
        var tables: [AppLocale: [CopyBook.Source: JSONObject]] = [:]
        for locale in AppLocale.allCases {
            tables[locale, default: [:]][.shared] = try json("copy/\(locale.rawValue).json").objectValue ?? JSONObject()
            tables[locale, default: [:]][.pack] = try json("rulepacks/\(jurisdiction)/copy/\(locale.rawValue).json").objectValue ?? JSONObject()
            tables[locale, default: [:]][.local] = localCopy?[locale.rawValue]?.objectValue ?? JSONObject()
        }
        // The device noun table ships with the copy; without it strings show as written.
        copy = CopyBook(tables: tables, nouns: DeviceNoun(json: try? json("copy/platform/device-noun.json")))
        tokens = try DesignTokens(json: json("design/tokens.json"))
        var lists: [AppLocale: JSON] = [:]
        for locale in AppLocale.allCases { lists[locale] = try json("skeleton/allowlist/\(locale.rawValue).json") }
        allowlistFiles = lists
        paystubSchema = try json("schemas/pointer.paystub.json")
        func text(_ path: String) -> String? {
            (try? Data(contentsOf: directory.appendingPathComponent(path))).map { String(decoding: $0, as: UTF8.self) }
        }
        samples = SampleDocument.catalog.compactMap { entry in
            text("samples/\(entry.id).txt").map { SampleDocument(id: entry.id, language: entry.language, titleKey: entry.titleKey, text: Raw($0)) }
        }
        var prompts: [Int: String] = [:]
        for version in 1...20 {
            if let t = text("prompts/pointer-extract.v\(version).md") { prompts[version] = t }
        }
        pointerPrompts = prompts
        self.prompts = try PromptLibrary(directory: directory.appendingPathComponent("prompts", isDirectory: true))
        outputChecks = try json("prompts/output-checks.json")
        sampleAnswers = try json("samples/answers.json")
        remoteConfigTemplate = try? json("remoteconfig.template.json")
        self.directory = directory
        let info = packInfo
        judgesHousehold = (try? json("rulepacks/\(jurisdiction)/judges-household.json")).flatMap { try? JudgesHousehold(json: $0, pack: info) }
        deviceCheckCases = try? json("fixtures/device-check/cases.json")
        routing = try? json("routing.json")
    }

    /// A file of the bundle by its path under shared/ (`fixtures/device-check/documents/en-l01-1.txt`).
    public func data(_ path: String) -> Data? { try? Data(contentsOf: directory.appendingPathComponent(path)) }

    /// The allowlist for a document: its language's list ∪ en (skeleton/SPEC.md section 4).
    public func allowlist(for language: AppLocale) throws -> Allowlist {
        let files = [allowlistFiles[.en], language == .en ? nil : allowlistFiles[language]].compactMap { $0 }
        return try Allowlist(files: files)
    }

    /// The pointer-extraction prompt for a Remote Config version; an unknown version means the newest.
    public func pointerPrompt(version: Int?) -> (version: Int, text: String)? {
        if let version, let text = pointerPrompts[version] { return (version, text) }
        guard let newest = pointerPrompts.keys.max() else { return nil }
        return (newest, pointerPrompts[newest]!)
    }

    public enum ContentError: Error, CustomStringConvertible {
        case missing(String)
        case malformed(String, String)

        public var description: String {
            switch self {
            case .missing(let path): "Missing contract file: \(path)"
            case .malformed(let path, let why): "Malformed contract file \(path): \(why)"
            }
        }
    }
}

/// The parts of a rule pack the UI shows (shared/rulepacks/SPEC.md section 2), beyond what the
/// verdict engine reads.
public struct PackInfo: Sendable {
    public struct Question: Sendable {
        public let id: String
        public let type: String
        public let sensitive: Bool
        public let values: [String]
        public let min: Int?
        public let max: Int?
    }

    public struct Program: Sendable {
        public let id: String
        public let name: String
        public let period: String?
        public let caveats: [String]
        public let applyUrl: String?
        /// Official sources (https only), with the date a person compared the numbers, when they have.
        public let sources: [Source]
        public let docsRequired: [String]
    }

    public struct Source: Sendable {
        public let url: String
        public let title: String
        public let checkedAt: String?
    }

    public let jurisdiction: String
    /// `draft`: read from official sources (on `sourcesReadOn`), not all confirmed by a person.
    public let status: String?
    public let sourcesReadOn: String?
    public var isDraft: Bool { status == "draft" }
    /// ISO 4217 code when the pack names one: amounts, limits and income ranges are money.
    public let currency: String?
    /// BCP 47 tag of the jurisdiction's number conventions (`en-US`): money is written this way in
    /// every interface language.
    public let numberFormat: String?
    public let verifiedOn: String?
    public let questions: [Question]
    public let questionOrder: [String]?
    public let programs: [Program]

    /// Synthetic packs used only for tests and demos.
    public static let demoJurisdictions: Set<String> = ["zz-test"]
    public var isDemo: Bool { Self.demoJurisdictions.contains(jurisdiction) }

    public init(json: JSON) throws {
        guard let jurisdiction = json["jurisdiction"]?.stringValue,
              let questions = json["questions"]?.arrayValue,
              let programs = json["programs"]?.arrayValue
        else { throw SharedBundle.ContentError.malformed("pack.json", "missing jurisdiction, questions or programs") }
        func int(_ value: JSON?) -> Int? {
            guard let n = value?.numberValue, n.rounded() == n, abs(n) < 1e9 else { return nil }
            return Int(n)
        }
        self.jurisdiction = jurisdiction
        self.status = json["status"]?.stringValue
        self.sourcesReadOn = json["sourcesReadOn"]?.stringValue
        self.currency = json["currency"]?.stringValue
        self.numberFormat = json["numberFormat"]?.stringValue
        self.verifiedOn = json["verifiedOn"]?.stringValue
        self.questions = try questions.map { q in
            guard let id = q["id"]?.stringValue, let type = q["type"]?.stringValue else {
                throw SharedBundle.ContentError.malformed("pack.json", "malformed question")
            }
            return Question(id: id, type: type, sensitive: q["sensitive"]?.boolValue ?? false,
                            values: (q["values"]?.arrayValue ?? []).compactMap(\.stringValue), min: int(q["min"]), max: int(q["max"]))
        }
        self.questionOrder = json["questionOrder"]?.arrayValue?.compactMap(\.stringValue)
        self.programs = try programs.map { p in
            guard let id = p["id"]?.stringValue else { throw SharedBundle.ContentError.malformed("pack.json", "malformed program") }
            let sources = (p["sources"]?.arrayValue ?? []).compactMap { s -> Source? in
                guard let url = s["url"]?.stringValue, url.hasPrefix("https://") else { return nil }
                return Source(url: url, title: s["title"]?.stringValue ?? url, checkedAt: s["checkedAt"]?.stringValue)
            }
            let apply = p["applyUrl"]?.stringValue.flatMap { $0.hasPrefix("https://") ? $0 : nil }
            return Program(id: id, name: p["name"]?.stringValue ?? id, period: p["period"]?.stringValue,
                           caveats: (p["caveats"]?.arrayValue ?? []).compactMap(\.stringValue), applyUrl: apply, sources: sources,
                           docsRequired: (p["docsRequired"]?.arrayValue ?? []).compactMap(\.stringValue))
        }
    }

    public func program(_ id: String) -> Program? { programs.first { $0.id == id } }
}
