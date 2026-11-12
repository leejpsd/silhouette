// Canary leak test: no string listed in a shared/fixtures/canary/*.json fixture may appear in the
// skeleton (the outbound payload) of its document.

import Foundation
import Testing
@testable import SilhouetteCore

@Suite("shared/fixtures/canary")
struct CanaryTests {
    @Test("every file in the folder is a canary fixture or a document one of them uses")
    func folderIsFullyCovered() throws {
        let files = try Shared.files(in: Shared.canaryDir)
        let fixtures = files.filter { $0.hasSuffix(".json") }
        #expect(!fixtures.isEmpty)
        var documents = Set<String>()
        for f in fixtures {
            documents.insert(try #require(try Shared.json("fixtures/canary/\(f)")["document"]?.stringValue, "\(f) has no document"))
        }
        let unknown = files.filter { !$0.hasSuffix(".json") && !documents.contains($0) }
        #expect(unknown.isEmpty, "files the canary suite does not know how to run: \(unknown)")
    }

    static func fixtures() throws -> [String] {
        try Shared.files(in: Shared.canaryDir).filter { $0.hasSuffix(".json") }
    }

    @Test("no canary string appears in the skeleton", arguments: try fixtures())
    func noLeak(_ file: String) throws {
        let canary = try Shared.json("fixtures/canary/\(file)")
        let document = try Shared.text("fixtures/canary/\(try #require(canary["document"]?.stringValue))")
        let values = try #require(canary["canaries"]?.arrayValue).compactMap(\.stringValue)
        #expect(!values.isEmpty)
        let result = Skeletonizer.skeletonize(Raw(document), allowlist: try Shared.allowlist(try #require(canary["locale"]?.stringValue)))
        let payload = CloudBoundary.outbound(result.skeleton).text

        // The document really contains canaries, so the check is meaningful.
        #expect(values.contains { Skeletonizer.normalize(document).contains($0) })
        for value in values {
            let bytes = Array(value.utf8)
            let leakedExactly = Array(payload.utf8).windows(bytes.count).contains { $0.elementsEqual(bytes) }
            #expect(!leakedExactly && !payload.contains(value), "leaked: \(value)")
        }
        // Printing the result reveals nothing either.
        let printed = String(describing: result) + String(reflecting: result)
        for value in values where value.count > 3 {
            #expect(!printed.contains(value), "printing SkeletonResult leaked: \(value)")
        }
    }
}

extension Array {
    func windows(_ size: Int) -> [ArraySlice<Element>] {
        guard size > 0, size <= count else { return [] }
        return (0...(count - size)).map { self[$0..<($0 + size)] }
    }
}
