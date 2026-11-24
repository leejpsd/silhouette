// Paystubs read by Apple's on-device model on this machine, through the app's own port (Firebase AI
// Logic), part by part with the reading rules, and nothing sent: how many it answers, how many fields it
// gets right, and how large each request is in the model's own token count.
//
// - The window test runs whenever the on-device model's token count is available (iOS 26.4 or later):
//   every request of the long paystubs, as Planner builds it, must fit in the model's context window here,
//   and DeviceBudget's estimate must not be below this model's own count.
// - The reading run is long (minutes) and runs only when asked: `TEST_RUNNER_READING_RUN=<mode>` with
//   mode `auto` (as the app reads), `schema` (the constraint's text always in the prompt, as before),
//   `short` (the part's fields as the model schema instead) or `noschema` (neither), and optionally `TEST_RUNNER_READING_SETS` (comma separated: `sample`, `tuned`, `long`,
//   `heldout`; default `sample,tuned,long`) and `TEST_RUNNER_READING_OUT` (a folder for the run file).

import FirebaseAILogic
import FirebaseCore
import Foundation
import FoundationModels
@testable import Silhouette
import SilhouetteCore
@testable import SilhouetteKit
import Testing

private enum Repo {
    /// <repo>/ios, from <repo>/ios/SilhouetteTests/DeviceReadingWindowTests.swift
    static let ios = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    static let root = ios.deletingLastPathComponent()

    /// Synthetic paystubs with answer keys: `<id>.txt` and `<id>.gold.json`.
    static func documents(_ folder: URL, prefix: String = "") -> [HeldOutDocument] {
        let files = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        return files.filter { $0.pathExtension == "txt" && $0.lastPathComponent.hasPrefix(prefix) }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { url in
                let id = url.deletingPathExtension().lastPathComponent
                guard let text = try? String(contentsOf: url, encoding: .utf8),
                      let gold = (try? Data(contentsOf: folder.appendingPathComponent("\(id).gold.json"))).flatMap({ try? JSON.parse($0) })
                else { return nil }
                let layout = id.replacingOccurrences(of: #"-\d+$"#, with: "", options: .regularExpression)
                return HeldOutDocument(id: id, layout: layout, text: Raw(text), gold: gold)
            }
    }

    static func set(_ name: String, bundle: SharedBundle) -> [HeldOutDocument] {
        switch name {
        case "sample":
            // The sample's answer key is pointers; its values are those pointers rehydrated.
            guard let sample = bundle.samples.first(where: { $0.id == "paystub-en-01" }),
                  let pointers = bundle.sampleAnswers["samples"]?["paystub-en-01.txt"]?["pointers"],
                  let allowlist = try? bundle.allowlist(for: .en) else { return [] }
            let map = Skeletonizer.skeletonize(sample.text, allowlist: allowlist).map
            let gold = HeldOut.values(schema: bundle.paystubSchema, pointers: pointers, map: map)
            return [HeldOutDocument(id: sample.id, layout: "sample", text: sample.text, gold: gold)]
        case "tuned": return documents(root.appendingPathComponent("web/eval/dataset"), prefix: "en-")
        case "long": return documents(ios.appendingPathComponent("eval/long-paystubs"))
        case "heldout": return documents(root.appendingPathComponent("web/eval/heldout"), prefix: "hp-")
        default: return []
        }
    }
}

/// The app's port with the prompt's form forced: `schema` the constraint's text (as before), `short` the
/// part's fields as the model schema, `noschema` neither; nil leaves each call as Planner built it.
private struct ForcedPort: ModelPort {
    static let marker = "\n\nAnswer with JSON that matches this schema:\n"
    let base: FirebaseModelPort
    let mode: String?
    let pointerSchema: JSON
    func deviceAvailability() -> DeviceAvailability { base.deviceAvailability() }
    func generateOnDevice(_ call: DeviceCall) async throws -> ModelReply {
        guard let mode, let constraint = call.constraint else { return try await base.generateOnDevice(call) }
        let plain = call.prompt.components(separatedBy: Self.marker).first ?? call.prompt
        let short = Planner.partModelSchema(pointerSchema, constraint: constraint).map { plain + Self.marker + $0.jsonText } ?? plain
        let prompt = mode == "short" ? short : plain
        let forced = DeviceCall(taskId: call.taskId, system: call.system, prompt: prompt, maxOutputTokens: call.maxOutputTokens,
                                constraint: constraint, part: call.part, deterministic: call.deterministic, schemaInPrompt: mode == "schema")
        return try await base.generateOnDevice(forced)
    }
    func generateInCloud(_ request: CloudRequest) async throws -> ModelReply { throw TaskError(.notConfigured, "nothing is sent in this test") }
    func generateHybrid(_ request: CloudRequest, order: HybridOrder, gate: CloudGate) async throws -> ModelReply {
        throw TaskError(.notConfigured, "nothing is sent in this test")
    }
}

private func sharedBundle() throws -> SharedBundle {
    let shared = try #require(Bundle.main.resourceURL?.appendingPathComponent("Shared", isDirectory: true))
    return try SharedBundle(directory: shared, jurisdiction: "us-ca")
}

private var hasModel: Bool { FirebaseAI.SystemLanguageModel.default.isAvailable && FirebaseApp.app() != nil }
private let runMode = ProcessInfo.processInfo.environment["READING_RUN"]

@Suite("Long paystubs on this machine's on-device model", .serialized)
struct DeviceReadingWindowTests {
    /// Every request of a long paystub (the long synthetic set and the held-out texts, used here for their
    /// size only), with the schema in the prompt or not as Planner decides, counted by the model itself.
    @Test("every request of a long paystub fits this model's window, and the estimate is not below its count by more than 60")
    func requestsFitTheWindow() async throws {
        guard #available(iOS 26.4, *) else { return }
        let model = FoundationModels.SystemLanguageModel.default
        let bundle = try sharedBundle()
        let template = try #require(bundle.prompts["pointer-extract.v5"])
        let allowlist = try bundle.allowlist(for: .en)
        var largest = (tokens: 0, id: "", part: "")
        var lines: [String] = []
        for doc in Repo.set("long", bundle: bundle) + Repo.set("heldout", bundle: bundle) + Repo.set("sample", bundle: bundle) {
            let silhouette = Skeletonizer.skeletonize(doc.text, allowlist: allowlist)
            for part in [DeviceReading.Part.core, .gross, .deductions, .deductionsAgain] {
                let constraint = DeviceReading.constraint(schema: bundle.paystubSchema, skeleton: silhouette.skeleton.text, part: part)
                let call = Planner.devicePart(silhouette.skeleton, template: template, partText: bundle.prompts.deviceParts[part.rawValue] ?? "",
                                              part: part.rawValue, constraint: constraint, pointerSchema: bundle.paystubSchema)
                var entries: [Transcript.Entry] = [
                    .instructions(Transcript.Instructions(segments: [.text(Transcript.TextSegment(content: call.system))], toolDefinitions: [])),
                ]
                let schema = try DeviceConstraint.schema(constraint)
                entries.append(.prompt(Transcript.Prompt(segments: [.text(Transcript.TextSegment(content: call.prompt))],
                                                         responseFormat: call.schemaInPrompt ? Transcript.ResponseFormat(schema: schema) : nil)))
                let tokens = try await model.tokenCount(for: entries)
                let estimate = DeviceBudget.estimate(call)
                lines.append("\(doc.id) \(part.rawValue) silhouetteChars=\(silhouette.skeleton.text.count) schemaInPrompt=\(call.schemaInPrompt) tokens=\(tokens) estimate=\(estimate)")
                #expect(tokens + DeviceBudget.answerReserve(call.constraint) <= model.contextSize, "\(doc.id) \(part.rawValue): \(tokens) tokens")
                // The estimate is the iPhone's measure: the constraint's text counts 3.2 times more there, and the
                // instruction and prompt are estimated within 60 tokens.
                #expect(estimate + 60 >= tokens, "\(doc.id) \(part.rawValue): estimate \(estimate) below the model's \(tokens)")
                if tokens > largest.tokens { largest = (tokens, doc.id, part.rawValue) }
            }
        }
        print(lines.joined(separator: "\n"))
        print("largest request here: \(largest.tokens) tokens (\(largest.id) \(largest.part)), window \(model.contextSize)")
    }

    /// Without its text in the prompt, the constraint still decides what can be written: ids the prompt
    /// never shows are the only ones the answer can hold.
    @Test("the constraint holds when its text is not in the prompt", .enabled(if: hasModel, "needs the on-device model"))
    func constraintWithoutItsText() async throws {
        let constraint = try JSON.parse(Data(#"""
        {"type":"object","properties":{"grossPay":{"type":["string","null"],"enum":["N907","N908",null]},
         "employerName":{"type":["array","null"],"minItems":1,"items":{"type":"string","enum":["W915","W916"]}}},
         "required":["grossPay","employerName"],"additionalProperties":false}
        """#.utf8))
        let call = DeviceCall(taskId: "document.pointer.extract", system: "You label fields of a document.",
                              prompt: "Document:\nAcme Tools   Gross Pay ⟦N1⟧\nAnswer with JSON.", maxOutputTokens: 256, constraint: constraint,
                              part: "core", deterministic: true, schemaInPrompt: false)
        let reply = try await FirebaseModelPort().generateOnDevice(call)
        let answer = try JSON.parse(Data(reply.text.utf8))
        let keys = Set(answer.objectValue?.keys ?? [])
        #expect(keys.isSubset(of: ["grossPay", "employerName"]), "\(reply.text)")
        if let g = answer["grossPay"]?.stringValue { #expect(["N907", "N908"].contains(g), "\(reply.text)") }
        for w in answer["employerName"]?.arrayValue ?? [] { #expect(["W915", "W916"].contains(w.stringValue ?? ""), "\(reply.text)") }
        print("answer without the constraint's text: \(reply.text)")
    }

    /// A request past the window is refused before any answer, and the port names it so the reading can
    /// ask the same part again without the constraint's text.
    @Test("a request past the window is refused as such, and fits without the constraint's text", .enabled(if: hasModel, "needs the on-device model"))
    func refusedForLength() async throws {
        let bundle = try sharedBundle()
        let template = try #require(bundle.prompts["pointer-extract.v5"])
        let doc = try #require(Repo.set("long", bundle: bundle).last)
        let silhouette = Skeletonizer.skeletonize(doc.text, allowlist: try bundle.allowlist(for: .en))
        let constraint = DeviceReading.constraint(schema: bundle.paystubSchema, skeleton: silhouette.skeleton.text, part: .core)
        let make = { (constraintText: Bool?) in
            Planner.devicePart(silhouette.skeleton, template: template, partText: bundle.prompts.deviceParts["core"] ?? "", part: "core",
                               constraint: constraint, pointerSchema: bundle.paystubSchema, constraintText: constraintText)
        }
        #expect(!make(nil).schemaInPrompt)
        do {
            _ = try await FirebaseModelPort().generateOnDevice(make(true))
            Issue.record("answered with the constraint's text in the prompt")
        } catch let error as TaskError {
            #expect(error.origin == DeviceBudget.contextWindowOrigin, "\(error.detail)")
        }
        let reply = try await FirebaseModelPort().generateOnDevice(make(false))
        #expect(TaskRunner.parsePointers(reply.text) != nil, "\(reply.text)")
    }

    /// The reading run: each paystub read on the device as the app reads it, nothing sent, scored against its
    /// answer key the way the held-out scorer scores.
    @Test("paystubs read on this machine's on-device model", .enabled(if: runMode != nil && hasModel, "set TEST_RUNNER_READING_RUN"))
    func readingRun() async throws {
        let bundle = try sharedBundle()
        let template = try #require(bundle.prompts["pointer-extract.v5"])
        let allowlist = try bundle.allowlist(for: .en)
        let schema = bundle.paystubSchema
        let forced = ["schema", "short", "noschema"].contains(runMode ?? "") ? runMode : nil
        let runner = TaskRunner(port: ForcedPort(base: FirebaseModelPort(), mode: forced, pointerSchema: schema), log: OutboundLog(),
                                outputChecks: bundle.outputChecks)
        let sets = (ProcessInfo.processInfo.environment["READING_SETS"] ?? "sample,tuned,long").split(separator: ",").map(String.init)
        var records: [JSON] = []
        var golds: [String: JSON] = [:]
        for doc in sets.flatMap({ Repo.set($0, bundle: bundle) }) {
            golds[doc.id] = doc.gold
            let started = Date()
            let ms = { Date().timeIntervalSince(started) * 1000 }
            let silhouette = Skeletonizer.skeletonize(doc.text, allowlist: allowlist)
            let request = try Planner.pointers(silhouette.skeleton, language: .en, template: template, pointerSchema: schema)
            let inParts = ReadingInParts(template: template, parts: bundle.prompts.deviceParts, schema: schema, skeleton: silhouette.skeleton,
                                         map: silhouette.map, jurisdiction: bundle.packInfo.jurisdiction, language: "en")
            do {
                let outcome = try await runner.extractPointers(request, inParts: inParts, keepOnDevice: true)
                records.append(HeldOut.record(doc, schema: schema, map: silhouette.map, outcome: outcome, latencyMs: ms()))
            } catch {
                let e = (error as? DeviceReadingFailed)?.error ?? (error as? TaskError) ?? TaskError(.unknown, String(describing: error))
                records.append(HeldOut.failed(doc, schema: schema, map: silhouette.map, error: "\(e.kind.rawValue): \(e.detail)",
                                              attempt: (error as? DeviceReadingFailed)?.attempt, latencyMs: ms()))
            }
            print("read \(doc.id): \(records.last?["ran"]?.stringValue ?? "?")")
        }
        let file = HeldOut.runFile(date: ISO8601DateFormatter().string(from: Date()), browser: "Silhouette tests", platform: "iOS Simulator",
                                   userAgent: "simulator", availability: [("systemLanguageModel", "available")],
                                   device: .object(JSONObject([("mode", .string(runMode ?? "auto"))])), documents: records)
        if let out = ProcessInfo.processInfo.environment["READING_OUT"] {
            let url = URL(fileURLWithPath: out).appendingPathComponent("reading-\(runMode ?? "auto")-\(sets.joined(separator: "+")).json")
            try Data((file.jsonText + "\n").utf8).write(to: url)
        }
        let f = HeldOut.figures(file, golds: golds)
        print("""
        mode \(runMode ?? "auto"), sets \(sets.joined(separator: ",")): \(f.documents) paystubs, \(f.onDevice) answered on the device, \
        \(f.notRun) not answered; fields right as shown \(f.finalCorrect)/\(f.finalTotal), first answer \(f.firstCorrect)/\(f.firstTotal); \
        all income inputs right \(f.incomeAllRight), any income input wrong \(f.incomeWrong), any value wrong \(f.wrongShown)
        """)
        for r in f.rows {
            print("  \(r.id) \(r.ran) shown \(r.shown.correct)/\(r.shown.total) first \(r.first.map { "\($0.correct)/\($0.total)" } ?? "-") wrong \(r.wrong)")
        }
    }
}
