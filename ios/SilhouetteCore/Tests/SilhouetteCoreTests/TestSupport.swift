// Test helpers. Contract files are read directly from the repository's shared/ folder (never
// copied), resolved from this file's location.

import Foundation
import Testing
@testable import SilhouetteCore

enum Shared {
    /// <repo>/shared, from <repo>/ios/SilhouetteCore/Tests/SilhouetteCoreTests/TestSupport.swift
    static let root: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()  // SilhouetteCoreTests
        .deletingLastPathComponent()  // Tests
        .deletingLastPathComponent()  // SilhouetteCore
        .deletingLastPathComponent()  // ios
        .deletingLastPathComponent()  // repository root
        .appendingPathComponent("shared", isDirectory: true)

    static let conformanceDir = root.appendingPathComponent("fixtures/conformance", isDirectory: true)
    static let canaryDir = root.appendingPathComponent("fixtures/canary", isDirectory: true)

    static func url(_ relative: String) -> URL { root.appendingPathComponent(relative) }

    static func text(_ relative: String) throws -> String {
        try String(contentsOf: url(relative), encoding: .utf8)
    }

    static func json(_ relative: String) throws -> JSON {
        try JSON.parse(Data(contentsOf: url(relative)))
    }

    static func files(in dir: URL) throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { !$0.hasPrefix(".") }.sorted()
    }

    static func allowlist(_ locale: String) throws -> Allowlist {
        try Allowlist(files: [json("skeleton/allowlist/en.json"), json("skeleton/allowlist/\(locale).json")])
    }

    static func conformance(_ file: String) throws -> JSON {
        try json("fixtures/conformance/\(file)")
    }

    /// The `cases` of a conformance file as test arguments.
    static func cases(_ file: String) throws -> [FixtureCase] {
        guard let cases = try conformance(file)["cases"]?.arrayValue else { throw ContractFileError("\(file) has no cases") }
        return cases.map { FixtureCase(file: file, json: $0) }
    }
}

struct FixtureCase: Sendable, CustomTestStringConvertible {
    let file: String
    let json: JSON
    var id: String {
        json["id"]?.stringValue ?? json["token"]?.stringValue.map { JSON.string($0).jsonText } ?? json["value"]?.jsonText ?? json.jsonText
    }
    var testDescription: String { id }
    subscript(key: String) -> JSON? { json[key] }
}

/// Exact equality: same structure, exact strings, ordered object keys, and identical
/// JSON.stringify text.
func expectIdentical(_ actual: JSON, _ expected: JSON?, _ context: String, sourceLocation: SourceLocation = #_sourceLocation) {
    guard let expected else {
        Issue.record("\(context): fixture has no expected value", sourceLocation: sourceLocation)
        return
    }
    #expect(actual.isIdentical(to: expected), "\(context)\n  actual:   \(actual.jsonText)\n  expected: \(expected.jsonText)",
            sourceLocation: sourceLocation)
    #expect(Array(actual.jsonText.utf8) == Array(expected.jsonText.utf8), "\(context): serialization differs",
            sourceLocation: sourceLocation)
}

/// Code-point equality (Swift `==` on String would accept canonically equivalent strings).
func expectExactString(_ actual: String, _ expected: String?, _ context: String, sourceLocation: SourceLocation = #_sourceLocation) {
    #expect(expected.map { actual.exactlyEquals($0) } == true,
            "\(context)\n  actual:   \(JSON.string(actual).jsonText)\n  expected: \(expected.map { JSON.string($0).jsonText } ?? "nil")",
            sourceLocation: sourceLocation)
}

/// The error class names used by `expectedError` in the fixtures.
enum FixtureError: String {
    case generalize = "GeneralizeError"
    case rule = "RuleError"
    case input = "InputError"

    func matches(_ error: any Error) -> Bool {
        switch self {
        case .generalize: error is GeneralizeError
        case .rule: error is RuleError || { if case .rule = error as? VerdictError { true } else { false } }()
        case .input: error is InputError || { if case .input = error as? VerdictError { true } else { false } }()
        }
    }
}

func expectFixtureError(_ name: String, _ context: String, sourceLocation: SourceLocation = #_sourceLocation, _ body: () throws -> Void) {
    guard let kind = FixtureError(rawValue: name) else {
        Issue.record("\(context): unknown expectedError \(name)", sourceLocation: sourceLocation)
        return
    }
    do {
        try body()
        Issue.record("\(context): expected \(name), nothing was thrown", sourceLocation: sourceLocation)
    } catch {
        #expect(kind.matches(error), "\(context): expected \(name), got \(type(of: error))", sourceLocation: sourceLocation)
    }
}
