// Firebase AI Logic, App Check and Remote Config. The only file that imports Firebase.
//
// - Configured only when GoogleService-Info.plist is in the bundle (it is not in the repository;
//   a build without it runs fully on the device and says that cloud requests are off).
// - App Check: the debug provider in debug builds (the token is printed in the Xcode console on the
//   first run, "Firebase App Check debug token: …"; register it in the Firebase console), App Attest
//   in release builds.
// - Inference: the SDK's on-device model (`FirebaseAI.SystemLanguageModel`, Apple Foundation Models
//   behind Firebase AI Logic) and the SDK's cloud Gemini model, each in its own single-turn session.
//   The app does the device-first or cloud-first routing itself, so every cloud request is recorded
//   before it is made (the SDK's HybridModel would fall back to the cloud inside the SDK).

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

final class FirebaseModelPort: ModelPort {
    private let ai: FirebaseAI

    init() {
        ai = FirebaseAI.firebaseAI(backend: .googleAI())
    }

    func deviceAvailability() -> DeviceAvailability {
        switch FirebaseAI.SystemLanguageModel.default.availability {
        case .available: .available
        case .unavailable(.deviceNotEligible): .deviceNotEligible
        case .unavailable(.appleIntelligenceNotEnabled): .appleIntelligenceNotEnabled
        case .unavailable(.modelNotReady): .modelNotReady
        default: .unavailable
        }
    }

    func generateOnDevice(_ call: DeviceCall) async throws -> ModelReply {
        // Never hand a request that must stay on the device to an SDK call when the model is not ready.
        guard deviceAvailability() == .available else { throw TaskError(.onDeviceUnavailable, "the on-device model is not available") }
        let session = ai.generativeModelSession(model: .systemModel(), instructions: call.system)
        let options = GenerationOptionsChoice.foundationModels(FirebaseAI.GenerationOptions(maximumResponseTokens: call.maxOutputTokens))
        do {
            if let constraint = call.constraint {
                // A reading part: the strict response constraint as the on-device schema (DeviceConstraint).
                guard let schema = DeviceConstraint.schema(constraint) else { throw TaskError(.onDeviceUnavailable, "the constraint could not be expressed") }
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
            throw TaskError(.onDeviceUnavailable, String(describing: type(of: error)))
        }
    }

    func generateInCloud(_ request: CloudRequest) async throws -> ModelReply {
        guard FirebaseServices.isConfigured else { throw TaskError(.notConfigured, "no Firebase configuration in this build") }
        let session = ai.generativeModelSession(model: .geminiModel(name: request.model), instructions: request.system.text)
        let schema = request.responseSchema.flatMap(Self.schema)
        let config = GenerationConfig(maxOutputTokens: request.maxOutputTokens, responseMIMEType: schema == nil ? nil : "application/json",
                                      responseSchema: schema)
        do {
            let response = try await session.respond(to: request.prompt.text, options: .gemini(config))
            return ModelReply(text: response.content, modelVersion: response.rawResponse.modelVersion)
        } catch {
            throw Self.classify(error)
        }
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
    static func schema(_ constraint: JSON) -> GenerationSchema? {
        var properties: [DynamicGenerationSchema.Property] = []
        for (name, spec) in constraint["properties"]?.objectValue?.entries ?? [] {
            guard let (schema, optional) = field(name, spec) else { continue }
            properties.append(DynamicGenerationSchema.Property(name: name, schema: schema, isOptional: optional))
        }
        let root = DynamicGenerationSchema(name: "Reading", properties: properties)
        return try? GenerationSchema(root: root, dependencies: [])
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
