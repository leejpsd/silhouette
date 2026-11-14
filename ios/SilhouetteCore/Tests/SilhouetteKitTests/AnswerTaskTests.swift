import Foundation
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

/// A model port that never calls a model: scripted replies, and a record of every call.
final class FakePort: ModelPort, @unchecked Sendable {
    enum Call: Equatable { case device(String), cloud(String) }
    private let lock = NSLock()
    var availability: DeviceAvailability
    var deviceReplies: [Result<String, TaskError>]
    var cloudReplies: [Result<String, TaskError>]
    private(set) var calls: [Call] = []
    private(set) var cloudRequests: [CloudRequest] = []
    private(set) var deviceCalls: [DeviceCall] = []
    /// Entries in the outgoing record at the moment each cloud call was made.
    var log: OutboundLog?
    private(set) var recordedBeforeCloud: [Int] = []

    init(availability: DeviceAvailability = .available, device: [Result<String, TaskError>] = [], cloud: [Result<String, TaskError>] = []) {
        self.availability = availability
        deviceReplies = device
        cloudReplies = cloud
    }

    func deviceAvailability() -> DeviceAvailability { availability }

    func generateOnDevice(_ call: DeviceCall) async throws -> ModelReply {
        let next: Result<String, TaskError> = lock.withLock {
            calls.append(.device(call.taskId))
            deviceCalls.append(call)
            return deviceReplies.isEmpty ? .failure(TaskError(.onDeviceUnavailable, "no script")) : deviceReplies.removeFirst()
        }
        return ModelReply(text: try next.get(), modelVersion: TaskRunner.onDeviceModelVersion)
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

    func explainInput(_ s: QuickCheckSession, program: String = "food-help", locale: AppLocale = .en) throws -> ExplainInput {
        let silhouette = try #require(s.silhouette(pack: bundle.pack, packInfo: bundle.packInfo, bands: bundle.bands))
        return ExplainInput(profile: silhouette.profile, silhouetteVerdicts: silhouette.verdicts,
                            program: try #require(AnswerInputs.programFacts(bundle, programId: program, locale: locale)), locale: locale)
    }

    var explainTemplate: PromptTemplate { bundle.prompts.versioned("explain", version: config.promptExplainV, among: 3...3)! }
    var askTemplate: PromptTemplate { bundle.prompts["ask.v2"]! }
}

@Suite("Answer tasks: routing, record, checks, consent")
struct AnswerTaskTests {
    func runner(_ port: FakePort, log: OutboundLog = OutboundLog()) throws -> TaskRunner {
        port.log = log
        return TaskRunner(port: port, log: log, outputChecks: try Fixture().bundle.outputChecks,
                          firstRequestFields: ["app-check-token-request", "installation"])
    }

    func explainRequest(long: Bool = false) throws -> CloudRequest {
        let f = try Fixture()
        let s = try f.session([("householdSize", .integer(3)), ("income", .income(.band("B")))])
        return Planner.explain(try f.explainInput(s), long: long, template: f.explainTemplate, config: f.config)
    }

    @Test("Remote Config defaults are exactly the template's")
    func configDefaults() throws {
        let f = try Fixture()
        #expect(f.config == AppConfig(values: ["route_short_text_max_words": "80", "route_ondevice_locales_ios": #"["en","es","ko"]"#,
                                               "prompt_pointer_extract_v": "4", "prompt_explain_v": "5"]))
        #expect(f.bundle.prompts.versioned("pointer-extract", version: 2, among: 2...4)?.id == "pointer-extract.v2")
        #expect(f.bundle.prompts.versioned("pointer-extract", version: 99, among: 2...4)?.id == "pointer-extract.v4")
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
        #expect(log.entries.first?.fields.contains("profile-silhouette") == true)
        #expect(log.entries.first?.fields.contains("app-check-token-request") == true, "the first request names the SDK's own traffic")
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
        #expect(log.entries.last?.fields.contains("app-check-token-request") == false, "only the first request names them")
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
                                                     verdictLabel: $0.verdictLabel, criteriaLines: $0.criteriaLines) }
        let request = Planner.explainPersonal(r, template: f.bundle.prompts["explain-personal.v1"]!)
        #expect(!request.call.prompt.contains("xxxx"))
        #expect(!Planner.exceedsDeviceLimit(request.call))
    }

    @Test("two people with the same silhouette but different exact incomes, private answers and results send identical requests")
    func sameSilhouetteSameRequest() throws {
        let f = try Fixture()
        let a = try f.session([("householdSize", .integer(3)), ("income", .income(.exact(30100))), ("residentStatus", .choice("eligible")),
                               ("housing", .choice("renter"))])
        let b = try f.session([("householdSize", .integer(3)), ("income", .income(.exact(44000))), ("residentStatus", .choice("not-eligible")),
                               ("housing", .choice("renter")), ("hasEarnedIncome", .choice("yes"))])
        let va = try a.verdicts(pack: f.bundle.pack, bands: f.bundle.bands)[program: "food-help"]?.verdict
        let vb = try b.verdicts(pack: f.bundle.pack, bands: f.bundle.bands)[program: "food-help"]?.verdict
        #expect(va != vb, "the results on screen differ")
        for long in [false, true] {
            let ra = Planner.explain(try f.explainInput(a), long: long, template: f.explainTemplate, config: f.config)
            let rb = Planner.explain(try f.explainInput(b), long: long, template: f.explainTemplate, config: f.config)
            #expect(ra.rendering == rb.rendering)
        }
        let question = Public<String>("How do I apply?")
        #expect(Planner.askChip(try f.explainInput(a), question: question, template: f.askTemplate).rendering
            == Planner.askChip(try f.explainInput(b), question: question, template: f.askTemplate).rendering)
        // The person-specific part of the request (the system instruction is the shared prompt text).
        let text = Planner.explain(try f.explainInput(a), long: false, template: f.explainTemplate, config: f.config).prompt.text
        for leak in ["30100", "30,100", "44000", "44,000", "not-eligible", "residentStatus", "Probably not", "You may qualify"] {
            #expect(!text.contains(leak), "\(leak) in the request")
        }
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
}
