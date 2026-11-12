// A small JSON value type that behaves like JavaScript's JSON.parse / JSON.stringify where the
// contract depends on it:
// - booleans and numbers are distinct (no NSNumber bridging, `true` never becomes `1`);
// - numbers are IEEE-754 doubles;
// - object key order is preserved (insertion order; a duplicate key keeps its first position and
//   takes the last value, as in JSON.parse);
// - strings are compared by their exact code points, never by Unicode canonical equivalence
//   (Swift's `String ==` treats "\u{212A}" and "K" as equal; JavaScript's `===` does not).

import Foundation

// MARK: - Exact string comparison

extension String {
    /// Code-point equality, like JavaScript `===` on strings. Swift's `==` uses canonical
    /// equivalence, which would make `"e\u{301}" == "\u{E9}"` and `"\u{212A}" == "K"` true.
    @inlinable
    func exactlyEquals(_ other: String) -> Bool {
        utf8.elementsEqual(other.utf8)
    }

    /// Ordering by UTF-16 code units, like JavaScript's default `Array.prototype.sort`.
    func utf16Precedes(_ other: String) -> Bool {
        utf16.lexicographicallyPrecedes(other.utf16)
    }

    /// Splits on an ASCII byte at the code-unit level, keeping empty parts, like JavaScript
    /// `split(".")`. Swift's `split(separator:)` works on grapheme clusters, so a separator followed
    /// by a combining mark would not split there.
    func splitExactly(on separator: UInt8) -> [String] {
        utf8.split(separator: separator, omittingEmptySubsequences: false).map { String(decoding: $0, as: UTF8.self) }
    }

    func containsExactly(_ byte: UInt8) -> Bool {
        utf8.contains(byte)
    }
}

/// A string key hashed and compared by its exact code points (see `exactlyEquals`).
struct ExactKey: Hashable, Sendable {
    let string: String
    init(_ string: String) { self.string = string }
    static func == (lhs: ExactKey, rhs: ExactKey) -> Bool { lhs.string.exactlyEquals(rhs.string) }
    func hash(into hasher: inout Hasher) {
        for byte in string.utf8 { hasher.combine(byte) }
    }
}

// MARK: - Values

public enum JSON: Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSON])
    case object(JSONObject)
}

/// An ordered JSON object. Lookups compare keys by exact code points ("own properties only":
/// there is no prototype, so `constructor` or `__proto__` are ordinary keys).
public struct JSONObject: Sendable {
    public private(set) var entries: [(key: String, value: JSON)] = []

    public init() {}

    public init(_ entries: [(String, JSON)]) {
        for (key, value) in entries { self[key] = value }
    }

    public var keys: [String] { entries.map(\.key) }
    public var count: Int { entries.count }

    /// Own-property read. `nil` when the key is absent.
    public subscript(key: String) -> JSON? {
        get { entries.first { $0.key.exactlyEquals(key) }?.value }
        set {
            if let index = entries.firstIndex(where: { $0.key.exactlyEquals(key) }) {
                if let newValue { entries[index].value = newValue } else { entries.remove(at: index) }
            } else if let newValue {
                entries.append((key, newValue))
            }
        }
    }

    public func has(_ key: String) -> Bool { self[key] != nil }
}

// MARK: - Accessors

extension JSON {
    public var objectValue: JSONObject? { if case .object(let o) = self { o } else { nil } }
    public var arrayValue: [JSON]? { if case .array(let a) = self { a } else { nil } }
    public var stringValue: String? { if case .string(let s) = self { s } else { nil } }
    public var numberValue: Double? { if case .number(let n) = self { n } else { nil } }
    public var boolValue: Bool? { if case .bool(let b) = self { b } else { nil } }
    public var isNull: Bool { if case .null = self { true } else { false } }

    /// Own-property read on an object; `nil` for a missing key or a non-object.
    public subscript(key: String) -> JSON? { objectValue?[key] }

    /// Structural equality with exact strings, exact (IEEE) numbers and **ordered** object keys.
    public func isIdentical(to other: JSON) -> Bool {
        switch (self, other) {
        case (.null, .null): return true
        case (.bool(let a), .bool(let b)): return a == b
        case (.number(let a), .number(let b)): return a == b
        case (.string(let a), .string(let b)): return a.exactlyEquals(b)
        case (.array(let a), .array(let b)):
            return a.count == b.count && zip(a, b).allSatisfy { $0.isIdentical(to: $1) }
        case (.object(let a), .object(let b)):
            return a.count == b.count
                && zip(a.entries, b.entries).allSatisfy { $0.key.exactlyEquals($1.key) && $0.value.isIdentical(to: $1.value) }
        default: return false
        }
    }
}

// MARK: - Serialization (JSON.stringify without indentation)

extension JSON {
    /// The same text JavaScript's `JSON.stringify(value)` produces.
    public var jsonText: String {
        var out = ""
        write(to: &out)
        return out
    }

    func write(to out: inout String) {
        switch self {
        case .null: out += "null"
        case .bool(let b): out += b ? "true" : "false"
        case .number(let n): out += n.isFinite ? JSNumber.string(n) : "null"
        case .string(let s): JSON.writeString(s, to: &out)
        case .array(let items):
            out += "["
            for (i, item) in items.enumerated() {
                if i > 0 { out += "," }
                item.write(to: &out)
            }
            out += "]"
        case .object(let object):
            out += "{"
            for (i, entry) in object.entries.enumerated() {
                if i > 0 { out += "," }
                JSON.writeString(entry.key, to: &out)
                out += ":"
                entry.value.write(to: &out)
            }
            out += "}"
        }
    }

    /// JSON.stringify string quoting: `"` and `\` escaped, control characters as the short
    /// escapes or `\u00xx`, everything else (including `/` and U+2028) written as is.
    static func writeString(_ s: String, to out: inout String) {
        out += "\""
        for scalar in s.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    let hex = String(scalar.value, radix: 16)
                    out += "\\u" + String(repeating: "0", count: 4 - hex.count) + hex
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        out += "\""
    }
}

// MARK: - JavaScript number formatting

/// `Number.prototype.toString()` (ECMA-262 Number::toString, radix 10).
/// Swift's `description` yields the same shortest round-trip digits but a different layout
/// (`1e-07`, `100.0`, `1.2345678901234568e+20`), so only the digits and exponent are taken from it.
enum JSNumber {
    static func string(_ x: Double) -> String {
        if x.isNaN { return "NaN" }
        if x == 0 { return "0" }
        if x.isInfinite { return x < 0 ? "-Infinity" : "Infinity" }
        if x < 0 { return "-" + string(-x) }

        // Decompose the shortest representation into digits `s` (k digits) and exponent `n`
        // such that x = 0.s × 10^n.
        let text = x.description
        var mantissa = Substring(text)
        var exponent = 0
        if let e = text.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            mantissa = text[..<e]
            exponent = Int(text[text.index(after: e)...])!
        }
        var intPart = mantissa
        var fracPart: Substring = ""
        if let dot = mantissa.firstIndex(of: ".") {
            intPart = mantissa[..<dot]
            fracPart = mantissa[mantissa.index(after: dot)...]
        }
        var digits = Array(intPart + fracPart)
        var n = intPart.count + exponent
        while let first = digits.first, first == "0" { digits.removeFirst(); n -= 1 }
        while let last = digits.last, last == "0" { digits.removeLast() }
        let k = digits.count
        let s = String(digits)

        if k <= n && n <= 21 { return s + String(repeating: "0", count: n - k) }
        if 0 < n && n <= 21 {
            let i = s.index(s.startIndex, offsetBy: n)
            return s[..<i] + "." + s[i...]
        }
        if -6 < n && n <= 0 { return "0." + String(repeating: "0", count: -n) + s }
        let e = n - 1
        let expText = (e < 0 ? "-" : "+") + String(abs(e))
        if k == 1 { return s + "e" + expText }
        return String(s.first!) + "." + s.dropFirst() + "e" + expText
    }

    /// `Number.isSafeInteger`.
    static func isSafeInteger(_ x: Double) -> Bool {
        x.isFinite && x.rounded(.towardZero) == x && abs(x) <= 9_007_199_254_740_991
    }
}

// MARK: - Parsing (JSON.parse)

public struct JSONParseError: Error, Sendable, CustomStringConvertible {
    public let offset: Int
    public let reason: String
    public var description: String { "JSON parse error at byte \(offset): \(reason)" }
}

extension JSON {
    public static func parse(_ text: String) throws(JSONParseError) -> JSON {
        try parse(Data(text.utf8))
    }

    public static func parse(_ data: Data) throws(JSONParseError) -> JSON {
        var parser = Parser(bytes: [UInt8](data))
        parser.skipWhitespace()
        let value = try parser.parseValue(depth: 0)
        parser.skipWhitespace()
        guard parser.index == parser.bytes.count else { throw parser.error("unexpected trailing content") }
        return value
    }

    private struct Parser {
        let bytes: [UInt8]
        var index = 0

        func error(_ reason: String) -> JSONParseError { JSONParseError(offset: index, reason: reason) }

        mutating func skipWhitespace() {
            while index < bytes.count, [0x20, 0x09, 0x0A, 0x0D].contains(bytes[index]) { index += 1 }
        }

        mutating func expect(_ literal: String) throws(JSONParseError) {
            for byte in literal.utf8 {
                guard index < bytes.count, bytes[index] == byte else { throw error("invalid literal") }
                index += 1
            }
        }

        mutating func parseValue(depth: Int) throws(JSONParseError) -> JSON {
            guard depth < 512 else { throw error("nesting too deep") }
            guard index < bytes.count else { throw error("unexpected end of input") }
            switch bytes[index] {
            case UInt8(ascii: "n"): try expect("null"); return .null
            case UInt8(ascii: "t"): try expect("true"); return .bool(true)
            case UInt8(ascii: "f"): try expect("false"); return .bool(false)
            case UInt8(ascii: "\""): return .string(try parseString())
            case UInt8(ascii: "["):
                index += 1
                var items: [JSON] = []
                skipWhitespace()
                if index < bytes.count, bytes[index] == UInt8(ascii: "]") { index += 1; return .array(items) }
                while true {
                    skipWhitespace()
                    items.append(try parseValue(depth: depth + 1))
                    skipWhitespace()
                    guard index < bytes.count else { throw error("unterminated array") }
                    if bytes[index] == UInt8(ascii: ",") { index += 1; continue }
                    if bytes[index] == UInt8(ascii: "]") { index += 1; return .array(items) }
                    throw error("expected , or ]")
                }
            case UInt8(ascii: "{"):
                index += 1
                var object = JSONObject()
                skipWhitespace()
                if index < bytes.count, bytes[index] == UInt8(ascii: "}") { index += 1; return .object(object) }
                while true {
                    skipWhitespace()
                    guard index < bytes.count, bytes[index] == UInt8(ascii: "\"") else { throw error("expected a key") }
                    let key = try parseString()
                    skipWhitespace()
                    guard index < bytes.count, bytes[index] == UInt8(ascii: ":") else { throw error("expected :") }
                    index += 1
                    skipWhitespace()
                    object[key] = try parseValue(depth: depth + 1)
                    skipWhitespace()
                    guard index < bytes.count else { throw error("unterminated object") }
                    if bytes[index] == UInt8(ascii: ",") { index += 1; continue }
                    if bytes[index] == UInt8(ascii: "}") { index += 1; return .object(object) }
                    throw error("expected , or }")
                }
            default:
                return .number(try parseNumber())
            }
        }

        private func isDigit(_ i: Int) -> Bool { i < bytes.count && bytes[i] >= 0x30 && bytes[i] <= 0x39 }

        mutating func parseNumber() throws(JSONParseError) -> Double {
            let start = index
            if index < bytes.count, bytes[index] == UInt8(ascii: "-") { index += 1 }
            guard isDigit(index) else { throw error("invalid value") }
            if bytes[index] == UInt8(ascii: "0") { index += 1 } else { while isDigit(index) { index += 1 } }
            if index < bytes.count, bytes[index] == UInt8(ascii: ".") {
                index += 1
                guard isDigit(index) else { throw error("invalid number") }
                while isDigit(index) { index += 1 }
            }
            if index < bytes.count, bytes[index] == UInt8(ascii: "e") || bytes[index] == UInt8(ascii: "E") {
                index += 1
                if index < bytes.count, bytes[index] == UInt8(ascii: "+") || bytes[index] == UInt8(ascii: "-") { index += 1 }
                guard isDigit(index) else { throw error("invalid number") }
                while isDigit(index) { index += 1 }
            }
            // Double(String) is correctly rounded and locale-independent, like JavaScript's Number().
            let lexeme = String(decoding: bytes[start..<index], as: UTF8.self)
            guard let value = Double(lexeme) else { throw error("invalid number") }
            return value
        }

        mutating func parseHex4() throws(JSONParseError) -> UInt32 {
            guard index + 4 <= bytes.count else { throw error("truncated \\u escape") }
            var value: UInt32 = 0
            for _ in 0..<4 {
                let b = bytes[index]
                let digit: UInt32
                switch b {
                case 0x30...0x39: digit = UInt32(b - 0x30)
                case 0x41...0x46: digit = UInt32(b - 0x41 + 10)
                case 0x61...0x66: digit = UInt32(b - 0x61 + 10)
                default: throw error("invalid \\u escape")
                }
                value = value * 16 + digit
                index += 1
            }
            return value
        }

        mutating func parseString() throws(JSONParseError) -> String {
            index += 1  // opening quote
            var scalars = String.UnicodeScalarView()
            var runStart = index
            func flushRun(_ end: Int) throws(JSONParseError) {
                guard runStart < end else { return }
                guard let run = String(validating: bytes[runStart..<end], as: UTF8.self) else {
                    throw JSONParseError(offset: runStart, reason: "invalid UTF-8")
                }
                scalars.append(contentsOf: run.unicodeScalars)
            }
            while true {
                guard index < bytes.count else { throw error("unterminated string") }
                let b = bytes[index]
                if b == UInt8(ascii: "\"") {
                    try flushRun(index)
                    index += 1
                    return String(scalars)
                }
                if b < 0x20 { throw error("control character in string") }
                if b != UInt8(ascii: "\\") { index += 1; continue }
                try flushRun(index)
                index += 1
                guard index < bytes.count else { throw error("unterminated escape") }
                let e = bytes[index]
                index += 1
                switch e {
                case UInt8(ascii: "\""): scalars.append("\"")
                case UInt8(ascii: "\\"): scalars.append("\\")
                case UInt8(ascii: "/"): scalars.append("/")
                case UInt8(ascii: "b"): scalars.append("\u{08}")
                case UInt8(ascii: "f"): scalars.append("\u{0C}")
                case UInt8(ascii: "n"): scalars.append("\n")
                case UInt8(ascii: "r"): scalars.append("\r")
                case UInt8(ascii: "t"): scalars.append("\t")
                case UInt8(ascii: "u"):
                    let unit = try parseHex4()
                    if (0xD800...0xDBFF).contains(unit) {
                        // A high surrogate must be followed by a low surrogate. JavaScript strings can
                        // hold a lone surrogate; Swift strings cannot, so it is rejected here.
                        guard index + 1 < bytes.count, bytes[index] == UInt8(ascii: "\\"), bytes[index + 1] == UInt8(ascii: "u")
                        else { throw error("lone surrogate (not representable in Swift)") }
                        index += 2
                        let low = try parseHex4()
                        guard (0xDC00...0xDFFF).contains(low) else { throw error("lone surrogate (not representable in Swift)") }
                        scalars.append(Unicode.Scalar(0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00))!)
                    } else if (0xDC00...0xDFFF).contains(unit) {
                        throw error("lone surrogate (not representable in Swift)")
                    } else {
                        scalars.append(Unicode.Scalar(unit)!)
                    }
                default: throw error("invalid escape")
                }
                runStart = index
            }
        }
    }
}
