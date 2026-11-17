// Must not compile: the person's own result (Raw) where the explanation takes public program information only.
// expect-error: cannot convert value of type 'Raw<PersonalResult>' to expected argument type 'Public<ProgramFacts>'
import SilhouetteCore
import SilhouetteKit

func leak(result: Raw<PersonalResult>, template: PromptTemplate, config: AppConfig) {
    _ = Planner.explain(result, locale: .en, long: false, template: template, config: config)
}
