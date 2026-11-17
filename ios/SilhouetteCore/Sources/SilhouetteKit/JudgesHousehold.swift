// The judges' prepared household (shared/rulepacks/{jurisdiction}/judges-household.json): the answers
// every platform fills the Quick Check with for the judges' path and the on-device check's own result.
// Synthetic: an invented household.

import Foundation
import SilhouetteCore

public struct JudgesHousehold: Sendable {
    /// Answers by question id, in the file's order, as Quick Check answers.
    public let answers: [(id: String, value: AnswerValue)]
    /// Questions the household leaves unanswered on purpose.
    public let unanswered: [String]

    public struct FormatError: Error, CustomStringConvertible {
        public let description: String
    }

    /// Reads the file against the pack's questions (an answer's form follows its question's type).
    public init(json: JSON, pack: PackInfo) throws {
        var out: [(String, AnswerValue)] = []
        for (id, value) in json["answers"]?.objectValue?.entries ?? [] {
            if id == "income" {
                switch value["kind"]?.stringValue {
                case "band": out.append((id, .income(.band(try Self.need(value["bandId"]?.stringValue, id)))))
                case "exact": out.append((id, .income(.exact(try Self.need(value["amount"]?.numberValue, id)))))
                default: throw FormatError(description: "income: kind must be band or exact")
                }
                continue
            }
            guard let question = pack.questions.first(where: { $0.id == id }) else { throw FormatError(description: "\(id): not a question of the pack") }
            switch question.type {
            case "int": out.append((id, .integer(Int(try Self.need(value.numberValue, id)))))
            case "bool": out.append((id, .boolean(try Self.need(value.boolValue, id))))
            case "multi": out.append((id, .selection((value.arrayValue ?? []).compactMap(\.stringValue))))
            default: out.append((id, .choice(try Self.need(value.stringValue, id))))
            }
        }
        answers = out
        unanswered = (json["unanswered"]?.arrayValue ?? []).compactMap(\.stringValue)
    }

    private static func need<T>(_ value: T?, _ id: String) throws -> T {
        guard let value else { throw FormatError(description: "\(id): wrong form") }
        return value
    }
}
