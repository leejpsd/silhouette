// Remote Config values the app reads, with defaults from the bundled copy of
// firebase/remoteconfig.template.json. Nothing is fetched at start; the app fetches right before its
// first model request.

import Foundation
import SilhouetteCore

public struct AppConfig: Sendable, Equatable {
    public var shortTextMaxWords: Int
    /// Locales the on-device model is used for (route_ondevice_locales_ios).
    public var onDeviceLocales: [String]
    public var promptPointerExtractV: Int
    public var promptExplainV: Int

    public static let keys = ["route_short_text_max_words", "route_ondevice_locales_ios", "prompt_pointer_extract_v", "prompt_explain_v"]

    /// Builds the values from Remote Config strings (defaults or fetched).
    public init(values: [String: String]) {
        shortTextMaxWords = values["route_short_text_max_words"].flatMap { Int($0) } ?? 80
        let locales = values["route_ondevice_locales_ios"].flatMap { try? JSON.parse($0) }?.arrayValue?.compactMap(\.stringValue)
        onDeviceLocales = locales ?? ["en", "es", "ko"]
        promptPointerExtractV = values["prompt_pointer_extract_v"].flatMap { Int($0) } ?? 4
        promptExplainV = values["prompt_explain_v"].flatMap { Int($0) } ?? 3
    }

    /// Every parameter's default value from the template, as strings.
    public static func defaultValues(template: JSON) -> [String: String] {
        var out: [String: String] = [:]
        for (key, param) in template["parameters"]?.objectValue?.entries ?? [] {
            if let v = param["defaultValue"]?["value"]?.stringValue { out[key] = v }
        }
        return out
    }
}
