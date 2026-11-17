// Explanations and questions on a program's page: "Why this result" (rules, plus the on-device
// explanation), "About this program" (cloud-capable, never a result), prepared questions and typed
// questions (on the device only). Nothing is requested until the person taps.

import Foundation
import SilhouetteCore
import SilhouetteKit

/// One request the person started.
enum RequestState {
    case idle
    /// The step before sending: what would leave, and the request.
    case confirm(CloudRequest, lines: [String])
    case loading(slow: Bool)
    case done(TaskResult, sentBefore: Bool)
    case failed(TaskError)
    case skipped
    case cancelled
}

extension AppModel {
    static let slowAfter: Duration = .seconds(15)
    static let chips = AnswerInputs.chips

    func reasons(_ programId: String) -> Raw<[CriterionReason]> {
        session.reasons(pack: bundle.pack, bands: bundle.bands, programId: programId)
    }

    func whyRows(_ programId: String) -> [WhyRow] {
        AnswerInputs.whyRows(bundle, programId: programId, reasons: reasons(programId), locale: locale, currency: bundle.packInfo.currency,
                             format: bundle.packInfo.numberFormat)
    }

    func state(_ key: String) -> RequestState {
        if let s = requests[key] { return s }
        if let cached = answers.answer(key) { return .done(cached, sentBefore: false) }
        return .idle
    }

    /// The device has no network path (Results shows the offline note).
    var isOffline: Bool { forceOffline || !network.isOnline }

    /// Whether anything has actually left this device (the results lead says so).
    var anythingLeft: Bool { outbound.contains(where: \.left) }

    // MARK: Requests with the step before sending

    /// The program's public information in the UI language: all a general explanation is given.
    private func publicFacts(_ programId: String) -> Public<ProgramFacts>? {
        AnswerInputs.programFacts(bundle, programId: programId, locale: locale)
    }

    func aboutKey(_ programId: String, long: Bool) -> String {
        AnswerSession.key(long ? "explain-long" : "explain-short", locale.rawValue, programId)
    }

    func chipKey(_ programId: String, _ chip: String) -> String {
        AnswerSession.key("ask-chip", locale.rawValue, programId, chip)
    }

    /// What the step before sending lists: nothing about the person, the program, the question.
    private func publicLines(_ programId: String, question: String? = nil) -> [String] {
        [t("send.linePublic"), t("send.line.program", ["value": programName(programId)])]
            + (question.map { [t("send.line.question", ["value": $0])] } ?? [])
    }

    func startAbout(_ programId: String, long: Bool) {
        guard let facts = publicFacts(programId), let template = explainTemplate else { return }
        let request = Planner.explain(facts, locale: locale, long: long, template: template, config: currentConfig)
        start(aboutKey(programId, long: long), request: request, content: "program|\(programId)|\(locale.rawValue)", lines: publicLines(programId))
    }

    func startChip(_ programId: String, _ chip: String) {
        guard let facts = publicFacts(programId), let template = askTemplate,
              let question = AnswerInputs.chipQuestion(bundle, chip: chip, locale: locale) else { return }
        let request = Planner.askChip(facts, question: question, locale: locale, template: template)
        start(chipKey(programId, chip), request: request, content: "program|\(programId)|\(locale.rawValue)|\(chip)",
              lines: publicLines(programId, question: question.value))
    }

    var currentConfig: AppConfig {
        lastConfig ?? AppConfig(values: bundle.remoteConfigTemplate.map(AppConfig.defaultValues) ?? [:])
    }

    /// Only versions that send nothing about the person are bundled for use: explain 5, ask 4.
    var explainTemplate: PromptTemplate? {
        bundle.prompts.versioned("explain", version: currentConfig.promptExplainV, among: 5...5)
    }

    var askTemplate: PromptTemplate? {
        bundle.prompts.versioned("ask", version: currentConfig.promptAskV, among: 4...4)
    }

    private func start(_ key: String, request: CloudRequest, content: String, lines: [String]) {
        if answers.answer(key) != nil { requests[key] = nil; return }
        if case .loading = state(key) { return }
        let destination = AnswerSession.destination(of: request)
        if answers.needsConsent(content, destination) {
            pendingContent[key] = content
            requests[key] = .confirm(request, lines: lines)
            sheet = .send(key)
            return
        }
        run(key, request: request, content: content, sentBefore: answers.wasSent(content))
    }

    /// Send, after the step before sending.
    func send(_ key: String) {
        guard case .confirm(let request, _) = state(key), let content = pendingContent[key] else { return }
        answers.giveConsent(content, AnswerSession.destination(of: request))
        if sheet == .send(key) { sheet = nil }
        run(key, request: request, content: content, sentBefore: false)
    }

    /// "Keep everything on this device".
    func keepOnDevice(_ key: String) {
        if sheet == .send(key) { sheet = nil }
        guard case .confirm = state(key) else { return }
        pendingContent[key] = nil
        requests[key] = .skipped
    }

    func cancel(_ key: String) {
        tasks[key]?.cancel()
        tasks[key] = nil
        requests[key] = .cancelled
    }

    private func run(_ key: String, request: CloudRequest, content: String, sentBefore: Bool) {
        requests[key] = .loading(slow: false)
        let runner = self.runner
        tasks[key] = Task { [weak self] in
            let slow = Task { [weak self] in
                try? await Task.sleep(for: Self.slowAfter)
                guard !Task.isCancelled, let self, case .loading = self.requests[key] else { return }
                self.requests[key] = .loading(slow: true)
            }
            defer { slow.cancel() }
            do {
                let result = try await runner.runText(request)
                guard let self, !Task.isCancelled else { return }
                if result.source == .inCloud { self.answers.markSent(content) }
                self.answers.store(key, result)
                self.requests[key] = .done(result, sentBefore: sentBefore)
                self.lastConfig = await self.remoteConfig.current()
            } catch {
                guard let self, !Task.isCancelled else { return }
                let e = (error as? TaskError) ?? TaskError(.unknown, "task")
                if e.status != nil { self.answers.markSent(content) }
                self.requests[key] = .failed(e)
            }
        }
    }

    // MARK: On the device only (Raw input)

    func personalKey(_ programId: String) -> String { AnswerSession.key("explain-personal", locale.rawValue, programId) }

    func explainPersonal(_ programId: String) {
        guard let template = bundle.prompts["explain-personal.v1"], let verdict = result(programId)?.verdict else { return }
        let request = Planner.explainPersonal(
            AnswerInputs.personalResult(bundle, programId: programId, verdict: verdict, reasons: reasons(programId), locale: locale),
            template: template)
        runOnDevice(personalKey(programId), request)
    }

    func askFree(_ programId: String, question: String) -> String {
        let key = AnswerSession.key("ask-free", locale.rawValue, programId, UUID().uuidString)
        guard let template = bundle.prompts["ask-personal.v1"], let verdict = result(programId)?.verdict else { return key }
        let request = Planner.askFreeText(
            Raw(question),
            result: AnswerInputs.personalResult(bundle, programId: programId, verdict: verdict, reasons: reasons(programId), locale: locale),
            template: template)
        runOnDevice(key, request)
        return key
    }

    private func runOnDevice(_ key: String, _ request: DeviceRequest) {
        requests[key] = .loading(slow: false)
        let runner = self.runner
        tasks[key] = Task { [weak self] in
            do {
                let result = try await runner.runPersonal(request)
                guard let self, !Task.isCancelled else { return }
                self.requests[key] = .done(result, sentBefore: false)
            } catch {
                guard let self, !Task.isCancelled else { return }
                self.requests[key] = .failed((error as? TaskError) ?? TaskError(.unknown, "task"))
            }
        }
    }
}
