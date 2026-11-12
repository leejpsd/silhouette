import CryptoKit
import Foundation
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

@Suite("Encrypted answer store")
struct StoreTests {
    func temporaryStore(keys: any KeyStore = InMemoryKeyStore()) -> AnswerStore {
        AnswerStore(directory: FileManager.default.temporaryDirectory.appendingPathComponent("silhouette-test-\(UUID())"), keys: keys)
    }

    func sampleSession() throws -> QuickCheckSession {
        var (_, s) = try Repo.session()
        s.answer("householdSize", with: .integer(4))
        s.answer("income", with: .income(.exact(31337)))
        s.answer("benefits", with: .selection([]))
        s.answer("hasEarnedIncome", with: .choice("yes"))
        s.skip("residentStatus")
        return s
    }

    @Test("answers round-trip, including skipped and empty selections")
    func roundTrip() throws {
        let store = temporaryStore()
        defer { try? store.deleteEverything() }
        let s = try sampleSession()
        try store.save(s.answers)
        let loaded = QuickCheckSession(steps: s.steps, answers: try store.load(steps: s.steps))
        #expect(loaded.answers.value == s.answers.value)
        #expect(loaded.displayAnswer(for: "residentStatus") == .skipped)
        #expect(loaded.displayAnswer(for: "benefits") == .value(.selection([])))
    }

    @Test("the file on disk is ciphertext: no answer value or step id appears in it")
    func encryptedAtRest() throws {
        let store = temporaryStore()
        defer { try? store.deleteEverything() }
        try store.save(try sampleSession().answers)
        let bytes = try Data(contentsOf: store.fileURL)
        for needle in ["31337", "householdSize", "residentStatus", "yes", "exact"] {
            #expect(bytes.range(of: Data(needle.utf8)) == nil, "\(needle) found in the stored file")
        }
        let values = try store.fileURL.resourceValues(forKeys: [.isExcludedFromBackupKey])
        #expect(values.isExcludedFromBackup == true)
    }

    @Test("a different key cannot read the file, and tampering is detected")
    func integrity() throws {
        let keys = InMemoryKeyStore()
        let store = temporaryStore(keys: keys)
        defer { try? store.deleteEverything() }
        let s = try sampleSession()
        try store.save(s.answers)
        var bytes = try Data(contentsOf: store.fileURL)
        bytes[bytes.count - 1] ^= 0x01
        try bytes.write(to: store.fileURL)
        #expect(throws: StoreError.self) { try store.load(steps: s.steps) }
        try store.save(s.answers)
        try keys.save(SymmetricKey(size: .bits256))
        #expect(throws: StoreError.self) { try store.load(steps: s.steps) }
    }

    @Test("delete everything removes the file and the key")
    func deleteEverything() throws {
        let keys = InMemoryKeyStore()
        let store = temporaryStore(keys: keys)
        let s = try sampleSession()
        try store.save(s.answers)
        #expect(store.hasSavedData)
        #expect(try keys.load() != nil)
        try store.deleteEverything()
        #expect(!store.hasSavedData)
        #expect(!FileManager.default.fileExists(atPath: store.directory.path))
        #expect(try keys.load() == nil)
        #expect(try store.load(steps: s.steps).value == QuickCheckAnswers())
    }

    @Test("stored answers that no longer fit the pack are dropped on load")
    func sanitizeOnLoad() throws {
        let (_, s) = try Repo.session()
        let json = try JSON.parse(#"{"version":1,"answers":{"householdSize":{"int":99},"housing":{"choice":"renter"},"gone":{"int":1},"numChildren":null,"benefits":{"selection":["cash"]}}}"#)
        let decoded = AnswerCodec.decode(json, steps: s.steps)
        let session = QuickCheckSession(steps: s.steps, answers: Raw(decoded))
        #expect(session.displayAnswer(for: "householdSize") == nil)
        #expect(session.displayAnswer(for: "housing") == .value(.choice("renter")))
        #expect(session.displayAnswer(for: "numChildren") == .skipped)
        #expect(session.displayAnswer(for: "benefits") == nil)
        #expect(session.displayAnswer(for: "gone") == nil)
    }

    #if os(iOS)
    /// A SwiftPM test bundle on the simulator runs without a host app and has no keychain
    /// entitlement (errSecMissingEntitlement, -34018). The app itself has one; the
    /// delete-everything UI test covers the Keychain path there.
    @Test("the Keychain key store saves, loads and deletes the device key")
    func keychain() throws {
        let keys = KeychainKeyStore(service: "app.silhouette.benefits.tests", account: UUID().uuidString)
        defer { try? keys.delete() }
        try withKnownIssue("no keychain entitlement in a hostless test bundle") {
            #expect(try keys.load() == nil)
            let key = SymmetricKey(size: .bits256)
            try keys.save(key)
            #expect(try keys.load() == key)
            try keys.delete()
            #expect(try keys.load() == nil)
        } when: {
            Self.keychainUnavailable
        } matching: { issue in
            if case .keychain(-34018)? = issue.error as? StoreError { return true }
            return false
        }
    }

    static var keychainUnavailable: Bool {
        do { _ = try KeychainKeyStore(service: "app.silhouette.benefits.tests", account: "probe").load(); return false } catch {
            if case .keychain(-34018) = error as? StoreError { return true }
            return false
        }
    }
    #endif
}
