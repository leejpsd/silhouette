// Runs the requests of shared/routing.json through a ModelPort:
// - PREFER_ON_DEVICE and PREFER_IN_CLOUD (cloud-safe input): the SDK's hybrid model chooses. Device
//   first: Apple's on-device model; when it is not available or its request fails, the SDK hands the
//   same request to the cloud model. Cloud first: the cloud model; when it fails, the on-device model.
//   The badge is what the SDK reports (the reply's model version). What the app still does itself:
//   - a device answer the SDK returns but that fails the app's checks (not a JSON object) is not a
//     failure to the SDK: the app repeats it once with ONLY_IN_CLOUD (routing.json `onDeviceFailure`,
//     reason `on-device-failed`);
//   - App Check and the record at the moment the SDK hands a request to the cloud (`CloudGate`);
//   - a paystub read on the device in parts (each part ONLY_ON_DEVICE with its own constraint, then
//     the reading rules), and a document read in one request on a device with a model: the device
//     needs the schema in its prompt, and a hybrid request has one prompt and one schema for both.
// - ONLY_IN_CLOUD: the cloud model alone. ONLY_ON_DEVICE (Raw input): the on-device model alone,
//   never the cloud.
// Every cloud request is recorded in the outgoing record before it is made, then marked sent or
// failed. A text that states a result is asked for once more, then refused (OUTPUT_CHECKS.md).

import Foundation
import SilhouetteCore

public struct TaskResult: Sendable {
    public let text: String
    public let source: InferenceSource
    public let reason: RoutingReason
    public let route: ExplainRoute?
    /// A device-first request ran in the cloud because this device has no model.
    public let noDeviceModel: Bool
}

public struct PointerOutcome: Sendable {
    /// Untrusted pointer JSON (nulls removed); the Rehydrator validates every reference.
    public let pointers: JSON
    public let source: InferenceSource
    public let reason: RoutingReason
    /// Fields left out as not read on this device (DEVICE_READING.md sections 5 and 6).
    public var notRead: [String] = []
    /// What the device answered, part by part, when it was asked (placeholder ids only).
    public var attempt: DeviceAttempt? = nil
}

/// The on-device reading of a document, for the review screen and the on-device check.
public struct DeviceAttempt: Sendable {
    public let passes: [DeviceReading.Pass]
    /// The problems that made it fail (empty when it passed).
    public let problems: [String]
}

/// A failed on-device reading when the person chose to keep everything on the device.
public struct DeviceReadingFailed: Error, Sendable {
    public let error: TaskError
    public let attempt: DeviceAttempt?
}

/// The step a reading is on, for the status line (DEVICE_READING.md section 7).
public enum ReadingStage: String, Sendable {
    case deviceReading = "device-reading"
    case deviceGross = "device-gross"
    case deviceDeductions = "device-deductions"
    case checking
    case sendingAfterDevice = "sending-after-device"

    public var copyKey: String {
        switch self {
        case .deviceReading: "preview.stage.deviceReading"
        case .deviceGross: "preview.stage.deviceGross"
        case .deviceDeductions: "preview.stage.deviceDeductions"
        case .checking: "preview.stage.checking"
        case .sendingAfterDevice: "preview.stage.sendingAfterDevice"
        }
    }
}

/// What a paystub is read with on a device in parts (pointer-extract.v5.md with
/// pointer-extract-device.v1.md): the prompt, the part texts, the schema and the silhouette's map,
/// which the checks use on the device and which is never sent.
public struct ReadingInParts: Sendable {
    let template: PromptTemplate
    let parts: [String: String]
    let schema: JSON
    let skeleton: Skeleton
    let map: Raw<PlaceholderMap>
    let jurisdiction: String
    let docType: String
    /// The document's language: net-pay labels for the confirmation rules (DEVICE_READING.md section 5.1).
    let language: String

    public init(template: PromptTemplate, parts: [String: String], schema: JSON, skeleton: Skeleton, map: Raw<PlaceholderMap>,
                jurisdiction: String, language: String = "en", docType: String = "paystub") {
        self.language = language
        self.template = template
        self.parts = parts
        self.schema = schema
        self.skeleton = skeleton
        self.map = map
        self.jurisdiction = jurisdiction
        self.docType = docType
    }

    /// A schema with a list field is read in parts; one without (a lease) in one request.
    var hasListField: Bool { DeviceReading.partFields(schema, .deductions).count > 0 }
}

public final class TaskRunner: Sendable {
    public static let cloudDestination = "firebasevertexai.googleapis.com"
    public static let onDeviceModelVersion = "apple-foundation-models-system-language-model"

    let port: any ModelPort
    let log: OutboundLog
    let outputChecks: JSON
    /// Runs after every cloud request that left (fetches Remote Config the first time: shared/RECORD.md
    /// section 1, after the first request the person chose to send).
    let afterCloudRequest: @Sendable () async -> Void
    /// Fields the first cloud request also carries because the SDK makes them for it.
    let firstRequestFields: [String]
    private let state = Mutex()

    public init(port: any ModelPort, log: OutboundLog, outputChecks: JSON, firstRequestFields: [String] = [],
                afterCloudRequest: @escaping @Sendable () async -> Void = {}) {
        self.port = port
        self.log = log
        self.outputChecks = outputChecks
        self.firstRequestFields = firstRequestFields
        self.afterCloudRequest = afterCloudRequest
    }

    // MARK: Primitive calls

    private func checkCancelled() throws(TaskError) {
        if Task.isCancelled { throw TaskError(.cancelled, "cancelled by the person") }
    }

    /// Records an answer written on this device: kept, never sent (`kept:document`, `kept:about`, `kept:ask`).
    private func recordKept(_ kind: String) {
        log.record(OutboundEntry(channel: .aiCloud, destination: "this device", fields: ["kept:\(kind)"], status: .answeredOnDevice))
    }

    private static func keptKind(_ taskId: String) -> String {
        switch taskId {
        case "document.pointer.extract": "document"
        case "ask.chip": "ask"
        default: "about"
        }
    }

    /// A call to the on-device model. Checks availability before any SDK call, so a request that must
    /// stay on the device is never handed to an SDK path that could send it elsewhere.
    private func onDevice(_ call: DeviceCall, kept: String?) async throws(TaskError) -> ModelReply {
        let availability = port.deviceAvailability()
        guard availability == .available else { throw Self.unavailable(availability) }
        do {
            let reply = try await port.generateOnDevice(call)
            try checkCancelled()
            if let kept { recordKept(kept) }
            return reply
        } catch let e as TaskError {
            throw e
        } catch {
            if Task.isCancelled { throw TaskError(.cancelled, "cancelled by the person") }
            throw TaskError(.onDeviceUnavailable, String(describing: error).prefix(300).description, origin: "sdk",
                            errorType: String(reflecting: type(of: error)))
        }
    }

    /// The availability guard's error: the state the system reported, before any SDK call.
    static func unavailable(_ availability: DeviceAvailability) -> TaskError {
        TaskError(.onDeviceUnavailable, "the on-device model is not available (\(availability.rawValue))",
                  origin: "availability-guard", errorType: "DeviceAvailability.\(availability.rawValue)")
    }

    /// The app's step around one cloud request (`CloudGate`): App Check first (no token, no request),
    /// then the request in the record as attempted before it leaves; after it, sent or failed.
    private func cloudGate(_ request: CloudRequest) -> CloudGate {
        let entryId = EntryBox()
        return CloudGate(open: { [self] in
            if Task.isCancelled { throw TaskError(.cancelled, "cancelled by the person") }
            // No token, no request: the App Check token is obtained first; without one the model request is
            // recorded as stopped before it left, and not made.
            if let destination = port.appCheckDestination {
                let token = OutboundEntry(channel: .appCheck, destination: destination, fields: ["app-check-token-request"], status: .attempted)
                log.record(token)
                do {
                    try await port.confirmAppCheck()
                    log.update(token.id, status: .sent(200))
                } catch {
                    log.update(token.id, status: .failed("App Check"))
                    log.record(OutboundEntry(channel: .aiCloud, destination: Self.cloudDestination, fields: request.fields + ["model-request"],
                                             payload: request.rendering, status: .blocked("noAppCheck"), model: request.model))
                    throw TaskError(.appCheck, "no App Check token: \(String(describing: error).prefix(200))", origin: "app-check-guard",
                                    errorType: String(reflecting: type(of: error)))
                }
                if Task.isCancelled { throw TaskError(.cancelled, "cancelled by the person") }
            }
            let first = state.takeFirstCloudRequest()
            let entry = OutboundEntry(channel: .aiCloud, destination: Self.cloudDestination,
                                      fields: request.fields + (first ? firstRequestFields : []) + ["model-request"],
                                      payload: request.rendering, status: .attempted, model: request.model, silhouette: request.silhouette)
            log.record(entry)
            entryId.set(entry.id)
        }, close: { [self] error in
            guard let id = entryId.value else { return }
            log.update(id, status: error.map { .failed($0.status.map { "HTTP \($0)" } ?? $0.kind.rawValue) } ?? .sent(200))
            Task { await afterCloudRequest() }
        })
    }

    /// ONLY_IN_CLOUD: the cloud model alone.
    private func inCloud(_ request: CloudRequest) async throws(TaskError) -> ModelReply {
        try checkCancelled()
        let gate = cloudGate(request)
        do { try await gate.open() } catch { throw Self.taskError(error) }
        do {
            let reply = try await port.generateInCloud(request)
            gate.close(nil)
            try checkCancelled()
            return reply
        } catch let e as TaskError {
            gate.close(e)
            throw e
        } catch {
            let e = Task.isCancelled ? TaskError(.cancelled, "cancelled by the person") : TaskError(.unknown, String(describing: type(of: error)))
            gate.close(e)
            throw e
        }
    }

    private static func taskError(_ error: Error) -> TaskError {
        if let e = error as? TaskError { return e }
        if error is CancellationError || Task.isCancelled { return TaskError(.cancelled, "cancelled by the person") }
        return TaskError(.unknown, String(describing: type(of: error)))
    }

    /// Where a hybrid reply was written, as the SDK reports it: the on-device model's version, or the
    /// cloud model's name (firebase-ios-sdk 12.19.3: LanguageModelSession+ModelSession.swift sets
    /// `apple-foundation-models-system-language-model`; a Gemini reply carries the backend's `modelVersion`).
    static func source(of reply: ModelReply) -> InferenceSource {
        reply.modelVersion == onDeviceModelVersion ? .onDevice : .inCloud
    }

    /// A cloud-safe request through the SDK's hybrid model. The SDK chooses; the app records what it chose.
    private func hybrid(_ request: CloudRequest, order: HybridOrder) async throws(TaskError) -> (ModelReply, InferenceSource) {
        try checkCancelled()
        let gate = cloudGate(request)
        let reply: ModelReply
        do {
            reply = try await port.generateHybrid(request, order: order, gate: gate)
        } catch {
            throw gate.cloudError ?? Self.taskError(error)
        }
        try checkCancelled()
        let source = Self.source(of: reply)
        if source == .onDevice { recordKept(Self.keptKind(request.taskId)) }
        return (reply, source)
    }

    // MARK: Routing

    private func route(_ request: CloudRequest, accept: (ModelReply) -> Bool = { _ in true }) async throws(TaskError)
        -> (ModelReply, InferenceSource, RoutingReason, Bool) {
        switch request.mode {
        case .preferOnDevice:
            // Whether this device has a model decides the reason shown when the SDK used the cloud: no
            // model here (the task's own reason), or the device failed (`on-device-failed`). The SDK asks
            // the same system model for its availability before it starts a device session.
            let deviceAvailable = port.deviceAvailability() == .available
            let (reply, source) = try await hybrid(request, order: .deviceFirst)
            if source == .onDevice {
                if accept(reply) { return (reply, .onDevice, request.reason, false) }
                // The device answered but the answer fails the app's checks. The SDK returned it as an
                // answer, so the retry of routing.json `onDeviceFailure` is the app's: once, ONLY_IN_CLOUD.
                return (try await inCloud(request), .inCloud, .onDeviceFailed, false)
            }
            return (reply, .inCloud, deviceAvailable ? .onDeviceFailed : request.reason, !deviceAvailable)
        case .preferInCloud:
            // The SDK falls back to the device when the cloud request fails for any reason (no App Check
            // token, an HTTP error, the network), not only offline; the input is public, so that is safe.
            let (reply, source) = try await hybrid(request, order: .cloudFirst)
            return (reply, source, request.reason, false)
        case .onlyInCloud:
            return (try await inCloud(request), .inCloud, request.reason, false)
        case .onlyOnDevice:
            return (try await onDevice(request.deviceCall, kept: Self.keptKind(request.taskId)), .onDevice, request.reason, false)
        }
    }

    /// A document read in one request on a device that has a model: the app's own device-first step.
    /// The on-device call carries the schema in its prompt (the device has no parameter for the cloud's
    /// `responseSchema`), so the device and the cloud get different prompts, which a hybrid request
    /// cannot do (one prompt and one schema for both; given a schema, the SDK replaces the cloud's
    /// `responseSchema` with its own conversion of it: GeminiModelSession.swift `buildConfig`).
    private func deviceThenCloud(_ request: CloudRequest, accept: (ModelReply) -> Bool) async throws(TaskError)
        -> (ModelReply, InferenceSource, RoutingReason) {
        let call = request.deviceCall
        if !Planner.exceedsDeviceLimit(call) {
            do {
                let reply = try await onDevice(call, kept: Self.keptKind(request.taskId))
                if accept(reply) { return (reply, .onDevice, request.reason) }
            } catch {
                if error.kind == .cancelled { throw error }
            }
        }
        // The device could not answer: the same cloud-safe request, once, in the cloud.
        return (try await inCloud(request), .inCloud, .onDeviceFailed)
    }

    private func blocked(_ text: String, _ scope: OutputCheck.Scope?, _ locale: AppLocale, verdict: String? = nil) -> Bool {
        guard let scope else { return false }
        return OutputCheck.isBlocked(text, locale: locale.rawValue, scope: scope, checks: outputChecks, verdict: verdict)
    }

    // MARK: Tasks

    /// explain.short, explain.long, ask.chip.
    public func runText(_ request: CloudRequest) async throws(TaskError) -> TaskResult {
        for _ in 0..<2 {
            let (reply, source, reason, noModel) = try await route(request)
            let text = reply.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !blocked(text, request.checks, request.locale) {
                return TaskResult(text: text, source: source, reason: reason, route: request.route, noDeviceModel: noModel)
            }
        }
        throw TaskError(.blocked, "the reply stated a result twice")
    }

    /// explain.personal and ask.freeText: the device only. Without a device model the caller shows
    /// the rule engine's reasons (or the prepared questions) instead.
    public func runPersonal(_ request: DeviceRequest) async throws(TaskError) -> TaskResult {
        let availability = port.deviceAvailability()
        guard availability == .available else { throw Self.unavailable(availability) }
        guard !Planner.exceedsDeviceLimit(request.call) else {
            throw TaskError(.onDeviceUnavailable, "input longer than \(Planner.onDeviceCharacterBudget) characters", origin: "input-length-guard",
                            errorType: "Planner.onDeviceCharacterBudget")
        }
        for _ in 0..<2 {
            // ONLY_ON_DEVICE with Raw input: never recorded as a request, it cannot leave.
            let reply = try await onDevice(request.call, kept: nil)
            let text = reply.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !blocked(text, request.checks, request.locale, verdict: request.verdict) {
                return TaskResult(text: text, source: .onDevice, reason: request.reason, route: nil, noDeviceModel: false)
            }
        }
        throw TaskError(.blocked, "the reply stated a result twice")
    }

    static func parsePointers(_ text: String) -> JSON? {
        var t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.hasPrefix("```") {
            t = t.components(separatedBy: "\n").dropFirst().joined(separator: "\n")
            if let end = t.range(of: "```", options: .backwards) { t = String(t[..<end.lowerBound]) }
        }
        guard case .object(let o)? = try? JSON.parse(t) else { return nil }
        return .object(JSONObject(o.entries.filter { !$0.value.isNull }))
    }

    /// document.pointer.extract (PREFER_ON_DEVICE, Skeleton input).
    /// - On a device whose model is available, with `inParts`: the paystub is read in parts, every
    ///   answer checked (DEVICE_READING.md). A core that does not hold up is a failed on-device attempt:
    ///   repeated once in the cloud (reason `on-device-failed`), or, when the person chose to keep
    ///   everything on the device, nothing is sent and `DeviceReadingFailed` is thrown.
    ///   This is the app's own step, not the SDK's hybrid model: each part is ONLY_ON_DEVICE with its own
    ///   prompt and constraint, and whether the reading holds up is decided by the reading rules, which
    ///   the SDK cannot see (to the SDK every part that returns is an answer).
    /// - On a device with a model, otherwise: one request, device first (a reply that is not a JSON object
    ///   is a device failure), also the app's own step (`deviceThenCloud`).
    /// - Without a model on this device: one request through the SDK's hybrid model, which hands it to the
    ///   cloud model; the source is what the SDK reports.
    /// - `keepOnDevice`: the cloud is never used (the on-device model alone).
    public func extractPointers(_ request: CloudRequest, inParts: ReadingInParts? = nil, keepOnDevice: Bool = false,
                                progress: @Sendable (ReadingStage) -> Void = { _ in }) async throws -> PointerOutcome {
        let available = port.deviceAvailability() == .available
        if keepOnDevice && !available { throw Self.unavailable(port.deviceAvailability()) }
        if available, let inParts, inParts.hasListField {
            let reading = try await readInParts(inParts, progress: progress)
            switch reading.outcome {
            case .onDevice(let pointers, let notRead):
                recordKept("document")
                return PointerOutcome(pointers: pointers, source: .onDevice, reason: request.reason, notRead: notRead,
                                      attempt: DeviceAttempt(passes: reading.passes, problems: []))
            case .failed(let problems):
                let attempt = DeviceAttempt(passes: reading.passes, problems: problems)
                if keepOnDevice { throw DeviceReadingFailed(error: TaskError(.onDeviceUnreliable, "the device could not read the silhouette reliably"), attempt: attempt) }
                progress(.sendingAfterDevice)
                // A cloud failure after a failed on-device attempt keeps the device's answer for diagnosis.
                let reply: ModelReply
                do { reply = try await inCloud(request) } catch { throw DeviceReadingFailed(error: error, attempt: attempt) }
                guard let pointers = Self.parsePointers(reply.text) else {
                    throw DeviceReadingFailed(error: TaskError(.badOutput, "the reply is not a JSON object"), attempt: attempt)
                }
                return PointerOutcome(pointers: pointers, source: .inCloud, reason: .onDeviceFailed, attempt: attempt)
            }
        }
        if keepOnDevice {
            progress(.deviceReading)
            let reply: ModelReply
            do { reply = try await onDevice(request.deviceCall, kept: nil) } catch {
                if error.kind == .cancelled { throw error }
                throw DeviceReadingFailed(error: TaskError(.onDeviceUnreliable, "the device could not read the silhouette"), attempt: nil)
            }
            guard let pointers = Self.parsePointers(reply.text) else {
                throw DeviceReadingFailed(error: TaskError(.onDeviceUnreliable, "the device's reply is not a JSON object"), attempt: nil)
            }
            recordKept("document")
            return PointerOutcome(pointers: pointers, source: .onDevice, reason: request.reason)
        }
        let isJSON: (ModelReply) -> Bool = { Self.parsePointers($0.text) != nil }
        let reply: ModelReply, source: InferenceSource, reason: RoutingReason
        if available {
            progress(.deviceReading)
            (reply, source, reason) = try await deviceThenCloud(request, accept: isJSON)
        } else {
            // No model on this device: the SDK's hybrid model finds the system model unavailable and hands
            // the silhouette to the cloud model.
            (reply, source, reason, _) = try await route(request, accept: isJSON)
        }
        guard let pointers = Self.parsePointers(reply.text) else { throw TaskError(.badOutput, "the reply is not a JSON object") }
        return PointerOutcome(pointers: pointers, source: source, reason: reason)
    }

    /// The parts of DEVICE_READING.md section 3, each `ONLY_ON_DEVICE` with its strict constraint.
    private func readInParts(_ plan: ReadingInParts, progress: @Sendable (ReadingStage) -> Void) async throws -> DeviceReading.Reading {
        try await DeviceReading.read(schema: plan.schema, skeleton: plan.skeleton.text, map: plan.map, jurisdiction: plan.jurisdiction,
                                     language: plan.language) { part in
            switch part {
            case .core, .whole: progress(.deviceReading)
            case .gross: progress(.deviceGross)
            case .deductions, .deductionsAgain: progress(.deviceDeductions)
            }
            defer { progress(.checking) }
            let constraint = DeviceReading.constraint(schema: plan.schema, skeleton: plan.skeleton.text, part: part)
            let build = { (constraintText: Bool?) in
                Planner.devicePart(plan.skeleton, docType: plan.docType, template: plan.template, partText: plan.parts[part.rawValue] ?? "",
                                   part: part.rawValue, constraint: constraint, pointerSchema: plan.schema, constraintText: constraintText)
            }
            var call = build(nil)
            let started = Date()
            do throws(TaskError) {
                let reply: ModelReply
                do throws(TaskError) {
                    reply = try await onDevice(call, kept: nil)
                } catch where error.origin == DeviceBudget.contextWindowOrigin && call.schemaInPrompt {
                    // The estimate was short for this model: the same part, the same constraint, once more
                    // with the part's fields in short form instead of the constraint's text.
                    call = build(false)
                    reply = try await onDevice(call, kept: nil)
                }
                return DeviceReading.PartAnswer(text: reply.text, seconds: Date().timeIntervalSince(started), schemaInPrompt: call.schemaInPrompt)
            } catch {
                if error.kind == .cancelled { throw error }
                return DeviceReading.PartAnswer(text: nil, error: error.kind.rawValue, seconds: Date().timeIntervalSince(started),
                                                failure: DeviceReading.Failure(origin: error.origin ?? "app", type: error.errorType ?? "TaskError",
                                                                               message: error.detail),
                                                schemaInPrompt: call.schemaInPrompt)
            }
        }
    }
}

/// The record entry of one cloud request, set when the request is recorded.
final class EntryBox: @unchecked Sendable {
    private let lock = NSLock()
    private var id: UUID?
    func set(_ value: UUID) { lock.withLock { id = value } }
    var value: UUID? { lock.withLock { id } }
}

/// Tracks whether the first cloud request of this run has been made.
final class Mutex: @unchecked Sendable {
    private let lock = NSLock()
    private var first = true
    func takeFirstCloudRequest() -> Bool { lock.withLock { defer { first = false }; return first } }
}

/// Reads document silhouettes with a model through the runner (PREFER_ON_DEVICE).
public struct ModelPointerExtractor: PointerExtractor {
    let runner: TaskRunner
    let template: PromptTemplate
    let schema: JSON
    let canRun: @Sendable () -> Bool

    /// - Parameter canRun: whether a model can be reached now (device model or network and configuration).
    public init(runner: TaskRunner, template: PromptTemplate, schema: JSON, canRun: @escaping @Sendable () -> Bool) {
        self.runner = runner
        self.template = template
        self.schema = schema
        self.canRun = canRun
    }

    public var destination: String { TaskRunner.cloudDestination }

    public func canRead(_ skeleton: Skeleton, language: AppLocale) -> Bool { canRun() }

    public func extract(_ request: PointerRequest) async throws -> PointerResult {
        let cloud = try Planner.pointers(request.skeleton, docType: request.docType, language: request.language,
                                         template: template, pointerSchema: schema)
        let outcome = try await runner.extractPointers(cloud)
        return PointerResult(pointers: outcome.pointers, source: outcome.source, reason: outcome.reason)
    }
}

// MARK: - Consent and the session cache

/// Answers of this session (memory only), what the person agreed to send, per content and
/// destination, and what has actually left. "Delete everything" clears it.
public struct AnswerSession: Sendable {
    /// Where a request goes first. Agreeing to "may be sent if this device can't" (device-first) does
    /// not cover a request that goes to the cloud first.
    public enum Destination: String, Sendable { case deviceFirst, cloud }

    var consents: Set<String> = []
    var sent: Set<String> = []
    var answers: [String: TaskResult] = [:]

    public init() {}

    public static func destination(of request: CloudRequest) -> Destination {
        request.mode == .preferOnDevice || request.mode == .onlyOnDevice ? .deviceFirst : .cloud
    }

    /// The step before sending is needed unless this content was agreed to for this destination, or
    /// has already reached the cloud in this session.
    public func needsConsent(_ content: String, _ destination: Destination) -> Bool {
        !sent.contains(content) && !consents.contains("\(content)|\(destination.rawValue)")
    }

    public mutating func giveConsent(_ content: String, _ destination: Destination) {
        consents.insert("\(content)|\(destination.rawValue)")
    }

    public mutating func markSent(_ content: String) { sent.insert(content) }
    public func wasSent(_ content: String) -> Bool { sent.contains(content) }

    /// Cache key: task kind, language, canonical silhouette, program and question.
    public static func key(_ parts: String...) -> String { parts.joined(separator: "|") }
    public func answer(_ key: String) -> TaskResult? { answers[key] }
    public mutating func store(_ key: String, _ result: TaskResult) { answers[key] = result }
    public mutating func clear() { self = AnswerSession() }
}
