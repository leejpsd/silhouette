// The ledger of everything that has left the device, shown in the "Leaving your device" bar.
//
// Every network call the app makes is to go through `OutboundLog.send`, which records the entry
// before the request is made. A payload, when shown, is a `CloudText`: only text that
// SilhouetteCore minted from a Skeleton, Generalized or Public value can appear in the log.

import Foundation
import SilhouetteCore

public struct OutboundEntry: Sendable, Identifiable {
    public enum Channel: String, Sendable {
        case aiCloud = "ai-cloud"
        case appCheck = "app-check"
        case firestore
        case remoteConfig = "remote-config"
        case other
    }

    public enum Status: Sendable, Equatable {
        /// Recorded before the request is made.
        case attempted
        /// The request reached the destination; HTTP status of the response.
        case sent(Int)
        /// Not completed (the reason is an error kind, never a value).
        case failed(String)
        /// Answered by the on-device model: nothing left the device.
        case answeredOnDevice
    }

    public let id: UUID
    public let channel: Channel
    public let at: Date
    /// Host the request went to.
    public let destination: String
    /// What kind of content left (copy keys under `outbound.field.`), never values.
    public let fields: [String]
    /// For model calls: the request as the app built it. Only cloud-safe text can be recorded.
    public let payload: CloudText?
    public var status: Status
    /// The cloud model, for model requests.
    public let model: String?

    public init(channel: Channel, at: Date = Date(), destination: String, fields: [String], payload: CloudText? = nil,
                status: Status = .sent(200), model: String? = nil) {
        self.id = UUID()
        self.status = status
        self.model = model
        self.channel = channel
        self.at = at
        self.destination = destination
        self.fields = fields
        self.payload = payload
    }
}

public final class OutboundLog: @unchecked Sendable {
    public static let shared = OutboundLog()

    private let lock = NSLock()
    private var storage: [OutboundEntry] = []
    private var observers: [UUID: @Sendable ([OutboundEntry]) -> Void] = [:]

    public init() {}

    public var entries: [OutboundEntry] { lock.withLock { storage } }

    /// Records an entry, then performs the request. Use this for every call that leaves the device.
    public func send<T>(_ entry: OutboundEntry, _ request: () async throws -> T) async rethrows -> T {
        record(entry)
        return try await request()
    }

    /// Changes the status of a recorded entry (after the response or the failure).
    public func update(_ id: UUID, status: OutboundEntry.Status) {
        let (snapshot, callbacks) = lock.withLock { () -> ([OutboundEntry], [@Sendable ([OutboundEntry]) -> Void]) in
            if let i = storage.firstIndex(where: { $0.id == id }) { storage[i].status = status }
            return (storage, Array(observers.values))
        }
        for callback in callbacks { callback(snapshot) }
    }

    /// True once any request has actually left the device (sent or attempted).
    public var anythingLeft: Bool {
        entries.contains { e in
            switch e.status {
            case .answeredOnDevice: false
            default: true
            }
        }
    }

    public func record(_ entry: OutboundEntry) {
        let (snapshot, callbacks) = lock.withLock { () -> ([OutboundEntry], [@Sendable ([OutboundEntry]) -> Void]) in
            storage.append(entry)
            return (storage, Array(observers.values))
        }
        for callback in callbacks { callback(snapshot) }
    }

    /// Forgets every entry ("Delete everything" erases the record of what was sent).
    public func clear() {
        let callbacks = lock.withLock { () -> [@Sendable ([OutboundEntry]) -> Void] in
            storage.removeAll()
            return Array(observers.values)
        }
        for callback in callbacks { callback([]) }
    }

    /// Calls `onChange` with the full list after every change. Returns a token for `removeObserver`.
    @discardableResult
    public func observe(_ onChange: @escaping @Sendable ([OutboundEntry]) -> Void) -> UUID {
        let id = UUID()
        lock.withLock { observers[id] = onChange }
        return id
    }

    public func removeObserver(_ id: UUID) {
        _ = lock.withLock { observers.removeValue(forKey: id) }
    }
}
