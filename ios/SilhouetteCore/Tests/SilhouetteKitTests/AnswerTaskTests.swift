import Foundation
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

/// A model port that never calls a model: scripted replies, and a record of every call.
final class FakePort: ModelPort, @unchecked Sendable {
    enum Call: Equatable { case device(String), cloud(String), appCheck }
    private let lock = NSLock()
    var availability: DeviceAvailability
    var deviceReplies: [Result<String, TaskError>]
    var cloudReplies: [Result<String, TaskError>]
    private(set) var calls: [Call] = []
    private(set) var cloudRequests: [CloudRequest] = []
    private(set) var deviceCalls: [DeviceCall] = []
    /// Errors the SDK throws (not TaskErrors), one per device call, before any scripted reply.
    var sdkErrors: [Error] = []
    /// Availability answers given before `availability` (the model can stop being ready mid-reading).
    var availabilityQueue: [DeviceAvailability] = []
    /// App Check before a cloud request: nil (no App Check), or whether a token can be obtained.
    var appCheckToken: Bool?
    /// Entries in the outgoing record at the moment each cloud call was made.
    var log: OutboundLog?
    private(set) var recordedBeforeCloud: [Int] = []

    init(availability: DeviceAvailability = .available, device: [Result<String, TaskError>] = [], cloud: [Result<String, TaskError>] = []) {
        self.availability = availability
        deviceReplies = device
        cloudReplies = cloud
    }

    func deviceAvailability() -> DeviceAvailability {
        lock.withLock { availabilityQueue.isEmpty ? availability : availabilityQueue.removeFirst() }
    }

    func generateOnDevice(_ call: DeviceCall) async throws -> ModelReply {
        let (sdkError, next): (Error?, Result<String, TaskError>) = lock.withLock {
            calls.append(.device(call.taskId))
            deviceCalls.append(call)
            if !sdkErrors.isEmpty { return (sdkErrors.removeFirst(), .success("")) }
            return (nil, deviceReplies.isEmpty ? .failure(TaskError(.onDeviceUnavailable, "no script")) : deviceReplies.removeFirst())
        }
        if let sdkError { throw sdkError }
        return ModelReply(text: try next.get(), modelVersion: TaskRunner.onDeviceModelVersion)
    }

    var appCheckDestination: String? { appCheckToken == nil ? nil : "firebaseappcheck.googleapis.com" }

    struct NoToken: Error {}

    func confirmAppCheck() async throws {
        lock.withLock { calls.append(.appCheck) }
        if appCheckToken == false { throw NoToken() }
    }

    func generateInCloud(_ request: CloudRequest) async throws -> ModelReply {
        let next: Result<String, TaskError> = lock.withLock {
            calls.append(.cloud(request.taskId))
            cloudRequests.append(request)
            recordedBeforeCloud.append(log?.entries.count ?? -1)
            return cloudReplies.isEmpty ? .failure(TaskError(.unknown, "no script")) : cloudReplies.removeFirst()
        }
        return ModelReply(text: try next.get(), modelVersion: Planner.cloudModel)
    }
}

/// Two people, their sessions and the bundle.
struct Fixture {
    let bundle: SharedBundle
    let config: AppConfig

    init() throws {
        bundle = try Repo.bundle()
        let template = try JSON.parse(Data(contentsOf: Repo.ios.deletingLastPathComponent().appendingPathComponent("firebase/remoteconfig.template.json")))
        config = AppConfig(values: AppConfig.defaultValues(template: template))
    }

    func session(_ answers: [(String, AnswerValue?)]) throws -> QuickCheckSession {
        var s = QuickCheckSession(steps: try QuickCheck.steps(pack: bundle.packInfo, bands: bundle.bands))
        for (id, value) in answers {
            if let value { s.answer(id, with: value) } else { s.skip(id) }
        }
        return s
    }

    /// The program's public information: all a general explanation is given.
    func facts(_ program: String = "food-help", locale: AppLocale = .en) throws -> Public<ProgramFacts> {
        try #require(AnswerInputs.programFacts(bundle, programId: program, locale: locale))
    }

    var explainTemplate: PromptTemplate { bundle.prompts.versioned("explain", version: config.promptExplainV, among: 5...5)! }
    var askTemplate: PromptTemplate { bundle.prompts.versioned("ask", version: config.promptAskV, among: 4...4)! }
}

@Suite("Answer tasks: routing, record, checks, consent")
struct AnswerTaskTests {
    func runner(_ port: FakePort, log: OutboundLog = OutboundLog()) throws -> TaskRunner {
        port.log = log
        return TaskRunner(port: port, log: log, outputChecks: try Fixture().bundle.outputChecks,
                          firstRequestFields: ["installation"])
    }

    func explainRequest(long: Bool = false) throws -> CloudRequest {
        let f = try Fixture()
        return Planner.explain(try f.facts(), locale: .en, long: long, template: f.explainTemplate, config: f.config)
    }

    @Test("no App Check token, no request: the model request is recorded as stopped before it left, not as sent")
    func noTokenNoRequest() async throws {
        let log = OutboundLog()
        let port = FakePort(availability: .unavailable, cloud: [.success("Program facts.")])
        port.appCheckToken = false
        await #expect(throws: TaskError.self) { _ = try await runner(port, log: log).runText(try explainRequest()) }
        #expect(port.calls == [.appCheck], "the model request was not made")
        #expect(log.entries.map(\.fields) == [["app-check-token-request"], ["program-facts", "model-request"]])
        #expect(log.entries.last?.status == .blocked("noAppCheck") && log.entries.last?.left == false)
        #expect(log.entries.filter(\.left).count == 1, "only the token request left")
    }

    @Test("with a token: the token request, then the model request; Remote Config only after the first request that left")
    func tokenThenRequest() async throws {
        let log = OutboundLog()
        let port = FakePort(availability: .unavailable, cloud: [.success("Program facts.")])
        port.appCheckToken = true
        let fetched = CallCounter()
        let r = TaskRunner(port: port, log: log, outputChecks: try Fixture().bundle.outputChecks, afterCloudRequest: { fetched.add() })
        port.log = log
        #expect(fetched.value == 0)
        _ = try await r.runText(try explainRequest())
        #expect(port.calls == [.appCheck, .cloud("explain.short")])
        #expect(log.entries.map(\.status) == [.sent(200), .sent(200)])
        try await Task.sleep(for: .milliseconds(50))
        #expect(fetched.value == 1)
    }

    @Test("device-only work makes no request: no App Check, no Remote Config")
    func deviceOnlyMakesNoRequest() async throws {
        let log = OutboundLog()
        let port = FakePort(device: [.success("This program lowers food costs.")])
        port.appCheckToken = true
        let fetched = CallCounter()
        let r = TaskRunner(port: port, log: log, outputChecks: try Fixture().bundle.outputChecks, afterCloudRequest: { fetched.add() })
        _ = try await r.runText(try explainRequest())
        try await Task.sleep(for: .milliseconds(50))
        #expect(port.calls == [.device("explain.short")] && fetched.value == 0 && !log.anythingLeft)
    }

    @Test("the line under the count: what carried something of the person's, then the rest (RECORD.md section 4)")
    func countLine() {
        func entry(_ fields: [String], _ status: OutboundEntry.Status = .sent(200)) -> OutboundEntry {
            OutboundEntry(channel: .aiCloud, destination: "x", fields: fields, status: status)
        }
        #expect(OutboundLog.split([entry(["kept:document"], .answeredOnDevice)]).isEmpty)
        let document = OutboundLog.split([entry(["app-check-token-request"]), entry(["document-silhouette", "model-request"]),
                                          entry(["remote-config", "installation"])])
        #expect(document.map(\.key) == ["leaving.split.document", "leaving.split.technical"] && document.map(\.count) == [1, 2])
        let general = OutboundLog.split([entry(["app-check-token-request"]), entry(["program-facts", "model-request"]),
                                         entry(["program-facts", "model-request"], .blocked("noAppCheck"))])
        #expect(general.map(\.key) == ["leaving.split.nothingOfYours", "leaving.split.general"] && general.map(\.count) == [0, 2])
        let personal = OutboundLog.split([entry(["profile-silhouette", "model-request"]), entry(["document-silhouette"], .failed("HTTP 500"))])
        #expect(personal.map(\.key) == ["leaving.split.personal"] && personal.map(\.count) == [2])
    }

    @Test("Remote Config defaults are exactly the template's")
    func configDefaults() throws {
        let f = try Fixture()
        #expect(f.config == AppConfig(values: ["route_short_text_max_words": "80", "route_ondevice_locales_ios": #"["en","es","ko"]"#,
                                               "prompt_pointer_extract_v": "5", "prompt_explain_v": "5", "prompt_ask_v": "4"]))
        #expect(f.bundle.prompts.versioned("pointer-extract", version: 2, among: 2...5)?.id == "pointer-extract.v2")
        // A version the app does not bundle falls back to the newest bundled one.
        #expect(f.bundle.prompts.versioned("pointer-extract", version: 99, among: 2...5)?.id == "pointer-extract.v5")
        #expect(Set(f.bundle.prompts.deviceParts.keys) == ["core", "gross", "deductions", "deductions-again"])
        #expect(f.bundle.prompts.deviceParts["deductions-again"]?.hasSuffix("including the last one.") == true)
    }

    @Test("explain routes: short and a device language → explain.short; long → explain.long")
    func explainRouting() throws {
        let f = try Fixture()
        #expect(Planner.explainRoute(words: 60, locale: .ko, config: f.config).taskId == "explain.short")
        #expect(Planner.explainRoute(words: 180, locale: .en, config: f.config).basis == .long)
        var narrow = f.config
        narrow.onDeviceLocales = ["en"]
        #expect(Planner.explainRoute(words: 60, locale: .es, config: narrow).basis == .locale)
        #expect(try explainRequest().mode == .preferOnDevice)
        #expect(try explainRequest(long: true).mode == .preferInCloud)
    }

    @Test("PREFER_ON_DEVICE runs on the device when its model is available; nothing is sent")
    func deviceFirst() async throws {
        let log = OutboundLog()
        let port = FakePort(device: [.success("This program lowers food costs.")])
        let result = try await runner(port, log: log).runText(try explainRequest())
        #expect(result.source == .onDevice && result.reason == .shortText)
        #expect(port.calls == [.device("explain.short")])
        #expect(log.entries.map(\.status) == [.answeredOnDevice])
        #expect(log.entries.first?.fields == ["kept:about"], "an answer written on the device is recorded as kept")
        #expect(!log.anythingLeft)
    }

    @Test("a device failure is repeated once in the cloud with reason on-device-failed, recorded before it is made")
    func deviceFailureRetriesOnce() async throws {
        let log = OutboundLog()
        let port = FakePort(device: [.failure(TaskError(.onDeviceUnavailable, "context window"))], cloud: [.success("Program facts.")])
        let result = try await runner(port, log: log).runText(try explainRequest())
        #expect(result.source == .inCloud && result.reason == .onDeviceFailed)
        #expect(port.calls == [.device("explain.short"), .cloud("explain.short")])
        #expect(port.recordedBeforeCloud == [1], "the cloud request was in the record before the call")
        #expect(log.entries.first?.status == .sent(200))
        #expect(log.entries.first?.fields.contains("program-facts") == true)
        #expect(log.entries.first?.fields.contains("profile-silhouette") == false, "nothing about the person")
        #expect(log.entries.first?.fields.contains("installation") == true, "the first request names the SDK's own traffic")
    }

    @Test("without a device model, device-first requests go to the cloud and say why; a cloud failure is not retried")
    func noDeviceModel() async throws {
        let log = OutboundLog()
        let port = FakePort(availability: .appleIntelligenceNotEnabled, cloud: [.success("Facts."), .failure(TaskError(.quotaDaily, "per day", status: 429))])
        let r = try runner(port, log: log)
        let result = try await r.runText(try explainRequest())
        #expect(result.source == .inCloud && result.noDeviceModel && result.reason == .shortText)
        await #expect(throws: TaskError.self) { try await r.runText(try explainRequest()) }
        #expect(port.calls == [.cloud("explain.short"), .cloud("explain.short")])
        #expect(log.entries.last?.status == .failed("HTTP 429"))
        #expect(log.entries.last?.fields.contains("installation") == false, "only the first request names them")
    }

    @Test("PREFER_IN_CLOUD uses the device only when the cloud cannot be reached")
    func cloudFirst() async throws {
        let port = FakePort(device: [.success("Offline answer.")], cloud: [.success("Cloud answer."), .failure(TaskError(.network, "offline"))])
        let r = try runner(port)
        #expect(try await r.runText(try explainRequest(long: true)).source == .inCloud)
        let offline = try await r.runText(try explainRequest(long: true))
        #expect(offline.source == .onDevice && offline.reason == .longOrUnsupportedLocale)
    }

    @Test("a reply that states a result is asked for once more, then refused")
    func outputChecks() async throws {
        let port = FakePort(device: [.success("You qualify for this program."), .success("The program checks income.")])
        #expect(try await runner(port).runText(try explainRequest()).text == "The program checks income.")
        let twice = FakePort(device: [.success("You may qualify."), .success("You probably qualify.")])
        do {
            _ = try await runner(twice).runText(try explainRequest())
            Issue.record("not blocked")
        } catch {
            #expect((error as? TaskError)?.kind == .blocked)
        }
    }

    func personal(_ f: Fixture) throws -> Raw<PersonalResult> {
        let s = try f.session([("householdSize", .integer(3)), ("income", .income(.exact(30524))), ("residentStatus", .choice("eligible"))])
        let verdict = try #require(try s.verdicts(pack: f.bundle.pack, bands: f.bundle.bands)[program: "food-help"])
        return AnswerInputs.personalResult(f.bundle, programId: "food-help", verdict: verdict.verdict,
                                           reasons: s.reasons(pack: f.bundle.pack, bands: f.bundle.bands, programId: "food-help"), locale: .en)
    }

    @Test("explain.personal and typed questions run on the device only and allow hedged wording")
    func personalOnDeviceOnly() async throws {
        let f = try Fixture()
        let request = Planner.explainPersonal(try personal(f), template: f.bundle.prompts["explain-personal.v1"]!)
        #expect(request.call.prompt.contains("(limit 34,000, yours 30,524)"))
        let port = FakePort(device: [.success("You may qualify because your income is under the limit.")])
        let r = try runner(port)
        #expect(try await r.runPersonal(request).source == .onDevice)
        let none = FakePort(availability: .deviceNotEligible)
        await #expect(throws: TaskError.self) { try await runner(none).runPersonal(request) }
        #expect(none.calls.isEmpty, "never the cloud")
        let typed = Planner.askFreeText(Raw("Can my sister apply?"), result: try personal(f), template: f.bundle.prompts["ask-personal.v1"]!)
        #expect(typed.call.prompt.contains("Can my sister apply?"))
    }

    @Test("an on-device request over the input limit drops the program facts first")
    func deviceInputLimit() throws {
        let f = try Fixture()
        let r = try personal(f).map { PersonalResult(locale: $0.locale, programName: $0.programName, facts: String(repeating: "x", count: 9000),
                                                     verdict: $0.verdict, verdictLabel: $0.verdictLabel, criteriaLines: $0.criteriaLines) }
        let request = Planner.explainPersonal(r, template: f.bundle.prompts["explain-personal.v1"]!)
        #expect(!request.call.prompt.contains("xxxx"))
        #expect(!Planner.exceedsDeviceLimit(request.call))
    }

    @Test("the general explanation and prepared questions carry nothing about the person (explain v5, ask v4)")
    func nothingAboutThePerson() throws {
        let f = try Fixture()
        let a = try f.session([("householdSize", .integer(3)), ("income", .income(.exact(30100))), ("residentStatus", .choice("eligible"))])
        let b = try f.session([("householdSize", .integer(1)), ("income", .income(.exact(44000))), ("residentStatus", .choice("not-eligible"))])
        let va = try a.verdicts(pack: f.bundle.pack, bands: f.bundle.bands)[program: "food-help"]?.verdict
        let vb = try b.verdicts(pack: f.bundle.pack, bands: f.bundle.bands)[program: "food-help"]?.verdict
        #expect(va != vb, "the results on screen differ")
        // The requests are built from the program alone, so they cannot differ between the two people.
        let request = Planner.explain(try f.facts(), locale: .en, long: false, template: f.explainTemplate, config: f.config)
        #expect(request.fields == ["program-facts"])
        let chip = Planner.askChip(try f.facts(), question: Public<String>("How do I apply?"), locale: .en, template: f.askTemplate)
        #expect(chip.fields == ["program-facts", "prepared-question"])
        let text = request.prompt.text + chip.prompt.text
        for leak in ["30100", "30,100", "44000", "44,000", "not-eligible", "residentStatus", "Probably not", "You may qualify", "incomeBand", "householdSize"] {
            #expect(!text.contains(leak), "\(leak) in the request")
        }
        #expect(text.contains("Program: Test Food Help") && text.contains("Question: How do I apply?"))
    }

    @Test("{programFacts}: program copy, then the answers it uses, then what it checks, one item per line")
    func programFactsLines() throws {
        let f = try Fixture()
        let facts = try f.facts().value.facts.components(separatedBy: "\n")
        let uses = try #require(facts.firstIndex { $0.hasPrefix("This program uses: ") })
        let checks = try #require(facts.firstIndex { $0.hasPrefix("This program checks: ") })
        #expect(uses < checks && checks == facts.count - 1)
        #expect(facts[uses].hasPrefix("This program uses: Yearly income"), "annualIncome first")
        #expect(uses >= 1, "the program copy comes first")
    }

    @Test("canary strings never appear in a pointer request, on the device or in the cloud")
    func canaryRequests() throws {
        let f = try Fixture()
        let canary = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("fixtures/canary/paystub-canary-01.json")))
        let text = try String(contentsOf: Repo.shared.appendingPathComponent("fixtures/canary/paystub-canary-01.txt"), encoding: .utf8)
        var doc = DocumentSession(language: .en)
        doc.setText(Raw(text), source: .paste)
        let skeleton = try #require(try doc.silhouette(bundle: f.bundle)).skeleton
        let request = try Planner.pointers(skeleton, language: .en, template: f.bundle.prompts["pointer-extract.v4"]!,
                                           pointerSchema: f.bundle.paystubSchema)
        for value in (canary["canaries"]?.arrayValue ?? []).compactMap(\.stringValue) {
            #expect(!request.rendering.text.contains(value) && !request.deviceCall.prompt.contains(value), "\(value)")
        }
        #expect(request.deviceCall.prompt.contains("Answer with JSON that matches this schema:\n"))
        #expect(request.responseSchema?.isIdentical(to: try ModelSchema.derive(f.bundle.paystubSchema, requiredNullable: true, dialect: .openapi)) == true)
    }

    @Test("pointer extraction: an unusable device reply is a device failure; nulls are removed")
    func pointerExtraction() async throws {
        let f = try Fixture()
        let skeleton = Skeletonizer.skeletonize(Raw("Gross Pay 1,000.00"), allowlist: try f.bundle.allowlist(for: .en)).skeleton
        let request = try Planner.pointers(skeleton, language: .en, template: f.bundle.prompts["pointer-extract.v4"]!, pointerSchema: f.bundle.paystubSchema)
        let port = FakePort(device: [.success("I think gross pay is N1")], cloud: [.success(#"{"grossPay":"N1","netPay":null}"#)])
        let outcome = try await runner(port).extractPointers(request)
        #expect(outcome.reason == .onDeviceFailed && outcome.source == .inCloud)
        #expect(outcome.pointers.jsonText == #"{"grossPay":"N1"}"#)
        let fenced = FakePort(device: [.success("```json\n{\"grossPay\":\"N1\"}\n```")])
        #expect(try await runner(fenced).extractPointers(request).source == .onDevice)
    }

    @Test("consent: per content and destination; device-first consent does not cover cloud-first; sent content needs none")
    func consent() {
        var s = AnswerSession()
        #expect(s.needsConsent("profile", .deviceFirst))
        s.giveConsent("profile", .deviceFirst)
        #expect(!s.needsConsent("profile", .deviceFirst))
        #expect(s.needsConsent("profile", .cloud))
        #expect(s.needsConsent("other-profile", .deviceFirst))
        s.markSent("profile")
        #expect(!s.needsConsent("profile", .cloud))
        s.clear()
        #expect(s.needsConsent("profile", .deviceFirst) && !s.wasSent("profile"))
    }

    @Test("Why this result: limits and the person's value from the rules; a band when only a band is known")
    func whyRows() throws {
        let f = try Fixture()
        let exact = try f.session([("householdSize", .integer(3)), ("income", .income(.exact(30524)))])
        let rows = AnswerInputs.whyRows(f.bundle, programId: "food-help", reasons: exact.reasons(pack: f.bundle.pack, bands: f.bundle.bands, programId: "food-help"), locale: .en)
        let income = try #require(rows.first { $0.id == "income-limit" })
        #expect(income.state == .pass)
        #expect(income.limits.first?.limit == "34,000" && income.limits.first?.yours == "30,524")
        #expect(rows.first { $0.id == "residency" }?.state == .unknown)
        let band = try f.session([("householdSize", .integer(3)), ("income", .income(.band("C")))])
        let bandRows = AnswerInputs.whyRows(f.bundle, programId: "food-help", reasons: band.reasons(pack: f.bundle.pack, bands: f.bundle.bands, programId: "food-help"), locale: .en)
        #expect(bandRows.first { $0.id == "income-limit" }?.limits.first?.yours == "30,000–44,999")
        // On screen, income limits and values are money in the pack's currency; the prompts keep plain numbers.
        let money = AnswerInputs.whyRows(f.bundle, programId: "food-help", reasons: exact.reasons(pack: f.bundle.pack, bands: f.bundle.bands, programId: "food-help"),
                                         locale: .en, currency: f.bundle.packInfo.currency)
        let moneyIncome = try #require(money.first { $0.id == "income-limit" })
        #expect(moneyIncome.limits.first?.limit == "$34,000" && moneyIncome.limits.first?.yours == "$30,524")
        #expect(moneyIncome.limitVariables == ["annualIncome"])
    }

    @Test("the silhouette leaves out sensitive answers and exact income")
    func silhouetteLines() throws {
        let f = try Fixture()
        let s = try f.session([("householdSize", .integer(3)), ("income", .income(.exact(30524))), ("residentStatus", .choice("eligible"))])
        let silhouette = try #require(s.silhouette(pack: f.bundle.pack, packInfo: f.bundle.packInfo, bands: f.bundle.bands))
        let lines = AnswerInputs.silhouetteLines(f.bundle, silhouette, locale: .en).joined(separator: "\n")
        #expect(lines.contains("(C)") && !lines.contains("30524") && !lines.contains("eligible"))
        #expect(!silhouette.canonical.contains("30524"))
    }

    @Test("Why this result on the California pack: a criterion met another way says which; an uncertain state says what it depends on")
    func whyNotesCalifornia() throws {
        let bundle = try SharedBundle(directory: Repo.shared, jurisdiction: "us-ca", localCopy: JSON.parse(Data(contentsOf: Repo.localCopy)))
        let base = try Shared.us.base()
        var a = base
        a["annualIncome"] = .number(100_000)
        a["benefits"] = .array([.string("medi-cal")])
        let reasons = try RulesEngine.criterionReasons(pack: bundle.pack, bands: bundle.bands, answers: Raw(.object(a)), programId: "ca-lifeline")
        let rows = AnswerInputs.whyRows(bundle, programId: "ca-lifeline", reasons: reasons, locale: .en, currency: "USD", format: "en-US")
        let row = try #require(rows.first { $0.id == "income-or-program" })
        #expect(row.state == .pass)
        #expect(row.limits.isEmpty, "the income limit did not decide it")
        #expect(row.notes.first?.hasPrefix("Met through: ") == true, "\(row.notes)")
        // CalFresh over the gross limit, with someone 60 or older or disabled: possible, because of that answer.
        var b = base
        b["annualIncome"] = .number(200_000)
        b["hasElderlyOrDisabledMember"] = .string("yes")
        let calfreshReasons = try RulesEngine.criterionReasons(pack: bundle.pack, bands: bundle.bands, answers: Raw(.object(b)), programId: "calfresh")
        let calfresh = AnswerInputs.whyRows(bundle, programId: "calfresh", reasons: calfreshReasons, locale: .en)
        let gross = try #require(calfresh.first { $0.id == "gross-income-limit" })
        #expect(gross.state == .mixed)
        #expect(gross.stateText.hasPrefix("Over this limit, but still possible because of: "), "\(gross.stateText)")
    }
}

@Suite("Reading a paystub in parts on the device (DEVICE_READING.md)")
struct DeviceReadingTaskTests {
    static let fixture = try! JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("fixtures/conformance/device-reading.json")))

    struct Plan {
        let request: CloudRequest
        let parts: ReadingInParts
    }

    /// The bundled sample's silhouette from the fixture, the v5 prompt and its device parts.
    func plan() throws -> Plan {
        let f = try Fixture()
        let doc = try #require(Self.fixture["documents"]?["sample"])
        let skeleton = Skeleton(text: try #require(doc["skeleton"]?.stringValue))
        let map = PlaceholderMap((doc["map"]?.objectValue?.entries ?? []).map { ($0.key, $0.value.stringValue ?? "") })
        let template = try #require(f.bundle.prompts["pointer-extract.v5"])
        let request = try Planner.pointers(skeleton, language: .en, template: template, pointerSchema: f.bundle.paystubSchema)
        return Plan(request: request, parts: ReadingInParts(template: template, parts: f.bundle.prompts.deviceParts, schema: f.bundle.paystubSchema,
                                                           skeleton: skeleton, map: Raw(map), jurisdiction: "us-ca"))
    }

    func answers(_ id: String) throws -> [String] {
        let reading = try #require(Self.fixture["readings"]?.arrayValue?.first { $0["id"]?.stringValue == id })
        let a = try #require(reading["answers"])
        return ["core", "gross", "deductions", "deductionsAgain"].compactMap { a[$0]?.stringValue }
    }

    func runner(_ port: FakePort, log: OutboundLog) throws -> TaskRunner {
        port.log = log
        return TaskRunner(port: port, log: log, outputChecks: try Fixture().bundle.outputChecks)
    }

    @Test("a reading that passes stays on the device: each part ONLY_ON_DEVICE with its constraint, recorded once as kept")
    func passes() async throws {
        let p = try plan()
        let port = FakePort(device: try answers("core-right-deductions-right").map { .success($0) })
        let log = OutboundLog()
        let outcome = try await runner(port, log: log).extractPointers(p.request, inParts: p.parts)
        #expect(outcome.source == .onDevice && outcome.reason == .documentSilhouetteOnly)
        #expect(port.calls == [.device("document.pointer.extract"), .device("document.pointer.extract")])
        #expect(port.deviceCalls.map(\.part) == ["core", "deductions"])
        #expect(port.deviceCalls.allSatisfy { $0.constraint?["additionalProperties"]?.boolValue == false })
        #expect(port.deviceCalls[0].system.hasSuffix(try #require(Fixture().bundle.prompts.deviceParts["core"])))
        #expect(log.entries.map(\.fields) == [["kept:document"]] && !log.anythingLeft)
        #expect(outcome.attempt?.passes.count == 2)
    }

    @Test("a core that does not hold up is a failed attempt: once in the cloud with v5 alone, reason on-device-failed")
    func failsThenCloud() async throws {
        let p = try plan()
        let port = FakePort(device: try answers("core-not-an-option").map { .success($0) }, cloud: [.success(#"{"grossPay":"N12"}"#)])
        let log = OutboundLog()
        let stages = StageLog()
        let outcome = try await runner(port, log: log).extractPointers(p.request, inParts: p.parts) { stages.add($0) }
        #expect(outcome.source == .inCloud && outcome.reason == .onDeviceFailed)
        #expect(port.calls.last == .cloud("document.pointer.extract"))
        let cloud = try #require(port.cloudRequests.first)
        #expect(!cloud.system.text.contains("On this device the reading is done in two parts"), "no device wording in the cloud")
        #expect(stages.all.first == .deviceReading && stages.all.last == .sendingAfterDevice)
    }

    @Test("kept on the device by the person's choice: a failed reading sends nothing and fills in nothing")
    func keepOnDevice() async throws {
        let p = try plan()
        let port = FakePort(device: try answers("core-not-an-option").map { .success($0) })
        do {
            _ = try await runner(port, log: OutboundLog()).extractPointers(p.request, inParts: p.parts, keepOnDevice: true)
            Issue.record("did not fail")
        } catch let failed as DeviceReadingFailed {
            #expect(failed.error.kind == .onDeviceUnreliable)
            #expect(failed.error.copyKey == "error.on-device-unreliable")
        }
        #expect(!port.calls.contains(.cloud("document.pointer.extract")))
    }

    /// An error of the kind the on-device model throws before it answers (as the Foundation Models
    /// framework does for a prompt it will not take): fails at once, with a type and a message.
    enum FakeGenerationError: Error, CustomStringConvertible {
        case unsupportedLanguageOrLocale(String)
        var description: String {
            switch self { case .unsupportedLanguageOrLocale(let d): "unsupportedLanguageOrLocale(debugDescription: \(d))" }
        }
    }

    @Test("a part the SDK fails before answering is recorded with where it stopped, the error type and its message")
    func sdkFailureRecorded() async throws {
        let p = try plan()
        let port = FakePort(cloud: [.success(#"{"grossPay":"N12"}"#)])
        port.sdkErrors = [FakeGenerationError.unsupportedLanguageOrLocale("Unsupported language")]
        let outcome = try await runner(port, log: OutboundLog()).extractPointers(p.request, inParts: p.parts)
        #expect(outcome.source == .inCloud && outcome.reason == .onDeviceFailed)
        let core = try #require(outcome.attempt?.passes.first)
        #expect(core.part == .core && core.problems == ["error:on-device-unavailable"] && core.value == nil)
        let failure = try #require(core.failure)
        #expect(failure.origin == "sdk")
        #expect(failure.type.hasSuffix("FakeGenerationError"))
        #expect(failure.message.contains("unsupportedLanguageOrLocale") && failure.message.contains("Unsupported language"))
    }

    @Test("an SDK error the port already classified keeps its origin, type and message")
    func classifiedFailureRecorded() async throws {
        let p = try plan()
        let thrown = TaskError(.onDeviceUnavailable, "exceededContextWindowSize: 4,210 tokens", origin: "sdk",
                               errorType: "FoundationModels.LanguageModelSession.GenerationError")
        let port = FakePort(device: [.failure(thrown)], cloud: [.success(#"{"grossPay":"N12"}"#)])
        let outcome = try await runner(port, log: OutboundLog()).extractPointers(p.request, inParts: p.parts)
        let failure = try #require(outcome.attempt?.passes.first?.failure)
        #expect(failure == DeviceReading.Failure(origin: "sdk", type: "FoundationModels.LanguageModelSession.GenerationError",
                                                 message: "exceededContextWindowSize: 4,210 tokens"))
    }

    @Test("the availability guard stops a part before any SDK call, and says so")
    func guardFailureRecorded() async throws {
        let p = try plan()
        let port = FakePort(cloud: [.success(#"{"grossPay":"N12"}"#)])
        // Ready when the reading starts, not ready when the core part is asked.
        port.availabilityQueue = [.available, .modelNotReady]
        let outcome = try await runner(port, log: OutboundLog()).extractPointers(p.request, inParts: p.parts)
        #expect(!port.calls.contains(.device("document.pointer.extract")), "no SDK call")
        let failure = try #require(outcome.attempt?.passes.first?.failure)
        #expect(failure.origin == "availability-guard" && failure.type == "DeviceAvailability.modelNotReady")
    }

    @Test("reading a document asks for greedy sampling; written answers do not")
    func deterministicReading() async throws {
        let p = try plan()
        let port = FakePort(device: try answers("core-right-deductions-right").map { .success($0) })
        _ = try await runner(port, log: OutboundLog()).extractPointers(p.request, inParts: p.parts)
        #expect(!port.deviceCalls.isEmpty && port.deviceCalls.allSatisfy(\.deterministic))
        #expect(p.request.deviceCall.deterministic)
        let f = try Fixture()
        let program = try #require(f.bundle.packInfo.programs.first?.id)
        let facts = try #require(AnswerInputs.programFacts(f.bundle, programId: program, locale: .en))
        let explain = Planner.explain(facts, locale: .en, long: false, template: try #require(f.bundle.prompts["explain.v5"]), config: f.config)
        #expect(!explain.deviceCall.deterministic)
    }

    @Test("ONLY_ON_DEVICE without a device model: no SDK call at all, on the device or in the cloud")
    func onlyOnDeviceGuard() async throws {
        let p = try plan()
        let port = FakePort(availability: .modelNotReady, device: [.success("{}")], cloud: [.success("{}")])
        await #expect(throws: TaskError.self) {
            _ = try await runner(port, log: OutboundLog()).extractPointers(p.request, inParts: p.parts, keepOnDevice: true)
        }
        #expect(port.calls.isEmpty)
        let f = try Fixture()
        let s = try f.session([("householdSize", .integer(3)), ("income", .income(.exact(30524)))])
        let verdict = try #require(try s.verdicts(pack: f.bundle.pack, bands: f.bundle.bands)[program: "food-help"])
        let personal = AnswerInputs.personalResult(f.bundle, programId: "food-help", verdict: verdict.verdict,
                                                   reasons: s.reasons(pack: f.bundle.pack, bands: f.bundle.bands, programId: "food-help"), locale: .en)
        let request = Planner.explainPersonal(personal, template: f.bundle.prompts["explain-personal.v1"]!)
        await #expect(throws: TaskError.self) { _ = try await runner(port, log: OutboundLog()).runPersonal(request) }
        #expect(port.calls.isEmpty, "a Raw request is never handed to the SDK when the device model is not available")
    }

    @Test("personal scope takes the verdict on screen: a hedge that contradicts it is blocked")
    func verdictAwareCheck() async throws {
        let f = try Fixture()
        let s = try f.session([("householdSize", .integer(1)), ("income", .income(.exact(90000)))])
        let verdict = try #require(try s.verdicts(pack: f.bundle.pack, bands: f.bundle.bands)[program: "food-help"])
        #expect(verdict.verdict == .unlikely)
        let personal = AnswerInputs.personalResult(f.bundle, programId: "food-help", verdict: verdict.verdict,
                                                   reasons: s.reasons(pack: f.bundle.pack, bands: f.bundle.bands, programId: "food-help"), locale: .en)
        let request = Planner.explainPersonal(personal, template: f.bundle.prompts["explain-personal.v1"]!)
        let port = FakePort(device: [.success("You may qualify for this program."), .success("You may qualify for this program.")])
        await #expect(throws: TaskError.self) { _ = try await runner(port, log: OutboundLog()).runPersonal(request) }
    }
}

final class StageLog: @unchecked Sendable {
    private let lock = NSLock()
    private var stages: [ReadingStage] = []
    func add(_ s: ReadingStage) { lock.withLock { stages.append(s) } }
    var all: [ReadingStage] { lock.withLock { stages } }
}

enum Shared {
    enum us {
        /// The base answers of the California pack's hand-worked households.
        static func base() throws -> JSONObject {
            let cases = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("rulepacks/us-ca/cases.json")))
            return cases["base"]?.objectValue ?? JSONObject()
        }
    }
}

/// Counts calls from any task.
final class CallCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var n = 0
    func add() { lock.withLock { n += 1 } }
    var value: Int { lock.withLock { n } }
}
