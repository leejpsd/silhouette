// Requests for the tasks of shared/routing.json.
//
// - `CloudRequest`: every cloud-capable task (PREFER_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD). Its
//   texts are `CloudText`, composed only from Skeleton, Generalized and Public values and bundled
//   prompt templates, so a Raw value cannot be put into one.
// - `DeviceRequest`: ONLY_ON_DEVICE tasks whose input is Raw. It can only become a `DeviceCall`.

import Foundation
import SilhouetteCore

public struct CloudRequest: Sendable {
    public let taskId: String
    public let mode: RoutingMode
    public let reason: RoutingReason
    /// The cloud model name.
    public let model: String
    public let system: CloudText
    public let prompt: CloudText
    public let maxOutputTokens: Int
    /// Structured output for the cloud (the derived model schema, OpenAPI dialect), when the task has one.
    public let responseSchema: JSON?
    /// The same schema in the JSON Schema dialect, for the on-device prompt.
    let deviceSchema: JSON?
    /// What the request carries, for the outgoing record (copy keys `outbound.field.*`), never values.
    public let fields: [String]
    let checks: OutputCheck.Scope?
    public let route: ExplainRoute?
    public let locale: AppLocale
    /// A document reading's silhouette, as it is inside the prompt (for the record's "What left").
    public var silhouette: CloudText? = nil

    /// The request object as this app builds it for Firebase AI Logic. The SDK serializes the HTTP
    /// body itself, so this is the app's rendering of the same request, not the bytes on the wire.
    public var rendering: CloudText {
        var generation = JSONObject([("maxOutputTokens", .number(Double(maxOutputTokens)))])
        if let responseSchema {
            generation["responseMimeType"] = .string("application/json")
            generation["responseSchema"] = responseSchema
        }
        let body = JSONObject([
            ("model", .string(model)),
            ("generationConfig", .object(generation)),
            ("systemInstruction", .object(JSONObject([("role", .string("system")),
                                                      ("parts", .array([.object(JSONObject([("text", .string(system.text))]))]))]))),
            ("contents", .array([.object(JSONObject([("role", .string("user")),
                                                     ("parts", .array([.object(JSONObject([("text", .string(prompt.text))]))]))]))])),
        ])
        return CloudText(composed: JSON.object(body).jsonText)
    }

    /// The device-first attempt of this request: the same cloud-safe text, with the schema in the
    /// prompt where the on-device call has no schema parameter (shared/schemas/MODEL_SCHEMA.md).
    var deviceCall: DeviceCall {
        var text = prompt.text
        if let deviceSchema { text += "\n\nAnswer with JSON that matches this schema:\n" + deviceSchema.jsonText }
        return DeviceCall(taskId: taskId, system: system.text, prompt: text, maxOutputTokens: maxOutputTokens,
                          deterministic: taskId == "document.pointer.extract")
    }
}

/// An ONLY_ON_DEVICE request. Holds Raw values (exact answers, the on-screen result, typed text).
public struct DeviceRequest: Sendable {
    public let taskId: String
    public let reason: RoutingReason
    let call: DeviceCall
    let checks: OutputCheck.Scope
    public let locale: AppLocale
    /// The verdict on screen: a hedge that contradicts it is blocked too (OUTPUT_CHECKS.md, scope personal).
    let verdict: String
}

// MARK: - Inputs

/// Facts about one program from the rule pack and its copy, in the UI language. Static content.
public struct ProgramFacts: Sendable {
    public let programId: String
    public let name: String
    /// `{programFacts}` (shared/rulepacks/SPEC.md section 2.1): one item per line.
    public let facts: String
    /// Criterion labels by criterion id.
    public let criteria: [String: String]
}

/// The person's own result for the on-device prompts. Raw: it holds the on-screen verdict, exact
/// values and answers to sensitive questions.
public struct PersonalResult: Sendable {
    public let locale: AppLocale
    public let programName: String
    public let facts: String
    /// The verdict on screen (`likely`, `maybe`, `depends`, `unlikely`).
    public let verdict: String
    public let verdictLabel: String
    /// `- {label}: {state}` lines, with ` (limit {limit}, yours {value})` where the rules compare.
    public let criteriaLines: String
}

/// Why an explanation runs where it runs (routing.json explain.short `when`).
public struct ExplainRoute: Sendable, Equatable {
    public enum Basis: String, Sendable { case short, long, locale }
    public let taskId: String
    public let basis: Basis
    public let words: Int
    public let maxShortWords: Int
    public let locale: AppLocale
}
