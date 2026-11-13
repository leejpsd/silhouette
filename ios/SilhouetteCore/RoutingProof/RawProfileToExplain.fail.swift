// Must not compile: the exact profile (Raw) where the explanation needs the Generalized profile.
// expect-error: cannot convert value of type 'Raw<ExactProfile>' to expected argument type 'Generalized<GeneralizedProfile>'
import SilhouetteCore
import SilhouetteKit

func leak(exact: Raw<ExactProfile>, verdicts: Generalized<[SilhouetteVerdict]>, facts: Public<ProgramFacts>) {
    _ = ExplainInput(profile: exact, silhouetteVerdicts: verdicts, program: facts, locale: .en)
}
