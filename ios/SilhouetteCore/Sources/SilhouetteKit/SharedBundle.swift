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
        copy = CopyBook(tables: tables)
        tokens = try DesignTokens(json: json("design/tokens.json"))
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
    }

    public let jurisdiction: String
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
            return Program(id: id, name: p["name"]?.stringValue ?? id, period: p["period"]?.stringValue,
                           caveats: (p["caveats"]?.arrayValue ?? []).compactMap(\.stringValue), applyUrl: p["applyUrl"]?.stringValue)
        }
    }

    public func program(_ id: String) -> Program? { programs.first { $0.id == id } }
}
