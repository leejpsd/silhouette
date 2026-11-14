// A scripted model for UI tests (launch argument `-UITestModel device|cloud|none`): no model and no
// network. `device`: an on-device model is available; `cloud`: only the cloud (simulated); `none`:
// neither. Replies are fixed sentences that never state a result. Variants of `cloud` script the
// states of a request: `cloud-slow` (takes longer than usual), `cloud-quota` (daily limit),
// `cloud-blocked` (an output check stopped the reply), `cloud-empty` (a document with no paystub values).

import Foundation
import SilhouetteCore
import SilhouetteKit

final class TestModelPort: ModelPort {
    let mode: String

    init(mode: String) { self.mode = mode }

    func deviceAvailability() -> DeviceAvailability { mode == "device" ? .available : .appleIntelligenceNotEnabled }

    func generateOnDevice(_ call: DeviceCall) async throws -> ModelReply {
        try await Task.sleep(for: .milliseconds(300))
        return ModelReply(text: "This test answer was written on this device.", modelVersion: TaskRunner.onDeviceModelVersion)
    }

    func generateInCloud(_ request: CloudRequest) async throws -> ModelReply {
        guard mode.hasPrefix("cloud") else { throw TaskError(.network, "offline") }
        switch mode {
        case "cloud-slow": try await Task.sleep(for: .seconds(120))
        case "cloud-quota": throw TaskError(.quotaDaily, "scripted", status: 429)
        case "cloud-blocked": throw TaskError(.blocked, "scripted")
        default: try await Task.sleep(for: .milliseconds(300))
        }
        if request.responseSchema != nil { return ModelReply(text: "{}", modelVersion: Planner.cloudModel) }
        return ModelReply(text: "This test answer describes the program in general.", modelVersion: Planner.cloudModel)
    }
}
