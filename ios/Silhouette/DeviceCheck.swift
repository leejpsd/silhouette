// The on-device check (shared/validation/DEVICE_CHECK.md): the fixed cases of
// shared/fixtures/device-check/cases.json run through Firebase AI Logic and the app's own tasks,
// recording where each one finally ran, the time of each part, and the yearly-income inputs right, not
// found or wrong. The run file (version 3, shared/schemas/device-check-run.v3.json) is saved in the
// app's Documents folder when the run finishes and can be shared. Every input is synthetic: the bundled
// sample paystub, four evaluation paystubs and the judges' household. Placeholder ids and field names
// only are recorded; never a document value.

import Foundation
import Observation
import SilhouetteCore
import SilhouetteKit
import UIKit

/// A live run of the check on this iPhone.
@MainActor
@Observable
final class DeviceCheckRun {
    private(set) var cases: [JSON] = []
    private(set) var running = false
    private(set) var current = 0
    private(set) var total = 0
    private(set) var file: JSON?
    /// Where the finished run was saved in the app's Documents folder (visible in the Files app).
    private(set) var savedURL: URL?
    @ObservationIgnored private var started = Date()
    @ObservationIgnored private var availabilityBefore = DeviceAvailability.unavailable

    private let model: AppModel
    init(model: AppModel) { self.model = model }

    private var bundle: SharedBundle { model.bundle }
    private var schema: JSON { bundle.paystubSchema }

    static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }

    /// The Firebase Apple SDK the app is built with (pinned in project.yml).
    static let sdkVersion = "12.19.3"

    /// The device model identifier ("iPhone18,1"); on the simulator, the simulated device's.
    static var modelIdentifier: String {
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return simulated }
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    }

    static var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
        return "\(version) (\(build))"
    }

    /// The device and system, as the run file names them.
    static var environment: (browser: String, platform: String, userAgent: String) {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let system = "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)"
        return ("Silhouette \(version)", system, "Silhouette/\(version) (\(modelIdentifier); \(system); Firebase AI Logic \(sdkVersion))")
    }

    /// The run file's device block: what ran the check, as far as iOS exposes it. The system names no
    /// version of its on-device model; the SDK calls it `apple-foundation-models-system-language-model`.
    static var deviceBlock: JSON {
        DeviceCheck.deviceBlock(os: UIDevice.current.systemName, osVersion: UIDevice.current.systemVersion, model: modelIdentifier,
                                onDeviceModel: "Apple Foundation Models (\(TaskRunner.onDeviceModelVersion))",
                                sdk: "Firebase AI Logic \(sdkVersion)", appVersion: appVersion)
    }

    /// Saves a run file in the app's Documents folder (shown in the Files app under On My iPhone,
    /// Silhouette) and returns where.
    static func save(_ file: JSON) -> URL? {
        guard let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return nil }
        let url = folder.appendingPathComponent(DeviceCheck.fileName(file))
        guard (try? Data((file.jsonText + "\n").utf8).write(to: url, options: .atomic)) != nil else { return nil }
        return url
    }

    func run(repetitions: Int) async {
        guard !running else { return }
        running = true
        cases = []
        file = nil
        savedURL = nil
        started = Date()
        availabilityBefore = model.port.deviceAvailability()
        let jobs = jobs(repetitions: repetitions)
        total = jobs.count
        for (i, job) in jobs.enumerated() {
            current = i + 1
            cases.append(await job())
        }
        let env = Self.environment
        let finished = DeviceCheck.runFile(date: Self.iso(started), browser: env.browser, platform: env.platform, userAgent: env.userAgent,
                                           availability: [("systemLanguageModel", availabilityBefore.rawValue)],
                                           jurisdiction: bundle.packInfo.jurisdiction, repetitions: repetitions, device: Self.deviceBlock, cases: cases)
        file = finished
        // Saved as soon as the run finishes, so it can be collected without the share sheet.
        savedURL = Self.save(finished)
        running = false
    }

    private func jobs(repetitions: Int) -> [() async -> JSON] {
        var out: [() async -> JSON] = []
        for r in 0..<max(1, repetitions) {
            for c in extractionCases {
                out.append { [unowned self] in await self.extraction(id: c.id, document: c.document, gold: c.gold, repetition: repetitions > 1 ? r + 1 : nil) }
            }
        }
        for locale in [AppLocale.en, .es] { out.append { [unowned self] in await self.explanation(locale) } }
        for locale in [AppLocale.en, .es] {
            for chip in ["apply", "change"] { out.append { [unowned self] in await self.question(locale, chip) } }
        }
        out.append { [unowned self] in await self.personal(typed: false) }
        out.append { [unowned self] in await self.personal(typed: true) }
        out.append { [unowned self] in self.photo() }
        return out
    }

    /// The extraction cases of shared/fixtures/device-check/cases.json: id, document and gold paths.
    private var extractionCases: [(id: String, document: String, gold: String?)] {
        (bundle.deviceCheckCases?["extraction"]?.arrayValue ?? []).compactMap { c in
            guard let id = c["id"]?.stringValue, let document = c["document"]?.stringValue else { return nil }
            let gold = c["gold"]?.stringValue
            return (id, document, gold?.hasSuffix(".json") == true ? gold : nil)
        }
    }

    private func ms(_ since: Date) -> JSON { .number((Date().timeIntervalSince(since) * 1000).rounded()) }

    private func base(_ id: String, task: String, mode: String, repetition: Int? = nil) -> JSONObject {
        var o = JSONObject([("id", .string(id)), ("task", .string(task)), ("mode", .string(mode))])
        if let repetition { o["repetition"] = .number(Double(repetition)) }
        return o
    }

    private func failure(_ error: Error, into o: inout JSONObject) {
        let e = (error as? DeviceReadingFailed)?.error ?? (error as? TaskError) ?? TaskError(.unknown, String(describing: error))
        o["ran"] = .string("not-run")
        o["outputCheck"] = e.kind == .blocked ? .string("blocked") : .null
        // The kind, then where it stopped (an app guard or the SDK) and the error type, when known.
        let origin = [e.origin, e.errorType].compactMap { $0 }.joined(separator: ", ")
        o["error"] = .string(String("\(e.kind.rawValue): \(e.detail)\(origin.isEmpty ? "" : " (\(origin))")".prefix(600)))
    }

    // MARK: Extraction

    /// The text and the expected values of an extraction case (synthetic, kept as Raw like any document):
    /// the bundled sample with its answer key, or a check document with its gold file.
    private func document(_ path: String, gold goldPath: String?) -> (text: Raw<String>, gold: Raw<JSON>)? {
        guard let goldPath else { return ReadingScore.sampleGold(bundle, sampleId: "paystub-en-01") }
        guard let text = bundle.data(path).map({ String(decoding: $0, as: UTF8.self) }),
              let gold = bundle.data(goldPath).flatMap({ try? JSON.parse($0) }) else { return nil }
        return (Raw(text), Raw(gold))
    }

    private func extraction(id: String, document path: String, gold goldPath: String?, repetition: Int?) async -> JSON {
        var o = base(id, task: "document.pointer.extract", mode: "PREFER_ON_DEVICE", repetition: repetition)
        let started = Date()
        guard let doc = document(path, gold: goldPath), let allowlist = try? bundle.allowlist(for: .en) else {
            o["ran"] = .string("not-run"); o["latencyMs"] = .null; o["outputCheck"] = .null; o["note"] = .string("the case could not be loaded")
            return .object(o)
        }
        let silhouette = Skeletonizer.skeletonize(doc.text, allowlist: allowlist)
        let gold = doc.gold
        let goldIds = ReadingScore.goldIds(gold: gold, map: silhouette.map)
        let statusesOf = { (pointers: JSON) in ReadingScore.statuses(schema: self.schema, pointers: pointers, map: silhouette.map, gold: gold) }
        let noAnswer = statusesOf(.object(JSONObject()))
        let coreFields = Set((schema["properties"]?.objectValue?.keys ?? []).filter { $0 != "deductions" })
        let version = model.lastConfig?.promptPointerExtractV ?? model.currentConfig.promptPointerExtractV
        guard let template = model.pointerTemplate(version: version),
              let request = try? Planner.pointers(silhouette.skeleton, language: .en, template: template, pointerSchema: schema) else {
            failure(TaskError(.unknown, "no pointer prompt"), into: &o)
            return .object(o)
        }
        let inParts = template.id == "pointer-extract.v5" && version >= 5
            ? ReadingInParts(template: template, parts: bundle.prompts.deviceParts, schema: schema, skeleton: silhouette.skeleton,
                             map: silhouette.map, jurisdiction: bundle.packInfo.jurisdiction, language: "en")
            : nil

        // Everything the device answered, including deductions then left out as not read.
        func deviceAnswer(_ attempt: DeviceAttempt) -> JSON? {
            let parts = attempt.passes.compactMap(\.value)
            guard !parts.isEmpty else { return nil }
            var merged = JSONObject()
            for p in parts { for (k, v) in p.objectValue?.entries ?? [] { merged[k] = v } }
            return .object(merged)
        }
        func diagnose(_ attempt: DeviceAttempt) -> JSON {
            let answer = deviceAnswer(attempt)
            let statuses = answer.map(statusesOf) ?? noAnswer
            let core = ReadingScore.score(statuses, gold: gold, only: coreFields)
            let deductionsAsked = attempt.passes.contains { $0.part == .deductions }
            let deductions = deductionsAsked ? (statuses.first { $0.field == "deductions" }?.status.rawValue ?? "absent") : "not-asked"
            let corePass = attempt.passes.first
            var d = JSONObject()
            d["scoredBy"] = .string("value")
            d["rawText"] = .string(String((corePass?.text ?? "").prefix(4000)))
            d["parsed"] = .bool(corePass?.parsed ?? false)
            d["problems"] = .array(attempt.problems.map(JSON.string))
            d["passed"] = .bool(attempt.problems.isEmpty)
            d["fields"] = .array((schema["properties"]?.objectValue?.keys ?? []).map { field in
                let status = statuses.first { $0.field == field }?.status ?? .absent
                return .object(JSONObject([("field", .string(field)), ("gold", .array((goldIds[field] ?? []).map(JSON.string))),
                                           ("answered", .array(DeviceCheck.answeredIds(answer?[field]).map(JSON.string))),
                                           ("status", .string(status.rawValue))]))
            })
            d["core"] = .object(JSONObject([("correct", .number(Double(core.correct))), ("total", .number(Double(core.total)))]))
            d["deductions"] = .string(deductions)
            d["passes"] = .array(attempt.passes.map(DeviceCheck.passRecord))
            return .object(d)
        }
        func fields(_ s: (correct: Int, total: Int)) -> JSON {
            .object(JSONObject([("correct", .number(Double(s.correct))), ("total", .number(Double(s.total)))]))
        }
        do {
            let outcome = try await model.runner.extractPointers(request, inParts: inParts)
            let finalStatuses = statusesOf(outcome.pointers)
            let finalScore = ReadingScore.score(finalStatuses, gold: gold)
            let firstScore = outcome.attempt.map { a in deviceAnswer(a).map { ReadingScore.score(statusesOf($0), gold: gold) } ?? (0, finalScore.total) } ?? finalScore
            let income = DeviceCheck.incomeInputs(finalStatuses)
            let ran = outcome.source == .onDevice ? "ON_DEVICE" : "IN_CLOUD"
            o["ran"] = .string(ran)
            o["latencyMs"] = ms(started)
            o["outputCheck"] = .null
            o["first"] = .object(JSONObject([("ran", .string(outcome.attempt != nil ? "ON_DEVICE" : ran)), ("fields", fields(firstScore))]))
            var final = JSONObject()
            final["ran"] = .string(ran)
            final["fields"] = fields(finalScore)
            final["retried"] = .bool(outcome.reason == .onDeviceFailed)
            final["deductionsNotRead"] = .bool(outcome.notRead.contains("deductions"))
            final["notRead"] = .array(outcome.notRead.map(JSON.string))
            final["incomeInputsCorrect"] = .bool(income.notFound.isEmpty && income.wrong.isEmpty)
            final["incomeInputs"] = .object(JSONObject([("right", .array(income.right.map(JSON.string))), ("notFound", .array(income.notFound.map(JSON.string))),
                                                        ("wrong", .array(income.wrong.map(JSON.string)))]))
            final["wrongFields"] = .array(DeviceCheck.wrongFields(finalStatuses).map(JSON.string))
            o["final"] = .object(final)
            if let attempt = outcome.attempt { o["device"] = diagnose(attempt) }
            o["note"] = .string(outcome.reason.rawValue)
        } catch {
            failure(error, into: &o)
            o["latencyMs"] = ms(started)
            if let attempt = (error as? DeviceReadingFailed)?.attempt {
                let total = ReadingScore.score(noAnswer, gold: gold).total
                let first = deviceAnswer(attempt).map { ReadingScore.score(statusesOf($0), gold: gold) } ?? (0, total)
                o["first"] = .object(JSONObject([("ran", .string("ON_DEVICE")), ("fields", fields(first))]))
                o["device"] = diagnose(attempt)
            }
        }
        return .object(o)
    }

    // MARK: Explanations and questions

    private var firstProgram: String { bundle.packInfo.programs.first?.id ?? "" }

    private func text(_ o: inout JSONObject, started: Date, _ run: () async throws -> TaskResult) async {
        do {
            let result = try await run()
            o["ran"] = .string(result.source == .onDevice ? "ON_DEVICE" : "IN_CLOUD")
            o["latencyMs"] = ms(started)
            o["outputCheck"] = .string("passed")
            o["note"] = .string(result.reason.rawValue)
        } catch {
            failure(error, into: &o)
            o["latencyMs"] = ms(started)
        }
    }

    private func explanation(_ locale: AppLocale) async -> JSON {
        let config = model.currentConfig
        guard let facts = AnswerInputs.programFacts(bundle, programId: firstProgram, locale: locale), let template = model.explainTemplate else {
            return .object(base("explanation (\(locale.rawValue))", task: "explain.short", mode: "PREFER_ON_DEVICE"))
        }
        let request = Planner.explain(facts, locale: locale, long: false, template: template, config: config)
        var o = base("explanation (\(locale.rawValue))", task: request.taskId, mode: request.mode.rawValue)
        await text(&o, started: Date()) { try await self.model.runner.runText(request) }
        return .object(o)
    }

    private func question(_ locale: AppLocale, _ chip: String) async -> JSON {
        let label = bundle.copy.text("ask.chip.\(chip)", locale)
        guard let facts = AnswerInputs.programFacts(bundle, programId: firstProgram, locale: locale), let template = model.askTemplate,
              let question = AnswerInputs.chipQuestion(bundle, chip: chip, locale: locale) else {
            return .object(base("\(label) (\(locale.rawValue))", task: "ask.chip", mode: "PREFER_ON_DEVICE"))
        }
        let request = Planner.askChip(facts, question: question, locale: locale, template: template)
        var o = base("\(label) (\(locale.rawValue))", task: request.taskId, mode: request.mode.rawValue)
        await text(&o, started: Date()) { try await self.model.runner.runText(request) }
        return .object(o)
    }

    /// The prepared synthetic household's own result for the first program, on this device only.
    private func personal(typed: Bool) async -> JSON {
        var o = base(typed ? "typed question (en)" : "your own result (en)", task: typed ? "ask.freeText" : "explain.personal", mode: "ONLY_ON_DEVICE")
        let started = Date()
        do {
            let steps = try QuickCheck.steps(pack: bundle.packInfo, bands: bundle.bands)
            var session = QuickCheckSession(steps: steps)
            for (id, value) in bundle.judgesHousehold?.answers ?? [] where session.step(id) != nil { _ = session.answer(id, with: value) }
            let verdict = try session.verdicts(pack: bundle.pack, bands: bundle.bands).first { $0.programId == firstProgram }?.verdict ?? .depends
            let personal = AnswerInputs.personalResult(bundle, programId: firstProgram, verdict: verdict,
                                                       reasons: session.reasons(pack: bundle.pack, bands: bundle.bands, programId: firstProgram), locale: .en)
            let request = typed
                ? Planner.askFreeText(Raw("What papers should I bring?"), result: personal, template: bundle.prompts["ask-personal.v1"]!)
                : Planner.explainPersonal(personal, template: bundle.prompts["explain-personal.v1"]!)
            await text(&o, started: started) { try await self.model.runner.runPersonal(request) }
        } catch {
            failure(error, into: &o)
            o["latencyMs"] = ms(started)
        }
        return .object(o)
    }

    /// Reading a photo needs an on-device model that takes images. On iPhone the on-device model takes
    /// text only, so the case is not available on this platform: kept in the file (`not-run`, with its
    /// note), and left out of the figures the screen shows.
    private func photo() -> JSON {
        var o = base("photo of the sample (en)", task: "document.photo.read", mode: "ONLY_ON_DEVICE")
        o["ran"] = .string("not-run")
        o["latencyMs"] = .null
        o["outputCheck"] = .null
        o["note"] = .string("not available on this platform: the on-device model on iPhone takes text only, so photos are not read")
        return .object(o)
    }
}


/// The 24 held-out paystubs (web/eval/heldout/, bundled as `Shared/heldout/`) read on this iPhone as the app
/// reads a document: the silhouette made here, the device first with the reading in parts and its checks
/// (shared/validation/DEVICE_READING.md), and one cloud retry of the same silhouette when the device's answer
/// fails them. The run file has the shape of the web's held-out run, so web/eval/heldout-score.mjs scores it;
/// it is saved in the app's Documents folder when the run finishes. The screen stays on while it runs.
@MainActor
@Observable
final class HeldOutRun {
    private(set) var running = false
    private(set) var current = 0
    private(set) var total = 0
    private(set) var documents: [JSON] = []
    private(set) var file: JSON?
    private(set) var savedURL: URL?
    /// How long the whole run took, once finished.
    private(set) var seconds: Double?

    private let model: AppModel
    init(model: AppModel) { self.model = model }

    private var bundle: SharedBundle { model.bundle }
    private var schema: JSON { bundle.paystubSchema }

    /// The bundled held-out paystubs.
    nonisolated static func documents(_ bundle: SharedBundle) -> [HeldOutDocument] {
        HeldOut.load(directory: bundle.directory.appendingPathComponent("heldout", isDirectory: true))
    }

    /// Held-out runs recorded on an iPhone and bundled with the app (eval/on-device/heldout/), newest first.
    /// The answer keys of the bundled paystubs, for scoring a run file.
    static func golds(_ bundle: SharedBundle) -> [String: JSON] {
        if let cachedGolds { return cachedGolds }
        let golds = HeldOut.golds(documents(bundle))
        cachedGolds = golds
        return golds
    }
    private static var cachedGolds: [String: JSON]?

    static var bundledRecordings: [(name: String, file: JSON)] {
        let urls = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: "Shared/recordings/heldout") ?? []
        return urls.compactMap { url in (try? JSON.parse(Data(contentsOf: url))).flatMap { HeldOut.isRunFile($0) ? (url.lastPathComponent, $0) : nil } }
            .sorted { ($0.file["date"]?.stringValue ?? "") > ($1.file["date"]?.stringValue ?? "") }
    }

    static func save(_ file: JSON) -> URL? {
        guard let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return nil }
        let url = folder.appendingPathComponent(HeldOut.fileName(file))
        guard (try? Data((file.jsonText + "\n").utf8).write(to: url, options: .atomic)) != nil else { return nil }
        return url
    }

    func run() async {
        guard !running else { return }
        running = true
        documents = []
        file = nil
        savedURL = nil
        seconds = nil
        let started = Date()
        let availability = model.port.deviceAvailability()
        // Several minutes: the screen is kept on, so the run is not stopped by the phone locking.
        let wasIdleDisabled = UIApplication.shared.isIdleTimerDisabled
        UIApplication.shared.isIdleTimerDisabled = true
        let docs = Self.documents(bundle)
        total = docs.count
        for (i, doc) in docs.enumerated() {
            current = i + 1
            documents.append(await read(doc))
        }
        let env = DeviceCheckRun.environment
        let finished = HeldOut.runFile(date: DeviceCheckRun.iso(started), browser: env.browser, platform: env.platform, userAgent: env.userAgent,
                                       availability: [("systemLanguageModel", availability.rawValue)], device: DeviceCheckRun.deviceBlock,
                                       documents: documents)
        file = finished
        savedURL = Self.save(finished)
        seconds = Date().timeIntervalSince(started)
        UIApplication.shared.isIdleTimerDisabled = wasIdleDisabled
        running = false
    }

    private func read(_ doc: HeldOutDocument) async -> JSON {
        let started = Date()
        let ms = { Date().timeIntervalSince(started) * 1000 }
        guard let allowlist = try? bundle.allowlist(for: .en) else {
            return HeldOut.failed(doc, schema: schema, map: Raw(PlaceholderMap()), error: "the allowlist could not be loaded", attempt: nil, latencyMs: ms())
        }
        let silhouette = Skeletonizer.skeletonize(doc.text, allowlist: allowlist)
        // The same prompt, parts and checks as a document read in the app (and as the on-device check).
        let version = model.lastConfig?.promptPointerExtractV ?? model.currentConfig.promptPointerExtractV
        guard let template = model.pointerTemplate(version: version),
              let request = try? Planner.pointers(silhouette.skeleton, language: .en, template: template, pointerSchema: schema) else {
            return HeldOut.failed(doc, schema: schema, map: silhouette.map, error: "unknown: no pointer prompt", attempt: nil, latencyMs: ms())
        }
        let inParts = template.id == "pointer-extract.v5" && version >= 5 && !bundle.prompts.deviceParts.isEmpty
            ? ReadingInParts(template: template, parts: bundle.prompts.deviceParts, schema: schema, skeleton: silhouette.skeleton,
                             map: silhouette.map, jurisdiction: bundle.packInfo.jurisdiction, language: "en")
            : nil
        do {
            let outcome = try await model.runner.extractPointers(request, inParts: inParts)
            return HeldOut.record(doc, schema: schema, map: silhouette.map, outcome: outcome, latencyMs: ms())
        } catch {
            let e = (error as? DeviceReadingFailed)?.error ?? (error as? TaskError) ?? TaskError(.unknown, String(describing: error))
            let origin = [e.origin, e.errorType].compactMap { $0 }.joined(separator: ", ")
            return HeldOut.failed(doc, schema: schema, map: silhouette.map, error: "\(e.kind.rawValue): \(e.detail)\(origin.isEmpty ? "" : " (\(origin))")",
                                  attempt: (error as? DeviceReadingFailed)?.attempt, latencyMs: ms())
        }
    }
}
