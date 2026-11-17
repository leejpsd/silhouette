// The on-device check: a fixed set of synthetic cases run through Firebase AI Logic and the app's own
// tasks, recording where each one finally ran, the time of each part, and the yearly-income inputs
// right, not found or wrong. It produces a run file in the format of the Web app's check (version 3,
// kind `silhouette-device-check`), which can be shared from the phone and kept next to the Web's runs.
// Every input is synthetic: the bundled sample paystub, four generated evaluation paystubs and an
// invented household. Placeholder ids and field names only are recorded; never a document value.

import Foundation
import Observation
import SilhouetteCore
import SilhouetteKit
import UIKit

enum DeviceCheck {
    static let kind = "silhouette-device-check"
    static let version = 3
    /// The fields the yearly income is worked out from.
    static let incomeInputs = ["grossPay", "ytdGross", "payFrequency", "periodStart", "periodEnd", "payDate"]

    /// The extraction cases: the bundled sample and four evaluation paystubs (as in the Web check).
    static let extractionCases: [(id: String, file: String?)] = [
        ("pointers: bundled sample", nil),
        ("pointers: evaluation paystub L01", "en-l01-1"),
        ("pointers: evaluation paystub L04", "en-l04-2"),
        ("pointers: evaluation paystub L07", "en-l07-3"),
        ("pointers: evaluation paystub L10", "en-l10-1"),
    ]

    /// The ids a pointer answer gives for a field.
    static func answeredIds(_ value: JSON?) -> [String] {
        switch value {
        case .string(let s)?: s.range(of: #"^[NDW][0-9]+$"#, options: .regularExpression) != nil ? [s] : []
        case .array(let items)?: items.flatMap { answeredIds($0) }
        case .object(let o)?: o.entries.flatMap { answeredIds($0.value) }
        default: []
        }
    }

    /// "device-check-2026-11-17T1012-silhouette0-ios265.json": UTC date and time, app and platform.
    static func fileName(date: String, browser: String, platform: String) -> String {
        func slug(_ s: String) -> String { s.lowercased().filter { $0.isLetter || $0.isNumber }.filter(\.isASCII) }
        let parts = browser.split(separator: " ")
        let name = parts.first.map(String.init) ?? "app"
        let major = parts.dropFirst().first.map { String($0.split(separator: ".").first ?? "") } ?? ""
        var stamp = String(date.prefix(10))
        if let t = date.range(of: #"T(\d{2}):(\d{2})"#, options: .regularExpression) {
            stamp += "T" + date[t].dropFirst().replacingOccurrences(of: ":", with: "")
        }
        return "device-check-\(stamp)-\(slug(name))\(major)-\(slug(platform)).json"
    }

    /// Whether a parsed JSON value is a run file this screen can show (versions 1 to 3).
    static func isRunFile(_ json: JSON) -> Bool {
        json["kind"]?.stringValue == kind && json["cases"]?.arrayValue != nil && json["date"]?.stringValue != nil
            && [1, 2, 3].contains(Int(json["version"]?.numberValue ?? 0))
    }

    /// Where a case was finally answered, in a file of any version.
    static func finalRan(_ c: JSON, version: Int) -> String {
        version >= 3 ? (c["ran"]?.stringValue ?? "not-run") : (c["final"]?["ran"]?.stringValue ?? c["ran"]?.stringValue ?? "not-run")
    }

    struct Summary {
        var total = 0, onDevice = 0, afterDevice = 0, inCloud = 0, notRun = 0
        var readings = 0, incomeRight = 0, incomeNotFound = 0, incomeWrong = 0
        var wrongReachedPerson: Int?
        var deductionsNotRead = 0
        var repetitions = 1
    }

    static func summarize(_ file: JSON) -> Summary {
        let version = Int(file["version"]?.numberValue ?? 3)
        let cases = file["cases"]?.arrayValue ?? []
        var s = Summary()
        s.total = cases.count
        s.repetitions = Int(file["repetitions"]?.numberValue ?? 1)
        for c in cases {
            let ran = finalRan(c, version: version)
            let after = c["final"]?["retried"]?.boolValue == true && ran == "IN_CLOUD"
            if ran == "ON_DEVICE" { s.onDevice += 1 } else if after { s.afterDevice += 1 } else if ran == "IN_CLOUD" { s.inCloud += 1 } else { s.notRun += 1 }
            if c["final"]?["deductionsNotRead"]?.boolValue == true { s.deductionsNotRead += 1 }
            guard c["task"]?.stringValue == "document.pointer.extract" else { continue }
            s.readings += 1
            if let income = c["final"]?["incomeInputs"] {
                let notFound = income["notFound"]?.arrayValue?.count ?? 0, wrong = income["wrong"]?.arrayValue?.count ?? 0
                if wrong > 0 { s.incomeWrong += 1 } else if notFound > 0 { s.incomeNotFound += 1 } else { s.incomeRight += 1 }
            }
            if let wrong = c["final"]?["wrongFields"]?.arrayValue {
                s.wrongReachedPerson = (s.wrongReachedPerson ?? 0) + (wrong.isEmpty ? 0 : 1)
            }
        }
        return s
    }
}

/// A live run of the check on this iPhone.
@MainActor
@Observable
final class DeviceCheckRun {
    private(set) var cases: [JSON] = []
    private(set) var running = false
    private(set) var current = 0
    private(set) var total = 0
    private(set) var file: JSON?
    @ObservationIgnored private var started = Date()

    private let model: AppModel
    init(model: AppModel) { self.model = model }

    private var bundle: SharedBundle { model.bundle }
    private var schema: JSON { bundle.paystubSchema }

    static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }

    /// The device and system, as the run file names them.
    static var environment: (browser: String, platform: String, userAgent: String) {
        var info = utsname()
        uname(&info)
        let machine = withUnsafeBytes(of: &info.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let system = "\(UIDevice.current.systemName) \(UIDevice.current.systemVersion)"
        return ("Silhouette \(version)", system, "Silhouette/\(version) (\(machine); \(system); Firebase AI Logic 12.19.3)")
    }

    func run(repetitions: Int) async {
        guard !running else { return }
        running = true
        cases = []
        file = nil
        started = Date()
        let jobs = jobs(repetitions: repetitions)
        total = jobs.count
        for (i, job) in jobs.enumerated() {
            current = i + 1
            cases.append(await job())
        }
        let env = Self.environment
        var f = JSONObject()
        f["kind"] = .string(DeviceCheck.kind)
        f["version"] = .number(Double(DeviceCheck.version))
        f["date"] = .string(Self.iso(started))
        f["browser"] = .string(env.browser)
        f["platform"] = .string(env.platform)
        f["userAgent"] = .string(env.userAgent)
        f["availability"] = .object(JSONObject([("systemLanguageModel", .string(model.port.deviceAvailability().rawValue))]))
        f["jurisdiction"] = .string(bundle.packInfo.jurisdiction)
        f["repetitions"] = .number(Double(repetitions))
        f["cases"] = .array(cases)
        file = .object(f)
        running = false
    }

    private func jobs(repetitions: Int) -> [() async -> JSON] {
        var out: [() async -> JSON] = []
        for r in 0..<max(1, repetitions) {
            for c in DeviceCheck.extractionCases {
                out.append { [unowned self] in await self.extraction(id: c.id, file: c.file, repetition: repetitions > 1 ? r + 1 : nil) }
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

    private func ms(_ since: Date) -> JSON { .number((Date().timeIntervalSince(since) * 1000).rounded()) }

    private func base(_ id: String, task: String, mode: String, repetition: Int? = nil) -> JSONObject {
        var o = JSONObject([("id", .string(id)), ("task", .string(task)), ("mode", .string(mode))])
        if let repetition { o["repetition"] = .number(Double(repetition)) }
        return o
    }

    private func failure(_ error: Error, into o: inout JSONObject) {
        let e = (error as? DeviceReadingFailed)?.error ?? (error as? TaskError) ?? TaskError(.unknown, "error")
        o["ran"] = .string("not-run")
        o["outputCheck"] = e.kind == .blocked ? .string("blocked") : .null
        o["error"] = .string(String("\(e.kind.rawValue): \(e.detail)".prefix(300)))
    }

    // MARK: Extraction

    /// The text and the expected values of an extraction case (synthetic, kept as Raw like any document).
    private func document(_ file: String?) -> (text: Raw<String>, gold: Raw<JSON>)? {
        guard let file else { return ReadingScore.sampleGold(bundle, sampleId: "paystub-en-01") }
        guard let textURL = Bundle.main.url(forResource: file, withExtension: "txt"),
              let goldURL = Bundle.main.url(forResource: "\(file).gold", withExtension: "json"),
              let text = try? String(contentsOf: textURL, encoding: .utf8),
              let gold = try? JSON.parse(Data(contentsOf: goldURL)) else { return nil }
        return (Raw(text), Raw(gold))
    }

    private func extraction(id: String, file: String?, repetition: Int?) async -> JSON {
        var o = base(id, task: "document.pointer.extract", mode: "PREFER_ON_DEVICE", repetition: repetition)
        let started = Date()
        guard let doc = document(file), let allowlist = try? bundle.allowlist(for: .en) else {
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
                             map: silhouette.map, jurisdiction: bundle.packInfo.jurisdiction)
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
            let core = ReadingScore.score(statuses, only: coreFields)
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
            d["passes"] = .array(attempt.passes.map { p in
                var r = JSONObject([("part", .string(p.part.rawValue)), ("rawText", .string(String(p.text.prefix(4000)))), ("parsed", .bool(p.parsed))])
                if let v = p.value { r["parsedValue"] = v }
                r["problems"] = .array(p.problems.map(JSON.string))
                if !p.marked.isEmpty { r["marked"] = .array(p.marked.map(JSON.string)) }
                r["extraKeys"] = .array(p.extraKeys.map(JSON.string))
                r["missingKeys"] = .array(p.missingKeys.map(JSON.string))
                r["latencyMs"] = .number(((p.seconds ?? 0) * 1000).rounded())
                return .object(r)
            })
            return .object(d)
        }
        func fields(_ s: (correct: Int, total: Int)) -> JSON {
            .object(JSONObject([("correct", .number(Double(s.correct))), ("total", .number(Double(s.total)))]))
        }
        do {
            let outcome = try await model.runner.extractPointers(request, inParts: inParts)
            let finalStatuses = statusesOf(outcome.pointers)
            let finalScore = ReadingScore.score(finalStatuses)
            let firstScore = outcome.attempt.map { a in deviceAnswer(a).map { ReadingScore.score(statusesOf($0)) } ?? (0, finalScore.total) } ?? finalScore
            let byField = Dictionary(finalStatuses.map { ($0.field, $0.status) }, uniquingKeysWith: { a, _ in a })
            let inputs = DeviceCheck.incomeInputs
            func of(_ want: [ReadingScore.Status?]) -> JSON { .array(inputs.filter { want.contains(byField[$0]) }.map(JSON.string)) }
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
            final["incomeInputsCorrect"] = .bool(inputs.allSatisfy { [nil, .correct, .absent].contains(byField[$0]) })
            final["incomeInputs"] = .object(JSONObject([("right", of([.correct, .absent, nil])), ("notFound", of([.missing])), ("wrong", of([.wrong, .spurious]))]))
            final["wrongFields"] = .array(finalStatuses.filter { $0.status == .wrong || $0.status == .spurious }.map { .string($0.field) })
            o["final"] = .object(final)
            if let attempt = outcome.attempt { o["device"] = diagnose(attempt) }
            o["note"] = .string(outcome.reason.rawValue)
        } catch {
            failure(error, into: &o)
            o["latencyMs"] = ms(started)
            if let attempt = (error as? DeviceReadingFailed)?.attempt {
                let total = ReadingScore.score(noAnswer).total
                let first = deviceAnswer(attempt).map { ReadingScore.score(statusesOf($0)) } ?? (0, total)
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
            for (id, value) in PreparedHousehold.answers where session.step(id) != nil { _ = session.answer(id, with: value) }
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

    /// Reading a photo needs an on-device model that takes images; this app does not read photos yet.
    private func photo() -> JSON {
        var o = base("photo of the sample (en)", task: "document.photo.read", mode: "ONLY_ON_DEVICE")
        o["ran"] = .string("not-run")
        o["latencyMs"] = .null
        o["outputCheck"] = .null
        o["note"] = .string("skipped: this app does not read photos (the on-device model is used for text only)")
        return .object(o)
    }
}

