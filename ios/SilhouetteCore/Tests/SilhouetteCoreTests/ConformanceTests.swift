// Conformance suite: runs every file in shared/fixtures/conformance/ against SilhouetteCore and
// asserts exact equality with `expected`, `expectedError`, `expectedUnknown` and
// `expectedUnknownReads` (including object key order and the canonical profile string).

import Foundation
import Testing
@testable import SilhouetteCore

@Suite("shared/fixtures/conformance")
struct ConformanceTests {
    /// Files this suite knows how to run. A new file in the folder fails the suite until a runner
    /// is added.
    static let knownFiles: Set<String> = [
        "device-check.json", "device-reading.json", "evaluator.json", "judges-household.json", "generalize.json", "model-schema.json", "output-check.json", "rehydrate.json", "silhouette-verdict.json",
        "skeleton.json", "validate.json", "verdict.json",
    ]

    @Test("every file in the folder has a runner, and every runner has a file")
    func folderIsFullyCovered() throws {
        let files = Set(try Shared.files(in: Shared.conformanceDir))
        #expect(files.subtracting(Self.knownFiles).isEmpty, "no runner for: \(files.subtracting(Self.knownFiles).sorted())")
        #expect(Self.knownFiles.subtracting(files).isEmpty, "missing fixture files: \(Self.knownFiles.subtracting(files).sorted())")
        // These have sections instead of `cases`: device-reading.json (DeviceReadingTests), device-check.json
        // (SilhouetteKit's DeviceCheckConformanceTests: scoring needs the Kit) and judges-household.json (below).
        let sectioned: Set<String> = ["device-reading.json", "device-check.json", "judges-household.json"]
        for file in files where !sectioned.contains(file) { #expect(try !Shared.cases(file).isEmpty, "\(file) has no cases") }
        #expect(DeviceReadingTests.caseCount > 0)
    }

    // MARK: skeleton.json

    @Test("skeleton.json", arguments: try Shared.cases("skeleton.json"))
    func skeleton(_ k: FixtureCase) throws {
        let input = try #require(k["input"]?.stringValue)
        let allow = try Shared.allowlist(try #require(k["locale"]?.stringValue))
        let hide = (k["hide"]?.arrayValue ?? []).compactMap(\.stringValue)
        let result = Skeletonizer.skeletonize(Raw(input), allowlist: allow, hide: Raw(hide))
        let map = result.map.value

        expectExactString(result.skeleton.text, k["expected"]?["skeleton"]?.stringValue, "\(k.id): skeleton")
        expectIdentical(map.json, k["expected"]?["map"], "\(k.id): map")

        // No ASCII digit and no non-allowlisted word survives.
        let stripped = try NSRegularExpression(pattern: "\u{27E6}[DNW][0-9]+\u{27E7}")
            .stringByReplacingMatches(in: result.skeleton.text, range: NSRange(location: 0, length: (result.skeleton.text as NSString).length), withTemplate: "")
        #expect(!stripped.unicodeScalars.contains { ("0"..."9").contains($0) }, "\(k.id): digit survived")
        let words = try NSRegularExpression(pattern: #"[\p{L}\p{M}]+"#)
        let ns = stripped as NSString
        for m in words.matches(in: stripped, range: NSRange(location: 0, length: ns.length)) {
            let word = ns.substring(with: m.range)
            #expect(allow.contains(word.lowercased()), "\(k.id): \"\(word)\" survived but is not allowlisted")
            #expect(!hide.contains(word.lowercased()), "\(k.id): hidden word \"\(word)\" survived")
        }

        // Skeleton + map reconstruct the normalized input exactly.
        let placeholder = try NSRegularExpression(pattern: "\u{27E6}([DNW][0-9]+)\u{27E7}")
        let sk = result.skeleton.text as NSString
        var rebuilt = ""
        var cursor = 0
        for m in placeholder.matches(in: result.skeleton.text, range: NSRange(location: 0, length: sk.length)) {
            rebuilt += sk.substring(with: NSRange(location: cursor, length: m.range.location - cursor))
            rebuilt += map[sk.substring(with: m.range(at: 1))] ?? ""
            cursor = m.range.location + m.range.length
        }
        rebuilt += sk.substring(from: cursor)
        expectExactString(rebuilt, Skeletonizer.normalize(input), "\(k.id): reconstruction")
    }

    // MARK: rehydrate.json

    @Test("rehydrate.json numbers")
    func rehydrateNumbers() throws {
        let numbers = try #require(try Shared.conformance("rehydrate.json")["numbers"]?.arrayValue)
        #expect(!numbers.isEmpty)
        for n in numbers {
            let token = try #require(n["token"]?.stringValue)
            let actual: JSON = Rehydrator.parseNumber(token).map(JSON.number) ?? .null
            expectIdentical(actual, n["expected"], "parseNumber(\(JSON.string(token).jsonText))")
        }
    }

    @Test("rehydrate.json typed amounts")
    func typedAmounts() throws {
        let cases = try #require(try Shared.conformance("rehydrate.json")["typedAmounts"]?.arrayValue)
        #expect(cases.count >= 41)
        for c in cases {
            let text = try #require(c["text"]?.stringValue)
            let actual: JSON = Rehydrator.parseTypedAmount(text).map(JSON.number) ?? .null
            expectIdentical(actual, c["expected"], "parseTypedAmount(\(JSON.string(text).jsonText))")
        }
    }

    @Test("rehydrate.json", arguments: try Shared.cases("rehydrate.json"))
    func rehydrate(_ k: FixtureCase) throws {
        let schema = try Shared.json("schemas/\(try #require(k["schema"]?.stringValue))")
        let mapObject = try #require(k["map"]?.objectValue)
        var entries: [(String, String)] = []
        for (id, value) in mapObject.entries { entries.append((id, try #require(value.stringValue))) }
        let pointers = try #require(k["pointers"])
        let result = Rehydrator.rehydrate(schema: schema, pointers: pointers, map: Raw(PlaceholderMap(entries)))
        expectIdentical(result.value, k["expected"], k.id)
    }

    // MARK: generalize.json

    @Test("generalize.json", arguments: try Shared.cases("generalize.json"))
    func generalize(_ k: FixtureCase) throws {
        let bands = try Bands(json: Shared.json(try #require(try Shared.conformance("generalize.json")["bands"]?.stringValue)))
        let exact = try #require(k["exact"])
        if let error = k["expectedError"]?.stringValue {
            expectFixtureError(error, k.id) { _ = try Generalizer.generalize(json: Raw(exact), bands: bands) }
            return
        }
        let profile = try Generalizer.generalize(json: Raw(exact), bands: bands)
        expectIdentical(profile.value.json, k["expected"], k.id)
        expectExactString(profile.canonical, k["expectedCanonical"]?.stringValue, "\(k.id): canonical")
        expectExactString(CloudBoundary.outbound(profile).text, k["expectedCanonical"]?.stringValue, "\(k.id): outbound payload")
    }

    // MARK: evaluator.json

    @Test("evaluator.json", arguments: try Shared.cases("evaluator.json"))
    func evaluator(_ k: FixtureCase) throws {
        let file = try Shared.conformance("evaluator.json")
        let data = try #require(file["data"])
        let unavailable = Set(try #require(file["unavailable"]?.arrayValue).compactMap(\.stringValue))
        let expr = try #require(k["expr"])
        var ctx = EvalContext(unavailable: unavailable)
        if let error = k["expectedError"]?.stringValue {
            expectFixtureError(error, k.id) { _ = try RulesEngine.evaluate(expr, data: data, context: &ctx) }
        } else if k["expectedUnknown"]?.boolValue == true {
            let value = try RulesEngine.evaluate(expr, data: data, context: &ctx)
            #expect(value.isUnknown, "\(k.id): expected unknown")
            let reads = ctx.unknownReads.sorted { $0.utf16Precedes($1) }
            expectIdentical(.array(reads.map(JSON.string)), k["expectedUnknownReads"], "\(k.id): unknown reads")
        } else if let expected = k["expected"] {
            let value = try RulesEngine.evaluate(expr, data: data, context: &ctx)
            expectIdentical(try #require(value.json, "\(k.id): unexpected unknown"), expected, k.id)
        } else {
            Issue.record("\(k.id): case has no expected, expectedError or expectedUnknown")
        }
    }

    // MARK: verdict.json

    @Test("verdict.json", arguments: try Shared.cases("verdict.json"))
    func verdict(_ k: FixtureCase) throws {
        let file = try Shared.conformance("verdict.json")
        let pack = try RulePack(json: Shared.json(try #require(file["pack"]?.stringValue)))
        let bands = try Bands(json: Shared.json(try #require(file["bands"]?.stringValue)))
        let answers = try #require(k["answers"])
        if let error = k["expectedError"]?.stringValue {
            expectFixtureError(error, k.id) { _ = try RulesEngine.verdicts(pack: pack, bands: bands, answers: Raw(answers)) }
            return
        }
        let result = try RulesEngine.verdicts(pack: pack, bands: bands, answers: Raw(answers))
        expectIdentical(.array(result.map(\.json)), k["expected"], k.id)
    }

    // MARK: judges-household.json

    @Test("judges-household.json: the results before and after the sample paystub, and its yearly income")
    func judgesHousehold() throws {
        let file = try Shared.conformance("judges-household.json")
        let pack = try RulePack(json: Shared.json(try #require(file["pack"]?.stringValue)))
        let bands = try Bands(json: Shared.json(try #require(file["bands"]?.stringValue)))
        for stage in ["before", "after"] {
            let answers = try #require(file[stage]?["engineAnswers"])
            let result = try RulesEngine.verdicts(pack: pack, bands: bands, answers: Raw(answers))
            expectIdentical(.array(result.map(\.json)), file[stage]?["expected"], "judges-household \(stage)")
        }
        let values = try #require(file["paystub"]?["values"])
        let validation = try Validator.validatePaystubs(Raw([values]), jurisdiction: pack.jurisdiction)
        #expect(validation.annualization.map { Double($0.annualIncome) } == file["paystub"]?["annualIncome"]?.numberValue)
        // The household file gives the "before" answers: the income band as incomeBand, every other answer by question id.
        let household = try Shared.json(try #require(file["household"]?.stringValue))
        var engine = JSONObject()
        for (id, value) in household["answers"]?.objectValue?.entries ?? [] {
            if id == "income" { engine["incomeBand"] = value["bandId"] ?? .null } else { engine[id] = value }
        }
        expectIdentical(.object(engine), file["before"]?["engineAnswers"], "judges-household engine answers")
    }

    // MARK: validate.json

    @Test("validate.json", arguments: try Shared.cases("validate.json"))
    func validate(_ k: FixtureCase) throws {
        let jurisdiction = try #require(k["jurisdiction"]?.stringValue)
        let stubs = try #require(k["stubs"]?.arrayValue)
        if let error = k["expectedError"]?.stringValue {
            expectFixtureError(error, k.id) { _ = try Validator.validatePaystubs(Raw(stubs), jurisdiction: jurisdiction) }
            return
        }
        let result = try Validator.validatePaystubs(Raw(stubs), jurisdiction: jurisdiction)
        expectIdentical(result.json, k["expected"], k.id)
    }

    @Test("validate.json w2Cases", arguments: (try Shared.conformance("validate.json")["w2Cases"]?.arrayValue ?? [])
        .map { FixtureCase(file: "validate.json", json: $0) })
    func validateW2(_ k: FixtureCase) throws {
        let forms = try #require(k["forms"]?.arrayValue)
        if let error = k["expectedError"]?.stringValue {
            expectFixtureError(error, k.id) { _ = try Validator.validateW2s(Raw(forms)) }
            return
        }
        expectIdentical(try Validator.validateW2s(Raw(forms)).json, k["expected"], k.id)
    }

    // MARK: model-schema.json

    @Test("model-schema.json", arguments: try Shared.cases("model-schema.json"))
    func modelSchema(_ k: FixtureCase) throws {
        let schema = try #require(k["schema"])
        let options = k["options"]
        let requiredNullable = options?["requiredNullable"]?.boolValue ?? false
        let dialect = try #require(ModelSchema.Dialect(rawValue: options?["dialect"]?.stringValue ?? "openapi"))
        if k["expectedError"] != nil {
            #expect(throws: ModelSchemaError.self, "\(k.id)") {
                try ModelSchema.derive(schema, requiredNullable: requiredNullable, dialect: dialect)
            }
            return
        }
        expectIdentical(try ModelSchema.derive(schema, requiredNullable: requiredNullable, dialect: dialect), k["expected"], k.id)
    }

    // MARK: silhouette-verdict.json

    @Test("silhouette-verdict.json", arguments: try Shared.cases("silhouette-verdict.json"))
    func silhouetteVerdict(_ k: FixtureCase) throws {
        let file = try Shared.conformance("silhouette-verdict.json")
        let pack = try RulePack(json: Shared.json(try #require(file["pack"]?.stringValue)))
        let bands = try Bands(json: Shared.json(try #require(file["bands"]?.stringValue)))
        let p = try #require(k["profile"])
        let size: GeneralizedProfile.HouseholdSize? = switch p["householdSize"] {
        case .number(let n)?: .exact(Int(n))
        case .string(let s)?: .capped(s)
        default: nil
        }
        let profile = GeneralizedProfile(
            jurisdiction: try #require(p["jurisdiction"]?.stringValue), incomeBand: p["incomeBand"]?.stringValue, householdSize: size,
            childAgeBands: p["childAgeBands"]?.arrayValue?.compactMap(\.stringValue), county: p["county"]?.stringValue,
            housing: p["housing"]?.stringValue.flatMap(GeneralizedProfile.Housing.init(rawValue:)))
        let result = try RulesEngine.silhouetteVerdicts(pack: pack, bands: bands,
                                                        profile: Generalized(value: profile, canonical: profile.canonical))
        expectIdentical(.array(result.value.map(\.json)), k["expected"], k.id)
        expectExactString(CloudBoundary.outbound(result).text, k["expected"]?.jsonText, "\(k.id): outbound text")
    }

    // MARK: output-check.json

    @Test("output-check.json", arguments: try Shared.cases("output-check.json"))
    func outputCheck(_ k: FixtureCase) throws {
        let file = try Shared.conformance("output-check.json")
        let checksPath = try #require(file["checks"]?.stringValue)
        let checks = try Shared.json(checksPath)
        let scopeName = try #require(k["scope"]?.stringValue)
        let scope = try #require(OutputCheck.Scope(rawValue: scopeName))
        let text = try #require(k["text"]?.stringValue)
        let locale = try #require(k["locale"]?.stringValue)
        let blocked = OutputCheck.isBlocked(text, locale: locale, scope: scope, checks: checks, verdict: k["verdict"]?.stringValue)
        #expect(blocked == k["blocked"]?.boolValue, "\(k.id)")
    }
}
