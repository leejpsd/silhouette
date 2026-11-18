// A scripted model for UI tests and screenshots (launch argument `-UITestModel`): no model and no
// network. `device`: an on-device model is available; `cloud`: only the cloud (simulated); `none`:
// neither. Text replies are fixed sentences that never state a result. A document is read from the
// bundled samples' answer keys (any other document has no paystub values), part by part on the device.
// Variants script the states of a request: `cloud-slow` (takes longer than usual), `cloud-quota`
// (daily limit), `cloud-blocked` (an output check stopped the reply), `device-unreliable` (the device
// answers a reading that does not pass its checks), `device-notread` (hours worked on the gross pay's
// placeholder, and deductions that do not add up: both left out as not read).

import Foundation
import SilhouetteCore
import SilhouetteKit

final class TestModelPort: ModelPort {
    let mode: String
    /// Silhouette text → pointers of the bundled samples.
    let answerKeys: [(skeleton: String, pointers: JSON)]

    init(mode: String, answerKeys: [(skeleton: String, pointers: JSON)] = []) {
        self.mode = mode
        self.answerKeys = answerKeys
    }

    /// The right answers of the on-device check's documents (shared/fixtures/device-check/answers.json),
    /// found by a line only that document's silhouette has.
    static func checkAnswers(_ bundle: SharedBundle) -> [(skeleton: String, pointers: JSON)] {
        guard let file = bundle.data("fixtures/device-check/answers.json").flatMap({ try? JSON.parse($0) }) else { return [] }
        return (file["documents"]?.arrayValue ?? []).compactMap { d in
            guard let needle = d["needle"]?.stringValue, var core = d["core"]?.objectValue else { return nil }
            if let deductions = d["deductions"]?["deductions"] { core["deductions"] = deductions }
            return (needle, .object(core))
        }
    }

    func deviceAvailability() -> DeviceAvailability { mode.hasPrefix("device") ? .available : .appleIntelligenceNotEnabled }

    private func pointers(in prompt: String) -> JSON? {
        answerKeys.first { prompt.contains($0.skeleton) }?.pointers
    }

    /// The fields of one reading part from an answer key.
    private func part(_ part: String, of pointers: JSON) -> JSON {
        let entries = pointers.objectValue?.entries ?? []
        switch part {
        case "gross": return .object(JSONObject(entries.filter { ["grossPay", "ytdGross"].contains($0.key) }.map { ($0.key, $0.value) }))
        case "deductions", "deductions-again":
            return .object(JSONObject([("deductions", pointers["deductions"] ?? .array([]))]))
        default: return .object(JSONObject(entries.filter { $0.key != "deductions" }.map { ($0.key, $0.value) }))
        }
    }

    func generateOnDevice(_ call: DeviceCall) async throws -> ModelReply {
        guard deviceAvailability() == .available else { throw TaskError(.onDeviceUnavailable, "the on-device model is not available") }
        try await Task.sleep(for: .milliseconds(300))
        if call.taskId == "document.pointer.extract" {
            if mode == "device-unreliable" { return ModelReply(text: #"{"payFrequency":"fortnightly"}"#, modelVersion: TaskRunner.onDeviceModelVersion) }
            var found = pointers(in: call.prompt)
            if mode == "device-notread", var o = found?.objectValue {
                o["hoursWorked"] = o["grossPay"]
                o["deductions"] = .array([])
                found = .object(o)
            }
            let reply = call.part.map { p in found.map { part(p, of: $0) } ?? .object(JSONObject()) } ?? found ?? .object(JSONObject())
            return ModelReply(text: reply.jsonText, modelVersion: TaskRunner.onDeviceModelVersion)
        }
        return ModelReply(text: "This test answer was written on this iPhone.", modelVersion: TaskRunner.onDeviceModelVersion)
    }

    func generateInCloud(_ request: CloudRequest) async throws -> ModelReply {
        guard mode.hasPrefix("cloud") || mode == "device-unreliable" else { throw TaskError(.network, "offline") }
        switch mode {
        case "cloud-slow": try await Task.sleep(for: .seconds(120))
        case "cloud-quota": throw TaskError(.quotaDaily, "scripted", status: 429)
        case "cloud-blocked": throw TaskError(.blocked, "scripted")
        default: try await Task.sleep(for: .milliseconds(300))
        }
        if request.responseSchema != nil {
            return ModelReply(text: (pointers(in: request.prompt.text) ?? .object(JSONObject())).jsonText, modelVersion: Planner.cloudModel)
        }
        return ModelReply(text: "This test answer describes the program in general.", modelVersion: Planner.cloudModel)
    }
}
