// The size of the on-device reading requests (DeviceBudget): the estimate against the model's own token
// counts (token-counts.json), and every request of a paystub up to 3,500 characters inside the window.

import Foundation
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

@Suite("On-device request size")
struct DeviceBudgetTests {
    static let root = Repo.ios.deletingLastPathComponent()
    static let bundle = try! Repo.bundle()
    static let template = bundle.prompts["pointer-extract.v5"]!
    static let allowlist = try! bundle.allowlist(for: .en)

    static func text(_ doc: String) -> String? {
        let folders = ["shared/samples", "web/eval/dataset", "web/eval/heldout", "ios/eval/long-paystubs"]
        return folders.lazy.compactMap { try? String(contentsOf: root.appendingPathComponent("\($0)/\(doc).txt"), encoding: .utf8) }.first
    }

    static func ids(_ folder: String, prefix: String) -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent(folder).path)) ?? [])
            .filter { $0.hasPrefix(prefix) && $0.hasSuffix(".txt") }.map { String($0.dropLast(4)) }.sorted()
    }

    static let parts: [DeviceReading.Part] = [.core, .gross, .deductions, .deductionsAgain]

    /// The device call of one part, as the reading builds it.
    static func call(_ text: String, _ part: DeviceReading.Part, constraintText: Bool? = nil) -> DeviceCall {
        let silhouette = Skeletonizer.skeletonize(Raw(text), allowlist: allowlist)
        let constraint = DeviceReading.constraint(schema: bundle.paystubSchema, skeleton: silhouette.skeleton.text, part: part)
        return Planner.devicePart(silhouette.skeleton, template: template, partText: bundle.prompts.deviceParts[part.rawValue] ?? "",
                                  part: part.rawValue, constraint: constraint, pointerSchema: bundle.paystubSchema, constraintText: constraintText)
    }

    static let counts: [JSON] = {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("token-counts.json")
        return (try? JSON.parse(Data(contentsOf: url)))?["requests"]?.arrayValue ?? []
    }()

    @Test("the text estimate is at most 60 tokens below and 80 above the model's count, on every recorded request")
    func textCalibration() throws {
        #expect(Self.counts.count == 284)
        for r in Self.counts {
            let doc = try #require(r["doc"]?.stringValue), partName = try #require(r["part"]?.stringValue)
            let part = try #require(DeviceReading.Part(rawValue: partName))
            let text = try #require(Self.text(doc), "\(doc)")
            let call = Self.call(text, part, constraintText: true)
            let counted = try #require(r["text"]?.numberValue)
            let estimate = Double(DeviceBudget.textTokens(call.system + call.prompt))
            #expect(estimate >= counted - 60 && estimate <= counted + 80, "\(doc) \(partName): estimate \(estimate), counted \(counted)")
        }
    }

    /// The iPhone's own count, constraint included, of the 24 requests it refused.
    @Test("with the constraint's text, the estimate matches what the iPhone counted")
    func iPhoneCalibration() throws {
        let refused = Self.counts.filter { $0["iphone"] != nil }
        #expect(refused.count == 24)
        for r in refused {
            let doc = try #require(r["doc"]?.stringValue)
            let text = try #require(Self.text(doc))
            let call = Self.call(text, .core, constraintText: true)
            let iphone = try #require(r["iphone"]?.numberValue)
            let estimate = Double(DeviceBudget.estimate(call))
            #expect(estimate >= iphone - 50 && estimate <= iphone + 120, "\(doc): estimate \(estimate), iPhone \(iphone)")
            #expect(estimate > Double(DeviceBudget.window), "\(doc): the iPhone refused it")
        }
    }

    @Test("every part of the bundled sample keeps the constraint's text in its prompt, as before")
    func sampleUnchanged() throws {
        let text = try #require(Self.text("paystub-en-01"))
        for part in Self.parts {
            let call = Self.call(text, part)
            #expect(call.schemaInPrompt, "\(part.rawValue)")
            #expect(!call.prompt.contains("Answer with JSON"), "\(part.rawValue): the prompt is as before")
        }
        // The evaluation paystubs the iPhone has read in its on-device check: their first part too.
        for doc in ["en-l01-1", "en-l04-1", "en-l07-1", "en-l10-1"] {
            #expect(Self.call(try #require(Self.text(doc)), .core).schemaInPrompt, "\(doc)")
        }
    }

    /// Every part of the long synthetic paystubs (2,750 to 3,460 characters) and the held-out texts (used here
    /// for their size), as Planner builds it, fits the window with room for the answer.
    @Test("the largest request of a paystub up to 3,500 characters stays under 4,096 tokens")
    func longPaystubsFit() throws {
        let docs = Self.ids("ios/eval/long-paystubs", prefix: "ls-") + Self.ids("web/eval/heldout", prefix: "hp-")
        #expect(docs.count == 32)
        var largest = (tokens: 0, doc: "", part: "")
        for doc in docs {
            let text = try #require(Self.text(doc))
            #expect(text.count <= 3500)
            for part in Self.parts {
                let call = Self.call(text, part)
                let tokens = DeviceBudget.estimate(call)
                #expect(tokens + DeviceBudget.answerReserve(call.constraint) <= DeviceBudget.window, "\(doc) \(part.rawValue): \(tokens)")
                if tokens > largest.tokens { largest = (tokens, doc, part.rawValue) }
            }
        }
        #expect(largest.tokens < DeviceBudget.window - 128)
        print("largest estimated request: \(largest.tokens) tokens (\(largest.doc) \(largest.part))")
        // Without the constraint's text, the longest first part is the instruction and the silhouette alone.
        let longest = try #require(docs.max { (Self.text($0)?.count ?? 0) < (Self.text($1)?.count ?? 0) })
        let core = Self.call(try #require(Self.text(longest)), .core)
        #expect(!core.schemaInPrompt)
        #expect(core.prompt.contains("Answer with JSON that matches this schema:\n{"))
        #expect(DeviceBudget.estimate(core) < 3000)
        print("longest paystub's first part without the constraint's text: \(DeviceBudget.estimate(core)) tokens (\(longest))")
    }

    @Test("without the constraint's text, the prompt names the part's fields only, required and nullable")
    func partFieldsInShortForm() throws {
        let text = try #require(Self.text("ls-02-2"))
        for part in Self.parts {
            let call = Self.call(text, part, constraintText: false)
            let schemaText = try #require(call.prompt.components(separatedBy: "Answer with JSON that matches this schema:\n").last)
            let schema = try JSON.parse(Data(schemaText.utf8))
            let fields = call.constraint?["properties"]?.objectValue?.keys ?? []
            #expect(schema["properties"]?.objectValue?.keys == fields, "\(part.rawValue)")
            #expect(schema["required"]?.arrayValue?.compactMap(\.stringValue) == fields)
            #expect(!schemaText.contains("\"N1\""), "no id lists")
            #expect(!fields.contains("employerName") && !fields.contains("employeeName"), "the short form does not ask the names")
        }
    }

    @Test("a constraint counts every allowed value of every field")
    func allowedValues() throws {
        let text = try #require(Self.text("paystub-en-01"))
        let ids = DeviceReading.placeholderIds(Skeletonizer.skeletonize(Raw(text), allowlist: Self.allowlist).skeleton.text)
        let n = ids["N"]!.count, d = ids["D"]!.count, w = ids["W"]!.count
        let core = try #require(Self.call(text, .core).constraint)
        let frequencies = (Self.bundle.paystubSchema["properties"]?["payFrequency"]?["enum"]?.arrayValue ?? []).filter { !$0.isNull }.count
        #expect(DeviceBudget.allowedValues(core) == 5 * n + 3 * d + 2 * w + frequencies)
        let gross = try #require(Self.call(text, .gross).constraint)
        #expect(DeviceBudget.allowedValues(gross) == 2 * n)
    }
}
