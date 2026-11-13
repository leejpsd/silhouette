// Local encrypted store for Quick Check answers.
// - One 256-bit AES-GCM key per device, kept in the Keychain (this device only, available after
//   first unlock, never synced).
// - The answers file is sealed with AES-GCM (fresh nonce on every write, record name bound as
//   additional data), written with complete file protection, and excluded from backup.
// - `deleteEverything()` removes the file and the key.

import CryptoKit
import Foundation
import Security
import SilhouetteCore

// MARK: - Keys

public protocol KeyStore: Sendable {
    func load() throws -> SymmetricKey?
    func save(_ key: SymmetricKey) throws
    func delete() throws
}

public enum StoreError: Error, CustomStringConvertible {
    case keychain(OSStatus)
    case unreadable

    public var description: String {
        switch self {
        case .keychain(let status): "Keychain error \(status)"
        case .unreadable: "The saved answers could not be decrypted"
        }
    }
}

/// The device key as a generic password item in the Keychain.
public struct KeychainKeyStore: KeyStore {
    public let service: String
    public let account: String

    public init(service: String = "app.silhouette.benefits.store", account: String = "answers-key") {
        self.service = service
        self.account = account
    }

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecUseDataProtectionKeychain as String: true,
        ]
    }

    public func load() throws -> SymmetricKey? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else { throw StoreError.keychain(status) }
        return SymmetricKey(data: data)
    }

    public func save(_ key: SymmetricKey) throws {
        var q = query
        q[kSecValueData as String] = key.withUnsafeBytes { Data($0) }
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        q[kSecAttrSynchronizable as String] = false
        let status = SecItemAdd(q as CFDictionary, nil)
        guard status == errSecSuccess else { throw StoreError.keychain(status) }
    }

    public func delete() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw StoreError.keychain(status) }
    }
}

/// For tests.
public final class InMemoryKeyStore: KeyStore, @unchecked Sendable {
    private let lock = NSLock()
    private var key: SymmetricKey?
    public init() {}
    public func load() throws -> SymmetricKey? { lock.withLock { key } }
    public func save(_ key: SymmetricKey) throws { lock.withLock { self.key = key } }
    public func delete() throws { lock.withLock { key = nil } }
}

// MARK: - Store

public struct AnswerStore: Sendable {
    public let directory: URL
    public let keys: any KeyStore
    static let record = "answers"
    static let additionalData = Data("silhouette.answers.v1".utf8)

    public var fileURL: URL { directory.appendingPathComponent("\(Self.record).sealed") }

    /// `directory` defaults to Application Support/Silhouette.
    public init(directory: URL? = nil, keys: any KeyStore = KeychainKeyStore()) {
        self.directory = directory
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Silhouette", isDirectory: true)
        self.keys = keys
    }

    private func key(createIfMissing: Bool) throws -> SymmetricKey? {
        if let existing = try keys.load() { return existing }
        guard createIfMissing else { return nil }
        let key = SymmetricKey(size: .bits256)
        try keys.save(key)
        return key
    }

    public func save(_ answers: Raw<QuickCheckAnswers>) throws {
        try seal(AnswerCodec.encode(answers.value), to: fileURL, additionalData: Self.additionalData)
    }

    /// The saved answers, or empty answers when nothing is saved. A file that cannot be decrypted
    /// (for example after the key was removed) throws `StoreError.unreadable`.
    public func load(steps: [Step]) throws -> Raw<QuickCheckAnswers> {
        guard let json = try open(fileURL, additionalData: Self.additionalData) else { return Raw(QuickCheckAnswers()) }
        return Raw(AnswerCodec.decode(json, steps: steps))
    }

    // MARK: The document in progress

    static let documentAdditionalData = Data("silhouette.document.v1".utf8)
    public var documentURL: URL { directory.appendingPathComponent("document.sealed") }

    public func saveDocument(_ session: DocumentSession) throws {
        try seal(DocumentCodec.encode(session.draft.value), to: documentURL, additionalData: Self.documentAdditionalData)
    }

    public func loadDocument(schema: JSON) throws -> DocumentSession? {
        guard let json = try open(documentURL, additionalData: Self.documentAdditionalData),
              let draft = DocumentCodec.decode(json, schema: schema) else { return nil }
        return DocumentSession(draft: Raw(draft))
    }

    public func deleteDocument() throws {
        if FileManager.default.fileExists(atPath: documentURL.path) { try FileManager.default.removeItem(at: documentURL) }
    }

    // MARK: Sealing

    private func seal(_ json: JSON, to url: URL, additionalData: Data) throws {
        guard let key = try key(createIfMissing: true) else { return }
        let sealed = try AES.GCM.seal(Data(json.jsonText.utf8), using: key, authenticating: additionalData)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try excludeFromBackup(directory)
        #if os(iOS)
        try sealed.combined!.write(to: url, options: [.atomic, .completeFileProtection])
        #else
        try sealed.combined!.write(to: url, options: [.atomic])
        #endif
        try excludeFromBackup(url)
    }

    private func open(_ url: URL, additionalData: Data) throws -> JSON? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        guard let key = try key(createIfMissing: false) else { throw StoreError.unreadable }
        do {
            let box = try AES.GCM.SealedBox(combined: Data(contentsOf: url))
            return try JSON.parse(AES.GCM.open(box, using: key, authenticating: additionalData))
        } catch {
            throw StoreError.unreadable
        }
    }

    /// Removes the answers, the document in progress and the device key.
    public func deleteEverything() throws {
        if FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.removeItem(at: directory)
        }
        try keys.delete()
    }

    public var hasSavedData: Bool { FileManager.default.fileExists(atPath: fileURL.path) }

    private func excludeFromBackup(_ url: URL) throws {
        var u = url
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try u.setResourceValues(values)
    }
}

// MARK: - Codec

/// The stored form of the answers: `{"version":1,"answers":{"stepId": null | {"int":3} | …}}`.
/// `null` means skipped.
enum AnswerCodec {
    static func encode(_ answers: QuickCheckAnswers) -> JSON {
        var out = JSONObject()
        for (id, answer) in answers.byStep.sorted(by: { $0.key < $1.key }) {
            switch answer {
            case .skipped: out[id] = .null
            case .value(let value):
                let tagged: (String, JSON) = switch value {
                case .integer(let n): ("int", .number(Double(n)))
                case .choice(let c): ("choice", .string(c))
                case .selection(let s): ("selection", .array(s.map(JSON.string)))
                case .boolean(let b): ("bool", .bool(b))
                case .income(.band(let id)): ("band", .string(id))
                case .income(.exact(let n)): ("exact", .number(n))
                }
                out[id] = .object(JSONObject([tagged]))
            }
        }
        return .object(JSONObject([("version", .number(1)), ("answers", .object(out))]))
    }

    static func decode(_ json: JSON, steps: [Step]) -> QuickCheckAnswers {
        var answers = QuickCheckAnswers()
        guard let stored = json["answers"]?.objectValue else { return answers }
        func int(_ j: JSON?) -> Int? {
            guard let n = j?.numberValue, n.rounded() == n, abs(n) <= 1e15 else { return nil }
            return Int(n)
        }
        for (id, entry) in stored.entries {
            if entry.isNull { answers.byStep[id] = .skipped; continue }
            guard let object = entry.objectValue, object.count == 1 else { continue }
            let (tag, v) = object.entries[0]
            let value: AnswerValue? = switch tag {
            case "int": int(v).map(AnswerValue.integer)
            case "choice": v.stringValue.map(AnswerValue.choice)
            case "selection": v.arrayValue.map { .selection($0.compactMap(\.stringValue)) }
            case "bool": v.boolValue.map(AnswerValue.boolean)
            case "band": v.stringValue.map { .income(.band($0)) }
            case "exact": v.numberValue.map { .income(.exact($0)) }
            default: nil
            }
            if let value { answers.byStep[id] = .value(value) }
        }
        return QuickCheckSession.sanitized(answers, steps: steps)
    }
}
