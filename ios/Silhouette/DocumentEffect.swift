// What a paystub did when its yearly income was used (contract v1.40): how it was read, the income,
// the questions it answered and the results it changed. Memory only, beside the income answer.

import SilhouetteCore
import SilhouetteKit

struct DocumentEffect {
    /// How the document was read (on this device, in the cloud, a recording, the sample's answer key).
    let source: InferenceSource
    let amount: Int
    let annualization: ValidationResult.Annualization
    /// Variables it answered: `annualIncome`, and `hasEarnedIncome` when that was not already yes.
    let filled: [String]
    let changed: [(program: String, before: Verdict, after: Verdict)]
    /// The rule engine's results before the document's income was used, and with it (contract v1.44).
    let without: [ProgramVerdict]
    let with: [ProgramVerdict]
    /// Each program's period as the pack writes it ("Tax year 2025"): an amount is yearly when it is a tax year's.
    let programPeriods: [String: String?]

    /// `results.incomeFrom.{key}`
    var incomeFromKey: String {
        switch source {
        case .onDevice: "ON_DEVICE"
        case .inCloud: "IN_CLOUD"
        case .recordedCloud: "RECORDED_CLOUD"
        case .recordedDevice: "RECORDED"
        case .sampleAnswerKey: "SAMPLE_KEY"
        }
    }

    func change(_ program: String) -> (before: Verdict, after: Verdict)? {
        changed.first { $0.program == program }.map { ($0.before, $0.after) }
    }

    // MARK: Without and with the paystub (results.docEffect.withoutLabel / withLabel)

    /// Programs that may qualify (`likely`, the results' own count).
    static func mayQualify(_ results: [ProgramVerdict]) -> [ProgramVerdict] { results.filter { $0.verdict == .likely } }

    /// Of those, the ones that show an amount: an estimate or an "up to".
    static func withAmount(_ results: [ProgramVerdict]) -> [ProgramVerdict] {
        mayQualify(results).filter { ($0.estimatedAmount ?? 0) > 0 || ($0.upToAmount ?? 0) > 0 }
    }

    /// Whether a program's amount is for a year (a tax year's credit).
    func isYearly(_ programId: String) -> Bool {
        (programPeriods[programId] ?? nil)?.hasPrefix("Tax year") == true
    }

    /// The yearly total with the paystub: the estimates of the programs that may qualify, and their "up to"
    /// amounts apart. Amounts that are not yearly are left out.
    var totals: (estimated: Double, upTo: Double) {
        let yearly = Self.mayQualify(with).filter { isYearly($0.programId) }
        let estimated = yearly.compactMap(\.estimatedAmount).filter { $0 > 0 }.reduce(0, +)
        let upTo = yearly.filter { ($0.estimatedAmount ?? 0) <= 0 }.compactMap(\.upToAmount).filter { $0 > 0 }.reduce(0, +)
        return (estimated, upTo)
    }
}
