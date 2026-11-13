// Skeletonizer and Rehydrator. Contract: shared/skeleton/SPEC.md (v1.5).
// Must stay byte-identical with shared/reference/silhouette.mjs.
//
// Tokenization is deny by default and by Unicode code point: an explicit safe-character list, no
// Unicode property classes. Swift `String` works on grapheme clusters (and String subscripts round
// indices to them), so this file uses NSRegularExpression (ICU, code-point semantics) with
// explicit code-point classes, and slices with NSString UTF-16 ranges.

import Foundation

// MARK: - Allowlist

/// The union of allowlist files (SPEC.md section 4: the document's language ∪ en). Words compare by exact code
/// points, like a JavaScript `Set<string>`.
public struct Allowlist: Sendable {
    let words: Set<ExactKey>
    /// Role labels and function words that stand in front of a name (section 4.2).
    let introducers: Set<ExactKey>

    public init(words: some Sequence<String>, introducers: some Sequence<String> = [String]()) {
        self.words = Set(words.map(ExactKey.init))
        self.introducers = Set(introducers.map(ExactKey.init))
    }

    /// Builds the allowlist from `skeleton/allowlist/{language}.json` files
    /// (`{"words": [...], "introducers": [...]}`), normally the document's language and `en`.
    public init(files: [JSON]) throws(ContractFileError) {
        func strings(_ value: JSON?, _ what: String) throws(ContractFileError) -> [String] {
            var out: [String] = []
            for item in value?.arrayValue ?? [] {
                guard let s = item.stringValue else { throw ContractFileError("allowlist \(what) entry is not a string") }
                out.append(s)
            }
            return out
        }
        var words: [String] = [], introducers: [String] = []
        for file in files {
            guard file["words"]?.arrayValue != nil else { throw ContractFileError("allowlist file has no words list") }
            words += try strings(file["words"], "words")
            introducers += try strings(file["introducers"], "introducers")
        }
        self.init(words: words, introducers: introducers)
    }

    func isIntroducer(_ word: String) -> Bool { introducers.contains(ExactKey(word.lowercased())) }

    public var count: Int { words.count }

    func contains(_ word: String) -> Bool { words.contains(ExactKey(word)) }

    /// SPEC.md section 4. Lowercasing is Swift `lowercased()` (locale-independent).
    func isAllowlisted(_ word: String) -> Bool {
        let lower = word.lowercased()
        if contains(lower) { return true }
        if !lower.containsExactly(UInt8(ascii: "-")) { return false }
        return lower.splitExactly(on: UInt8(ascii: "-")).allSatisfy(contains)
    }
}

/// A file under shared/ does not have the expected shape.
public struct ContractFileError: Error, Sendable, CustomStringConvertible {
    public let description: String
    init(_ description: String) { self.description = description }
}

// MARK: - Placeholder map

/// Placeholder id (`D1`, `N3`, `W12`) → original token text, in creation order. Always wrapped in
/// `Raw`: it holds the document's values.
public struct PlaceholderMap: Sendable {
    public private(set) var entries: [(id: String, value: String)] = []
    private var index: [ExactKey: String] = [:]

    public init() {}

    public init(_ entries: [(String, String)]) {
        for (id, value) in entries { add(id, value) }
    }

    mutating func add(_ id: String, _ value: String) {
        if index.updateValue(value, forKey: ExactKey(id)) == nil { entries.append((id, value)) }
        else if let i = entries.firstIndex(where: { $0.id.exactlyEquals(id) }) { entries[i].value = value }
    }

    /// Own-key lookup.
    public subscript(id: String) -> String? { index[ExactKey(id)] }

    public var json: JSON { .object(JSONObject(entries.map { ($0.id, JSON.string($0.value)) })) }
}

public struct SkeletonResult: Sendable {
    /// Cloud-safe document silhouette.
    public let skeleton: Skeleton
    /// Placeholder → original value. Never leaves the device.
    public let map: Raw<PlaceholderMap>
}

// MARK: - Skeletonizer

public enum Skeletonizer {
    /// Characters kept verbatim that never belong to a word (SPEC.md section 2), as ICU class
    /// content written with explicit code points. Everything else that is not an ASCII digit is
    /// word material. `@` and `_` are deliberately not listed.
    public static let safeClass =
        #"\u0009\u000A\u0020\u00A0\u2000-\u200A\u202F\u205F\u3000"# // whitespace
        + #"\u0021-\u002F\u003A-\u003F\u005B-\u005E\u0060\u007B-\u007E"# // ASCII punctuation and symbols
        + #"\u00A2\u00A3\u00A5\u00A7\u00B0\u00B1\u00B6\u00B7\u00D7\u00F7"# // ¢ £ ¥ § ° ± ¶ · × ÷
        + #"\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20A9\u20AC\u2116"# // – — ‘ ’ “ ” • … ₩ € №
        + #"\u3001\u3002\u3008-\u3011\u3014\u3015\u30FB"# // CJK punctuation
        + #"\uFF01\uFF05\uFF08\uFF09\uFF0B-\uFF0F\uFF1A\uFF1B\uFF1D\uFF1F\uFF3B\uFF3D\uFF5E"# // fullwidth punctuation

    /// Month names (English full and abbreviated, Spanish full).
    public static let monthNames: [[String]] = [
        ["january", "jan", "enero"], ["february", "feb", "febrero"], ["march", "mar", "marzo"], ["april", "apr", "abril"],
        ["may", "mayo"], ["june", "jun", "junio"], ["july", "jul", "julio"], ["august", "aug", "agosto"],
        ["september", "sept", "sep", "septiembre", "setiembre"], ["october", "oct", "octubre"],
        ["november", "nov", "noviembre"], ["december", "dec", "diciembre"],
    ]

    /// A literal matched ASCII case-insensitively, as explicit classes (`[oO][cC][tT]`). ICU's
    /// case-insensitive mode folds by Unicode rules (U+017F ſ matches `s`), which the spec excludes.
    static func asciiInsensitive(_ word: String) -> String {
        word.map { c in
            c.isASCII && c.isLetter ? "[\(c.lowercased())\(c.uppercased())]" : String(c)
        }.joined()
    }

    /// Longest alternative first, then alphabetical (as in the reference).
    static let monthAlternation: String = {
        let names = monthNames.flatMap { $0 }.sorted { a, b in
            a.count != b.count ? a.count > b.count : a.utf16.lexicographicallyPrecedes(b.utf16)
        }
        return "(?:" + names.map(asciiInsensitive).joined(separator: "|") + ")"
    }()

    /// "October 17, 2026", "Oct. 17 2026", "17 October 2026", "17 de octubre de 2026".
    static let monthDatePattern: String = {
        let ordinal = "(?:" + ["st", "nd", "rd", "th"].map(asciiInsensitive).joined(separator: "|") + ")"
        let de = asciiInsensitive("de"), l = asciiInsensitive("l")
        let m = monthAlternation
        // Month first: MONTH\.? [0-9]{1,2}(?:st|nd|rd|th)?,? [0-9]{4}(?![0-9])
        // Day first:   [0-9]{1,2}(?:st|nd|rd|th)? (?:de )?MONTH\.?,? (?:del? )?[0-9]{4}(?![0-9])
        return "\(m)\\.? [0-9]{1,2}\(ordinal)?,? [0-9]{4}(?![0-9])"
            + "|[0-9]{1,2}\(ordinal)? (?:\(de) )?\(m)\\.?,? (?:\(de)\(l)? )?[0-9]{4}(?![0-9])"
    }()

    /// The token regex of SPEC.md section 2. Groups: 1 DATE, 2 NUM, 3 WORD, 4 OTHER.
    public static let tokenPattern: String = {
        let x = "[^0-9\(safeClass)]"
        return "(\(monthDatePattern)|[0-9]{1,4}[/.\\-][0-9]{1,2}[/.\\-][0-9]{1,4})"
            + "|([0-9]+(?:[.,][0-9]+)*)"
            + "|(\(x)+(?:['\\u2019\\-]\(x)+)*)"
            + "|([\\s\\S])"
    }()

    private static let tokenRegex = try! NSRegularExpression(pattern: tokenPattern)

    /// Separators that keep two words in one phrase (section 4.1).
    static let phraseJoiners: Set<String> = [" ", ", ", " & "]

    /// SPEC.md section 1: NFC, `\r\n` and `\r` to `\n`, delete U+27E6 and U+27E7. In this order.
    public static func normalize(_ text: String) -> String {
        let nfc = text.precomposedStringWithCanonicalMapping
        var out = String.UnicodeScalarView()
        var previousWasCR = false
        for scalar in nfc.unicodeScalars {
            defer { previousWasCR = scalar == "\r" }
            switch scalar {
            case "\r": out.append("\n")
            case "\n": if !previousWasCR { out.append("\n") }
            default: out.append(scalar)
            }
        }
        out.removeAll { $0 == "\u{27E6}" || $0 == "\u{27E7}" }
        return String(out)
    }

    private struct Token {
        enum Kind: Character { case date = "D", number = "N", word = "W", other = "O" }
        let kind: Kind
        var text: String
        var keep = false
        var hidden = false
    }

    /// Turns Raw document text into a Skeleton. One of the two functions allowed to produce a
    /// cloud-safe value from Raw. `allowlist` is the document language's list ∪ en; `hide` holds
    /// lowercase words the user chose to hide in this document (section 4.3).
    public static func skeletonize(_ text: Raw<String>, allowlist: Allowlist, hide: Raw<[String]> = Raw([])) -> SkeletonResult {
        let input = normalize(text.value) as NSString
        let hidden = Set(hide.value.map(ExactKey.init))
        func isHidden(_ word: String) -> Bool {
            let lower = word.lowercased()
            return hidden.contains(ExactKey(lower))
                || lower.splitExactly(on: UInt8(ascii: "-")).contains { hidden.contains(ExactKey($0)) }
        }

        // Pass 1: tokens. Consecutive safe characters form one separator token.
        var tokens: [Token] = []
        tokenRegex.enumerateMatches(in: input as String, range: NSRange(location: 0, length: input.length)) { match, _, _ in
            guard let match else { return }
            func group(_ i: Int) -> String? {
                let r = match.range(at: i)
                return r.location == NSNotFound ? nil : input.substring(with: r)
            }
            if let date = group(1) { tokens.append(Token(kind: .date, text: date)) }
            else if let num = group(2) { tokens.append(Token(kind: .number, text: num)) }
            else if let word = group(3) {
                let h = !hidden.isEmpty && isHidden(word)
                tokens.append(Token(kind: .word, text: word, keep: !h && allowlist.isAllowlisted(word), hidden: h))
            }
            else if let other = group(4) {
                if let last = tokens.last, last.kind == .other { tokens[tokens.count - 1].text += other }
                else { tokens.append(Token(kind: .other, text: other)) }
            }
        }

        // Pass 2: a phrase is masked as a whole (section 4.1), after its leading introducers (4.2).
        var i = 0
        while i < tokens.count {
            guard tokens[i].kind == .word else { i += 1; continue }
            var j = i
            while j + 2 < tokens.count, tokens[j + 1].kind == .other,
                  phraseJoiners.contains(where: { $0.exactlyEquals(tokens[j + 1].text) }), tokens[j + 2].kind == .word {
                j += 2
            }
            // Leading introducers (section 4.2: "Employee", "This Lease is made between") are labels in
            // front of a name and keep their own decision; the rest of the phrase is decided together.
            // A phrase in which the user hid a word is masked whole, introducers included (4.3).
            let userHidden = stride(from: i, through: j, by: 2).contains { tokens[$0].hidden }
            var start = i
            while !userHidden, start < j, tokens[start].keep, allowlist.isIntroducer(tokens[start].text) { start += 2 }
            let keep = stride(from: start, through: j, by: 2).allSatisfy { tokens[$0].keep }
            for k in stride(from: start, through: j, by: 2) { tokens[k].keep = keep }
            i = j + 1
        }

        // Pass 3: placeholders, numbered in document order.
        var counters: [Character: Int] = [:]
        var map = PlaceholderMap()
        var skeleton = ""
        for t in tokens {
            if t.kind == .other || (t.kind == .word && t.keep) { skeleton += t.text; continue }
            let n = (counters[t.kind.rawValue] ?? 0) + 1
            counters[t.kind.rawValue] = n
            let id = "\(t.kind.rawValue)\(n)"
            map.add(id, t.text)
            skeleton += "\u{27E6}\(id)\u{27E7}"
        }
        return SkeletonResult(skeleton: Skeleton(text: skeleton), map: Raw(map))
    }
}

// MARK: - Rehydrator

public enum Rehydrator {
    // `\z`, not `$`: in ICU `$` also matches before a final line terminator, in JavaScript it does not.
    private static let numberFormat =
        try! NSRegularExpression(pattern: #"^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?\z"#)

    /// SPEC.md section 5 step 2. `nil` for a token that does not match the number format.
    public static func parseNumber(_ token: String) -> Double? {
        let ns = token as NSString
        guard numberFormat.firstMatch(in: token, range: NSRange(location: 0, length: ns.length)) != nil else { return nil }
        // Correctly rounded and locale-independent, like JavaScript's Number().
        return Double(String(token.unicodeScalars.filter { $0 != "," }))
    }

    /// An amount typed by the user (SPEC.md section 5.1): around it, only tab, LF, CR, space and
    /// no-break space are trimmed, with one optional leading `$ € £ ¥ ₩` followed by the same set;
    /// the rest must have the number format of section 5. `nil` when it is not accepted.
    public static func parseTypedAmount(_ text: String) -> Double? {
        func isSpace(_ u: Unicode.Scalar) -> Bool { [0x09, 0x0A, 0x0D, 0x20, 0xA0].contains(u.value) }
        var scalars = Array(text.unicodeScalars)[...]
        while let f = scalars.first, isSpace(f) { scalars = scalars.dropFirst() }
        if let f = scalars.first, [0x24, 0x20AC, 0xA3, 0xA5, 0x20A9].contains(f.value) {
            scalars = scalars.dropFirst()
            while let f = scalars.first, isSpace(f) { scalars = scalars.dropFirst() }
        }
        while let l = scalars.last, isSpace(l) { scalars = scalars.dropLast() }
        // At most two digits after the dot: "60.000" is a thousands group in much of the world, not 60.
        if let dot = scalars.lastIndex(of: "."), scalars.distance(from: dot, to: scalars.endIndex) > 3,
           scalars[scalars.index(after: dot)...].allSatisfy({ ("0"..."9").contains($0) }) {
            return nil
        }
        return parseNumber(String(String.UnicodeScalarView(scalars)))
    }

    private static func isRef(_ value: JSON?, in map: PlaceholderMap, kind: UInt8) -> String? {
        guard case .string(let ref)? = value, map[ref] != nil, ref.utf8.first == kind else { return nil }
        return ref
    }

    private static func readField(_ spec: JSON, _ ref: JSON?, _ map: PlaceholderMap) -> JSON? {
        let kind = spec["x-kind"]?.stringValue
        let has: (JSON) -> String? = { r in
            if case .string(let s) = r, map[s] != nil { return s }
            return nil
        }
        switch kind {
        case "enum":
            guard case .string(let value)? = ref, let options = spec["enum"]?.arrayValue,
                  options.contains(where: { $0.stringValue?.exactlyEquals(value) == true }) else { return nil }
            return .string(value)
        case "number":
            guard let id = isRef(ref, in: map, kind: UInt8(ascii: "N")), let number = parseNumber(map[id]!) else { return nil }
            return .number(number)
        case "date":
            if let id = isRef(ref, in: map, kind: UInt8(ascii: "D")) { return .string(map[id]!) }
            if case .array(let refs)? = ref, refs.count == 3 {
                let ids = refs.compactMap { isRef($0, in: map, kind: UInt8(ascii: "N")) }
                if ids.count == 3 { return .string(ids.map { map[$0]! }.joined(separator: "-")) }
            }
            return nil
        case "text":
            guard case .array(let refs)? = ref else { return nil }
            let parts = refs.compactMap(has).map { map[$0]! }
            return parts.isEmpty ? nil : .string(parts.joined(separator: " "))
        default:
            return nil
        }
    }

    /// Resolves model pointers against the placeholder map. `pointers` is untrusted model output;
    /// fields are read as its own properties only. The result holds exact document values and
    /// therefore stays Raw.
    public static func rehydrate(schema: JSON, pointers: JSON, map rawMap: Raw<PlaceholderMap>) -> Raw<JSON> {
        let map = rawMap.value
        var out = JSONObject()
        let properties = schema["properties"]?.objectValue ?? JSONObject()
        for (name, spec) in properties.entries {
            guard let ref = pointers[name], !ref.isNull else { continue }
            if spec["x-kind"]?.stringValue == "list" {
                guard case .array(let entries) = ref,
                      let itemProperties = spec["items"]?["properties"]?.objectValue else { continue }
                let required = (spec["items"]?["required"]?.arrayValue ?? []).compactMap(\.stringValue)
                var items: [JSON] = []
                for entry in entries {
                    var item = JSONObject()
                    for (sub, subSpec) in itemProperties.entries {
                        if let value = readField(subSpec, entry[sub], map) { item[sub] = value }
                    }
                    if required.allSatisfy(item.has) { items.append(.object(item)) }
                }
                if !items.isEmpty { out[name] = .array(items) }
                continue
            }
            if let value = readField(spec, ref, map) { out[name] = value }
        }
        return Raw(.object(out))
    }
}
