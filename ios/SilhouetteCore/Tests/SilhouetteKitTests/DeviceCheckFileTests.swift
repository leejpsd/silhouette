// The on-device check (shared/validation/DEVICE_CHECK.md): scoring, summaries, file names and run-file
// validation against shared/fixtures/conformance/device-check.json; the iPhone's recorded runs; and
// those runs replayed under the confirmation rules of DEVICE_READING.md v2 section 5.1.

import Foundation
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

@Suite("on-device check")
struct DeviceCheckFileTests {
    static let fixture = try! JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("fixtures/conformance/device-check.json")))
    static let runSchema = try! JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("schemas/device-check-run.v3.json")))
    static let schema = try! JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("schemas/pointer.paystub.json")))

    static func section(_ name: String) -> [JSON] { fixture[name]?.arrayValue ?? [] }

    /// The iPhone's recorded runs kept with the app: the baseline and latest (bundled) and history/.
    static var iPhoneRuns: [(name: String, file: JSON)] {
        let folder = Repo.ios.appendingPathComponent("eval/on-device")
        let urls = ((try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? [])
            + ((try? FileManager.default.contentsOfDirectory(at: folder.appendingPathComponent("history"), includingPropertiesForKeys: nil)) ?? [])
        return urls.filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { url in (try? JSON.parse(Data(contentsOf: url))).map { (url.lastPathComponent, $0) } }
    }

    // MARK: device-check.json

    @Test("scoring a reading by value", arguments: section("readings").map { $0["id"]?.stringValue ?? "" })
    func reading(_ id: String) throws {
        let k = try #require(Self.section("readings").first { $0["id"]?.stringValue == id })
        let docId = try #require(k["document"]?.stringValue)
        let doc = try #require(Self.fixture["documents"]?[docId])
        let map = PlaceholderMap((doc["map"]?.objectValue?.entries ?? []).map { ($0.key, $0.value.stringValue ?? "") })
        let gold = try #require(doc["gold"])
        let statuses = ReadingScore.statuses(schema: Self.schema, pointers: try #require(k["pointers"]), map: Raw(map), gold: Raw(gold))
        let e = try #require(k["expected"])
        let byField = JSON.object(JSONObject(statuses.map { ($0.field, JSON.string($0.status.rawValue)) }))
        #expect(byField.jsonText == e["statuses"]?.jsonText, "\(id) statuses")
        let fields = ReadingScore.score(statuses, gold: Raw(gold))
        #expect(Double(fields.correct) == e["fields"]?["correct"]?.numberValue && Double(fields.total) == e["fields"]?["total"]?.numberValue, "\(id) fields")
        let income = DeviceCheck.incomeInputs(statuses)
        #expect(income.right == (e["incomeInputs"]?["right"]?.arrayValue ?? []).compactMap(\.stringValue), "\(id) right")
        #expect(income.notFound == (e["incomeInputs"]?["notFound"]?.arrayValue ?? []).compactMap(\.stringValue), "\(id) not found")
        #expect(income.wrong == (e["incomeInputs"]?["wrong"]?.arrayValue ?? []).compactMap(\.stringValue), "\(id) wrong")
        #expect(DeviceCheck.wrongFields(statuses) == (e["wrongFields"]?.arrayValue ?? []).compactMap(\.stringValue), "\(id) wrong fields")
    }

    @Test("the summary of runs of versions 1 to 3", arguments: section("runs").map { $0["id"]?.stringValue ?? "" })
    func run(_ id: String) throws {
        let k = try #require(Self.section("runs").first { $0["id"]?.stringValue == id })
        let s = DeviceCheck.summarize(k["cases"]?.arrayValue ?? [], version: Int(k["version"]?.numberValue ?? 3))
        #expect(s.json.jsonText == k["expected"]?.jsonText, "\(id)")
    }

    @Test("file names")
    func fileNames() {
        for k in Self.section("fileNames") {
            #expect(DeviceCheck.fileName(date: k["date"]?.stringValue ?? "", browser: k["browser"]?.stringValue ?? "",
                                         platform: k["platform"]?.stringValue ?? "") == k["expected"]?.stringValue)
        }
        #expect(!Self.section("fileNames").isEmpty)
    }

    @Test("the Web's recorded run and every iPhone run validate against the run-file schema")
    func validRuns() throws {
        for path in Self.section("validRuns").compactMap(\.stringValue) {
            let run = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent(path)))
            #expect(DeviceCheck.validate(Self.runSchema, run) == [], "\(path)")
        }
        #expect(Self.iPhoneRuns.count == 3)
        for run in Self.iPhoneRuns {
            #expect(DeviceCheck.validate(Self.runSchema, run.file) == [], "\(run.name)")
            #expect(DeviceCheck.fileName(run.file) == run.name, "\(run.name) is named as the spec says")
        }
    }

    @Test("a run file this app writes validates: device block, a pass that failed without an answer, the photo case")
    func writtenRunValidates() throws {
        let failed = DeviceReading.Pass(part: .core, parsed: false, value: nil, problems: ["error:on-device-unavailable"], extraKeys: [], missingKeys: [],
                                        seconds: 0.01, failure: DeviceReading.Failure(origin: "sdk", type: "FoundationModels.LanguageModelSession.GenerationError",
                                                                                      message: "guardrailViolation"))
        let record = DeviceCheck.passRecord(failed)
        let problems = (record["problems"]?.arrayValue ?? []).compactMap(\.stringValue)
        #expect(problems.first == "error:on-device-unavailable")
        #expect(problems.last == "failure:sdk:FoundationModels.LanguageModelSession.GenerationError: guardrailViolation")
        let extraction = JSON.object(JSONObject([
            ("id", .string("pointers: evaluation paystub L10")), ("task", .string("document.pointer.extract")), ("mode", .string("PREFER_ON_DEVICE")),
            ("ran", .string("not-run")), ("latencyMs", .number(12)), ("outputCheck", .null),
            ("device", .object(JSONObject([("scoredBy", .string("value")), ("rawText", .string("")), ("parsed", .bool(false)),
                                           ("problems", .array([.string("error:on-device-unavailable")])), ("passed", .bool(false)),
                                           ("fields", .array([])), ("passes", .array([record]))]))),
            ("error", .string("not-configured: no Firebase configuration in this build")),
        ]))
        let photo = JSON.object(JSONObject([("id", .string("photo of the sample (en)")), ("task", .string("document.photo.read")),
                                            ("mode", .string("ONLY_ON_DEVICE")), ("ran", .string("not-run")), ("latencyMs", .null),
                                            ("outputCheck", .null), ("note", .string("not available on this platform"))]))
        let file = DeviceCheck.runFile(date: "2026-11-17T10:12:00.000Z", browser: "Silhouette 1.0", platform: "iOS 26.5.2",
                                       userAgent: "Silhouette/1.0 (iPhone18,1; iOS 26.5.2; Firebase AI Logic 12.19.3)",
                                       availability: [("systemLanguageModel", "available")], jurisdiction: "us-ca", repetitions: 1,
                                       device: DeviceCheck.deviceBlock(os: "iOS", osVersion: "26.5.2", model: "iPhone18,1",
                                                                       onDeviceModel: "Apple Foundation Models", sdk: "Firebase AI Logic 12.19.3",
                                                                       appVersion: "1.0 (1)"),
                                       cases: [extraction, photo])
        #expect(DeviceCheck.validate(Self.runSchema, file) == [])
        #expect(DeviceCheck.fileName(file) == "device-check-2026-11-17T1012-silhouette1-ios2652.json")
        // The photo case stays in the file and is left out of the figures shown on iOS.
        #expect(DeviceCheck.countedCases(file).count == 1)
        #expect(DeviceCheck.summarize(file).total == 2)
    }

    @Test("the schema validator reports what the reference reports")
    func validatorFindsProblems() {
        let bad = JSON.object(JSONObject([("kind", .string("other")), ("version", .number(4)), ("cases", .array([])), ("extra", .bool(true))]))
        let problems = DeviceCheck.validate(Self.runSchema, bad)
        #expect(problems.contains("$: missing date") && problems.contains("$: unexpected extra"))
        #expect(problems.contains { $0.hasPrefix("$.kind: expected") } && problems.contains { $0.hasPrefix("$.version: not one of") })
    }

    // MARK: The iPhone runs under DEVICE_READING.md v2

    /// A document of the check by its case id (shared/fixtures/device-check/cases.json): its silhouette and gold values.
    static func document(_ caseId: String, bundle: SharedBundle) throws -> (skeleton: Skeleton, map: Raw<PlaceholderMap>, gold: Raw<JSON>)? {
        let cases = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("fixtures/device-check/cases.json")))
        guard let entry = cases["extraction"]?.arrayValue?.first(where: { $0["id"]?.stringValue == caseId }),
              let path = entry["document"]?.stringValue else { return nil }
        let allowlist = try bundle.allowlist(for: .en)
        if path.hasPrefix("samples/") {
            guard let sample = ReadingScore.sampleGold(bundle, sampleId: "paystub-en-01") else { return nil }
            let s = Skeletonizer.skeletonize(sample.text, allowlist: allowlist)
            return (s.skeleton, s.map, sample.gold)
        }
        let text = try String(contentsOf: Repo.shared.appendingPathComponent(path), encoding: .utf8)
        let goldPath = try #require(entry["gold"]?.stringValue)
        let gold = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent(goldPath)))
        let s = Skeletonizer.skeletonize(Raw(text), allowlist: allowlist)
        return (s.skeleton, s.map, Raw(gold))
    }

    @Test("replayed under the confirmation rules, no reading of the three iPhone runs leaves a wrong value with the person")
    func iPhoneRunsReplayed() async throws {
        let bundle = try Repo.bundle()
        var replayed = 0, stayed = 0, recordedWrong = 0
        for run in Self.iPhoneRuns {
            for c in run.file["cases"]?.arrayValue ?? [] where c["task"]?.stringValue == "document.pointer.extract" {
                guard let passes = c["device"]?["passes"]?.arrayValue, !passes.isEmpty,
                      let caseId = c["id"]?.stringValue, let doc = try Self.document(caseId, bundle: bundle) else { continue }
                if !(c["final"]?["wrongFields"]?.arrayValue ?? []).isEmpty { recordedWrong += 1 }
                var answers: [DeviceReading.Part: DeviceReading.PartAnswer] = [:]
                for p in passes {
                    guard let part = DeviceReading.Part(rawValue: p["part"]?.stringValue ?? "") else { continue }
                    let text = p["rawText"]?.stringValue ?? ""
                    answers[part] = text.isEmpty && p["parsed"]?.boolValue == false
                        ? DeviceReading.PartAnswer(text: nil, error: "on-device-unavailable")
                        : DeviceReading.PartAnswer(text: text)
                }
                // A part the recording does not have gets the recorded answer of the part it replaces.
                if answers[.deductionsAgain] == nil { answers[.deductionsAgain] = answers[.deductions] }
                let reading = try? await DeviceReading.read(schema: bundle.paystubSchema, skeleton: doc.skeleton.text, map: doc.map,
                                                            jurisdiction: "us-ca", language: "en") { part in
                    guard let a = answers[part] else { throw DeviceReading.MissingAnswer(part: part) }
                    return a
                }
                guard let reading else { continue }
                replayed += 1
                guard case .onDevice(let pointers, _) = reading.outcome else { continue }
                stayed += 1
                let statuses = ReadingScore.statuses(schema: bundle.paystubSchema, pointers: pointers, map: doc.map, gold: doc.gold)
                #expect(DeviceCheck.wrongFields(statuses) == [], "\(run.name) \(c["id"]?.stringValue ?? "") \(c["repetition"]?.numberValue.map { "repetition \(Int($0))" } ?? "")")
            }
        }
        print("iPhone replay: \(replayed) readings replayed, \(stayed) stayed on the device, \(recordedWrong) had a wrong value as recorded")
        #expect(recordedWrong > 0, "the recordings did let wrong values through before the rules")
        #expect(replayed > 0 && stayed > 0)
    }
}
