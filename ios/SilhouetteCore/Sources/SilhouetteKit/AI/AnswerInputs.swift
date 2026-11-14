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
    /// Rule-pack facts of one program in the UI language. Static content, so Public.
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
        var sentences = ["\(copy.text("answers.facts.checks", locale)) \(labels.joined(separator: "; "))."]
        if let period = info.period { sentences.append(copy.text("answers.facts.period", locale, ["period": period])) }
        for key in info.caveats {
            if let text = copy.lookup("caveat.\(key)", locale) { sentences.append("\(copy.text("answers.facts.note", locale)) \(text)") }
        }
        let facts = ProgramFacts(programId: programId, name: copy.programName(info, locale), facts: sentences.joined(separator: " "), criteria: criteria)
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

    /// "Why this result" rows, for showing the person their own result on this device.
    /// `currency`: income limits and values are shown as money in it (the screen passes the pack's).
    public static func whyRows(_ bundle: SharedBundle, programId: String, reasons: Raw<[CriterionReason]>, locale: AppLocale,
                               currency: String? = nil, format: String? = nil) -> [WhyRow] {
        reasons.value.map { r in
            let compared = r.comparisons.filter { $0.limit != nil }
            return WhyRow(id: r.id, label: bundle.copy.text("criterion.\(programId).\(r.id)", locale), state: r.state,
                          limits: compared.compactMap { c in
                              let money = Self.moneyVariables.contains(c.variable) ? currency : nil
                              return c.limit.map { (CopyBook.formatMoney($0, locale, currency: money, format: format),
                                                    shown(c.yours, locale: locale, none: bundle.copy.text("send.unanswered", locale),
                                                          currency: money, format: format)) }
                          },
                          limitVariables: compared.map(\.variable))
        }
    }

    /// Answers that are amounts of money.
    static let moneyVariables: Set<String> = ["annualIncome"]

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
                                  verdictLabel: bundle.copy.text("verdict.\(verdict.rawValue)", locale),
                                  criteriaLines: lines.joined(separator: "\n")))
    }
}
