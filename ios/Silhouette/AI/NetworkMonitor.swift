// Whether the device has a network path (for the offline sample answers, routing.json offlineSample).

import Foundation
import Network

final class NetworkMonitor: @unchecked Sendable {
    private let monitor = NWPathMonitor()
    private let lock = NSLock()
    private var satisfied = true

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            self?.lock.withLock { self?.satisfied = path.status == .satisfied }
        }
        monitor.start(queue: DispatchQueue(label: "network-monitor"))
    }

    var isOnline: Bool { lock.withLock { satisfied } }
}
