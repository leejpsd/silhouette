// Runs the requests of shared/routing.json through a ModelPort:
// - PREFER_ON_DEVICE: the device when its model is available; if the device fails, the same
//   cloud-safe request is repeated once with ONLY_IN_CLOUD (routing.json `onDeviceFailure`,
//   reason `on-device-failed`). Without a device model it goes to the cloud directly.
// - PREFER_IN_CLOUD: the cloud; the device only when the cloud cannot be reached.
// - ONLY_IN_CLOUD: the cloud. ONLY_ON_DEVICE (Raw input): the device, never the cloud.
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
}

public final class TaskRunner: Sendable {
    public static let cloudDestination = "firebasevertexai.googleapis.com"
    public static let onDeviceModelVersion = "apple-foundation-models-system-language-model"

    let port: any ModelPort
    let log: OutboundLog
    let outputChecks: JSON
    /// Runs before every cloud request (fetches Remote Config the first time).
    let beforeCloudRequest: @Sendable () async -> Void
    /// Fields the first cloud request also carries because the SDK makes them for it.
    let firstRequestFields: [String]
    private let state = Mutex()

    public init(port: any ModelPort, log: OutboundLog, outputChecks: JSON, firstRequestFields: [String] = [],
                beforeCloudRequest: @escaping @Sendable () async -> Void = {}) {
        self.port = port
        self.log = log
        self.outputChecks = outputChecks
        self.firstRequestFields = firstRequestFields
        self.beforeCloudRequest = beforeCloudRequest
    }

    // MARK: Primitive calls

    private func checkCancelled() throws(TaskError) {
        if Task.isCancelled { throw TaskError(.cancelled, "cancelled by the person") }
    }

    private func onDevice(_ call: DeviceCall, fields: [String]) async throws(TaskError) -> ModelReply {
        do {
            let reply = try await port.generateOnDevice(call)
            try checkCancelled()
            log.record(OutboundEntry(channel: .aiCloud, destination: "this device", fields: fields, status: .answeredOnDevice))
            return reply
        } catch let e as TaskError {
            throw e
        } catch {
            if Task.isCancelled { throw TaskError(.cancelled, "cancelled by the person") }
            throw TaskError(.onDeviceUnavailable, String(describing: type(of: error)))
        }
    }

    private func inCloud(_ request: CloudRequest) async throws(TaskError) -> ModelReply {
        await beforeCloudRequest()
        try checkCancelled()
        let first = state.takeFirstCloudRequest()
        let entry = OutboundEntry(channel: .aiCloud, destination: Self.cloudDestination,
                                  fields: request.fields + (first ? firstRequestFields : []) + ["model-request"],
                                  payload: request.rendering, status: .attempted, model: request.model)
        log.record(entry)
        do {
            let reply = try await port.generateInCloud(request)
            log.update(entry.id, status: .sent(200))
            try checkCancelled()
            return reply
        } catch let e as TaskError {
            log.update(entry.id, status: .failed(e.status.map { "HTTP \($0)" } ?? e.kind.rawValue))
            throw e
        } catch {
            let e = Task.isCancelled ? TaskError(.cancelled, "cancelled by the person") : TaskError(.unknown, String(describing: type(of: error)))
            log.update(entry.id, status: .failed(e.kind.rawValue))
            throw e
        }
    }

    // MARK: Routing

    private func route(_ request: CloudRequest, accept: (ModelReply) -> Bool = { _ in true }) async throws(TaskError)
        -> (ModelReply, InferenceSource, RoutingReason, Bool) {
        switch request.mode {
        case .preferOnDevice:
            let call = request.deviceCall
            guard port.deviceAvailability() == .available else {
                return (try await inCloud(request), .inCloud, request.reason, true)
            }
            if !Planner.exceedsDeviceLimit(call) {
                do {
                    let reply = try await onDevice(call, fields: request.fields)
                    if accept(reply) { return (reply, .onDevice, request.reason, false) }
                } catch {
                    if error.kind == .cancelled { throw error }
                }
            }
            // The device could not answer: the same cloud-safe request, once, in the cloud.
            return (try await inCloud(request), .inCloud, .onDeviceFailed, false)
        case .preferInCloud:
            do {
                return (try await inCloud(request), .inCloud, request.reason, false)
            } catch {
                guard error.kind == .network, port.deviceAvailability() == .available else { throw error }
                return (try await onDevice(request.deviceCall, fields: request.fields), .onDevice, request.reason, false)
            }
        case .onlyInCloud:
            return (try await inCloud(request), .inCloud, request.reason, false)
        case .onlyOnDevice:
            return (try await onDevice(request.deviceCall, fields: request.fields), .onDevice, request.reason, false)
        }
    }

    private func blocked(_ text: String, _ scope: OutputCheck.Scope?, _ locale: AppLocale) -> Bool {
        guard let scope else { return false }
        return OutputCheck.isBlocked(text, locale: locale.rawValue, scope: scope, checks: outputChecks)
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
        guard port.deviceAvailability() == .available else { throw TaskError(.onDeviceUnavailable, "no device model") }
        guard !Planner.exceedsDeviceLimit(request.call) else { throw TaskError(.onDeviceUnavailable, "input too long for the device model") }
        for _ in 0..<2 {
            let reply = try await onDevice(request.call, fields: [])
            let text = reply.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !blocked(text, request.checks, request.locale) {
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

    /// document.pointer.extract. A device reply that is not a JSON object counts as a device failure.
    public func extractPointers(_ request: CloudRequest) async throws(TaskError) -> PointerOutcome {
        let (reply, source, reason, _) = try await route(request, accept: { Self.parsePointers($0.text) != nil })
        guard let pointers = Self.parsePointers(reply.text) else { throw TaskError(.badOutput, "the reply is not a JSON object") }
        return PointerOutcome(pointers: pointers, source: source, reason: reason)
    }
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
