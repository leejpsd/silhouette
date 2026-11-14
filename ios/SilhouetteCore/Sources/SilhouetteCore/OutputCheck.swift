// Checks on model text: shared/prompts/OUTPUT_CHECKS.md, phrases in shared/prompts/output-checks.json.
// A model explains; it never decides. Text that states a result is not shown.

import Foundation

public enum OutputCheck {
    public enum Scope: String, Sendable {
        /// The task knows only the silhouette: hedged results are blocked too.
        case general
        /// The task knows the person's result: only definite results are blocked.
        case personal
    }

    /// JavaScript's `\\s` (whitespace and line terminators).
    static func isJSWhitespace(_ u: UInt16) -> Bool {
        switch u {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
        default: false
        }
    }

    /// Invisible characters removed before matching: soft hyphen, zero-width space, joiners, word
    /// joiner, byte order mark.
    static func isInvisible(_ u: UInt16) -> Bool {
        u == 0x00AD || (0x200B...0x200D).contains(u) || u == 0x2060 || u == 0xFEFF
    }

    /// NFC, locale-independent lowercase, invisible characters removed, curly apostrophes to `'`,
    /// whitespace runs to one space.
    static func normalize(_ text: String) -> [UInt16] {
        var out: [UInt16] = []
        var inSpace = false
        for u in text.precomposedStringWithCanonicalMapping.lowercased().utf16 {
            if isInvisible(u) { continue }
            if isJSWhitespace(u) {
                if !inSpace { out.append(0x20) }
                inSpace = true
                continue
            }
            inSpace = false
            out.append(u == 0x2018 || u == 0x2019 ? 0x27 : u)
        }
        return out
    }

    /// True when the text must not be shown. General tasks block every result phrase (positive,
    /// negative, criterion); a personal task with the person's `verdict` also blocks the phrases that
    /// contradict it (positive against `unlikely`, negative against `likely`).
    public static func isBlocked(_ text: String, locale: String, scope: Scope, checks: JSON, verdict: String? = nil) -> Bool {
        let locales = checks["locales"]?.objectValue ?? JSONObject()
        let rules = locales[locale] ?? locales["en"] ?? .null
        func list(_ key: String) -> [[UInt16]] { (rules[key]?.arrayValue ?? []).compactMap(\.stringValue).map { Array($0.utf16) } }
        let allowBefore = list("allowBefore")
        var phrases = list("definite")
        if scope == .general { phrases += list("positive") + list("negative") + list("criterion") }
        else if verdict == "unlikely" { phrases += list("positive") }
        else if verdict == "likely" { phrases += list("negative") }
        let haystack = normalize(text)
        for phrase in phrases where !phrase.isEmpty && phrase.count <= haystack.count {
            for at in 0...(haystack.count - phrase.count) where haystack[at..<(at + phrase.count)].elementsEqual(phrase) {
                let before = haystack[..<at]
                if !allowBefore.contains(where: { before.count >= $0.count && before.suffix($0.count).elementsEqual($0) }) { return true }
            }
        }
        return false
    }
}
