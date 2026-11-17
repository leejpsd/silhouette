// Control: cloud-capable requests are built from Public and Skeleton values, and on-device requests
// from Raw values.
import SilhouetteCore
import SilhouetteKit

func control(facts: Public<ProgramFacts>, chip: Public<String>, template: PromptTemplate, config: AppConfig,
             personal: Raw<PersonalResult>, typed: Raw<String>, skeleton: Skeleton, schema: JSON) throws {
    _ = Planner.explain(facts, locale: .en, long: false, template: template, config: config)
    _ = Planner.askChip(facts, question: chip, locale: .en, template: template)
    _ = try Planner.pointers(skeleton, language: .en, template: template, pointerSchema: schema)
    _ = Planner.devicePart(skeleton, template: template, partText: "", part: "core", constraint: schema)
    _ = Planner.explainPersonal(personal, template: template)
    _ = Planner.askFreeText(typed, result: personal, template: template)
}
