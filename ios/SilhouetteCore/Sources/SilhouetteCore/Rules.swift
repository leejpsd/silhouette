// Rules engine: expression evaluator (section 3) and verdict algorithm (sections 4 and 5) of
// shared/rulepacks/SPEC.md (v1.2). Must stay identical with shared/reference/silhouette.mjs.
// No model is involved.

import Foundation

// MARK: - Errors

/// An expression is malformed or its operands have the wrong type. A pack that raises it is invalid.
public struct RuleError: Error, Sendable, CustomStringConvertible {
    public let description: String
    init(_ description: String) { self.description = description }
}

/// The answers passed to `verdicts` are malformed. Messages never contain user values.
public struct InputError: Error, Sendable, CustomStringConvertible {
    public let description: String
    init(_ description: String) { self.description = description }
}

/// Either kind of failure from `RulesEngine.verdicts`.
public enum VerdictError: Error, Sendable {
    case rule(RuleError)
    case input(InputError)
}

// MARK: - Values

/// The result of evaluating an expression: a JSON value, or the third truth value `unknown`
/// (the answer depends on something the user has not told us).
public indirect enum RuleValue: Sendable {
    case unknown
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([RuleValue])
    case object(JSONObject)

    init(_ json: JSON) {
        switch json {
        case .null: self = .null
        case .bool(let b): self = .bool(b)
        case .number(let n): self = .number(n)
        case .string(let s): self = .string(s)
        case .array(let a): self = .array(a.map(RuleValue.init))
        case .object(let o): self = .object(o)
        }
    }

    /// The JSON value, or `nil` when the value is or contains `unknown`.
    public var json: JSON? {
        switch self {
        case .unknown: return nil
        case .null: return .null
        case .bool(let b): return .bool(b)
        case .number(let n): return .number(n)
        case .string(let s): return .string(s)
        case .array(let items):
            var out: [JSON] = []
            for item in items {
                guard let j = item.json else { return nil }
                out.append(j)
            }
            return .array(out)
        case .object(let o): return .object(o)
        }
    }

    public var isUnknown: Bool { if case .unknown = self { true } else { false } }

    var isPrimitive: Bool {
        switch self {
        case .null, .bool, .number, .string: true
        default: false
        }
    }

    /// Finite number (`isNumber` in the reference).
    var finiteNumber: Double? {
        if case .number(let n) = self, n.isFinite { return n }
        return nil
    }

    /// JavaScript `===` between primitives.
    func strictlyEquals(_ other: RuleValue) -> Bool {
        switch (self, other) {
        case (.null, .null): true
        case (.bool(let a), .bool(let b)): a == b
        case (.number(let a), .number(let b)): a == b
        case (.string(let a), .string(let b)): a.exactlyEquals(b)
        default: false
        }
    }
}

// MARK: - Evaluator

public struct EvalContext {
    /// Top-level variable names whose value is not known. Reading one gives `unknown`.
    public var unavailable: Set<String>
    /// Receives the names of unavailable variables that were read.
    public var unknownReads: [String] = []

    public init(unavailable: Set<String> = []) {
        self.unavailable = unavailable
    }

    func isUnavailable(_ name: String) -> Bool {
        unavailable.contains { $0.exactlyEquals(name) }
    }

    mutating func recordRead(_ name: String) {
        if !unknownReads.contains(where: { $0.exactlyEquals(name) }) { unknownReads.append(name) }
    }
}

public enum RulesEngine {
    private static let arity: [String: (min: Int, max: Int)] = [
        "!": (1, 1), "==": (2, 2), "!=": (2, 2), "<": (2, 2), "<=": (2, 2), ">": (2, 2), ">=": (2, 2),
        "+": (2, .max), "*": (2, .max), "-": (2, 2), "/": (2, 2), "min": (1, .max), "max": (1, .max),
        "floor": (1, 1), "in": (2, 2), "cat": (1, .max),
    ]

    /// Own-property dotted lookup. A missing key, or a walk into a non-object or an array, gives null.
    static func lookup(_ data: JSON, _ path: String) -> JSON {
        var node = data
        for key in path.splitExactly(on: UInt8(ascii: ".")) {
            guard case .object(let object) = node, let next = object[key] else { return .null }
            node = next
        }
        return node
    }

    /// `Math.min` / `Math.max`, including JavaScript's handling of -0.
    private static func jsMin(_ values: [Double]) -> Double {
        values.dropFirst().reduce(values[0]) { a, b in
            b < a || (b == 0 && a == 0 && b.sign == .minus) ? b : a
        }
    }

    private static func jsMax(_ values: [Double]) -> Double {
        values.dropFirst().reduce(values[0]) { a, b in
            b > a || (b == 0 && a == 0 && a.sign == .minus) ? b : a
        }
    }

    /// Evaluates an expression with the strict, three-valued semantics of SPEC.md section 3.
    public static func evaluate(_ expr: JSON, data: JSON, context ctx: inout EvalContext) throws(RuleError) -> RuleValue {
        switch expr {
        case .null, .bool, .number, .string: return RuleValue(expr)
        case .array(let items):
            var out: [RuleValue] = []
            for item in items { out.append(try evaluate(item, data: data, context: &ctx)) }
            return .array(out)
        case .object(let object):
            guard object.count == 1 else { throw RuleError("an expression object has exactly one operator") }
            let (op, raw) = object.entries[0]
            func fail(_ why: String) -> RuleError { RuleError("\(op): \(why)") }

            if op == "var" {
                let path = try evaluate(raw, data: data, context: &ctx)
                if path.isUnknown { return .unknown }
                guard case .string(let p) = path, !p.isEmpty else { throw fail("path must be a non-empty string") }
                let top = p.splitExactly(on: UInt8(ascii: "."))[0]
                if ctx.isUnavailable(top) {
                    ctx.recordRead(top)
                    return .unknown
                }
                return RuleValue(lookup(data, p))
            }

            let args: [JSON] = if case .array(let a) = raw { a } else { [raw] }
            func checkArity(_ min: Int, _ max: Int) throws(RuleError) {
                if args.count < min || args.count > max { throw fail("wrong number of arguments") }
            }
            func truth(_ x: RuleValue) throws(RuleError) -> Bool? {
                switch x {
                case .unknown: return nil
                case .bool(let b): return b
                default: throw fail("operand must be a boolean")
                }
            }

            // Three-valued logic, left to right. `and` stops at the first false, `or` at the first true.
            if op == "if" {
                try checkArity(3, 3)
                guard let condition = try truth(try evaluate(args[0], data: data, context: &ctx)) else { return .unknown }
                return try evaluate(condition ? args[1] : args[2], data: data, context: &ctx)
            }
            if op == "and" || op == "or" {
                try checkArity(1, .max)
                let decisive = op == "or"
                var sawUnknown = false
                for a in args {
                    let value = try truth(try evaluate(a, data: data, context: &ctx))
                    if value == decisive { return .bool(decisive) }
                    if value == nil { sawUnknown = true }
                }
                return sawUnknown ? .unknown : .bool(!decisive)
            }

            var v: [RuleValue] = []
            for a in args { v.append(try evaluate(a, data: data, context: &ctx)) }
            guard let range = arity[op] else { throw fail("unsupported operator") }
            try checkArity(range.min, range.max)
            let hasUnknown = v.contains { value in
                if value.isUnknown { return true }
                if case .array(let items) = value { return items.contains { $0.isUnknown } }
                return false
            }
            if hasUnknown { return .unknown }

            func numbers() throws(RuleError) -> [Double] {
                var out: [Double] = []
                for x in v {
                    guard let n = x.finiteNumber else { throw fail("operands must be numbers") }
                    out.append(n)
                }
                return out
            }
            func primitives() throws(RuleError) {
                if !v.allSatisfy(\.isPrimitive) { throw fail("operands must be primitives") }
            }

            switch op {
            case "!":
                guard case .bool(let b) = v[0] else { throw fail("operand must be a boolean") }
                return .bool(!b)
            case "==": try primitives(); return .bool(v[0].strictlyEquals(v[1]))
            case "!=": try primitives(); return .bool(!v[0].strictlyEquals(v[1]))
            case "<": let n = try numbers(); return .bool(n[0] < n[1])
            case "<=": let n = try numbers(); return .bool(n[0] <= n[1])
            case ">": let n = try numbers(); return .bool(n[0] > n[1])
            case ">=": let n = try numbers(); return .bool(n[0] >= n[1])
            case "+": let n = try numbers(); return .number(n.dropFirst().reduce(n[0], +))
            case "*": let n = try numbers(); return .number(n.dropFirst().reduce(n[0], *))
            case "-": let n = try numbers(); return .number(n[0] - n[1])
            case "/":
                let n = try numbers()
                if n[1] == 0 { throw fail("division by zero") }
                return .number(n[0] / n[1])
            case "min": return .number(jsMin(try numbers()))
            case "max": return .number(jsMax(try numbers()))
            case "floor": let n = try numbers(); return .number(n[0].rounded(.down))
            case "in":
                guard v[0].isPrimitive, case .array(let haystack) = v[1], haystack.allSatisfy(\.isPrimitive) else {
                    throw fail("expects a primitive and a list of primitives")
                }
                return .bool(haystack.contains { $0.strictlyEquals(v[0]) })
            case "cat":
                var out = ""
                for x in v {
                    switch x {
                    case .string(let s): out += s
                    case .number(let n) where JSNumber.isSafeInteger(n): out += JSNumber.string(n)
                    default: throw fail("operands must be strings or integers")
                    }
                }
                return .string(out)
            default:
                throw fail("unsupported operator")
            }
        }
    }
}

// MARK: - Rule pack

/// shared/rulepacks/{jurisdiction}/pack.json (the parts the engine reads).
public struct RulePack: Sendable {
    public struct Question: Sendable {
        public let id: String
        public let type: String
        public let sensitive: Bool
    }

    public struct Criterion: Sendable {
        public let id: String
        public let logic: JSON
        /// Present-but-null is kept as `.null` (and is then a RuleError, as in the reference).
        public let uncertainIf: JSON?
    }

    public struct Program: Sendable {
        public let id: String
        public let name: String?
        public let criteria: [Criterion]
        public let amount: JSON?
    }

    public let jurisdiction: String
    public let constants: JSON
    public let questions: [Question]
    public let programs: [Program]
    public let json: JSON

    public init(json: JSON) throws(ContractFileError) {
        guard let jurisdiction = json["jurisdiction"]?.stringValue,
              let constants = json["constants"],
              let questions = json["questions"]?.arrayValue,
              let programs = json["programs"]?.arrayValue
        else { throw ContractFileError("rule pack is missing jurisdiction, constants, questions or programs") }
        var qs: [Question] = []
        for q in questions {
            guard let id = q["id"]?.stringValue, let type = q["type"]?.stringValue else { throw ContractFileError("malformed question") }
            qs.append(Question(id: id, type: type, sensitive: q["sensitive"]?.boolValue ?? false))
        }
        var ps: [Program] = []
        for p in programs {
            guard let id = p["id"]?.stringValue, let criteria = p["criteria"]?.arrayValue else { throw ContractFileError("malformed program") }
            var cs: [Criterion] = []
            for c in criteria {
                guard let cid = c["id"]?.stringValue, let logic = c["logic"] else { throw ContractFileError("malformed criterion") }
                cs.append(Criterion(id: cid, logic: logic, uncertainIf: c["uncertainIf"]))
            }
            ps.append(Program(id: id, name: p["name"]?.stringValue, criteria: cs, amount: p["amount"]))
        }
        self.jurisdiction = jurisdiction
        self.constants = constants
        self.questions = qs
        self.programs = ps
        self.json = json
    }
}

// MARK: - Verdicts

public enum CriterionState: String, Sendable {
    case pass, fail, mixed, unknown
}

public enum Verdict: String, Sendable {
    case likely, maybe, depends, unlikely
}

public struct ProgramVerdict: Sendable {
    public struct CriterionResult: Sendable {
        public let id: String
        public let state: CriterionState
    }

    public let programId: String
    public let verdict: Verdict
    public let criteria: [CriterionResult]
    /// Sorted (UTF-16 code unit order), without duplicates.
    public let dependsOn: [String]
    public let estimatedAmount: Double?

    /// The verdict as JSON, keys in the reference order.
    public var json: JSON {
        var o = JSONObject()
        o["programId"] = .string(programId)
        o["verdict"] = .string(verdict.rawValue)
        o["criteria"] = .array(criteria.map { .object(JSONObject([("id", .string($0.id)), ("state", .string($0.state.rawValue))])) })
        o["dependsOn"] = .array(dependsOn.map(JSON.string))
        if let estimatedAmount { o["estimatedAmount"] = .number(estimatedAmount) }
        return .object(o)
    }
}

extension RulesEngine {
    /// Every numeric literal anywhere in a JSON value.
    static func numericLiterals(_ node: JSON, into out: inout [Double]) {
        switch node {
        case .number(let n): out.append(n)
        case .array(let items): for item in items { numericLiterals(item, into: &out) }
        case .object(let o): for entry in o.entries { numericLiterals(entry.value, into: &out) }
        default: break
        }
    }

    /// Sample points for a band (SPEC.md section 5), ascending, without duplicates.
    static func samplePoints(_ band: Bands.IncomeBand, _ literals: [Double]) -> [Double] {
        let min = band.min
        let max = band.max ?? (jsMaxOf([min] + literals) + 1)
        var points: [Double] = [min, max]
        for v in literals where v >= min && v <= max {
            for p in [v - 1, v, v + 1] { points.append(Swift.min(max, Swift.max(min, p))) }
        }
        var unique: [Double] = []
        for p in points where !unique.contains(p) { unique.append(p) }
        return unique.sorted()
    }

    private static func jsMaxOf(_ values: [Double]) -> Double { jsMax(values) }

    private static func given(_ value: JSON?) -> JSON? {
        guard let value, !value.isNull else { return nil }
        return value
    }

    /// Decides a verdict for every program in the pack (SPEC.md sections 4 and 5). The answers are
    /// Raw; the result is plain data and not CloudSafe, so it cannot enter a cloud-capable call.
    public static func verdicts(pack: RulePack, bands: Bands, answers rawAnswers: Raw<JSON>) throws(VerdictError) -> [ProgramVerdict] {
        let answers = rawAnswers.value
        let income = given(answers["annualIncome"])
        let exactIncome = income != nil
        var incomeValue = 0.0
        if let income {
            guard case .number(let n) = income, n.isFinite else { throw .input(InputError("annualIncome must be a finite number")) }
            incomeValue = n
        }
        var band: Bands.IncomeBand?
        if !exactIncome, let bandId = given(answers["incomeBand"]) {
            guard case .string(let id) = bandId, let found = bands.band(id: id) else { throw .input(InputError("unknown income band")) }
            band = found
        }

        var base = JSONObject()
        base["constants"] = pack.constants
        var unavailable = Set<String>()
        for q in pack.questions {
            if let answer = given(answers[q.id]) { base[q.id] = answer } else { unavailable.insert(q.id) }
        }
        if case .number(let size)? = base["householdSize"] {
            base["householdSizeCapped"] = .string(JSNumber.string(jsMin([size, bands.householdSizeCap])))
        } else {
            unavailable.insert("householdSizeCapped")
        }
        if exactIncome { base["annualIncome"] = .number(jsMax([incomeValue, 0])) }
        else if band == nil { unavailable.insert("annualIncome") }
        let baseData = JSON.object(base)

        var constantLiterals: [Double] = []
        numericLiterals(pack.constants, into: &constantLiterals)

        // Evaluates a boolean expression once, or at every sample point when only a band is known.
        func assess(_ logic: JSON, _ ctx: inout EvalContext) throws(RuleError) -> [Bool?] {
            func once(_ data: JSON, _ ctx: inout EvalContext) throws(RuleError) -> Bool? {
                switch try evaluate(logic, data: data, context: &ctx) {
                case .unknown: return nil
                case .bool(let b): return b
                default: throw RuleError("criterion logic must return a boolean")
                }
            }
            guard let band, !exactIncome else { return [try once(baseData, &ctx)] }
            var literals = constantLiterals
            numericLiterals(logic, into: &literals)
            var results: [Bool?] = []
            for point in samplePoints(band, literals) {
                var data = base
                data["annualIncome"] = .number(point)
                results.append(try once(.object(data), &ctx))
            }
            return results
        }

        do throws(RuleError) {
            var out: [ProgramVerdict] = []
            for program in pack.programs {
                var dependsOn: [String] = []
                var criteria: [ProgramVerdict.CriterionResult] = []
                for criterion in program.criteria {
                    var ctx = EvalContext(unavailable: unavailable)
                    let results = try assess(criterion.logic, &ctx)
                    var state: CriterionState
                    if results.contains(true) && results.contains(false) { state = .mixed }
                    else if results.contains(nil) { state = .unknown }
                    else { state = results[0] == true ? .pass : .fail }
                    if state == .fail, let uncertainIf = criterion.uncertainIf {
                        switch try evaluate(uncertainIf, data: baseData, context: &ctx) {
                        case .unknown: state = .unknown
                        case .bool(let b): if b { state = .mixed }
                        default: throw RuleError("uncertainIf must return a boolean")
                        }
                    }
                    if state == .unknown {
                        for name in ctx.unknownReads {
                            let reported = name.exactlyEquals("householdSizeCapped") ? "householdSize" : name
                            if !dependsOn.contains(where: { $0.exactlyEquals(reported) }) { dependsOn.append(reported) }
                        }
                    }
                    criteria.append(.init(id: criterion.id, state: state))
                }
                let states = criteria.map(\.state)
                let verdict: Verdict = states.contains(.fail) ? .unlikely
                    : states.contains(.mixed) ? .maybe
                    : states.contains(.unknown) ? .depends
                    : .likely
                var estimatedAmount: Double?
                if verdict == .likely, exactIncome, let amount = program.amount {
                    var ctx = EvalContext(unavailable: unavailable)
                    switch try evaluate(amount, data: baseData, context: &ctx) {
                    case .unknown: break
                    case .number(let n) where n.isFinite: estimatedAmount = n.rounded(.down)
                    default: throw RuleError("amount must return a number")
                    }
                }
                out.append(ProgramVerdict(programId: program.id, verdict: verdict, criteria: criteria,
                                          dependsOn: dependsOn.sorted { $0.utf16Precedes($1) }, estimatedAmount: estimatedAmount))
            }
            return out
        } catch {
            throw .rule(error)
        }
    }
}
