// A scripted model for UI tests (launch argument `-UITestModel device|cloud|none`): no model and no
// network. `device`: an on-device model is available; `cloud`: only the cloud (simulated); `none`:
// neither. Replies are fixed sentences that never state a result.

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
        guard mode == "cloud" else { throw TaskError(.network, "offline") }
        try await Task.sleep(for: .milliseconds(300))
        return ModelReply(text: "This test answer describes the program in general.", modelVersion: Planner.cloudModel)
    }
}
