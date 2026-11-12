// Quick Check: one question per screen, every question can be skipped. Skipped answers are
// unanswered for the verdict engine, which reports them as `depends` with `dependsOn`.
// Pure logic, no UI.

import Foundation
import SilhouetteCore

// MARK: - Steps

public struct Step: Sendable, Identifiable {
    public enum Kind: Sendable {
        case income(bands: [Bands.IncomeBand])
        case integer(min: Int, max: Int)
        case single(values: [String])
        case multiple(values: [String])
        case boolean
    }

    public let id: String
    public let kind: Kind
    public let sensitive: Bool

    public var isIncome: Bool { if case .income = kind { true } else { false } }
}

public enum QuickCheckError: Error, CustomStringConvertible {
    case unsupportedQuestion(String)
    case badQuestionOrder(String)

    public var description: String {
        switch self {
        case .unsupportedQuestion(let id): "Unsupported or incomplete question in pack: \(id)"
        case .badQuestionOrder(let why): "questionOrder: \(why)"
        }
    }
}

public enum QuickCheck {
    /// The reserved step id for the income question (shared/rulepacks/SPEC.md section 2).
    public static let incomeStep = "income"
    public static let maxExactIncome = 100_000_000

    /// Steps in the pack's `questionOrder`, or by default the income step first and then
    /// `questions[]` in pack order.
    public static func steps(pack: PackInfo, bands: Bands) throws -> [Step] {
        var byId: [String: Step] = [:]
        for q in pack.questions {
            let kind: Step.Kind
            switch q.type {
            case "int":
                guard let min = q.min, let max = q.max, min <= max else { throw QuickCheckError.unsupportedQuestion(q.id) }
                kind = .integer(min: min, max: max)
            case "enum": kind = .single(values: q.values)
            case "multi": kind = .multiple(values: q.values)
            case "bool": kind = .boolean
            default: throw QuickCheckError.unsupportedQuestion(q.id)
            }
            byId[q.id] = Step(id: q.id, kind: kind, sensitive: q.sensitive)
        }
        byId[incomeStep] = Step(id: incomeStep, kind: .income(bands: bands.annualIncome), sensitive: false)
        let order = pack.questionOrder ?? [incomeStep] + pack.questions.map(\.id)
        guard Set(order).count == order.count, order.count == byId.count else {
            throw QuickCheckError.badQuestionOrder("must list every question and \"income\" exactly once")
        }
        return try order.map { id in
            guard let step = byId[id] else { throw QuickCheckError.badQuestionOrder("unknown step \(id)") }
            return step
        }
    }

    /// The step a verdict-engine variable comes from (`annualIncome` comes from `income`).
    public static func step(forVariable variable: String) -> String {
        variable == "annualIncome" ? incomeStep : variable
    }

    public static let verdictOrder: [Verdict] = [.likely, .maybe, .depends, .unlikely]

    /// Programs grouped by verdict in display order; empty groups are omitted.
    public static func groups(_ results: [ProgramVerdict]) -> [(verdict: Verdict, programs: [ProgramVerdict])] {
        verdictOrder.compactMap { verdict in
            let programs = results.filter { $0.verdict == verdict }
            return programs.isEmpty ? nil : (verdict, programs)
        }
    }
}

// MARK: - Answers

public enum IncomeAnswer: Sendable, Equatable {
    case band(String)
    /// Currency units per year, as typed (decimals allowed).
    case exact(Double)
}

public enum AnswerValue: Sendable, Equatable {
    case integer(Int)
    case choice(String)
    /// Zero selections is a valid answer ("none of these"), distinct from skipping.
    case selection([String])
    case boolean(Bool)
    case income(IncomeAnswer)
}

/// One step's state: absent from the dictionary means not asked yet.
public enum Answer: Sendable, Equatable {
    case skipped
    case value(AnswerValue)
}

public enum AnswerProblem: String, Sendable {
    case integer = "q.error.integer"
    case choose = "q.error.choose"
    case amount = "q.error.amount"
}

extension Step {
    /// Checks one answer against this step. `nil` when valid.
    public func problem(with value: AnswerValue) -> AnswerProblem? {
        switch (kind, value) {
        case (.integer(let min, let max), .integer(let n)):
            return n >= min && n <= max ? nil : .integer
        case (.integer, _):
            return .integer
        case (.single(let values), .choice(let c)):
            return values.contains(c) ? nil : .choose
        case (.multiple(let values), .selection(let picked)):
            return picked.allSatisfy(values.contains) && Set(picked).count == picked.count ? nil : .choose
        case (.boolean, .boolean):
            return nil
        case (.income(let bands), .income(.band(let id))):
            return bands.contains { $0.id == id } ? nil : .choose
        case (.income, .income(.exact(let amount))):
            return amount.isFinite && amount >= 0 && amount <= Double(QuickCheck.maxExactIncome) ? nil : .amount
        default:
            return .choose
        }
    }
}

/// Answers by step id. Exact personal values: always kept inside `Raw` by `QuickCheckSession`.
public struct QuickCheckAnswers: Sendable, Equatable {
    var byStep: [String: Answer] = [:]
    public init() {}
}

// MARK: - Session

/// The Quick Check state for one pack. Answers are held as `Raw` and are revealed only to the
/// verdict engine, the encrypted store, and the question screen that shows the user their own
/// answer.
public struct QuickCheckSession: Sendable {
    public let steps: [Step]
    public private(set) var answers: Raw<QuickCheckAnswers>

    public init(steps: [Step], answers: Raw<QuickCheckAnswers> = Raw(QuickCheckAnswers())) {
        self.steps = steps
        self.answers = answers.map { Self.sanitized($0, steps: steps) }
    }

    public func step(_ id: String) -> Step? { steps.first { $0.id == id } }
    public func index(of id: String) -> Int? { steps.firstIndex { $0.id == id } }

    /// True once any step has been answered or skipped.
    public var isStarted: Bool { !answers.value.byStep.isEmpty }

    /// Index of the first step that has not been answered or skipped, or `steps.count`.
    public var firstOpenIndex: Int {
        steps.firstIndex { answers.value.byStep[$0.id] == nil } ?? steps.count
    }

    /// The user's own answer, for showing it back to them on this device.
    public func displayAnswer(for stepId: String) -> Answer? {
        answers.value.byStep[stepId]
    }

    /// Stores a valid answer. Returns the problem instead when the value does not fit the step.
    @discardableResult
    public mutating func answer(_ stepId: String, with value: AnswerValue) -> AnswerProblem? {
        guard let step = step(stepId) else { return .choose }
        if let problem = step.problem(with: value) { return problem }
        answers = answers.map { var a = $0; a.byStep[stepId] = .value(value); return a }
        return nil
    }

    public mutating func skip(_ stepId: String) {
        guard step(stepId) != nil else { return }
        answers = answers.map { var a = $0; a.byStep[stepId] = .skipped; return a }
    }

    public mutating func reset() {
        answers = Raw(QuickCheckAnswers())
    }

    /// Verdict-engine answers (shared/rulepacks/SPEC.md section 4), still Raw.
    public var engineAnswers: Raw<JSON> {
        answers.map { Self.engineAnswers($0, steps: steps) }
    }

    public func verdicts(pack: RulePack, bands: Bands) throws(VerdictError) -> [ProgramVerdict] {
        try RulesEngine.verdicts(pack: pack, bands: bands, answers: engineAnswers)
    }

    static func engineAnswers(_ answers: QuickCheckAnswers, steps: [Step]) -> JSON {
        var out = JSONObject()
        for step in steps {
            guard case .value(let value)? = answers.byStep[step.id], step.problem(with: value) == nil else { continue }
            switch value {
            case .income(.band(let id)): out["incomeBand"] = .string(id)
            case .income(.exact(let amount)): out["annualIncome"] = .number(amount)
            case .integer(let n): out[step.id] = .number(Double(n))
            case .choice(let c): out[step.id] = .string(c)
            case .selection(let picked): out[step.id] = .array(picked.map(JSON.string))
            case .boolean(let b): out[step.id] = .bool(b)
            }
        }
        return .object(out)
    }

    /// Drops answers that do not belong to a step or no longer validate (data loaded from storage
    /// may predate a pack change).
    static func sanitized(_ answers: QuickCheckAnswers, steps: [Step]) -> QuickCheckAnswers {
        var out = QuickCheckAnswers()
        for step in steps {
            switch answers.byStep[step.id] {
            case .skipped?: out.byStep[step.id] = .skipped
            case .value(let v)? where step.problem(with: v) == nil: out.byStep[step.id] = .value(v)
            default: break
            }
        }
        return out
    }
}
