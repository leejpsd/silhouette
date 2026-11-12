// Contract files bundled from shared/ by scripts/sync-shared.sh (a build phase), read with the
// JSON parser from SilhouetteCore.

import Foundation
import SilhouetteCore

enum SharedContent {
    enum LoadError: Error, CustomStringConvertible {
        case missing(String)
        case malformed(String, JSONParseError)

        var description: String {
            switch self {
            case .missing(let path): "Missing bundled file: Shared/\(path)"
            case .malformed(let path, let error): "Malformed bundled file Shared/\(path): \(error)"
            }
        }
    }

    static var directory: URL? { Bundle.main.resourceURL?.appendingPathComponent("Shared", isDirectory: true) }

    static func json(_ relativePath: String) throws -> JSON {
        guard let url = directory?.appendingPathComponent(relativePath), let data = try? Data(contentsOf: url) else {
            throw LoadError.missing(relativePath)
        }
        do {
            return try JSON.parse(data)
        } catch {
            throw LoadError.malformed(relativePath, error)
        }
    }
}

/// UI strings from shared/copy/{locale}.json. `en` is complete; other locales fall back to it
/// key by key.
struct AppCopy {
    static let supportedLocales = ["en", "es", "ko"]

    let locale: String
    private let strings: JSONObject
    private let english: JSONObject

    init(preferredLanguages: [String] = Locale.preferredLanguages) throws {
        let english = try SharedContent.json("copy/en.json").objectValue ?? JSONObject()
        let locale = preferredLanguages
            .compactMap { Locale(identifier: $0).language.languageCode?.identifier }
            .first { Self.supportedLocales.contains($0) } ?? "en"
        self.locale = locale
        self.english = english
        self.strings = locale == "en" ? english : (try SharedContent.json("copy/\(locale).json").objectValue ?? JSONObject())
    }

    subscript(key: String) -> String {
        strings[key]?.stringValue ?? english[key]?.stringValue ?? key
    }
}
