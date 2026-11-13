// Must not compile: app code cannot build a cloud request itself; only the Planner can.
// expect-error: 'CloudRequest' initializer is inaccessible due to 'internal' protection level
import SilhouetteCore
import SilhouetteKit

func forge(text: CloudText) -> CloudRequest {
    CloudRequest(taskId: "explain.short", mode: .onlyInCloud, reason: .shortText, model: "m", system: text, prompt: text,
                 maxOutputTokens: 1, responseSchema: nil, deviceSchema: nil, fields: [], checks: nil, route: nil, locale: .en)
}
