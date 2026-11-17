// Prompt files from shared/prompts: the "System instruction" section and the fenced
// "User content" template. Bundled with the app; never pasted into source.

import Foundation
import SilhouetteCore

public struct PromptTemplate: Sendable {
    public let id: String
    public let system: String
    public let user: String

    /// Splits a prompt file into its sections.
    public init(id: String, markdown: String) throws {
        func section(_ title: String) throws -> String {
            guard let start = markdown.range(of: "## \(title)") else { throw ContractFileError("\(id): missing section \(title)") }
            var body = markdown[start.upperBound...]
            if let end = body.range(of: "\n## ") { body = body[..<end.lowerBound] }
            return body.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let userSection = try section("User content")
        guard let open = userSection.range(of: "```\n"),
              let close = userSection.range(of: "\n```", range: open.upperBound..<userSection.endIndex)
        else { throw ContractFileError("\(id): no fenced user template") }
        self.id = id
        system = try section("System instruction")
        user = String(userSection[open.upperBound..<close.lowerBound])
    }

    /// Replaces `{name}` with values; unknown placeholders stay.
    static func fill(_ template: String, _ values: [String: String]) -> String {
        CopyBook.format(template, values)
    }
}

/// Every prompt the app uses, by file name.
public struct PromptLibrary: Sendable {
    let templates: [String: PromptTemplate]
    /// The part texts of `pointer-extract-device.v1.md`, by part (`core`, `gross`, `deductions`,
    /// `deductions-again`), exactly as written there.
    public let deviceParts: [String: String]

    public init(directory: URL) throws {
        var out: [String: PromptTemplate] = [:]
        let files = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        for file in files where file.hasSuffix(".md") && file != "OUTPUT_CHECKS.md" {
            let id = String(file.dropLast(3))
            let markdown = try String(contentsOf: directory.appendingPathComponent(file), encoding: .utf8)
            if let t = try? PromptTemplate(id: id, markdown: markdown) { out[id] = t }
        }
        templates = out
        let device = try? String(contentsOf: directory.appendingPathComponent("pointer-extract-device.v1.md"), encoding: .utf8)
        deviceParts = device.map(Self.parseDeviceParts) ?? [:]
    }

    /// Splits pointer-extract-device.v1.md into its part texts. The deductions part asked again is the
    /// deductions part's text, a line break, then the sentence after "then:".
    static func parseDeviceParts(_ markdown: String) -> [String: String] {
        func section(_ title: String) -> String? {
            guard let start = markdown.range(of: "\n## \(title)\n") else { return nil }
            var body = markdown[start.upperBound...]
            if let end = body.range(of: "\n## ") { body = body[..<end.lowerBound] }
            return body.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        var out: [String: String] = [:]
        out["core"] = section("Core part")
        out["gross"] = section("Gross part")
        out["deductions"] = section("Deductions part")
        if let deductions = out["deductions"], let again = section("Deductions part, asked again"),
           let then = again.range(of: "then:") {
            out["deductions-again"] = deductions + "\n" + again[then.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return out
    }

    public subscript(id: String) -> PromptTemplate? { templates[id] }

    /// `{name}.v{n}` for a Remote Config version; an unknown version means the newest bundled one.
    public func versioned(_ name: String, version: Int?, among allowed: ClosedRange<Int>) -> PromptTemplate? {
        if let version, allowed.contains(version), let t = templates["\(name).v\(version)"] { return t }
        let newest = allowed.reversed().first { templates["\(name).v\($0)"] != nil }
        return newest.flatMap { templates["\(name).v\($0)"] }
    }
}
