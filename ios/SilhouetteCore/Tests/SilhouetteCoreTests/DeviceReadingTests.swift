// shared/fixtures/conformance/device-reading.json (validation/DEVICE_READING.md): the response
// constraints, the checks, the readings part by part with a fake device answering from the
// fixture, and every right reading of the 38 evaluation paystubs (zero false alarms).

import Foundation
import Testing
@testable import SilhouetteCore

@Suite("shared/fixtures/conformance/device-reading.json")
struct DeviceReadingTests {
    static let fixture = try! Shared.conformance("device-reading.json")
    static let schema = try! Shared.json(fixture["schema"]!.stringValue!)
    static var jurisdiction: String { fixture["jurisdiction"]!.stringValue! }

    static func section(_ name: String) -> [FixtureCase] {
        (fixture[name]?.arrayValue ?? []).map { FixtureCase(file: "device-reading.json", json: $0) }
    }

    static func document(_ id: String) -> (skeleton: String, map: PlaceholderMap) {
        let doc = fixture["documents"]![id]!
        let map = PlaceholderMap((doc["map"]?.objectValue?.entries ?? []).map { ($0.key, $0.value.stringValue ?? "") })
        return (doc["skeleton"]!.stringValue!, map)
    }

    static func strings(_ json: JSON?) -> [String] { json?.arrayValue?.compactMap(\.stringValue) ?? [] }

    static var caseCount: Int {
        ["constraints", "checks", "readings"].reduce(0) { $0 + section($1).count } + (fixture["gold"]?["cases"]?.arrayValue?.count ?? 0)
    }

    @Test("the fixture has 4 constraints, 27 checks, 24 readings and 38 gold cases (93)")
    func counts() {
        #expect(Self.section("constraints").count == 4)
        #expect(Self.section("checks").count == 27)
        #expect(Self.section("readings").count == 24)
        #expect(Self.fixture["gold"]?["cases"]?.arrayValue?.count == 38)
        #expect(Self.caseCount == 93)
    }

    @Test("constraints", arguments: section("constraints"))
    func constraint(_ k: FixtureCase) throws {
        let doc = Self.document(try #require(k["document"]?.stringValue))
        let partName = try #require(k["part"]?.stringValue)
        let part = try #require(DeviceReading.Part(rawValue: partName))
        expectIdentical(DeviceReading.constraint(schema: Self.schema, skeleton: doc.skeleton, part: part), k["expected"], k.id)
    }

    @Test("checks", arguments: section("checks"))
    func check(_ k: FixtureCase) throws {
        let doc = Self.document(try #require(k["document"]?.stringValue))
        let p = try #require(k["pointers"])
        let e = try #require(k["expected"])
        let j = Self.jurisdiction
        #expect(DeviceReading.coreProblems(schema: Self.schema, pointers: p, skeleton: doc.skeleton, map: doc.map, jurisdiction: j) == Self.strings(e["core"]), "\(k.id) core")
        #expect(DeviceReading.deductionsProblems(schema: Self.schema, pointers: p, map: doc.map, jurisdiction: j) == Self.strings(e["deductions"]), "\(k.id) deductions")
        let notRead = DeviceReading.notReadFields(p, skeleton: doc.skeleton)
        #expect(notRead.problems == Self.strings(e["notRead"]?["problems"]), "\(k.id) not read problems")
        #expect(notRead.fields == Self.strings(e["notRead"]?["fields"]), "\(k.id) not read fields")
        #expect(DeviceReading.ytdMissingWithCandidate(schema: Self.schema, pointers: p, skeleton: doc.skeleton, map: doc.map, jurisdiction: j)
            == e["ytdMissingWithCandidate"]?.boolValue, "\(k.id) trigger")
    }

    @Test("readings with a fake device answering each part", arguments: section("readings"))
    func reading(_ k: FixtureCase) async throws {
        let doc = Self.document(try #require(k["document"]?.stringValue))
        var answers: [DeviceReading.Part: String] = [:]
        for (key, value) in k["answers"]?.objectValue?.entries ?? [] {
            let named = key == "deductionsAgain" ? DeviceReading.Part.deductionsAgain : DeviceReading.Part(rawValue: key)
            let part = try #require(named)
            answers[part] = value.stringValue
        }
        let r = try await DeviceReading.read(schema: Self.schema, skeleton: doc.skeleton, map: Raw(doc.map), jurisdiction: Self.jurisdiction, answers: answers)
        let e = try #require(k["expected"])
        #expect(r.asked.map(\.rawValue) == Self.strings(e["asked"]), "\(k.id) asked")
        let expectedPasses = e["passes"]?.arrayValue ?? []
        #expect(r.passes.count == expectedPasses.count, "\(k.id) passes")
        for (pass, x) in zip(r.passes, expectedPasses) {
            #expect(pass.part.rawValue == x["part"]?.stringValue, "\(k.id) part")
            #expect(pass.parsed == x["parsed"]?.boolValue, "\(k.id) parsed")
            #expect(pass.problems == Self.strings(x["problems"]), "\(k.id) \(pass.part) problems")
            #expect(pass.marked == Self.strings(x["marked"]), "\(k.id) \(pass.part) marked")
            #expect(pass.extraKeys == Self.strings(x["extraKeys"]), "\(k.id) \(pass.part) extra keys")
            #expect(pass.missingKeys == Self.strings(x["missingKeys"]), "\(k.id) \(pass.part) missing keys")
        }
        switch r.outcome {
        case .onDevice(let pointers, let notRead):
            #expect(e["outcome"]?.stringValue == "on-device", "\(k.id) outcome")
            expectIdentical(pointers, e["value"], "\(k.id) value")
            #expect(notRead == Self.strings(e["notRead"]), "\(k.id) not read")
        case .failed(let problems):
            #expect(e["outcome"]?.stringValue == "failed", "\(k.id) outcome")
            #expect(problems == Self.strings(e["problems"]), "\(k.id) problems")
        }
    }

    /// Every right reading of a gold case: each combination of the alternatives over `base`.
    static func rightReadings(_ g: JSON) -> [JSON] {
        func choices(_ field: String) -> [JSON?] {
            let alts = g["alternatives"]?[field]?.arrayValue ?? []
            return alts.isEmpty ? [nil] : alts
        }
        var out: [JSON] = []
        for gross in choices("grossPay") { for ytd in choices("ytdGross") { for hours in choices("hoursWorked") { for rate in choices("hourlyRate") {
            var r = g["base"]?.objectValue ?? JSONObject()
            for (key, value) in [("grossPay", gross), ("ytdGross", ytd), ("hoursWorked", hours), ("hourlyRate", rate)] {
                r = JSONObject(r.entries.filter { $0.key != key || value != nil }.map { ($0.key, $0.value) })
                if let value { r[key] = value }
            }
            out.append(.object(r))
        } } } }
        return out
    }

    @Test("no false alarm on any right reading of the 38 evaluation paystubs", arguments: (fixture["gold"]?["cases"]?.arrayValue ?? []).map { FixtureCase(file: "device-reading.json", json: $0) })
    func gold(_ g: FixtureCase) throws {
        let id = try #require(g["document"]?.stringValue)
        let doc = Self.document(id)
        let readings = Self.rightReadings(g.json)
        #expect(readings.count == Int(g["expected"]?["readings"]?.numberValue ?? -1), "\(id) readings")
        for r in readings {
            #expect(DeviceReading.coreProblems(schema: Self.schema, pointers: r, skeleton: doc.skeleton, map: doc.map, jurisdiction: Self.jurisdiction).isEmpty, "\(id) core")
            #expect(DeviceReading.notReadFields(r, skeleton: doc.skeleton).problems.isEmpty, "\(id) not read")
        }
        for (field, runs) in g["names"]?.objectValue?.entries ?? [] {
            for ids in runs.arrayValue ?? [] {
                #expect(DeviceReading.incompleteNameProblems(.object(JSONObject([(field, ids)])), skeleton: doc.skeleton).isEmpty, "\(id) \(field)")
            }
        }
        // Leaving year to date out asks the gross part again exactly where the document has one place for it.
        let grossChoices = g["alternatives"]?["grossPay"]?.arrayValue ?? []
        let expected = (g["expected"]?["ytdMissingWhenLeftOut"]?.arrayValue ?? []).compactMap(\.boolValue)
        for (i, gross) in grossChoices.enumerated() where i < expected.count {
            var left = g["base"]?.objectValue ?? JSONObject()
            left = JSONObject(left.entries.filter { $0.key != "ytdGross" }.map { ($0.key, $0.value) })
            left["grossPay"] = gross
            #expect(DeviceReading.ytdMissingWithCandidate(schema: Self.schema, pointers: .object(left), skeleton: doc.skeleton, map: doc.map,
                                                         jurisdiction: Self.jurisdiction) == expected[i], "\(id) left out \(i)")
        }
    }

    @Test("the real mistakes recorded on the device are caught")
    func realMistakes() {
        let by = Dictionary(uniqueKeysWithValues: Self.section("checks").map { ($0.id, $0.json["expected"]!) })
        for id in ["real-run3-sample-ytd-regular-line", "real-run3-l01-ytd-regular-line", "real-run3-l07-ytd-holiday-line"] {
            let core = Self.strings(by[id]?["core"])
            #expect(core.contains("ytdGross:not-on-gross-line"), "\(id)")
        }
        let shared = Self.strings(by["real-run3-l10-names-shared"]?["notRead"]?["fields"])
        #expect(shared.contains("employeeName"))
        #expect(by["real-run4-sample-ytd-left-out"]?["ytdMissingWithCandidate"]?.boolValue == true)
        let hours = Self.strings(by["real-run4-l07-hours-on-gross"]?["notRead"]?["fields"])
        #expect(hours == ["hoursWorked"])
    }
}
