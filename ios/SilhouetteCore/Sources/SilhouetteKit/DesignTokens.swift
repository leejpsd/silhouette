// shared/design/tokens.json: colors (light and dark), type scale, spacing, radii and sizes.
// The app builds its SwiftUI theme from these values at launch.

import Foundation
import SilhouetteCore

public struct DesignTokens: Sendable {
    public struct RGBA: Sendable, Equatable {
        public let red: Double, green: Double, blue: Double, alpha: Double
        public init(red: Double, green: Double, blue: Double, alpha: Double) {
            self.red = red
            self.green = green
            self.blue = blue
            self.alpha = alpha
        }
    }

    public struct TypeStyle: Sendable {
        public let size: Double
        public let lineHeight: Double
        public let weight: Double
        public let letterSpacing: Double
        /// `display`, `text` or `mono` (the typeface role), when the file names one.
        public let family: String?
    }

    public let light: [String: RGBA]
    public let dark: [String: RGBA]
    public let type: [String: TypeStyle]
    public let spacing: [String: Double]
    public let radius: [String: Double]
    public let size: [String: Double]
    /// The whole token file, for structured values (rotation, motion, shadows, compact sizes).
    public let json: JSON

    /// A number at a dotted path (`motion.duration.rise`), or the first number of an array there.
    public func number(_ path: String) -> Double? {
        var node: JSON? = json
        for key in path.split(separator: ".") { node = node?[String(key)] }
        if let n = node?.numberValue { return n }
        return node?.arrayValue?.first?.numberValue
    }

    /// Numbers of an array at a dotted path (`motion.easing.standard`).
    public func numbers(_ path: String) -> [Double] {
        var node: JSON? = json
        for key in path.split(separator: ".") { node = node?[String(key)] }
        return node?.arrayValue?.compactMap(\.numberValue) ?? []
    }

    /// No tokens (every lookup falls back to its default).
    public static let empty = DesignTokens()

    private init() {
        json = .object(JSONObject())
        light = [:]
        dark = [:]
        type = [:]
        spacing = [:]
        radius = [:]
        size = [:]
    }

    public init(json: JSON) throws {
        func colors(_ mode: String) throws -> [String: RGBA] {
            guard let table = json["color"]?[mode]?.objectValue else { throw SharedBundle.ContentError.malformed("tokens.json", "no \(mode) colors") }
            var out: [String: RGBA] = [:]
            for (name, value) in table.entries {
                guard let hex = value.stringValue, let rgba = Self.parseHex(hex) else {
                    throw SharedBundle.ContentError.malformed("tokens.json", "bad color \(name)")
                }
                out[name] = rgba
            }
            return out
        }
        func numbers(_ key: String) -> [String: Double] {
            var out: [String: Double] = [:]
            for (name, value) in json[key]?.objectValue?.entries ?? [] { if let n = value.numberValue { out[name] = n } }
            return out
        }
        self.json = json
        light = try colors("light")
        dark = try colors("dark")
        var styles: [String: TypeStyle] = [:]
        for (name, value) in json["typography"]?["scale"]?.objectValue?.entries ?? [] {
            guard let size = value["size"]?.numberValue, let line = value["lineHeight"]?.numberValue else { continue }
            styles[name] = TypeStyle(size: size, lineHeight: line, weight: value["weight"]?.numberValue ?? 400,
                                     letterSpacing: value["letterSpacing"]?.numberValue ?? 0, family: value["family"]?.stringValue)
        }
        type = styles
        spacing = numbers("spacing")
        radius = numbers("radius")
        size = numbers("size")
    }

    /// `#RRGGBB` or `#RRGGBBAA`.
    static func parseHex(_ hex: String) -> RGBA? {
        guard hex.hasPrefix("#"), hex.count == 7 || hex.count == 9, let v = UInt64(hex.dropFirst(), radix: 16) else { return nil }
        let hasAlpha = hex.count == 9
        let r = (v >> (hasAlpha ? 24 : 16)) & 0xFF, g = (v >> (hasAlpha ? 16 : 8)) & 0xFF, b = (v >> (hasAlpha ? 8 : 0)) & 0xFF
        let a = hasAlpha ? v & 0xFF : 0xFF
        return RGBA(red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, alpha: Double(a) / 255)
    }
}
