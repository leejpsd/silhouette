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

    /// `results.incomeFrom.{key}`
    var incomeFromKey: String {
        switch source {
        case .onDevice: "ON_DEVICE"
        case .inCloud: "IN_CLOUD"
        case .recordedCloud: "RECORDED_CLOUD"
        case .sampleAnswerKey: "SAMPLE_KEY"
        }
    }

    func change(_ program: String) -> (before: Verdict, after: Verdict)? {
        changed.first { $0.program == program }.map { ($0.before, $0.after) }
    }
}
