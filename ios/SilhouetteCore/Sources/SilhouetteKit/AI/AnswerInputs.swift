// Inputs of the answer tasks, built from the Quick Check answers, the rule pack and its copy:
// - the profile silhouette and the verdicts the engine reaches from it alone (cloud-capable tasks);
// - program facts (Public);
// - "Why this result" rows and the person's own result (Raw: for this screen and on-device tasks).

import Foundation
import SilhouetteCore

public struct Silhouette: Sendable {
    public let profile: Generalized<GeneralizedProfile>
    public let verdicts: Generalized<[SilhouetteVerdict]>
    /// The canonical profile: the content a consent is given for.
    public var canonical: String { profile.canonical }
}

public struct WhyRow: Sendable, Identifiable {
    public let id: String
    public let label: String
    public let state: CriterionState
    /// Limit and the person's value for each comparison with a known limit.
    public let limits: [(limit: String, yours: String)]
    /// The answer each entry of `limits` compares (`annualIncome`, `householdSize` …).
    public var limitVariables: [String] = []
    /// What the state means here: the state word, or what a `mixed` state depends on when it is not the income.
    public var stateText: String = ""
    /// How the criterion was met another way, and which household size a limit is for.
    public var notes: [String] = []
}

extension QuickCheckSession {
    /// The Generalizer's output for the current answers, or nil when it refuses them.
    public func silhouette(pack: RulePack, packInfo: PackInfo, bands: Bands) -> Silhouette? {
        let engine = engineAnswers.value
        let open = Set(packInfo.questions.filter { !$0.sensitive }.map(\.id))
        var exact = ExactProfile(jurisdiction: packInfo.jurisdiction)
        if case .number(let n)? = engine["annualIncome"] { exact.annualIncome = n }
        exact.incomeBand = engine["incomeBand"]?.stringValue
        if open.contains("householdSize"), case .number(let n)? = engine["householdSize"] { exact.householdSize = Int(n) }
        if open.contains("housing") { exact.housing = engine["housing"]?.stringValue }
        guard let profile = try? Generalizer.generalize(Raw(exact), bands: bands),
              let verdicts = try? RulesEngine.silhouetteVerdicts(pack: pack, bands: bands, profile: profile)
        else { return nil }
        return Silhouette(profile: profile, verdicts: verdicts)
    }

    /// The rule engine's reasons for one program (no model).
    public func reasons(pack: RulePack, bands: Bands, programId: String) -> Raw<[CriterionReason]> {
        (try? RulesEngine.criterionReasons(pack: pack, bands: bands, answers: engineAnswers, programId: programId)) ?? Raw([])
    }
}

public enum AnswerInputs {
    /// The optional program copy keys (shared/rulepacks/SPEC.md section 2.1), in `{programFacts}` order.
    public static let programCopyKeys = ["summary", "apply", "documents", "renewal", "office"]

    /// The pack's program copy in the UI language (English per key when the language lacks one).
    public static func programCopy(_ bundle: SharedBundle, programId: String, locale: AppLocale) -> [(key: String, text: String)] {
        programCopyKeys.compactMap { key in bundle.copy.lookup("program.\(programId).\(key)", locale).map { (key, $0) } }
    }

    /// The answers a program's criteria use: `annualIncome` first, then in pack question order.
    public static func programUses(_ bundle: SharedBundle, programId: String) -> [String] {
        guard let program = bundle.pack.programs.first(where: { $0.id == programId }) else { return [] }
        let used = Set(program.criteria.flatMap(\.requires))
        return (["annualIncome"] + bundle.packInfo.questions.map(\.id)).filter(used.contains)
    }

    /// `{programFacts}`: the program copy, then "This program uses: …" with the labels of the answers
    /// its criteria read, then "This program checks: …" with the criterion labels, one item per line.
    /// Static content, so Public.
    public static func programFacts(_ bundle: SharedBundle, programId: String, locale: AppLocale) -> Public<ProgramFacts>? {
        guard let info = bundle.packInfo.program(programId), let program = bundle.pack.programs.first(where: { $0.id == programId }) else { return nil }
        let copy = bundle.copy
        var criteria: [String: String] = [:]
        var labels: [String] = []
        for c in program.criteria {
            let label = copy.text("criterion.\(programId).\(c.id)", locale)
            criteria[c.id] = label
            labels.append(label)
        }
        var lines = programCopy(bundle, programId: programId, locale: locale).map(\.text)
        let uses = programUses(bundle, programId: programId).compactMap { copy.lookup("variable.\($0)", locale) }
        if !uses.isEmpty { lines.append("\(copy.text("answers.facts.uses", locale)) \(uses.joined(separator: "; ")).") }
        lines.append("\(copy.text("answers.facts.checks", locale)) \(labels.joined(separator: "; ")).")
        let facts = ProgramFacts(programId: programId, name: copy.programName(info, locale), facts: lines.joined(separator: "\n"), criteria: criteria)
        return Public(bundled: facts, text: facts.name)
    }

    /// The prepared question chips (copy keys `ask.chip.{id}`).
    public static let chips = ["apply", "documents", "change", "offer"]

    /// A prepared question in the UI language: bundled copy, so Public. Only known chip ids.
    public static func chipQuestion(_ bundle: SharedBundle, chip: String, locale: AppLocale) -> Public<String>? {
        guard chips.contains(chip) else { return nil }
        return Public(bundled: bundle.copy.text("ask.chip.\(chip)", locale))
    }

    /// The silhouette as lines for the step before sending, in the UI language. Each value is
    /// shown as the person knows it, with the form that is sent in brackets where they differ.
    public static func silhouetteLines(_ bundle: SharedBundle, _ silhouette: Silhouette, locale: AppLocale) -> [String] {
        let p = silhouette.profile.value
        let copy = bundle.copy
        let none = copy.text("send.unanswered", locale)
        let band = p.incomeBand.flatMap { id in bundle.bands.annualIncome.first { $0.id == id } }
        let size: String = switch p.householdSize {
        case .exact(let n)?: String(n)
        case .capped(let s)?: s
        case nil: none
        }
        let housing = p.housing.map { "\(copy.lookup("option.housing.\($0.rawValue)", locale) ?? $0.rawValue) (\($0.rawValue))" } ?? none
        let packName = copy.lookup("pack.\(p.jurisdiction).name", locale) ?? p.jurisdiction
        return [
            copy.text("send.line.jurisdiction", locale, ["value": "\(packName) (\(p.jurisdiction))"]),
            copy.text("send.line.incomeBand", locale, ["value": band.map { "\(copy.bandLabel($0, locale)) (\($0.id))" } ?? none]),
            copy.text("send.line.householdSize", locale, ["value": size]),
            copy.text("send.line.housing", locale, ["value": housing]),
            copy.text("send.line.childAgeBands", locale, ["value": p.childAgeBands.map { $0.isEmpty ? "-" : $0.joined(separator: ", ") } ?? none]),
            copy.text("send.line.county", locale, ["value": p.county ?? none]),
        ]
    }

    static func shown(_ yours: Comparison.Yours, locale: AppLocale, none: String, currency: String? = nil, format: String? = nil) -> String {
        let n = { CopyBook.formatMoney($0, locale, currency: currency, format: format) }
        switch yours {
        case .number(let v): return n(v)
        case .band(let b): return b.max.map { "\(n(b.min))–\(n($0))" } ?? "\(n(b.min))+"
        case .unanswered: return none
        }
    }

    /// "Why this result" rows, for showing the person their own result on this device. The lines never
    /// contradict the verdict: "limit / yours" only for a comparison that produces the state; a
    /// criterion met another way says which way; a `mixed` state from `uncertainIf` says what it depends
    /// on; a limit looked up for the largest household size says so.
    /// `currency`: income limits and values are shown as money in it (the screen passes the pack's).
    public static func whyRows(_ bundle: SharedBundle, programId: String, reasons: Raw<[CriterionReason]>, locale: AppLocale,
                               currency: String? = nil, format: String? = nil) -> [WhyRow] {
        let copy = bundle.copy
        return reasons.value.map { r in
            let compared = r.comparisons.filter { $0.limit != nil && $0.decisive }
            var row = WhyRow(id: r.id, label: copy.text("criterion.\(programId).\(r.id)", locale), state: r.state,
                             limits: compared.compactMap { c in
                                 let money = Self.isMoneyVariable(c.variable) ? currency : nil
                                 return c.limit.map { (CopyBook.formatMoney($0, locale, currency: money, format: format),
                                                       shown(c.yours, locale: locale, none: copy.text("send.unanswered", locale),
                                                             currency: money, format: format)) }
                             },
                             limitVariables: compared.map(\.variable))
            if let met = r.metBy {
                let way = met.value.flatMap { copy.lookup("option.\(met.variable).\($0)", locale) }
                    ?? copy.lookup("variable.\(met.variable)", locale) ?? met.variable
                row.notes.append(copy.text("why.metBy", locale, ["way": way]))
            }
            if let cap = compared.compactMap(\.capped).first { row.notes.append(copy.text("why.capNote", locale, ["cap": String(cap)])) }
            if let exception = r.exception, !exception.isEmpty {
                // The pack's own sentence for this criterion when it has one (rulepacks/SPEC.md section 5).
                let what = exception.map { copy.lookup("variable.\($0)", locale) ?? $0 }.joined(separator: ", ")
                row.stateText = copy.lookup("exception.\(programId).\(r.id)", locale) ?? copy.text("why.exception", locale, ["what": what])
            } else {
                row.stateText = copy.text("state.\(r.state.rawValue)", locale)
            }
            return row
        }
    }

    /// Answers that are amounts of money: the yearly income, and other incomes asked as an amount
    /// (investment income), not yes/no questions about income.
    public static func isMoneyVariable(_ variable: String) -> Bool {
        variable == "annualIncome" || (!variable.lowercased().hasPrefix("has") && variable.lowercased().hasSuffix("income"))
    }

    /// State words of explain-personal.v1.md (the prompt is in English).
    static let promptState: [CriterionState: String] = [.pass: "met", .fail: "not met", .mixed: "depends on your exact income", .unknown: "not answered"]

    /// The person's own result for the on-device prompts.
    public static func personalResult(_ bundle: SharedBundle, programId: String, verdict: Verdict,
                                      reasons: Raw<[CriterionReason]>, locale: AppLocale) -> Raw<PersonalResult> {
        let lines = whyRows(bundle, programId: programId, reasons: reasons, locale: .en).map { row in
            "- \(row.label): \(promptState[row.state] ?? "not answered")" + row.limits.map { " (limit \($0.limit), yours \($0.yours))" }.joined()
        }
        let facts = programFacts(bundle, programId: programId, locale: locale)?.value
        return Raw(PersonalResult(locale: locale, programName: facts?.name ?? programId, facts: facts?.facts ?? "",
                                  verdict: verdict.rawValue, verdictLabel: bundle.copy.text("verdict.\(verdict.rawValue)", locale),
                                  criteriaLines: lines.joined(separator: "\n")))
    }
}
