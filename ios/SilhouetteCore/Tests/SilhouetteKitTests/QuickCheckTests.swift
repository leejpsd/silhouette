import Foundation
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

@Suite("Quick Check flow")
struct QuickCheckTests {
    @Test("steps follow the pack's questionOrder, with the income step where it is listed")
    func stepOrder() throws {
        let (b, session) = try Repo.session()
        #expect(session.steps.map(\.id) == b.packInfo.questionOrder)
        #expect(session.steps.map(\.id) == ["householdSize", "numChildren", "hasEarnedIncome", "income", "housing", "benefits", "hasOlderMember", "residentStatus"])
        guard case .integer(let min, let max) = try #require(session.step("householdSize")).kind else { Issue.record("not int"); return }
        #expect((min, max) == (1, 20))
        #expect(session.step("residentStatus")?.sensitive == true)
        #expect(session.step("income")?.isIncome == true)
    }

    @Test("default order without questionOrder: income first, then questions in pack order")
    func defaultOrder() throws {
        let b = try Repo.bundle()
        var json = b.packInfo
        json = try PackInfo(json: {
            var o = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("rulepacks/zz-test/pack.json"))).objectValue!
            o["questionOrder"] = nil
            return .object(o)
        }())
        let steps = try QuickCheck.steps(pack: json, bands: b.bands)
        #expect(steps.first?.id == "income")
        #expect(steps.dropFirst().map(\.id) == b.packInfo.questions.map(\.id))
    }

    @Test("a questionOrder that misses a step is rejected")
    func badOrder() throws {
        var o = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("rulepacks/zz-test/pack.json"))).objectValue!
        o["questionOrder"] = .array([.string("householdSize")])
        #expect(throws: QuickCheckError.self) { try QuickCheck.steps(pack: PackInfo(json: .object(o)), bands: Repo.bundle().bands) }
    }

    @Test("validation per step kind")
    func validation() throws {
        let (_, s) = try Repo.session()
        let household = try #require(s.step("householdSize"))
        #expect(household.problem(with: .integer(1)) == nil)
        #expect(household.problem(with: .integer(0)) == .integer)
        #expect(household.problem(with: .integer(21)) == .integer)
        #expect(household.problem(with: .choice("3")) == .integer)
        let housing = try #require(s.step("housing"))
        #expect(housing.problem(with: .choice("renter")) == nil)
        #expect(housing.problem(with: .choice("tenant")) == .choose)
        let benefits = try #require(s.step("benefits"))
        #expect(benefits.problem(with: .selection([])) == nil)
        #expect(benefits.problem(with: .selection(["snap", "ssi"])) == nil)
        #expect(benefits.problem(with: .selection(["snap", "snap"])) == .choose)
        #expect(benefits.problem(with: .selection(["cash"])) == .choose)
        let income = try #require(s.step("income"))
        #expect(income.problem(with: .income(.band("C"))) == nil)
        #expect(income.problem(with: .income(.band("Z"))) == .choose)
        #expect(income.problem(with: .income(.exact(0))) == nil)
        #expect(income.problem(with: .income(.exact(-1))) == .amount)
        #expect(income.problem(with: .income(.exact(Double(QuickCheck.maxExactIncome + 1)))) == .amount)
    }

    @Test("invalid answers are refused and not stored")
    func refusesInvalid() throws {
        var (_, s) = try Repo.session()
        #expect(s.answer("householdSize", with: .integer(99)) == .integer)
        #expect(s.displayAnswer(for: "householdSize") == nil)
        #expect(s.answer("nope", with: .integer(1)) == .choose)
        #expect(!s.isStarted)
    }

    @Test("engine answers: band → incomeBand, exact → annualIncome, skipped → absent")
    func engineAnswers() throws {
        var (_, s) = try Repo.session()
        s.answer("householdSize", with: .integer(3))
        s.answer("benefits", with: .selection([]))
        s.answer("income", with: .income(.band("C")))
        s.skip("housing")
        #expect(s.engineAnswers.value.jsonText == #"{"householdSize":3,"incomeBand":"C","benefits":[]}"#)
        s.answer("income", with: .income(.exact(30524)))
        #expect(s.engineAnswers.value["annualIncome"]?.numberValue == 30524)
        #expect(s.engineAnswers.value["incomeBand"] == nil)
    }

    @Test("a full Quick Check gives the same verdicts as the engine on the equivalent answers")
    func fullRun() throws {
        var (b, s) = try Repo.session()
        s.answer("householdSize", with: .integer(3))
        s.answer("numChildren", with: .integer(2))
        s.answer("hasEarnedIncome", with: .choice("yes"))
        s.answer("income", with: .income(.exact(30524)))
        s.answer("housing", with: .choice("renter"))
        s.answer("benefits", with: .selection(["snap"]))
        s.answer("hasOlderMember", with: .choice("no"))
        s.answer("residentStatus", with: .choice("eligible"))
        #expect(s.firstOpenIndex == s.steps.count)
        let results = try s.verdicts(pack: b.pack, bands: b.bands)
        let direct = try RulesEngine.verdicts(pack: b.pack, bands: b.bands, answers: Raw(JSON.parse(
            #"{"householdSize":3,"numChildren":2,"hasEarnedIncome":"yes","annualIncome":30524,"housing":"renter","benefits":["snap"],"hasOlderMember":"no","residentStatus":"eligible"}"#)))
        #expect(JSON.array(results.map(\.json)).isIdentical(to: .array(direct.map(\.json))))
        #expect(results[program: "work-credit"]?.verdict == .likely)
        #expect(results[program: "work-credit"]?.estimatedAmount == 3000)
        #expect(QuickCheck.groups(results).map(\.verdict) == [.likely])
    }

    @Test("skipping the sensitive question makes food-help depend on it; answering it later resolves it")
    func skipSensitive() throws {
        var (b, s) = try Repo.session()
        s.answer("householdSize", with: .integer(3))
        s.answer("income", with: .income(.exact(30524)))
        s.skip("residentStatus")
        var food = try #require(try s.verdicts(pack: b.pack, bands: b.bands)[program: "food-help"])
        #expect(food.verdict == .depends)
        #expect(food.dependsOn == ["residentStatus"])
        s.answer("residentStatus", with: .choice("eligible"))
        food = try #require(try s.verdicts(pack: b.pack, bands: b.bands)[program: "food-help"])
        #expect(food.verdict == .likely)
    }

    @Test("choosing none of the benefits differs from skipping the question")
    func noneVersusSkip() throws {
        var (b, s) = try Repo.session()
        s.answer("householdSize", with: .integer(2))
        s.answer("benefits", with: .selection([]))
        let none = try #require(try s.verdicts(pack: b.pack, bands: b.bands)[program: "phone-discount"])
        s.skip("benefits")
        let skipped = try #require(try s.verdicts(pack: b.pack, bands: b.bands)[program: "phone-discount"])
        #expect(none.dependsOn == ["annualIncome"])
        #expect(skipped.dependsOn == ["annualIncome", "benefits"])
    }

    @Test("first open step and the variable-to-step mapping")
    func navigationHelpers() throws {
        var (_, s) = try Repo.session()
        #expect(s.firstOpenIndex == 0)
        s.answer("householdSize", with: .integer(1))
        s.skip("numChildren")
        #expect(s.firstOpenIndex == 2)
        #expect(QuickCheck.step(forVariable: "annualIncome") == "income")
        #expect(QuickCheck.step(forVariable: "householdSize") == "householdSize")
        s.reset()
        #expect(!s.isStarted)
    }

    @Test("groups follow likely, maybe, depends, unlikely and omit empty groups")
    func grouping() throws {
        var (b, s) = try Repo.session()
        s.answer("income", with: .income(.band("C")))
        let groups = QuickCheck.groups(try s.verdicts(pack: b.pack, bands: b.bands))
        let order = groups.map { QuickCheck.verdictOrder.firstIndex(of: $0.verdict)! }
        #expect(order == order.sorted())
        #expect(groups.allSatisfy { !$0.programs.isEmpty })
    }

    @Test("an exact income with decimals reaches the engine unchanged (not multiplied by 100)")
    func decimalIncome() throws {
        var (b, s) = try Repo.session()
        let amount = try #require(Rehydrator.parseTypedAmount("28,000.50"))
        #expect(s.answer("income", with: .income(.exact(amount))) == nil)
        #expect(s.engineAnswers.value["annualIncome"]?.numberValue == 28000.5)
        s.answer("hasEarnedIncome", with: .choice("yes"))
        s.answer("numChildren", with: .integer(0))
        let work = try #require(try s.verdicts(pack: b.pack, bands: b.bands)[program: "work-credit"])
        #expect(work.verdict == .unlikely, "28,000.50 is over the 18,000 no-child limit")
        #expect(s.answer("income", with: .income(.exact(.nan))) == .amount)
        #expect(s.answer("income", with: .income(.exact(1e9))) == .amount)
    }

    @Test("the understood amount is shown in the user's locale")
    func formatAmount() {
        #expect(CopyBook.formatAmount(28000.5, .en) == "28,000.50")
        #expect(CopyBook.formatAmount(28000, .en) == "28,000")
        #expect(CopyBook.formatAmount(28000.5, .es) == "28.000,50")
        #expect(CopyBook.formatAmount(28000.5, .ko) == "28,000.50")
    }
}
