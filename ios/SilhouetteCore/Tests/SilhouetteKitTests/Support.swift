import Foundation
@testable import SilhouetteCore
@testable import SilhouetteKit

enum Repo {
    /// <repo>/ios, from <repo>/ios/SilhouetteCore/Tests/SilhouetteKitTests/Support.swift
    static let ios: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    static let shared = ios.deletingLastPathComponent().appendingPathComponent("shared", isDirectory: true)
    static let localCopy = ios.appendingPathComponent("Silhouette/Resources/copy.local.json")

    static func bundle() throws -> SharedBundle {
        try SharedBundle(directory: shared, localCopy: JSON.parse(Data(contentsOf: localCopy)))
    }

    static func session() throws -> (SharedBundle, QuickCheckSession) {
        let b = try bundle()
        return (b, QuickCheckSession(steps: try QuickCheck.steps(pack: b.packInfo, bands: b.bands)))
    }
}

extension Array where Element == ProgramVerdict {
    subscript(program id: String) -> ProgramVerdict? { first { $0.programId == id } }
}
