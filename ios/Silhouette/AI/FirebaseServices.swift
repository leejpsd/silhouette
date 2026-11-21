// Firebase AI Logic, App Check and Remote Config. The only file that imports Firebase.
//
// - Configured only when GoogleService-Info.plist is in the bundle (it is not in the repository;
//   a build without it runs fully on the device and says that cloud requests are off).
// - App Check: the debug provider in debug builds (the token is printed in the Xcode console on the
//   first run, "Firebase App Check debug token: …"; register it in the Firebase console), App Attest
//   in release builds.
// - Inference, one single-turn session per request:
//   - cloud-safe input that may run on either side (PREFER_ON_DEVICE, PREFER_IN_CLOUD): the SDK's
//     `HybridModel` (Apple's on-device model and Gemini, in the task's order). The SDK chooses; the
//     reply's `modelVersion` says which model wrote it. The cloud side is wrapped (`GatedModel`) so the
//     app's App Check check and record run at the moment the SDK hands the request to the cloud;
//   - Raw input and the parts of an on-device reading: the on-device model alone (`.systemModel()`);
//   - ONLY_IN_CLOUD and the app's explicit retry of a device answer that fails its checks: Gemini alone.

import FirebaseAILogic
import FirebaseAppCheck
import FirebaseCore
import FirebaseRemoteConfig
import Foundation
// Only for the response constraint's type (GenerationSchema); every call goes through Firebase AI Logic.
import FoundationModels
import SilhouetteCore
import SilhouetteKit

enum FirebaseServices {
    /// True when the Firebase configuration file is bundled and Firebase was configured.
    nonisolated(unsafe) private(set) static var isConfigured = false
    static var hasConfiguration: Bool { Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil }

    /// The path a cloud model request goes to (the Gemini Developer API backend through Firebase AI Logic),
    /// for the record; nil without a Firebase configuration.
    static func modelPath(_ model: String) -> String? {
        guard isConfigured, let project = FirebaseApp.app()?.options.projectID else { return nil }
        return "/v1beta/projects/\(project)/models/\(model):generateContent"
    }

    /// Call once at launch, before anything else touches Firebase. Makes no network request.
    static func configure() {
        guard !isConfigured, hasConfiguration else { return }
        #if DEBUG
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        AppCheck.setAppCheckProviderFactory(AppAttestFactory())
        #endif
        FirebaseApp.configure()
        isConfigured = true
    }
}

final class AppAttestFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? { AppAttestProvider(app: app) }
}

// MARK: - Remote Config

/// Bundled defaults (the template's values); fetched once, right before the first model request.
actor RemoteConfigService {
    static let destination = "firebaseremoteconfig.googleapis.com"
    private var fetched = false
    private(set) var config: AppConfig
    private let defaults: [String: String]

    init(defaults: [String: String]) {
        self.defaults = defaults
        config = AppConfig(values: defaults)
    }

    func current() -> AppConfig { config }

    /// The first time: records the request, then fetches and activates. Later calls do nothing.
    func fetchOnce(log: OutboundLog) async {
        guard !fetched, FirebaseServices.isConfigured else { return }
        fetched = true
        let rc = RemoteConfig.remoteConfig()
        rc.setDefaults(defaults.mapValues { $0 as NSString })
        let entry = OutboundEntry(channel: .remoteConfig, destination: Self.destination, fields: ["remote-config", "installation"], status: .attempted)
        log.record(entry)
        do {
            _ = try await rc.fetchAndActivate()
            log.update(entry.id, status: .sent(200))
        } catch {
            log.update(entry.id, status: .failed((error as NSError).domain.components(separatedBy: ".").last ?? "error"))
        }
        var values = defaults
        for key in AppConfig.keys {
            let v = rc.configValue(forKey: key)
            if v.source != .static, let s = v.stringValue as String? { values[key] = s }
        }
        config = AppConfig(values: values)
    }
}

// MARK: - Model port

final class FirebaseModelPort: ModelPort, @unchecked Sendable {
    static let appCheckHost = "firebaseappcheck.googleapis.com"

    /// Firebase AI Logic needs a configured Firebase app, for the on-device model too. A build without
    /// the configuration file has none: it runs without models (sample answer keys, typed numbers,
    /// the rules' own reasons) instead of stopping at launch.
    ///
    /// Created on the first model call, not at launch. Its initializer creates the App Check instance;
    /// automatic token refresh is off (Info.plist `FirebaseAppCheckTokenAutoRefreshEnabled`), so App
    /// Check makes no request until a cloud request asks for a token (shared/RECORD.md section 1).
    /// Limited-use tokens: one per cloud request.
    private var ai: FirebaseAI? {
        lock.withLock {
            guard FirebaseServices.isConfigured else { return nil }
            if let made { return made }
            let instance = FirebaseAI.firebaseAI(backend: .googleAI(), useLimitedUseAppCheckTokens: true)
            made = instance
            return instance
        }
    }
    private var made: FirebaseAI?
    private let lock = NSLock()

    init() {}

    var appCheckDestination: String? { FirebaseServices.isConfigured ? Self.appCheckHost : nil }

    /// No token, no request: a limited-use App Check token must be obtainable before the cloud request
    /// is made. The SDK then obtains its own limited-use token for the request (it takes no token from
    /// the app), so each cloud request makes two token exchanges on iOS.
    func confirmAppCheck() async throws {
        _ = try await AppCheck.appCheck().limitedUseToken()
    }

    func deviceAvailability() -> DeviceAvailability {
        guard FirebaseServices.isConfigured else { return .unavailable }
        return switch FirebaseAI.SystemLanguageModel.default.availability {
        case .available: .available
        case .unavailable(.deviceNotEligible): .deviceNotEligible
        case .unavailable(.appleIntelligenceNotEnabled): .appleIntelligenceNotEnabled
        case .unavailable(.modelNotReady): .modelNotReady
        default: .unavailable
        }
    }

    func generateOnDevice(_ call: DeviceCall) async throws -> ModelReply {
        // Never hand a request that must stay on the device to an SDK call when the model is not ready.
        let availability = deviceAvailability()
        guard availability == .available else {
            throw TaskError(.onDeviceUnavailable, "the on-device model is not available (\(availability.rawValue))",
                            origin: "availability-guard", errorType: "SystemLanguageModel.Availability.\(availability.rawValue)")
        }
        // A reading part: the strict response constraint as the on-device schema (DeviceConstraint).
        var schema: GenerationSchema?
        if let constraint = call.constraint {
            do { schema = try DeviceConstraint.schema(constraint) } catch {
                throw TaskError(.onDeviceUnavailable, "the constraint could not be expressed: \(error)", origin: "constraint-guard",
                                errorType: String(reflecting: type(of: error)))
            }
        }
        guard let ai else { throw TaskError(.notConfigured, "no Firebase configuration in this build", origin: "configuration-guard") }
        let session = ai.generativeModelSession(model: .systemModel(), instructions: call.system)
        // Reading a document: greedy sampling (the most likely token every time), so the same silhouette
        // gives the same answer. Temperature has no effect under greedy sampling and is left unset.
        let options = GenerationOptionsChoice.foundationModels(
            FirebaseAI.GenerationOptions(sampling: call.deterministic ? .greedy : nil, maximumResponseTokens: call.maxOutputTokens))
        do {
            if let schema {
                let response = try await ConstrainedReply.$schema.withValue(schema) {
                    try await session.respond(to: call.prompt, generating: ConstrainedReply.self, includeSchemaInPrompt: true, options: options.value)
                }
                return ModelReply(text: response.content.content.jsonString, modelVersion: response.rawResponse.modelVersion)
            }
            let response = try await session.respond(to: call.prompt, options: options.value)
            return ModelReply(text: response.content, modelVersion: response.rawResponse.modelVersion)
        } catch is CancellationError {
            throw TaskError(.cancelled, "cancelled")
        } catch {
            throw Self.deviceError(error)
        }
    }

    /// An error thrown by the SDK or the on-device model, with its real type and message: the
    /// Foundation Models error case (context window, guardrail, language, unsupported guide, assets…)
    /// and its debug description. Its messages describe the request, never its text.
    static func deviceError(_ error: Error) -> TaskError {
        let ns = error as NSError
        var message = String(describing: error)
        if let e = error as? LocalizedError {
            message += [e.failureReason, e.recoverySuggestion].compactMap { $0 }.map { " | " + $0 }.joined()
        }
        message += " | \(ns.domain) \(ns.code)"
        return TaskError(.onDeviceUnavailable, String(message.prefix(600)), origin: "sdk", errorType: String(reflecting: type(of: error)))
    }

    func generateInCloud(_ request: CloudRequest) async throws -> ModelReply {
        guard let ai else { throw TaskError(.notConfigured, "no Firebase configuration in this build", origin: "configuration-guard") }
        let session = ai.generativeModelSession(model: .geminiModel(name: request.model), instructions: request.system.text)
        do {
            let response = try await session.respond(to: request.prompt.text, options: .gemini(Self.cloudConfig(request)))
            return ModelReply(text: response.content, modelVersion: response.rawResponse.modelVersion)
        } catch {
            throw Self.classify(error)
        }
    }

    /// A cloud-safe request through the SDK's hybrid model (firebase-ios-sdk 12.19.3, `HybridModel` and
    /// `HybridModelSession`): the SDK starts the primary model's session (the on-device model's fails when
    /// it is not available) and sends the request; when either throws anything but a cancellation, it sends
    /// the same prompt to the secondary model. Options for both sides in one value (`.hybrid`): greedy
    /// sampling on the device for a document, the response schema in the cloud. No schema is passed to
    /// `respond`: given one, the SDK would replace the cloud's `responseSchema` with its own conversion of
    /// the on-device schema (GeminiModelSession.swift `buildConfig`), and the cloud request would no longer
    /// be the one the record shows.
    func generateHybrid(_ request: CloudRequest, order: HybridOrder, gate: CloudGate) async throws -> ModelReply {
        guard let ai else { throw TaskError(.notConfigured, "no Firebase configuration in this build", origin: "configuration-guard") }
        let device = FirebaseAI.SystemLanguageModel.default
        let cloud = GatedModel(base: ai.geminiModel(name: request.model), gate: gate)
        let model = order == .deviceFirst ? HybridModel(primary: device, secondary: cloud) : HybridModel(primary: cloud, secondary: device)
        let session = ai.generativeModelSession(model: model, instructions: request.system.text)
        let call = request.hybridDeviceCall
        let options = ResponseGenerationOptions.hybrid(
            gemini: Self.cloudConfig(request),
            foundationModels: FirebaseAI.GenerationOptions(sampling: call.deterministic ? .greedy : nil, maximumResponseTokens: call.maxOutputTokens))
        do {
            let response = try await session.respond(to: request.prompt.text, options: options)
            return ModelReply(text: response.content, modelVersion: response.rawResponse.modelVersion)
        } catch {
            if error is CancellationError || Task.isCancelled { throw TaskError(.cancelled, "cancelled") }
            // The cloud's own error (no App Check token, quota, the network) when the cloud was asked; the
            // device's otherwise.
            if let cloudError = gate.cloudError { throw cloudError }
            throw gate.opened ? Self.classify(error) : Self.deviceError(error)
        }
    }

    /// The cloud request's generation config: its output limit and, for a document, the response schema.
    static func cloudConfig(_ request: CloudRequest) -> GenerationConfig {
        let schema = request.responseSchema.flatMap(Self.schema)
        return GenerationConfig(maxOutputTokens: request.maxOutputTokens, responseMIMEType: schema == nil ? nil : "application/json",
                                responseSchema: schema)
    }

    /// SDK and HTTP errors as task errors (messages never carry user values).
    static func classify(_ error: Error) -> TaskError {
        if error is CancellationError { return TaskError(.cancelled, "cancelled") }
        if let e = error as? GenerateContentError {
            switch e {
            case .internalError(let underlying): return classify(underlying)
            default: return TaskError(.badOutput, "the reply was blocked or stopped early")
            }
        }
        let ns = error as NSError
        let message = ns.localizedDescription.lowercased()
        if ns.domain.hasSuffix("BackendError") {
            let status = ns.code
            if message.contains("app check") || message.contains("appcheck") || status == 401 { return TaskError(.appCheck, "App Check", status: status) }
            if status == 403 {
                return message.contains("has not been used") || message.contains("disabled")
                    ? TaskError(.apiNotEnabled, "API not enabled", status: status) : TaskError(.permission, "permission denied", status: status)
            }
            if status == 429 || message.contains("resource_exhausted") || message.contains("quota") {
                let daily = message.range(of: "per.?day|daily", options: .regularExpression) != nil
                return TaskError(daily ? .quotaDaily : .quota, "quota", status: status)
            }
            return TaskError(.unknown, "HTTP \(status)", status: status)
        }
        if ns.domain == NSURLErrorDomain { return TaskError(.network, "network") }
        if message.contains("app check") { return TaskError(.appCheck, "App Check") }
        return TaskError(.unknown, ns.domain)
    }

    /// The derived model schema (OpenAPI dialect, shared/schemas/MODEL_SCHEMA.md) as the SDK's Schema.
    static func schema(_ json: JSON) -> Schema? {
        let nullable = json["nullable"]?.boolValue ?? false
        let description = json["description"]?.stringValue
        if case .array(let options)? = json["anyOf"] {
            let schemas = options.compactMap(schema)
            return schemas.isEmpty ? nil : .anyOf(schemas: schemas)
        }
        if case .array(let values)? = json["enum"] {
            return .enumeration(values: values.compactMap(\.stringValue), description: description, nullable: nullable)
        }
        switch json["type"]?.stringValue {
        case "string": return .string(description: description, nullable: nullable)
        case "integer": return .integer(description: description, nullable: nullable)
        case "number": return .double(description: description, nullable: nullable)
        case "boolean": return .boolean(description: description, nullable: nullable)
        case "array":
            guard let items = json["items"].flatMap(schema) else { return nil }
            return .array(items: items, description: description, nullable: nullable)
        case "object":
            let props = json["properties"]?.objectValue ?? JSONObject()
            var properties: [String: Schema] = [:]
            for (key, value) in props.entries { if let s = schema(value) { properties[key] = s } }
            let required = Set((json["required"]?.arrayValue ?? []).compactMap(\.stringValue))
            return .object(properties: properties, optionalProperties: props.keys.filter { !required.contains($0) },
                           propertyOrdering: props.keys, description: description, nullable: nullable)
        default: return nil
        }
    }
}

// MARK: - The cloud side of a hybrid request

/// The cloud model of a hybrid request with the app's step around it. The SDK's hybrid session starts this
/// model's session only when it hands the request over (`HybridModelSession.getSession(for: .secondaryModel)`
/// right before `_respond`, or first when the cloud is the primary model), so `gate.open()` runs exactly
/// when the request is about to leave: the App Check check (the SDK sends a request even when it cannot get
/// a token: FirebaseInfo+Headers.swift logs the token error and sends what it got) and the record entry.
/// It conforms to the SDK's `FirebaseAI.LanguageModel` and `_ModelSession` protocols, public but marked
/// for internal use; the SDK is pinned to an exact version (project.yml).
struct GatedModel: FirebaseAI.LanguageModel {
    let base: any FirebaseAI.LanguageModel
    let gate: CloudGate

    var _modelName: String { base._modelName }

    func _startSession(tools: [any ToolRepresentable]?, instructions: String?) throws -> any _ModelSession {
        GatedSession(base: try base._startSession(tools: tools, instructions: instructions), gate: gate)
    }
}

final class GatedSession: _ModelSession {
    let base: any _ModelSession
    let gate: CloudGate

    init(base: any _ModelSession, gate: CloudGate) {
        self.base = base
        self.gate = gate
    }

    var _hasHistory: Bool { base._hasHistory }

    nonisolated(nonsending) func _respond(to prompt: [any Part], schema: FirebaseAI.GenerationSchema?, includeSchemaInPrompt: Bool,
                                          options: any GenerationOptionsRepresentable) async throws -> _ModelSessionResponse {
        try await gate.open()
        do {
            let response = try await base._respond(to: prompt, schema: schema, includeSchemaInPrompt: includeSchemaInPrompt, options: options)
            gate.close(nil)
            return response
        } catch {
            gate.close(FirebaseModelPort.classify(error))
            throw error
        }
    }

    /// Not used by the app (every request is answered whole); the same step before the stream starts.
    func _streamResponse(to prompt: [any Part], schema: FirebaseAI.GenerationSchema?, includeSchemaInPrompt: Bool,
                         options: any GenerationOptionsRepresentable) -> sending AsyncThrowingStream<_ModelSessionResponse, any Error> {
        let base = base, gate = gate
        nonisolated(unsafe) let prompt = prompt
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    try await gate.open()
                    for try await snapshot in base._streamResponse(to: prompt, schema: schema, includeSchemaInPrompt: includeSchemaInPrompt,
                                                                   options: options) {
                        continuation.yield(snapshot)
                    }
                    gate.close(nil)
                    continuation.finish()
                } catch {
                    if gate.opened && gate.cloudError == nil { gate.close(FirebaseModelPort.classify(error)) }
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

/// Options for an on-device call (a value wrapper so both respond calls take the same options).
private enum GenerationOptionsChoice {
    case foundationModels(FirebaseAI.GenerationOptions)
    var value: FirebaseAI.GenerationOptions { switch self { case .foundationModels(let o): o } }
}

// MARK: - The response constraint on the device

/// The reply of a reading part, generated under a schema built for this silhouette. The SDK takes the
/// schema of a `Generable` type; this type's schema is the one set for the current call.
struct ConstrainedReply: Generable {
    @TaskLocal static var schema: GenerationSchema?
    static var generationSchema: GenerationSchema { schema ?? GeneratedContent.generationSchema }

    let content: GeneratedContent
    init(_ content: GeneratedContent) throws { self.content = content }
    var generatedContent: GeneratedContent { content }
}

/// The strict response constraint of a reading part (JSON Schema, shared/validation/DEVICE_READING.md
/// section 2) as an on-device generation schema, without loosening it:
/// - no other keys: the generated object has only the declared properties;
/// - names only W ids, dates only D ids, amounts only N ids of this silhouette, enums only their
///   options: string choices; a name is a list of at least one W id;
/// - each deduction exactly `{amount, kind}`, an N id and a fixed kind.
/// What cannot be expressed: "every key present, `null` allowed". A field the document lacks is left
/// out instead of written as `null`, which the reading treats the same way; a field whose kind has no id
/// in this silhouette (`{"type": "null"}`) is not offered at all.
enum DeviceConstraint {
    static func schema(_ constraint: JSON) throws -> GenerationSchema {
        var properties: [DynamicGenerationSchema.Property] = []
        for (name, spec) in constraint["properties"]?.objectValue?.entries ?? [] {
            guard let (schema, optional) = field(name, spec) else { continue }
            properties.append(DynamicGenerationSchema.Property(name: name, schema: schema, isOptional: optional))
        }
        let root = DynamicGenerationSchema(name: "Reading", properties: properties)
        return try GenerationSchema(root: root, dependencies: [])
    }

    private static func choices(_ spec: JSON?) -> [String] { (spec?["enum"]?.arrayValue ?? []).compactMap(\.stringValue) }

    private static func types(_ spec: JSON) -> [String] {
        if let t = spec["type"]?.stringValue { return [t] }
        return (spec["type"]?.arrayValue ?? []).compactMap(\.stringValue)
    }

    /// The schema of one field and whether it may be left out (`null` allowed).
    private static func field(_ name: String, _ spec: JSON) -> (DynamicGenerationSchema, Bool)? {
        let t = types(spec)
        let nullable = t.contains("null")
        if t == ["null"] { return nil }
        if t.contains("array") {
            let items = spec["items"] ?? .null
            if items["type"]?.stringValue == "object" {
                var props: [DynamicGenerationSchema.Property] = []
                for (key, sub) in items["properties"]?.objectValue?.entries ?? [] {
                    let options = choices(sub)
                    guard !options.isEmpty else { return (DynamicGenerationSchema(arrayOf: DynamicGenerationSchema(name: "\(name)Item", properties: []),
                                                                                  minimumElements: 0, maximumElements: 0), nullable) }
                    props.append(DynamicGenerationSchema.Property(name: key, schema: DynamicGenerationSchema(name: "\(name)\(key)", anyOf: options)))
                }
                return (DynamicGenerationSchema(arrayOf: DynamicGenerationSchema(name: "\(name)Item", properties: props)), nullable)
            }
            let options = choices(items)
            guard !options.isEmpty else { return nil }
            let minimum = spec["minItems"]?.numberValue.map { Int($0) }
            return (DynamicGenerationSchema(arrayOf: DynamicGenerationSchema(name: "\(name)Id", anyOf: options), minimumElements: minimum), nullable)
        }
        let options = choices(spec)
        guard !options.isEmpty else { return nil }
        return (DynamicGenerationSchema(name: "\(name)Choice", anyOf: options), nullable)
    }
}
