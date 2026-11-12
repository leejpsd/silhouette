// UI copy: shared/copy/{locale}.json (app-wide), shared/rulepacks/{jurisdiction}/copy/{locale}.json
// (pack labels; key conventions in shared/rulepacks/SPEC.md section 1) and the app's own
// copy.local.json for keys not yet in shared/copy.
// Per-key lookup: shared/{locale} → pack/{locale} → local/{locale} → the same three for en.

import Foundation
import SilhouetteCore

public enum AppLocale: String, Sendable, CaseIterable, Identifiable {
    case en, es, ko

    public var id: String { rawValue }

    /// The language's name in that language (never translated).
    public var nativeName: String {
        switch self {
        case .en: "English"
        case .es: "Español"
        case .ko: "한국어"
        }
    }

    /// The first supported language in the user's preference list, else English.
    public static func preferred(from languages: [String]) -> AppLocale {
        for tag in languages {
            let code = Locale(identifier: tag).language.languageCode?.identifier ?? String(tag.prefix(2))
            if let locale = AppLocale(rawValue: code) { return locale }
        }
        return .en
    }
}

public struct CopyBook: Sendable {
    public enum Source: Sendable, CaseIterable { case shared, pack, local }

    let tables: [AppLocale: [Source: JSONObject]]

    public init(tables: [AppLocale: [Source: JSONObject]]) {
        self.tables = tables
    }

    private func inLocale(_ locale: AppLocale, _ key: String) -> String? {
        for source in Source.allCases {
            if let s = tables[locale]?[source]?[key]?.stringValue { return s }
        }
        return nil
    }

    /// The template for `key` with per-key fallback to English, or nil when no table has it.
    public func lookup(_ key: String, _ locale: AppLocale) -> String? {
        inLocale(locale, key) ?? inLocale(.en, key)
    }

    public func has(_ key: String) -> Bool { lookup(key, .en) != nil }

    /// The text for `key` with `{name}` placeholders filled. A missing key returns the key itself
    /// (tests check that every key the app uses exists).
    public func text(_ key: String, _ locale: AppLocale, _ params: [String: String] = [:]) -> String {
        Self.format(lookup(key, locale) ?? key, params)
    }

    /// Replaces `{name}` with `params[name]`; unknown placeholders stay as they are.
    public static func format(_ template: String, _ params: [String: String]) -> String {
        guard !params.isEmpty else { return template }
        var out = ""
        var rest = Substring(template)
        while let open = rest.firstIndex(of: "{") {
            out += rest[..<open]
            let afterOpen = rest.index(after: open)
            if let close = rest[afterOpen...].firstIndex(of: "}"),
               let value = params[String(rest[afterOpen..<close])] {
                out += value
                rest = rest[rest.index(after: close)...]
            } else {
                out += "{"
                rest = rest[afterOpen...]
            }
        }
        return out + rest
    }

    /// Keys of a source table (for tests).
    public func keys(_ source: Source, _ locale: AppLocale) -> [String] {
        tables[locale]?[source]?.keys ?? []
    }

    // MARK: Domain helpers

    /// `program.{id}.name` from the pack copy, falling back to the pack's `name`.
    public func programName(_ program: PackInfo.Program, _ locale: AppLocale) -> String {
        lookup("program.\(program.id).name", locale) ?? program.name
    }

    /// Whole numbers in the locale's style (Intl.NumberFormat with no fraction digits).
    public static func formatNumber(_ value: Double, _ locale: AppLocale) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: locale.rawValue)
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: value)) ?? String(Int(value))
    }

    /// A typed money amount: whole numbers without decimals, otherwise two decimals.
    public static func formatAmount(_ value: Double, _ locale: AppLocale) -> String {
        let f = NumberFormatter()
        f.locale = Locale(identifier: locale.rawValue)
        f.numberStyle = .decimal
        let whole = value.rounded() == value
        f.minimumFractionDigits = whole ? 0 : 2
        f.maximumFractionDigits = 2
        return f.string(from: NSNumber(value: value)) ?? String(value)
    }

    public func bandLabel(_ band: Bands.IncomeBand, _ locale: AppLocale) -> String {
        let n = { Self.formatNumber($0, locale) }
        guard let max = band.max else { return text("income.band.top", locale, ["amount": n(band.min)]) }
        if band.min == 0 { return text("income.band.under", locale, ["amount": n(max + 1)]) }
        return text("income.band.range", locale, ["min": n(band.min), "max": n(max)])
    }
}
