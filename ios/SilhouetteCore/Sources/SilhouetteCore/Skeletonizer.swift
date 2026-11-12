// Skeletonizer and Rehydrator. Contract: shared/skeleton/SPEC.md (v1.1).
// Must stay byte-identical with shared/reference/silhouette.mjs.
//
// Tokenization is by Unicode code point, as in the JavaScript reference (`u` flag). Swift `String`
// works on grapheme clusters (and String subscripts round indices to them), so this file uses
// NSRegularExpression (ICU, code-point semantics) and slices with NSString UTF-16 ranges.

import Foundation

// MARK: - Allowlist

/// The union of allowlist files (SPEC.md section 4: app locale ∪ en). Words compare by exact code
/// points, like a JavaScript `Set<string>`.
public struct Allowlist: Sendable {
    let words: Set<ExactKey>

    public init(words: some Sequence<String>) {
        self.words = Set(words.map(ExactKey.init))
    }

    /// Builds the allowlist from `skeleton/allowlist/{locale}.json` files (`{"words": [...]}`).
    public init(files: [JSON]) throws(ContractFileError) {
        var all: [String] = []
        for file in files {
            guard let words = file["words"]?.arrayValue else { throw ContractFileError("allowlist file has no words list") }
            for word in words {
                guard let w = word.stringValue else { throw ContractFileError("allowlist word is not a string") }
                all.append(w)
            }
        }
        self.init(words: all)
    }

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
    /// The combined reference regex from SPEC.md section 2. Groups: 1 DATE, 2 NUM, 3 WORD, 4 OTHER.
    public static let tokenPattern =
        #"([0-9]{1,4}[/.\-][0-9]{1,2}[/.\-][0-9]{1,4})|([0-9]+(?:[.,][0-9]+)*)|([\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*)|([\s\S])"#

    private static let tokenRegex = try! NSRegularExpression(pattern: tokenPattern)

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
        // Bracket removal happens after newline conversion, as in the reference.
        out.removeAll { $0 == "\u{27E6}" || $0 == "\u{27E7}" }
        return String(out)
    }

    /// Turns Raw document text into a Skeleton. One of the two functions allowed to produce a
    /// cloud-safe value from Raw.
    public static func skeletonize(_ text: Raw<String>, allowlist: Allowlist) -> SkeletonResult {
        let input = normalize(text.value) as NSString
        var counters = (d: 0, n: 0, w: 0)
        var map = PlaceholderMap()
        var skeleton = ""

        func placeholder(_ kind: Character, _ value: String) -> String {
            let n: Int
            switch kind {
            case "D": counters.d += 1; n = counters.d
            case "N": counters.n += 1; n = counters.n
            default: counters.w += 1; n = counters.w
            }
            let id = "\(kind)\(n)"
            map.add(id, value)
            return "\u{27E6}\(id)\u{27E7}"
        }

        tokenRegex.enumerateMatches(in: input as String, range: NSRange(location: 0, length: input.length)) { match, _, _ in
            guard let match else { return }
            func group(_ i: Int) -> String? {
                let r = match.range(at: i)
                return r.location == NSNotFound ? nil : input.substring(with: r)
            }
            if let date = group(1) { skeleton += placeholder("D", date) }
            else if let num = group(2) { skeleton += placeholder("N", num) }
            else if let word = group(3) { skeleton += allowlist.isAllowlisted(word) ? word : placeholder("W", word) }
            else if let other = group(4) { skeleton += other }
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
