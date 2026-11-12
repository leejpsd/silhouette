// Cases where Swift and JavaScript differ by default: grapheme clusters vs code points, canonical
// equivalence in String ==, Unicode normalization, -0, number formatting, booleans vs numbers.
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

    /// Apple's ICU (used by NSRegularExpression) classifies 68 Private Use Area code points
    /// (U+F870 to U+F8D6) as letters or marks; V8 classifies them as private use. On iOS such a
    /// character becomes part of a WORD token and is masked, while the reference keeps it verbatim
    /// as OTHER. The iOS result is the stricter one. This test pins the platform behaviour so a
    /// change in either direction is noticed.
    @Test("Apple private-use letters are masked (reference keeps them as OTHER)")
    func applePrivateUseLetters() throws {
        let result = Skeletonizer.skeletonize(Raw("Net \u{F870} Pay"), allowlist: try Shared.allowlist("en"))
        #expect(result.skeleton.text == "Net \u{27E6}W1\u{27E7} Pay")
    }

    @Test("slug and number checks anchor at the true end of input")
    func anchors() {
        #expect(Generalizer.isSlug("test-shire"))
        #expect(!Generalizer.isSlug("testshire\n"))
        #expect(Rehydrator.parseNumber("1,000\n") == nil)
    }
}
