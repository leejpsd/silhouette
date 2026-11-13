import Foundation
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

/// Records what an extractor receives. Its only document input is a `Skeleton`.
final class SpyExtractor: PointerExtractor, @unchecked Sendable {
    private let lock = NSLock()
    private var seen: [String] = []
    var received: [String] { lock.withLock { seen } }
    var destination: String { "test" }
    func canRead(_ skeleton: Skeleton, language: AppLocale) -> Bool {
        lock.withLock { seen.append(skeleton.text) }
        return true
    }
    func extract(_ request: PointerRequest) async throws -> PointerResult {
        lock.withLock { seen.append(request.skeleton.text) }
        return PointerResult(pointers: .object(JSONObject()), source: .inCloud, reason: .documentSilhouetteOnly)
    }
}

@Suite("Document flow")
struct DocumentFlowTests {
    func sample(_ id: String) throws -> (SharedBundle, SampleDocument) {
        let b = try Repo.bundle()
        return (b, try #require(b.samples.first { $0.id == id }))
    }

    @Test("the sample answer key equals the *-correct pointers of the shared rehydrate fixture")
    func answerKeyMatchesFixture() throws {
        let fixture = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("fixtures/conformance/rehydrate.json")))
        for (id, text) in SampleAnswerKeyExtractor.pointers {
            let c = try #require(fixture["cases"]?.arrayValue?.first { $0["id"]?.stringValue == "\(id)-correct" })
            #expect(try JSON.parse(text).isIdentical(to: try #require(c["pointers"])), "\(id)")
        }
    }

    @Test("a sample is read by its answer key, values are rehydrated with their document line, and the year is annualized")
    func sampleToIncome() async throws {
        let (b, s) = try sample("paystub-en-01")
        var doc = DocumentSession(language: .ko)
        doc.setText(s.text, source: .sample, sampleId: s.id, language: s.language)
        let silhouette = try #require(try doc.silhouette(bundle: b))
        let extraction = PointerExtraction(extractors: [try SampleAnswerKeyExtractor(bundle: b)])
        #expect(extraction.extractor(for: silhouette.skeleton, language: .en) != nil)
        let result = try await extraction.extract(PointerRequest(skeleton: silhouette.skeleton, language: .en))
        #expect(result.source == .sampleAnswerKey && result.reason == .sampleAnswerKey)
        doc.apply(result, silhouette: silhouette, schema: b.paystubSchema)
        let gross = try #require(doc.fieldsForDisplay.first { $0.name == "grossPay" })
        #expect(gross.value == .number(1271.88) && gross.found && !gross.confirmed)
        #expect(gross.source?.hasPrefix("Gross Pay") == true, "\(gross.source ?? "")")
        #expect(doc.fieldsForDisplay.first { $0.name == "payFrequency" }?.value == .choice("semimonthly"))
        #expect(doc.deductionsForDisplay.count == 4)
        #expect(doc.pendingCount > 0)
        doc.confirmAll()
        #expect(doc.pendingCount == 0)
        let v = try doc.validation(jurisdiction: "zz-test")
        #expect(v.annualization?.annualIncome == 29233)
        #expect(v.annualization?.method == "ytd")
        #expect(v.checks[0].contains { $0.id == "net-sum" && $0.status == .ok })
    }

    @Test("the answer key reads only an unchanged sample in its own language")
    func answerKeyIsStrict() throws {
        let (b, s) = try sample("paystub-en-01")
        let key = try SampleAnswerKeyExtractor(bundle: b)
        var doc = DocumentSession(language: .en)
        doc.setText(s.text, source: .sample, sampleId: s.id)
        #expect(key.canRead(try #require(try doc.silhouette(bundle: b)).skeleton, language: .en))
        doc.hide("employee")
        #expect(!key.canRead(try #require(try doc.silhouette(bundle: b)).skeleton, language: .en))
        doc.unhide("employee")
        doc.setLanguage(.es)
        #expect(!key.canRead(try #require(try doc.silhouette(bundle: b)).skeleton, language: .es))
        var own = DocumentSession(language: .en)
        own.setText(Raw("Gross Pay 1,000.00\nNet Pay 900.00"), source: .paste)
        #expect(!key.canRead(try #require(try own.silhouette(bundle: b)).skeleton, language: .en))
    }

    @Test("hiding a word masks it everywhere and its phrase whole; unhiding restores the silhouette")
    func hideAndUndo() throws {
        let (b, s) = try sample("paystub-en-01")
        var doc = DocumentSession(language: .en)
        doc.setText(s.text, source: .sample, sampleId: s.id)
        let before = try #require(try doc.silhouette(bundle: b))
        let words = DocumentSession.segments(of: before.skeleton).compactMap { if case .word(let w) = $0 { w } else { nil } }
        #expect(words.contains("Gross"))
        doc.hide("Gross")
        let after = try #require(try doc.silhouette(bundle: b))
        #expect(!after.skeleton.text.contains("Gross"))
        #expect(DocumentSession.counts(after).words > DocumentSession.counts(before).words)
        #expect(DocumentSession.counts(after).numbers == DocumentSession.counts(before).numbers)
        #expect(doc.hiddenWordsForDisplay == ["gross"])
        doc.unhide("gross")
        #expect(try doc.silhouette(bundle: b)?.skeleton.text == before.skeleton.text)
    }

    @Test("leading labels stay readable next to masked names")
    func labelsNextToNames() throws {
        let b = try Repo.bundle()
        var doc = DocumentSession(language: .en)
        doc.setText(Raw("Employee Lucia Lindqvist\nPay Stub for Jordan Gross"), source: .paste)
        let result = try #require(try doc.silhouette(bundle: b))
        let segs = DocumentSession.segments(of: result)
        #expect(segs.first == .word("Employee"))
        #expect(segs.contains(.placeholder(id: "W1", kind: "W", original: "Lucia")))
        #expect(DocumentSession.segments(of: result.skeleton).contains(.placeholder(id: "W1", kind: "W", original: nil)))
    }

    @Test("a document with nothing found is reported as not a paystub")
    func notAPaystub() throws {
        let b = try Repo.bundle()
        var doc = DocumentSession(language: .en)
        doc.setText(Raw("Dear tenant, the pool is closed on Monday."), source: .paste)
        let silhouette = try #require(try doc.silhouette(bundle: b))
        doc.apply(PointerResult(pointers: try JSON.parse(#"{"grossPay":null,"netPay":null,"deductions":null}"#), source: .inCloud,
                                reason: .documentSilhouetteOnly), silhouette: silhouette, schema: b.paystubSchema)
        #expect(doc.foundNothing)
    }

    @Test("typed values: manual entry, average annualization, and several paystubs")
    func manualEntry() throws {
        let b = try Repo.bundle()
        var doc = DocumentSession(language: .en)
        doc.startManual(schema: b.paystubSchema)
        #expect(doc.fieldsForDisplay.allSatisfy { $0.value == nil })
        doc.setField("grossPay", .number(try #require(Rehydrator.parseTypedAmount("$2,000.50"))))
        doc.setField("payFrequency", .choice("biweekly"))
        var v = try doc.validation(jurisdiction: "zz-test")
        #expect(v.annualization?.method == "average")
        #expect(v.annualization?.annualIncome == 52013)
        doc.addAnother()
        #expect(doc.confirmedStubCount == 1)
        doc.startManual(schema: b.paystubSchema)
        doc.setField("grossPay", .number(1999.5))
        doc.setField("payFrequency", .choice("biweekly"))
        v = try doc.validation(jurisdiction: "zz-test")
        #expect(v.annualization?.annualIncome == 52000)
        if case .average(_, _, _, let used)? = v.annualization?.basis { #expect(used == [0, 1]) } else { Issue.record("not average") }
    }

    @Test("using the yearly income makes a possible result clearer")
    func useIncome() throws {
        let b = try Repo.bundle()
        var qc = QuickCheckSession(steps: try QuickCheck.steps(pack: b.packInfo, bands: b.bands))
        qc.answer("householdSize", with: .integer(1))
        qc.answer("income", with: .income(.band("B")))
        let before = try #require(try qc.verdicts(pack: b.pack, bands: b.bands)[program: "food-help"])
        #expect(before.verdict == .maybe)
        qc.answer("income", with: .income(.exact(29233)))
        let after = try #require(try qc.verdicts(pack: b.pack, bands: b.bands)[program: "food-help"])
        #expect(after.verdict == .unlikely)
    }

    @Test("canary strings never reach a skeleton or anything an extractor receives", arguments: [[String](), ["employee"], ["gross", "pay"]])
    func canary(_ hide: [String]) async throws {
        let b = try Repo.bundle()
        let canary = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("fixtures/canary/paystub-canary-01.json")))
        let text = try String(contentsOf: Repo.shared.appendingPathComponent("fixtures/canary/\(try #require(canary["document"]?.stringValue))"), encoding: .utf8)
        let values = (canary["canaries"]?.arrayValue ?? []).compactMap(\.stringValue)
        var doc = DocumentSession(language: .en)
        doc.setText(Raw(text), source: .paste)
        for word in hide { doc.hide(word) }
        let silhouette = try #require(try doc.silhouette(bundle: b))
        let spy = SpyExtractor()
        let extraction = PointerExtraction(extractors: [try SampleAnswerKeyExtractor(bundle: b), spy])
        _ = try await extraction.extract(PointerRequest(skeleton: silhouette.skeleton, language: doc.language))
        #expect(!spy.received.isEmpty)
        for payload in spy.received + [silhouette.skeleton.text, CloudBoundary.outbound(silhouette.skeleton).text] {
            for value in values { #expect(!payload.contains(value), "leaked \(value)") }
        }
    }

    @Test("the document draft is stored encrypted and removed by delete everything")
    func storedEncrypted() throws {
        let b = try Repo.bundle()
        let store = AnswerStore(directory: FileManager.default.temporaryDirectory.appendingPathComponent("silhouette-doc-\(UUID())"),
                                keys: InMemoryKeyStore())
        var doc = DocumentSession(language: .en)
        doc.setText(Raw("Employee Zyxwanda Quillfeather\nGross Pay 1,487.50"), source: .paste)
        doc.hide("gross")
        doc.startManual(schema: b.paystubSchema)
        doc.setField("grossPay", .number(1487.5))
        try store.saveDocument(doc)
        let bytes = try Data(contentsOf: store.documentURL)
        for needle in ["Zyxwanda", "1487", "gross", "Employee"] { #expect(bytes.range(of: Data(needle.utf8)) == nil, "\(needle) in file") }
        let loaded = try #require(try store.loadDocument(schema: b.paystubSchema))
        #expect(loaded.hiddenWordsForDisplay == ["gross"])
        #expect(loaded.fieldsForDisplay.first { $0.name == "grossPay" }?.value == .number(1487.5))
        try store.deleteEverything()
        #expect(try store.loadDocument(schema: b.paystubSchema) == nil)
    }

    @Test("prompts: an unknown Remote Config version means the newest")
    func prompts() throws {
        let b = try Repo.bundle()
        #expect(b.pointerPrompt(version: 2)?.version == 2)
        #expect(b.pointerPrompt(version: 99)?.version == b.pointerPrompts.keys.max())
        #expect(b.pointerPrompt(version: nil)?.version ?? 0 >= 4)
    }
}
