// Control: cloud-capable requests are built from Generalized, Public and Skeleton values, and
// on-device requests from Raw values.
import SilhouetteCore
import SilhouetteKit

func control(input: ExplainInput, chip: Public<String>, template: PromptTemplate, config: AppConfig,
             personal: Raw<PersonalResult>, typed: Raw<String>, skeleton: Skeleton, schema: JSON) throws {
    _ = Planner.explain(input, long: false, template: template, config: config)
    _ = Planner.askChip(input, question: chip, template: template)
    _ = try Planner.pointers(skeleton, language: .en, template: template, pointerSchema: schema)
    _ = Planner.explainPersonal(personal, template: template)
    _ = Planner.askFreeText(typed, result: personal, template: template)
}
