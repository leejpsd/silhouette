// Must not compile: a typed question (Raw) as a prepared question for a cloud-capable task.
// expect-error: cannot convert value of type 'Raw<String>' to expected argument type 'Public<String>'
import SilhouetteCore
import SilhouetteKit

func leak(input: ExplainInput, typed: Raw<String>, template: PromptTemplate) {
    _ = Planner.askChip(input, question: typed, template: template)
}
