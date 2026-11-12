// Cases where Swift and JavaScript differ by default and that the shared fixtures do not cover:
// grapheme clusters vs code points, canonical equivalence in String ==, -0, number formatting,
// JavaScript trim(), booleans vs numbers.
// Expected values come from the reference implementation (scripts/gen-edge-cases.mjs writes
// ios-edge-cases.json next to this file).

import Foundation
import Testing
@testable import SilhouetteCore

@Suite("Swift vs JavaScript edge cases")
struct PlatformEdgeCaseTests {
    static let file: JSON = {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("ios-edge-cases.json")
        return try! JSON.parse(Data(contentsOf: url))
    }()

    static func list(_ key: String) -> [FixtureCase] {
        (file[key]?.arrayValue ?? []).map { FixtureCase(file: key, json: $0) }
    }

    @Test("skeleton", arguments: list("skeleton"))
    func skeleton(_ k: FixtureCase) throws {
        let result = Skeletonizer.skeletonize(Raw(try #require(k["input"]?.stringValue)),
                                              allowlist: try Shared.allowlist(try #require(k["locale"]?.stringValue)))
        expectExactString(result.skeleton.text, k["expected"]?["skeleton"]?.stringValue, "\(k.id): skeleton")
        expectIdentical(result.map.value.json, k["expected"]?["map"], "\(k.id): map")
    }

    @Test("Number.prototype.toString", arguments: list("jsNumberToString"))
    func numberToString(_ k: FixtureCase) throws {
        let value = try #require(k["value"]?.numberValue)
        expectExactString(JSNumber.string(value), k["expected"]?.stringValue, "String(\(value))")
    }

    @Test("parseNumber", arguments: list("parseNumber"))
    func parseNumber(_ k: FixtureCase) throws {
        let token = try #require(k["token"]?.stringValue)
        expectIdentical(Rehydrator.parseNumber(token).map(JSON.number) ?? .null, k["expected"], JSON.string(token).jsonText)
    }

    @Test("evaluator", arguments: (file["evaluator"]?["cases"]?.arrayValue ?? []).map { FixtureCase(file: "evaluator", json: $0) })
    func evaluator(_ k: FixtureCase) throws {
        let data = try #require(Self.file["evaluator"]?["data"])
        let expr = try #require(k["expr"])
        var ctx = EvalContext()
        if let error = k["expectedError"]?.stringValue {
            expectFixtureError(error, k.id) { _ = try RulesEngine.evaluate(expr, data: data, context: &ctx) }
            return
        }
        let value = try RulesEngine.evaluate(expr, data: data, context: &ctx)
        let json = try #require(value.json)
        expectIdentical(json, k["expected"], k.id)
        if k["negativeZero"]?.boolValue == true {
            #expect(json.numberValue?.sign == .minus, "\(k.id): expected -0")
        } else if let n = json.numberValue, n == 0 {
            #expect(n.sign == .plus, "\(k.id): expected +0")
        }
    }

    @Test("JSON booleans are not numbers")
    func booleansStayBooleans() throws {
        let parsed = try JSON.parse(#"[true, 1, false, 0, 1.0, -0, 1e2]"#)
        let items = try #require(parsed.arrayValue)
        #expect(items[0].boolValue == true && items[0].numberValue == nil)
        #expect(items[1].numberValue == 1 && items[1].boolValue == nil)
        #expect(items[2].boolValue == false && items[3].numberValue == 0)
        #expect(items[4].numberValue == 1)
        #expect(items[5].numberValue?.sign == .minus)
        #expect(parsed.jsonText == "[true,1,false,0,1,0,100]")
    }

    @Test("JSON object key order and duplicate keys follow JSON.parse")
    func objectOrder() throws {
        let parsed = try JSON.parse(#"{"b":1,"a":2,"3":3,"b":4}"#)
        #expect(parsed.objectValue?.keys == ["b", "a", "3"])
        #expect(parsed.jsonText == #"{"b":4,"a":2,"3":3}"#)
        #expect(JSON.string("a/b\u{2028}\"\\\u{1}").jsonText == "\"a/b\u{2028}\\\"\\\\\\u0001\"")
    }

    /// `lowercased()` in Swift does not apply the Final_Sigma rule that JavaScript's
    /// `toLowerCase()` applies ("ΟΔΟΣ" → "οδοσ" vs "οδος"). The two only disagree on words with a
    /// capital sigma, so the skeletons are identical as long as no allowlist word contains σ or ς.
    @Test("allowlists contain no sigma (Final_Sigma lowercasing differs between Swift and JavaScript)")
    func noSigmaInAllowlists() throws {
        let dir = Shared.root.appendingPathComponent("skeleton/allowlist")
        for file in try Shared.files(in: dir) where file.hasSuffix(".json") {
            let words = try #require(try Shared.json("skeleton/allowlist/\(file)")["words"]?.arrayValue).compactMap(\.stringValue)
            let offending = words.filter { $0.unicodeScalars.contains { $0 == "\u{3C3}" || $0 == "\u{3C2}" } }
            #expect(offending.isEmpty, "\(file): \(offending)")
        }
    }

    @Test("allowlist words are NFC, so exact lookups after NFC input are meaningful")
    func allowlistsAreNFC() throws {
        let dir = Shared.root.appendingPathComponent("skeleton/allowlist")
        for file in try Shared.files(in: dir) where file.hasSuffix(".json") {
            let words = try #require(try Shared.json("skeleton/allowlist/\(file)")["words"]?.arrayValue).compactMap(\.stringValue)
            let offending = words.filter { !$0.precomposedStringWithCanonicalMapping.exactlyEquals($0) }
            #expect(offending.isEmpty, "\(file): \(offending)")
        }
    }

    @Test("parseDate (JavaScript trim, month names, anchors)", arguments: list("parseDate"))
    func parseDate(_ k: FixtureCase) throws {
        let text = try #require(k["text"]?.stringValue)
        let date = Validator.parseDate(text, jurisdiction: try #require(k["jurisdiction"]?.stringValue))
        expectIdentical(date.map { JSON.string($0.iso) } ?? .null, k["expected"], JSON.string(text).jsonText)
    }

    /// shared/skeleton/SPEC.md matches month names ASCII case-insensitively. The reference
    /// Skeletonizer uses JavaScript's `iu` flags, which also fold U+017F (ſ) to `s`, so it turns
    /// "ſept 3, 2026" into a date; validate.mjs (flag `i` only) does not parse it. This port follows
    /// the spec in both places.
    @Test("month names match ASCII case-insensitively only")
    func asciiOnlyMonthNames() throws {
        let allow = try Shared.allowlist("en")
        #expect(Skeletonizer.skeletonize(Raw("SEPT 3, 2026"), allowlist: allow).skeleton.text == "\u{27E6}D1\u{27E7}")
        #expect(Skeletonizer.skeletonize(Raw("\u{17F}ept 3, 2026"), allowlist: allow).map.value["D1"] == nil)
        #expect(Validator.parseDate("\u{17F}ept 3, 2026", jurisdiction: "us-ca") == nil)
    }

    @Test("slug and number checks anchor at the true end of input")
    func anchors() {
        #expect(Generalizer.isSlug("test-shire"))
        #expect(!Generalizer.isSlug("testshire\n"))
        #expect(Rehydrator.parseNumber("1,000\n") == nil)
    }
}

@Suite("Typed amounts")
struct TypedAmountTests {
    /// Trim spaces and one leading currency symbol, then only the number format of
    /// shared/skeleton/SPEC.md section 5. Never strip separators: "28000.50" must not become 2,800,050.
    @Test("accepted and refused formats", arguments: [
        ("28000.50", 28000.5), ("28,000.50", 28000.5), ("28000.5", 28000.5), ("28000", 28000.0), ("28,000", 28000.0),
        ("$28,000.50", 28000.5), (" \u{20A9} 2,485,000 ", 2485000.0), ("\u{20AC}30000", 30000.0), ("\u{A3} 12.34", 12.34),
        ("0", 0.0), ("\u{A0}1,234\u{3000}", 1234.0),
    ] as [(String, Double)])
    func accepted(_ text: String, _ expected: Double) {
        #expect(Rehydrator.parseTypedAmount(text) == expected, "\(JSON.string(text).jsonText)")
    }

    @Test("refused", arguments: [
        "28.000,50", "28000,50", "28 000", "1e3", "-5", "", " ", "$", "$$5", "5$", "28,00", "2,8000", "28000.", ".5", "USD 5", "\u{FF12}\u{FF18}",
    ])
    func refused(_ text: String) {
        #expect(Rehydrator.parseTypedAmount(text) == nil, "\(JSON.string(text).jsonText)")
    }
}
