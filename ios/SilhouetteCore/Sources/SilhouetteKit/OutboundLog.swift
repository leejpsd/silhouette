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

    public let id = UUID()
    public let channel: Channel
    public let at: Date
    /// Host the request went to.
    public let destination: String
    /// What kind of content left (copy keys under `outbound.field.`), never values.
    public let fields: [String]
    /// For model calls: exactly what was sent.
    public let payload: CloudText?

    public init(channel: Channel, at: Date = Date(), destination: String, fields: [String], payload: CloudText? = nil) {
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
