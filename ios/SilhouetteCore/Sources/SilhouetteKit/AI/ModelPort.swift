// The port between the app's tasks and a language model. The app implements it with Firebase AI
// Logic; tests implement it with fakes. Two methods, one per place a request can run:
// - `generateInCloud` takes a `CloudRequest`, which can only be built from cloud-safe values;
// - `generateOnDevice` takes a `DeviceCall`, built either from a `CloudRequest` (device-first tasks)
//   or from a `DeviceRequest` that holds Raw values (ONLY_ON_DEVICE tasks).

import Foundation
import SilhouetteCore

public enum DeviceAvailability: String, Sendable {
    case available
    case deviceNotEligible
    case appleIntelligenceNotEnabled
    case modelNotReady
    case unavailable
}

public enum RoutingMode: String, Sendable {
    case onlyOnDevice = "ONLY_ON_DEVICE"
    case preferOnDevice = "PREFER_ON_DEVICE"
    case preferInCloud = "PREFER_IN_CLOUD"
    case onlyInCloud = "ONLY_IN_CLOUD"
}

/// What a model returned and where it ran.
public struct ModelReply: Sendable {
    public let text: String
    /// The SDK's model version (`apple-foundation-models-system-language-model` on the device).
    public let modelVersion: String

    public init(text: String, modelVersion: String) {
        self.text = text
        self.modelVersion = modelVersion
    }
}

/// A request to the on-device model. Its texts may hold Raw values; it can only be handed to
/// `ModelPort.generateOnDevice`.
public struct DeviceCall: Sendable {
    public let taskId: String
    public let system: String
    public let prompt: String
    public let maxOutputTokens: Int
    /// The strict response constraint of a reading part (JSON Schema, DEVICE_READING.md section 2),
    /// when the call has one. The port converts it to what its on-device API accepts, without loosening it.
    public let constraint: JSON?
    /// The reading part (`core`, `gross`, `deductions`, `deductions-again`), when the call is one.
    public let part: String?
    /// Reading a document: the same silhouette should always give the same answer, so the port picks
    /// the most likely token at every step (greedy) where its on-device API allows it.
    public let deterministic: Bool
    /// Whether the constraint's text goes into the prompt as well (it always constrains the answer). Apple's
    /// on-device model writes the constraint into the prompt in full, every allowed id of every field, and
    /// counts it against its 4,096-token window; a long silhouette's constraint alone can fill it. Planner
    /// leaves it out when the request would not fit with it (`DeviceBudget`).
    public var schemaInPrompt: Bool

    init(taskId: String, system: String, prompt: String, maxOutputTokens: Int, constraint: JSON? = nil, part: String? = nil,
         deterministic: Bool = false, schemaInPrompt: Bool = true) {
        self.schemaInPrompt = schemaInPrompt
        self.taskId = taskId
        self.system = system
        self.prompt = prompt
        self.maxOutputTokens = maxOutputTokens
        self.constraint = constraint
        self.part = part
        self.deterministic = deterministic
    }
}

/// Which model of a hybrid request the SDK tries first (routing.json PREFER_ON_DEVICE, PREFER_IN_CLOUD).
public enum HybridOrder: String, Sendable {
    case deviceFirst
    case cloudFirst
}

public protocol ModelPort: Sendable {
    /// Whether the on-device model can run now (Apple Intelligence on, model downloaded).
    func deviceAvailability() -> DeviceAvailability
    /// The on-device model alone: ONLY_ON_DEVICE requests (Raw input, the parts of a reading).
    func generateOnDevice(_ call: DeviceCall) async throws -> ModelReply
    /// The cloud model alone: ONLY_IN_CLOUD requests and the explicit retry of `onDeviceFailure`.
    func generateInCloud(_ request: CloudRequest) async throws -> ModelReply
    /// The SDK's hybrid model for a cloud-safe request: the SDK chooses device or cloud and the reply's
    /// `modelVersion` says which one wrote it. The moment the SDK hands the request to the cloud model,
    /// the port runs `gate.open()` first (App Check, the record) and `gate.close` after it.
    func generateHybrid(_ request: CloudRequest, order: HybridOrder, gate: CloudGate) async throws -> ModelReply
    /// Where the App Check token for a cloud request comes from, or nil when the port needs none.
    var appCheckDestination: String? { get }
    /// Obtains the App Check token a cloud request needs, right before it. Throws when there is none:
    /// the request is then not made ("no token, no request", shared/RECORD.md section 1).
    func confirmAppCheck() async throws
}

public extension ModelPort {
    var appCheckDestination: String? { nil }
    func confirmAppCheck() async throws {}

    /// For ports without the SDK (tests, the scripted UI-test model): what the SDK's hybrid session does,
    /// step by step (firebase-ios-sdk 12.19.3, FirebaseAI/Sources/Types/Internal/HybridModelSession.swift,
    /// `_respond`): the primary model; when its session cannot start (the on-device model is not available)
    /// or its request throws anything but a cancellation, the secondary model with the same prompt. The
    /// device gets the cloud request's own text: a hybrid request has one prompt for both models.
    func generateHybrid(_ request: CloudRequest, order: HybridOrder, gate: CloudGate) async throws -> ModelReply {
        try await HybridEmulation.respond(self, request, order: order, gate: gate)
    }
}

/// The SDK's hybrid session, step by step, over a port's two single-model calls (see `generateHybrid`).
public enum HybridEmulation {
    public static func respond(_ port: some ModelPort, _ request: CloudRequest, order: HybridOrder, gate: CloudGate) async throws -> ModelReply {
        let device: @Sendable () async throws -> ModelReply = {
            let availability = port.deviceAvailability()
            guard availability == .available else { throw TaskRunner.unavailable(availability) }
            return try await port.generateOnDevice(request.hybridDeviceCall)
        }
        let cloud: @Sendable () async throws -> ModelReply = {
            try await gate.open()
            do {
                let reply = try await port.generateInCloud(request)
                gate.close(nil)
                return reply
            } catch {
                gate.close(error as? TaskError ?? TaskError(.unknown, String(describing: type(of: error))))
                throw error
            }
        }
        let (primary, secondary) = order == .deviceFirst ? (device, cloud) : (cloud, device)
        do {
            return try await primary()
        } catch {
            if Task.isCancelled || error is CancellationError || (error as? TaskError)?.kind == .cancelled { throw error }
            do { return try await secondary() } catch { throw gate.cloudError ?? error }
        }
    }
}

/// The app's own step around a request the SDK's hybrid model hands to the cloud model. The SDK decides
/// whether the cloud is used; the gate runs at that moment, inside the SDK's fallback:
/// - `open()`: no token, no request (shared/RECORD.md section 1): a limited-use App Check token first
///   (the SDK would otherwise send the request with a placeholder token), then the request is put in
///   the record as attempted, before it leaves. Throws when the request must not be made.
/// - `close(_:)`: the record says sent or failed.
/// A request the device answers never opens the gate: no App Check, no record entry, nothing sent.
public final class CloudGate: @unchecked Sendable {
    private let lock = NSLock()
    private var _opened = false
    private var _cloudError: TaskError?
    private let openStep: @Sendable () async throws -> Void
    private let closeStep: @Sendable (TaskError?) -> Void

    public init(open: @escaping @Sendable () async throws -> Void, close: @escaping @Sendable (TaskError?) -> Void) {
        openStep = open
        closeStep = close
    }

    /// True once the SDK handed the request to the cloud model.
    public var opened: Bool { lock.withLock { _opened } }
    /// Why the cloud did not answer (no App Check token, an HTTP error, the network), when it did not.
    public var cloudError: TaskError? { lock.withLock { _cloudError } }

    public func open() async throws {
        lock.withLock { _opened = true }
        do { try await openStep() } catch {
            let e = error as? TaskError ?? TaskError(.unknown, String(describing: type(of: error)))
            lock.withLock { _cloudError = e }
            throw e
        }
    }

    public func close(_ error: TaskError?) {
        if let error { lock.withLock { _cloudError = error } }
        closeStep(error)
    }
}

/// A failed task, by kind (shown with shared copy). Messages never contain user values.
public struct TaskError: Error, Sendable, CustomStringConvertible {
    public enum Kind: String, Sendable {
        case appCheck = "app-check"
        case permission
        case apiNotEnabled = "api-not-enabled"
        case quota
        /// The free daily limit: trying again in a minute will not help.
        case quotaDaily = "quota-daily"
        case cancelled
        /// The reply stated a result twice (shared/prompts/OUTPUT_CHECKS.md).
        case blocked
        case network
        /// No answer within the time limit the task sets (routing.json `bothWays.timeoutSeconds`).
        case timeout
        case onDeviceUnavailable = "on-device-unavailable"
        /// The device read a document but its answer did not pass the checks, and the person chose to
        /// keep everything on the device (DEVICE_READING.md section 7).
        case onDeviceUnreliable = "on-device-unreliable"
        case badOutput = "bad-output"
        /// No Firebase configuration in this build.
        case notConfigured = "not-configured"
        case unknown
    }

    public let kind: Kind
    public let detail: String
    /// HTTP status when the cloud answered with an error.
    public let status: Int?
    /// Where the call stopped: an app guard (`availability-guard`, `input-length-guard`,
    /// `constraint-guard`) before any SDK call, or `sdk` when the SDK or the model threw.
    public let origin: String?
    /// The type of the error the SDK threw (`FoundationModels.LanguageModelSession.GenerationError`…).
    public let errorType: String?

    public init(_ kind: Kind, _ detail: String, status: Int? = nil, origin: String? = nil, errorType: String? = nil) {
        self.kind = kind
        self.detail = detail
        self.status = status
        self.origin = origin
        self.errorType = errorType
    }

    public var description: String { "\(kind.rawValue): \(detail)" }

    /// Errors from the cloud side: repeating a call in the cloud would not help.
    var isCloudFailure: Bool {
        [.appCheck, .permission, .apiNotEnabled, .quota, .quotaDaily, .network, .notConfigured].contains(kind) || status != nil
    }

    /// The shared copy key for this error.
    public var copyKey: String {
        switch kind {
        case .quotaDaily: "error.quotaDaily"
        case .onDeviceUnreliable: "error.on-device-unreliable"
        case .quota: "error.quota"
        case .blocked: "answers.blocked"
        case .network: "error.network"
        case .appCheck: "error.app-check"
        case .cancelled: "answers.cancelled"
        default: "answers.error"
        }
    }
}
