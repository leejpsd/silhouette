// The held-out paystubs: the set the app bundles (web/eval/heldout-3/, frozen: these tests list its files and
// read its answer keys, never its texts), the run file it writes, and its figures, scored as
// web/eval/heldout-score.mjs scores them. The run file and scoring tests use the earlier set
// (web/eval/heldout/, no longer held out), whose texts and Chrome run are known.

import Foundation
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

@Suite("Held-out paystubs")
struct HeldOutTests {
    static let folder = Repo.ios.deletingLastPathComponent().appendingPathComponent("web/eval/heldout", isDirectory: true)
    static let documents = HeldOut.load(directory: folder, prefix: "hp-")
    static let schema = try! Repo.bundle().paystubSchema
    static let setFolder = Repo.ios.deletingLastPathComponent().appendingPathComponent("web/eval/heldout-3", isDirectory: true)

    /// The answer keys of the bundled set, from its `.gold.json` files alone.
    static func setGolds() throws -> [String: JSON] {
        let names = try FileManager.default.contentsOfDirectory(atPath: setFolder.path).filter { $0.hasPrefix(HeldOut.prefix) && $0.hasSuffix(".gold.json") }
        var out: [String: JSON] = [:]
        for name in names { out[String(name.dropLast(".gold.json".count))] = try JSON.parse(Data(contentsOf: setFolder.appendingPathComponent(name))) }
        return out
    }

    @Test("the bundled set is web/eval/heldout-3: 24 paystubs, each with its answer key, in 12 layouts")
    func theSet() throws {
        #expect(HeldOut.set == "heldout-3" && HeldOut.prefix == "hq-")
        let names = try FileManager.default.contentsOfDirectory(atPath: Self.setFolder.path)
        let texts = names.filter { $0.hasPrefix("hq-") && $0.hasSuffix(".txt") }.map { String($0.dropLast(4)) }
        let golds = try Self.setGolds()
        #expect(texts.count == 24 && Set(texts) == Set(golds.keys))
        #expect(golds.values.allSatisfy { $0["grossPay"]?.numberValue != nil })
        #expect(Set(texts.map { $0.replacingOccurrences(of: #"-\d+$"#, with: "", options: .regularExpression) }).count == 12)
        // The build bundles exactly this set.
        let sync = try String(contentsOf: Repo.ios.appendingPathComponent("scripts/sync-shared.sh"), encoding: .utf8)
        #expect(sync.contains("web/eval/heldout-3/hq-*.txt") && sync.contains("web/eval/heldout-3/hq-*.gold.json"))
        #expect(!sync.contains("web/eval/heldout/hp-"))
    }

    @Test("the earlier set is still read by its own prefix: 24 paystubs")
    func earlierSet() {
        #expect(Self.documents.count == 24)
        #expect(Self.documents.allSatisfy { $0.id.hasPrefix("hp-") && $0.gold["grossPay"]?.numberValue != nil })
        #expect(HeldOut.load(directory: Self.folder).isEmpty, "the default prefix is the bundled set's")
    }

    /// The Chrome run on the paystubs, scored here, gives what heldout-score.mjs gives for the same file.
    @Test("the figures of a run agree with the web's scorer")
    func figuresAgreeWithTheScorer() throws {
        let url = Repo.ios.deletingLastPathComponent().appendingPathComponent("web/eval/results/heldout/device-2026-11-19T0631-chrome157-macos.json")
        let file = try JSON.parse(Data(contentsOf: url))
        let f = HeldOut.figures(file, golds: HeldOut.golds(Self.documents))
        #expect(f.documents == 24)
        #expect((f.onDevice, f.inCloud, f.retried, f.notRun) == (13, 11, 11, 0))
        #expect((f.incomeAllRight, f.incomeWrong, f.wrongShown, f.allRight) == (17, 0, 4, 7))
        #expect((f.finalCorrect, f.finalTotal) == (199, 262))
        #expect((f.firstCorrect, f.firstTotal, f.firstIncomeWrong, f.firstIncomeCaught) == (163, 262, 12, 12))
        #expect(f.otherWrong == 4)
        #expect(f.medianMs == 11944.5)
    }

    /// The measurement on the iPhone (2026-11-24, iOS 26.5.2), scored here, gives what heldout-score.mjs gives
    /// for the same file: the device's first answer had a wrong yearly-income input on 22 paystubs, the checks
    /// stopped all 22, and one wrong yearly-income value came from the cloud's answer.
    @Test("the iPhone run on the bundled set agrees with the web's scorer")
    func iPhoneRun() throws {
        let url = Repo.ios.appendingPathComponent("eval/on-device/heldout/heldout-device-2026-11-24T0359-silhouette0-ios2652.json")
        let file = try JSON.parse(Data(contentsOf: url))
        #expect(file["set"]?.stringValue == "heldout-3")
        let f = HeldOut.figures(file, golds: try Self.setGolds())
        #expect(f.documents == 24)
        #expect((f.onDevice, f.inCloud, f.retried, f.notRun) == (2, 22, 22, 0))
        #expect((f.incomeAllRight, f.incomeWrong, f.wrongShown, f.otherWrong, f.allRight) == (19, 1, 6, 5, 13))
        #expect((f.firstIncomeWrong, f.firstIncomeCaught) == (22, 22))
    }

    @Test("names are scored word for word")
    func words() {
        #expect(HeldOut.words("HARBORLINE FABRICATION INC.") == HeldOut.words("HARBORLINE FABRICATION INC"))
        #expect(HeldOut.words("Lawn & Irrigation") == "Lawn Irrigation")
        #expect(HeldOut.status("employerName", gold: .string("A B."), got: .string("A B")) == .correct)
        #expect(HeldOut.status("payDate", gold: .string("10/16/2026"), got: .string("10/16/26")) == .wrong)
        #expect(HeldOut.status("ytdGross", gold: nil, got: .null) == .absent)
        #expect(HeldOut.status("ytdGross", gold: nil, got: .number(1)) == .spurious)
    }

    /// A reading answered with the scripted answer key: every field but the names right, recorded with values
    /// in the web's shape, and the figures of a file of such readings.
    @Test("a run file in the web's shape, scored from its values")
    func runFile() throws {
        let allowlist = try Repo.bundle().allowlist(for: .en)
        var records: [JSON] = []
        for doc in Self.documents {
            let scripted = HeldOut.scriptedAnswer(doc, allowlist: allowlist)
            let silhouette = Skeletonizer.skeletonize(doc.text, allowlist: allowlist)
            #expect(silhouette.skeleton.text == scripted.skeleton)
            let outcome = PointerOutcome(pointers: scripted.pointers, source: .onDevice, reason: .documentSilhouetteOnly)
            records.append(HeldOut.record(doc, schema: Self.schema, map: silhouette.map, outcome: outcome, latencyMs: 1000))
        }
        let file = HeldOut.runFile(date: "2026-11-23T10:30:00.000Z", browser: "Silhouette 0.1.0", platform: "iOS 26.5.2", userAgent: "test",
                                   availability: [("systemLanguageModel", "available")], device: .null, documents: records)
        #expect(HeldOut.isRunFile(file))
        #expect(file["set"]?.stringValue == "heldout-3")
        #expect(HeldOut.fileName(file) == "heldout-device-2026-11-23T1030-silhouette0-ios2652.json")
        let first = try #require(file["documents"]?.arrayValue?.first)
        #expect(first["final"]?["values"]?["grossPay"]?.numberValue == 2221.31)
        #expect(first["final"]?["values"]?["employerName"]?.isNull == true)
        #expect(first["ran"]?.stringValue == "ON_DEVICE" && first["retried"]?.boolValue == false)
        let f = HeldOut.figures(file, golds: HeldOut.golds(Self.documents))
        #expect(f.onDevice == 24 && f.wrongShown == 0)
        // Missing: the two names of each paystub (left out of the scripted answer), and the three dates of
        // layout 5 ("30-Sep-2026"), which the silhouette does not hold as one date placeholder.
        #expect(f.incomeAllRight == 22)
        #expect(f.finalTotal - f.finalCorrect == 48 + 6)
    }

    /// Held-out runs recorded on an iPhone (ios/eval/on-device/heldout/), when there are any: each is a run
    /// file of the bundled set's 24 paystubs that can be scored.
    @Test("recorded held-out runs are run files of the 24 paystubs")
    func recordings() throws {
        let dir = Repo.ios.appendingPathComponent("eval/on-device/heldout", isDirectory: true)
        let urls = ((try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []).filter { $0.pathExtension == "json" }
        for url in urls {
            let file = try JSON.parse(Data(contentsOf: url))
            #expect(HeldOut.isRunFile(file), "\(url.lastPathComponent)")
            #expect(file["set"]?.stringValue == HeldOut.set, "\(url.lastPathComponent)")
            #expect(HeldOut.figures(file, golds: try Self.setGolds()).documents == 24, "\(url.lastPathComponent)")
        }
    }
}

