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

    public init(directory: URL) throws {
        var out: [String: PromptTemplate] = [:]
        let files = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        for file in files where file.hasSuffix(".md") && file != "OUTPUT_CHECKS.md" {
            let id = String(file.dropLast(3))
            let markdown = try String(contentsOf: directory.appendingPathComponent(file), encoding: .utf8)
            if let t = try? PromptTemplate(id: id, markdown: markdown) { out[id] = t }
        }
        templates = out
    }

    public subscript(id: String) -> PromptTemplate? { templates[id] }

    /// `{name}.v{n}` for a Remote Config version; an unknown version means the newest bundled one.
    public func versioned(_ name: String, version: Int?, among allowed: ClosedRange<Int>) -> PromptTemplate? {
        if let version, allowed.contains(version), let t = templates["\(name).v\(version)"] { return t }
        let newest = allowed.reversed().first { templates["\(name).v\($0)"] != nil }
        return newest.flatMap { templates["\(name).v\($0)"] }
    }
}
