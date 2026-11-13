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

    init(taskId: String, system: String, prompt: String, maxOutputTokens: Int) {
        self.taskId = taskId
        self.system = system
        self.prompt = prompt
        self.maxOutputTokens = maxOutputTokens
    }
}

public protocol ModelPort: Sendable {
    /// Whether the on-device model can run now (Apple Intelligence on, model downloaded).
    func deviceAvailability() -> DeviceAvailability
    func generateOnDevice(_ call: DeviceCall) async throws -> ModelReply
    func generateInCloud(_ request: CloudRequest) async throws -> ModelReply
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
        case onDeviceUnavailable = "on-device-unavailable"
        case badOutput = "bad-output"
        /// No Firebase configuration in this build.
        case notConfigured = "not-configured"
        case unknown
    }

    public let kind: Kind
    public let detail: String
    /// HTTP status when the cloud answered with an error.
    public let status: Int?

    public init(_ kind: Kind, _ detail: String, status: Int? = nil) {
        self.kind = kind
        self.detail = detail
        self.status = status
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
        case .quota: "error.quota"
        case .blocked: "answers.blocked"
        case .network: "error.network"
        case .appCheck: "error.app-check"
        case .cancelled: "answers.cancelled"
        default: "answers.error"
        }
    }
}
