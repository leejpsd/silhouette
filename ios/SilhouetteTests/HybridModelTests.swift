// The SDK's hybrid session (firebase-ios-sdk, HybridModelSession.swift) with the app's step around its
// cloud side (GatedModel). Fake models stand in for Apple's on-device model and Gemini: no model runs and
// nothing is sent. They answer each call with an error, so every case can be followed call by call.

import FirebaseAILogic
import FirebaseCore
import Foundation
@testable import Silhouette
import SilhouetteCore
import SilhouetteKit
import Testing

private struct Thrown: Error, CustomStringConvertible {
    let by: String
    var description: String { "thrown by \(by)" }
}

/// Every call, in order.
private final class Calls: @unchecked Sendable {
    private let lock = NSLock()
    private var names: [String] = []
    func add(_ name: String) { lock.withLock { names.append(name) } }
    var all: [String] { lock.withLock { names } }
}

private enum Behaviour { case unavailable, fails, cancels }

private struct FakeModel: FirebaseAI.LanguageModel {
    let name: String
    let behaviour: Behaviour
    let calls: Calls

    var _modelName: String { name }

    func _startSession(tools: [any ToolRepresentable]?, instructions: String?) throws -> any _ModelSession {
        calls.add("\(name).start")
        if behaviour == .unavailable { throw Thrown(by: "\(name).start") }
        return FakeSession(name: name, behaviour: behaviour, calls: calls)
    }
}

private final class FakeSession: _ModelSession {
    let name: String
    let behaviour: Behaviour
    let calls: Calls

    init(name: String, behaviour: Behaviour, calls: Calls) {
        self.name = name
        self.behaviour = behaviour
        self.calls = calls
    }

    var _hasHistory: Bool { false }

    nonisolated(nonsending) func _respond(to prompt: [any Part], schema: FirebaseAI.GenerationSchema?, includeSchemaInPrompt: Bool,
                                          options: any GenerationOptionsRepresentable) async throws -> _ModelSessionResponse {
        calls.add("\(name).respond")
        if behaviour == .cancels { throw CancellationError() }
        throw Thrown(by: "\(name).respond")
    }

    func _streamResponse(to prompt: [any Part], schema: FirebaseAI.GenerationSchema?, includeSchemaInPrompt: Bool,
                         options: any GenerationOptionsRepresentable) -> sending AsyncThrowingStream<_ModelSessionResponse, any Error> {
        AsyncThrowingStream { $0.finish(throwing: Thrown(by: "\(self.name).stream")) }
    }
}

private func gate(_ calls: Calls, token: Bool = true) -> CloudGate {
    CloudGate(open: {
        calls.add("gate.open")
        if !token { throw TaskError(.appCheck, "no token") }
    }, close: { error in
        calls.add("gate.close(\(error?.kind.rawValue ?? "sent"))")
    })
}

/// One request through a hybrid model, the way `GenerativeModelSession.respond` makes it.
private func respond(_ model: HybridModel) async throws {
    let session = try model._startSession(tools: nil, instructions: "instructions")
    _ = try await session._respond(to: [TextPart("prompt")], schema: nil, includeSchemaInPrompt: false, options: ResponseGenerationOptions.default)
}

@Suite("The SDK's hybrid model with the app's step at its cloud side")
struct HybridModelTests {
    @Test("device first, no on-device model: the SDK hands the request to the cloud model, and the gate runs before it leaves")
    func unavailableDeviceHandsToCloud() async throws {
        let calls = Calls()
        let g = gate(calls)
        let model = HybridModel(primary: FakeModel(name: "device", behaviour: .unavailable, calls: calls),
                                secondary: GatedModel(base: FakeModel(name: "cloud", behaviour: .fails, calls: calls), gate: g))
        await #expect(throws: Thrown.self) { try await respond(model) }
        #expect(calls.all == ["device.start", "cloud.start", "gate.open", "cloud.respond", "gate.close(unknown)"])
        #expect(g.opened && g.cloudError?.kind == .unknown)
    }

    @Test("device first, the device request fails: the SDK sends the same prompt to the cloud model, through the gate")
    func deviceFailureHandsToCloud() async throws {
        let calls = Calls()
        let model = HybridModel(primary: FakeModel(name: "device", behaviour: .fails, calls: calls),
                                secondary: GatedModel(base: FakeModel(name: "cloud", behaviour: .fails, calls: calls), gate: gate(calls)))
        await #expect(throws: Thrown.self) { try await respond(model) }
        #expect(calls.all == ["device.start", "device.respond", "cloud.start", "gate.open", "cloud.respond", "gate.close(unknown)"])
    }

    @Test("a cancelled device request never reaches the cloud")
    func cancellationStaysOnDevice() async throws {
        let calls = Calls()
        let g = gate(calls)
        let model = HybridModel(primary: FakeModel(name: "device", behaviour: .cancels, calls: calls),
                                secondary: GatedModel(base: FakeModel(name: "cloud", behaviour: .fails, calls: calls), gate: g))
        await #expect(throws: CancellationError.self) { try await respond(model) }
        #expect(calls.all == ["device.start", "device.respond"])
        #expect(!g.opened)
    }

    @Test("no token, no request: when the gate stops it, the cloud model is never asked")
    func noTokenNoRequest() async throws {
        let calls = Calls()
        let model = HybridModel(primary: FakeModel(name: "device", behaviour: .fails, calls: calls),
                                secondary: GatedModel(base: FakeModel(name: "cloud", behaviour: .fails, calls: calls), gate: gate(calls, token: false)))
        do {
            try await respond(model)
            Issue.record("no error")
        } catch {
            #expect((error as? TaskError)?.kind == .appCheck)
        }
        #expect(calls.all == ["device.start", "device.respond", "cloud.start", "gate.open"])
    }

    @Test("cloud first: any cloud failure, not only offline, goes to the on-device model")
    func cloudFirstFallsBack() async throws {
        let calls = Calls()
        let model = HybridModel(primary: GatedModel(base: FakeModel(name: "cloud", behaviour: .fails, calls: calls), gate: gate(calls)),
                                secondary: FakeModel(name: "device", behaviour: .fails, calls: calls))
        await #expect(throws: Thrown.self) { try await respond(model) }
        #expect(calls.all == ["cloud.start", "gate.open", "cloud.respond", "gate.close(unknown)", "device.start", "device.respond"])
    }

    @Test("Apple's on-device model, when it is not available here, hands the request to the cloud model",
          .enabled(if: !FirebaseAI.SystemLanguageModel.default.isAvailable, "for a run without an on-device model"))
    func realSystemModelUnavailable() async throws {
        let calls = Calls()
        let model = HybridModel(primary: FirebaseAI.SystemLanguageModel.default,
                                secondary: GatedModel(base: FakeModel(name: "cloud", behaviour: .fails, calls: calls), gate: gate(calls)))
        await #expect(throws: Thrown.self) { try await respond(model) }
        #expect(calls.all == ["cloud.start", "gate.open", "cloud.respond", "gate.close(unknown)"])
    }

    /// The app's own hybrid request (FirebaseModelPort.generateHybrid) with Apple's on-device model on this
    /// machine: the device answers, the SDK reports the on-device model, and the cloud side is never asked.
    /// The gate refuses, so even a fallback could not send anything.
    @Test("with an on-device model here: the device answers, the reply names the on-device model, the gate stays shut",
          .enabled(if: FirebaseAI.SystemLanguageModel.default.isAvailable && FirebaseApp.app() != nil, "needs the on-device model and a Firebase configuration"))
    func realSystemModelAnswers() async throws {
        let shared = try #require(Bundle.main.resourceURL?.appendingPathComponent("Shared", isDirectory: true))
        let bundle = try SharedBundle(directory: shared, jurisdiction: "us-ca")
        let program = try #require(bundle.packInfo.programs.first)
        let facts = try #require(AnswerInputs.programFacts(bundle, programId: program.id, locale: .en))
        let template = try #require(bundle.prompts.versioned("ask", version: nil, among: 4...4))
        let request = Planner.askChip(facts, question: Public<String>("Who is this program for?"), locale: .en, template: template)
        let calls = Calls()
        let g = gate(calls, token: false)
        let reply = try await FirebaseModelPort().generateHybrid(request, order: .deviceFirst, gate: g)
        #expect(reply.modelVersion == TaskRunner.onDeviceModelVersion)
        #expect(!reply.text.isEmpty)
        #expect(!g.opened && calls.all.isEmpty)
    }

    @Test("the badge's on-device name is the one the SDK puts on an on-device reply")
    func onDeviceModelName() {
        #expect(FirebaseAI.SystemLanguageModel.default._modelName == TaskRunner.onDeviceModelVersion)
        #expect(HybridModel(primary: FirebaseAI.SystemLanguageModel.default, secondary: FakeModel(name: "cloud", behaviour: .fails, calls: Calls()))
            ._modelName == "hybrid:\(TaskRunner.onDeviceModelVersion),cloud")
    }
}
