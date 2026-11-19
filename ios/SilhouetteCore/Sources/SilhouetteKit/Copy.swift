// UI copy: shared/copy/{locale}.json (app-wide), shared/rulepacks/{jurisdiction}/copy/{locale}.json
// (pack labels; key conventions in shared/rulepacks/SPEC.md section 1) and the app's own
// copy.local.json for keys not yet in shared/copy.
// Per-key lookup: shared/{locale} → pack/{locale} → local/{locale} → the same three for en; a key that
// names the platform has variants, and `{key}.ios` is looked up first (shared/copy/PLATFORM_VARIANTS.md).
// Every string found then names the device the iOS way ("this iPhone"; `DeviceNoun`).

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

    /// The languages the app offers: English and Spanish. Korean copy stays in the shared contract but
    /// is not offered in any picker or sample list.
    public static let offered: [AppLocale] = [.en, .es]

    /// The first offered language in the user's preference list, else English.
    public static func preferred(from languages: [String]) -> AppLocale {
        for tag in languages {
            let code = Locale(identifier: tag).language.languageCode?.identifier ?? String(tag.prefix(2))
            if let locale = AppLocale(rawValue: code), offered.contains(locale) { return locale }
        }
        return .en
    }
}

/// The device noun (shared/copy/PLATFORM_VARIANTS.md, section "The device noun"): after lookup, the
/// phrases of `copy/platform/device-noun.json` for the string's language become this platform's name
/// for the device ("this device" → "this iPhone"). Whole phrases, case-sensitive, longest first; never
/// inside `{…}` and never next to a letter, a digit or a hyphen ("on-device model" stays).
public struct DeviceNoun: Sendable {
    /// Per language, (phrase, replacement) with the longest phrase first.
    let phrases: [AppLocale: [(from: [Character], to: String)]]

    public init() { phrases = [:] }

    /// - Parameter json: the parsed `device-noun.json`; `platform` is "ios" or "android".
    public init(json: JSON?, platform: String = CopyBook.platform) {
        var out: [AppLocale: [(from: [Character], to: String)]] = [:]
        for locale in AppLocale.allCases {
            guard let map = json?[locale.rawValue]?[platform]?.objectValue else { continue }
            let pairs = map.keys.compactMap { key in map[key]?.stringValue.map { (from: Array(key), to: $0) } }
            out[locale] = pairs.sorted { a, b in a.from.count != b.from.count ? a.from.count > b.from.count : String(a.from) < String(b.from) }
        }
        phrases = out
    }

    /// The text this platform shows for a copy string in `locale`.
    public func apply(_ text: String, _ locale: AppLocale) -> String {
        guard let list = phrases[locale], !list.isEmpty else { return text }
        let chars = Array(text)
        var out = ""
        var i = 0
        scan: while i < chars.count {
            if chars[i] == "{", let end = chars[i...].firstIndex(of: "}") {
                out += String(chars[i...end])
                i = end + 1
                continue
            }
            for (from, to) in list where i + from.count <= chars.count && Array(chars[i..<i + from.count]) == from {
                let before: Character? = i > 0 ? chars[i - 1] : nil
                let after: Character? = i + from.count < chars.count ? chars[i + from.count] : nil
                if Self.joins(before) || Self.joins(after) { continue }
                out += to
                i += from.count
                continue scan
            }
            out.append(chars[i])
            i += 1
        }
        return out
    }

    /// A letter, mark or digit, or a hyphen: a phrase next to it is part of another word.
    private static func joins(_ c: Character?) -> Bool {
        guard let c else { return false }
        if c == "-" { return true }
        return c.unicodeScalars.contains { scalar in
            switch scalar.properties.generalCategory {
            case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
                 .nonspacingMark, .spacingMark, .enclosingMark, .decimalNumber, .letterNumber, .otherNumber: true
            default: false
            }
        }
    }
}

public struct CopyBook: Sendable {
    public enum Source: Sendable, CaseIterable { case shared, pack, local }

    let tables: [AppLocale: [Source: JSONObject]]
    let nouns: DeviceNoun

    public init(tables: [AppLocale: [Source: JSONObject]], nouns: DeviceNoun = DeviceNoun()) {
        self.tables = tables
        self.nouns = nouns
    }

    private func inLocale(_ locale: AppLocale, _ key: String) -> String? {
        for source in Source.allCases {
            if let s = tables[locale]?[source]?[key]?.stringValue { return nouns.apply(s, locale) }
        }
        return nil
    }

    /// This app's platform, for keys that name the platform (`shared/copy/PLATFORM_VARIANTS.md`).
    public static let platform = "ios"

    /// The template for `key` with per-key fallback to English, or nil when no table has it. A key that
    /// names the platform is looked up as `{key}.ios` first, then as the plain key.
    public func lookup(_ key: String, _ locale: AppLocale) -> String? {
        let variant = "\(key).\(Self.platform)"
        return inLocale(locale, variant) ?? inLocale(.en, variant) ?? inLocale(locale, key) ?? inLocale(.en, key)
    }

    /// The language the template for `key` comes from (its own, or English as the fallback).
    private func language(of key: String, _ locale: AppLocale) -> AppLocale? {
        let variant = "\(key).\(Self.platform)"
        if inLocale(locale, variant) != nil { return locale }
        if inLocale(.en, variant) != nil { return .en }
        if inLocale(locale, key) != nil { return locale }
        if inLocale(.en, key) != nil { return .en }
        return nil
    }

    /// One and many (shared/copy/PLATFORM_VARIANTS.md): with `count` equal to 1, `{key}.one` in the
    /// same language as the plain key, when that language has it.
    func counted(_ key: String, _ locale: AppLocale, _ params: [String: String]) -> String? {
        guard let count = params["count"], Self.isOne(count), let language = language(of: key, locale) else { return nil }
        return inLocale(language, "\(key).one")
    }

    /// The count as the app formats it: plain digits.
    static func isOne(_ count: String) -> Bool { count.trimmingCharacters(in: .whitespaces) == "1" }

    public func has(_ key: String) -> Bool { lookup(key, .en) != nil }

    /// The text for `key` with `{name}` placeholders filled. A missing key returns the key itself
    /// (tests check that every key the app uses exists).
    public func text(_ key: String, _ locale: AppLocale, _ params: [String: String] = [:]) -> String {
        Self.format(counted(key, locale, params) ?? lookup(key, locale) ?? key, params)
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

    /// Money in the pack's currency, written the way the jurisdiction writes it (`format`, a BCP 47
    /// tag such as `en-US`) in every interface language, always grouped; without a format, in the UI
    /// language. Plain numbers without a currency. Whole amounts have no decimals; `cents: true`
    /// keeps two.
    public static func formatMoney(_ value: Double, _ locale: AppLocale, currency: String?, format: String? = nil,
                                   cents: Bool = false) -> String {
        guard let currency else { return cents ? formatAmount(value, locale) : formatNumber(value, locale) }
        let f = NumberFormatter()
        f.locale = Locale(identifier: format ?? locale.rawValue)
        f.numberStyle = .currency
        f.currencyCode = currency
        f.usesGroupingSeparator = true
        f.minimumGroupingDigits = 1
        let whole = value.rounded() == value
        f.minimumFractionDigits = cents && !whole ? 2 : 0
        f.maximumFractionDigits = cents ? 2 : 0
        return f.string(from: NSNumber(value: value)) ?? formatNumber(value, locale)
    }

    public func bandLabel(_ band: Bands.IncomeBand, _ locale: AppLocale, currency: String? = nil, format: String? = nil) -> String {
        let n = { Self.formatMoney($0, locale, currency: currency, format: format) }
        guard let max = band.max else { return text("income.band.top", locale, ["amount": n(band.min)]) }
        if band.min == 0 { return text("income.band.under", locale, ["amount": n(max + 1)]) }
        return text("income.band.range", locale, ["min": n(band.min), "max": n(max)])
    }
}
