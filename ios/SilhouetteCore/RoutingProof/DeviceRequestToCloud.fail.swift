// Must not compile: an on-device request (Raw input) sent to the cloud.
// expect-error: cannot convert value of type 'DeviceRequest' to expected argument type 'CloudRequest'
import SilhouetteCore
import SilhouetteKit

func leak(port: any ModelPort, personal: DeviceRequest) async throws {
    _ = try await port.generateInCloud(personal)
}
