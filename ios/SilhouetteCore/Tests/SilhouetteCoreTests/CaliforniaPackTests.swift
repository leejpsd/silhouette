// The California draft pack (shared/rulepacks/us-ca): its 27 hand-worked households (189 expected
// results) through the Swift engine, and the authoring checks of shared/reference/lint.mjs ported as
// tests, so the pack the app ships is checked by the code that runs it.

import Foundation
import Testing
@testable import SilhouetteCore

@Suite("rulepacks/us-ca")
struct CaliforniaPackTests {
    static let packJSON = try! Shared.json("rulepacks/us-ca/pack.json")
    static let bandsJSON = try! Shared.json("bands/us-ca.json")
    static let pack = try! RulePack(json: packJSON)
    static let bands = try! Bands(json: bandsJSON)
    static let cases = try! Shared.json("rulepacks/us-ca/cases.json")

    static var caseList: [FixtureCase] {
        (cases["cases"]?.arrayValue ?? []).map { FixtureCase(file: "us-ca/cases.json", json: $0) }
    }

    @Test("27 households, 189 expected results")
    func counts() {
        #expect(Self.caseList.count == 27)
        let results = Self.caseList.reduce(0) { $0 + ($1["expected"]?.objectValue?.count ?? 0) }
        #expect(results == 189)
    }

    @Test("each hand-worked household gives the expected verdicts and amounts", arguments: caseList)
    func household(_ k: FixtureCase) throws {
        var answers = Self.cases["base"]?.objectValue ?? JSONObject()
        for (key, value) in k["answers"]?.objectValue?.entries ?? [] { answers[key] = value }
        let out = try RulesEngine.verdicts(pack: Self.pack, bands: Self.bands, answers: Raw(.object(answers)))
        for (programId, want) in k["expected"]?.objectValue?.entries ?? [] {
            let got = try #require(out.first { $0.programId == programId }, "\(k.id) \(programId)")
            #expect(got.verdict.rawValue == want["verdict"]?.stringValue, "\(k.id) \(programId)")
            if let amount = want["estimatedAmount"]?.numberValue {
                #expect(got.estimatedAmount == amount, "\(k.id) \(programId) amount")
            }
        }
    }

    // MARK: Authoring checks (lint.mjs)

    static let slug = try! NSRegularExpression(pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*\\z")
    static let questionId = try! NSRegularExpression(pattern: "^[a-z][A-Za-z0-9]*\\z")
    static let reserved: Set<String> = ["annualIncome", "incomeBand", "constants", "householdSizeCapped", "constructor", "toString", "valueOf",
                                        "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString"]

    static func matches(_ regex: NSRegularExpression, _ text: String?) -> Bool {
        guard let text else { return false }
        return regex.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)) != nil
    }

    /// The variables an expression reads (`constants` for a computed constants path).
    static func reads(_ expr: JSON, into out: inout Set<String>) {
        switch expr {
        case .array(let items): items.forEach { reads($0, into: &out) }
        case .object(let o):
            guard o.count == 1 else { return }
            let (op, arg) = o.entries[0]
            if op == "var" {
                if let path = arg.stringValue { out.insert(String(path.split(separator: ".").first ?? "")) }
                else if let cat = arg["cat"]?.arrayValue, cat.first?.stringValue?.hasPrefix("constants.") == true {
                    out.insert("constants")
                    cat.dropFirst().forEach { reads($0, into: &out) }
                }
                return
            }
            reads(arg, into: &out)
        default: break
        }
    }

    /// Comparisons of annualIncome with 0 (authoring rule: ask a question instead).
    static func comparesIncomeWithZero(_ expr: JSON) -> Bool {
        switch expr {
        case .array(let items): return items.contains(where: comparesIncomeWithZero)
        case .object(let o):
            guard o.count == 1 else { return false }
            let (op, arg) = o.entries[0]
            if ["<", "<=", ">", ">="].contains(op), let args = arg.arrayValue, args.count == 2 {
                let isIncome = { (e: JSON) in e["var"]?.stringValue == "annualIncome" }
                if (isIncome(args[0]) && args[1].numberValue == 0) || (isIncome(args[1]) && args[0].numberValue == 0) { return true }
            }
            return comparesIncomeWithZero(arg)
        default: return false
        }
    }

    @Test("bands: start at 0, contiguous, open-ended last band, positive household cap")
    func lintBands() {
        let list = Self.bandsJSON["annualIncome"]?.arrayValue ?? []
        #expect(list.first?["min"]?.numberValue == 0)
        for (i, b) in list.enumerated() {
            if i == list.count - 1 { #expect(b["max"]?.isNull == true) }
            else { #expect(b["max"]?.numberValue.map { $0 == $0.rounded() } == true) }
            if i > 0 { #expect(b["min"]?.numberValue == (list[i - 1]["max"]?.numberValue ?? -1) + 1) }
        }
        #expect(Set(list.compactMap { $0["id"]?.stringValue }).count == list.count)
        #expect((Self.bandsJSON["householdSizeCap"]?.numberValue ?? 0) >= 1)
        #expect(Self.bandsJSON["jurisdiction"]?.stringValue == Self.packJSON["jurisdiction"]?.stringValue)
    }

    @Test("pack: ids, question types, question order, currency and number format")
    func lintPackShape() {
        let p = Self.packJSON
        #expect(Self.matches(Self.slug, p["jurisdiction"]?.stringValue))
        #expect(p["currency"]?.stringValue.map { $0.count == 3 && $0.allSatisfy(\.isUppercase) } ?? true)
        #expect(p["numberFormat"]?.stringValue == "en-US")
        var ids: [String] = []
        for q in p["questions"]?.arrayValue ?? [] {
            let id = q["id"]?.stringValue ?? ""
            #expect(Self.matches(Self.questionId, id) && !Self.reserved.contains(id), "\(id)")
            #expect(q["sensitive"]?.boolValue != nil, "\(id) sensitive")
            let type = q["type"]?.stringValue ?? ""
            #expect(["int", "enum", "bool", "multi"].contains(type), "\(id) type")
            if type == "int" { #expect((q["min"]?.numberValue ?? 1) <= (q["max"]?.numberValue ?? 0), "\(id) min/max") }
            let values = q["values"]?.arrayValue ?? []
            if type == "enum" || type == "multi" { #expect(values.count > 0, "\(id) values") }
            ids.append(id)
        }
        #expect(Set(ids).count == ids.count)
        let order = (p["questionOrder"]?.arrayValue ?? []).compactMap(\.stringValue)
        #expect(order.sorted() == (ids + ["income"]).sorted())
    }

    @Test("criteria: slugs, requires lists every variable read, no income-versus-zero rule, logic returns a boolean at every band edge")
    func lintCriteria() throws {
        let p = Self.packJSON
        let questionIds = Set((p["questions"]?.arrayValue ?? []).compactMap { $0["id"]?.stringValue })
        var sample = JSONObject([("constants", p["constants"] ?? .object(JSONObject())), ("householdSizeCapped", .string("1"))])
        for q in p["questions"]?.arrayValue ?? [] {
            let id = q["id"]!.stringValue!
            switch q["type"]?.stringValue {
            case "int": sample[id] = .number(1)
            case "bool": sample[id] = .bool(true)
            case "multi": sample[id] = .array([])
            default: sample[id] = q["values"]?.arrayValue?.first ?? .null
            }
        }
        let points = (Self.bandsJSON["annualIncome"]?.arrayValue ?? []).flatMap { b -> [Double] in
            let min = b["min"]?.numberValue ?? 0
            return [min, b["max"]?.numberValue ?? min + 1]
        }
        for program in p["programs"]?.arrayValue ?? [] {
            let pid = program["id"]?.stringValue ?? ""
            #expect(Self.matches(Self.slug, pid), "\(pid)")
            var allRequires: Set<String> = ["annualIncome"]
            for c in program["criteria"]?.arrayValue ?? [] {
                let cid = c["id"]?.stringValue ?? ""
                let where_ = "\(pid)/\(cid)"
                #expect(Self.matches(Self.slug, cid), "\(where_)")
                let requires = (c["requires"]?.arrayValue ?? []).compactMap(\.stringValue)
                for r in requires { #expect(r == "annualIncome" || questionIds.contains(r), "\(where_) requires \(r)") }
                allRequires.formUnion(requires)
                var read = Set<String>()
                Self.reads(c["logic"] ?? .null, into: &read)
                #expect(!Self.comparesIncomeWithZero(c["logic"] ?? .null), "\(where_) compares income with 0")
                if let uncertain = c["uncertainIf"] {
                    var extra = Set<String>()
                    Self.reads(uncertain, into: &extra)
                    #expect(!extra.contains("annualIncome"), "\(where_) uncertainIf reads annualIncome")
                    read.formUnion(extra)
                    var ctx = EvalContext()
                    if case .bool = try RulesEngine.evaluate(uncertain, data: .object(sample), context: &ctx) {} else { Issue.record("\(where_) uncertainIf is not a boolean") }
                }
                for name in read where name != "constants" {
                    if name == "householdSizeCapped" { #expect(requires.contains("householdSize"), "\(where_)") }
                    else { #expect(requires.contains(name), "\(where_) reads \(name) without requiring it") }
                }
                for income in points {
                    var data = sample
                    data["annualIncome"] = .number(income)
                    var ctx = EvalContext()
                    if case .bool = try RulesEngine.evaluate(c["logic"]!, data: .object(data), context: &ctx) {} else { Issue.record("\(where_) logic is not a boolean at \(income)") }
                }
            }
            if let amount = program["amount"] {
                var read = Set<String>()
                Self.reads(amount, into: &read)
                for name in read where !["constants", "householdSizeCapped"].contains(name) {
                    #expect(allRequires.contains(name), "\(pid)/amount reads \(name), which no criterion requires")
                }
                var data = sample
                data["annualIncome"] = .number(points.first ?? 0)
                var ctx = EvalContext()
                if case .number(let n) = try RulesEngine.evaluate(amount, data: .object(data), context: &ctx) { #expect(n.isFinite) }
                else { Issue.record("\(pid)/amount is not a number") }
            }
        }
    }

    @Test("a draft pack names the date its sources were read, and every program has a source and an apply link")
    func draftAndSources() {
        let p = Self.packJSON
        #expect(p["status"]?.stringValue == "draft")
        #expect(p["sourcesReadOn"]?.stringValue != nil)
        for program in p["programs"]?.arrayValue ?? [] {
            let sources = program["sources"]?.arrayValue ?? []
            #expect(sources.count > 0, "\(program["id"]?.stringValue ?? "")")
            #expect(program["applyUrl"]?.stringValue != nil)
        }
        for locale in ["en", "es"] {
            let copy = try? Shared.json("rulepacks/us-ca/copy/\(locale).json")
            for program in p["programs"]?.arrayValue ?? [] {
                let id = program["id"]?.stringValue ?? ""
                for field in ["name", "summary", "apply", "documents", "office"] {
                    #expect(copy?["program.\(id).\(field)"]?.stringValue != nil, "\(locale) program.\(id).\(field)")
                }
            }
        }
    }
}
