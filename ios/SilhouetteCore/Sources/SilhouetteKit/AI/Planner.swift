// Builds the requests of each task from typed inputs. The only place where request texts are
// composed: cloud-capable requests from CloudSafe values, on-device requests from Raw values.

import Foundation
import SilhouetteCore

public enum Planner {
    /// The cloud model for every cloud-capable task.
    public static let cloudModel = "gemini-3.5-flash-lite"
    /// Word limits the app asks for: a short explanation fits on a card; a long one compares criteria.
    public static let explainWords = (short: 60, long: 180)
    public static let askWords = 80
    /// On-device output is short (explain-personal.v1.md).
    public static let personalWords = 80
    /// The on-device input limit is 4096 tokens; this keeps a margin for any language.
    public static let onDeviceCharacterBudget = 6000

    static let languageNames: [AppLocale: String] = [.en: "English", .es: "Spanish", .ko: "Korean"]

    static func task(_ id: String) -> (mode: RoutingMode, reason: RoutingReason) {
        switch id {
        case "document.pointer.extract": (.preferOnDevice, .documentSilhouetteOnly)
        case "explain.short": (.preferOnDevice, .shortText)
        case "explain.long": (.preferInCloud, .longOrUnsupportedLocale)
        case "ask.chip": (.preferOnDevice, .preparedQuestion)
        case "explain.personal": (.onlyOnDevice, .yourResultStaysOnDevice)
        case "ask.freeText": (.onlyOnDevice, .typedTextMayBePersonal)
        default: (.onlyInCloud, .needsCurrentInfo)
        }
    }

    // MARK: Routing of explanations

    /// explain.short when `words <= route_short_text_max_words && locale in route_ondevice_locales`.
    public static func explainRoute(words: Int, locale: AppLocale, config: AppConfig) -> ExplainRoute {
        let short = words <= config.shortTextMaxWords
        let deviceLocale = config.onDeviceLocales.contains(locale.rawValue)
        if short && deviceLocale {
            return ExplainRoute(taskId: "explain.short", basis: .short, words: words, maxShortWords: config.shortTextMaxWords, locale: locale)
        }
        return ExplainRoute(taskId: "explain.long", basis: short ? .locale : .long, words: words,
                            maxShortWords: config.shortTextMaxWords, locale: locale)
    }

    // MARK: Cloud-capable requests

    private static func text(_ value: some CloudSafe) -> String { CloudBoundary.outbound(value).text }

    /// Placeholder values of explain.v3 and ask.v2: `pass` and `fail` states go to the first two
    /// lists, `unknown` and `mixed` to the third; an empty list is written as `none`.
    static func explainValues(_ input: ExplainInput, maxWords: Int, question: Public<String>?) -> [String: String] {
        let facts = input.program.value
        let states = input.silhouetteVerdicts.value.first { $0.programId == facts.programId }?.criteria ?? []
        func list(_ wanted: Set<CriterionState>) -> String {
            let labels = states.filter { wanted.contains($0.state) }.map { facts.criteria[$0.id] ?? $0.id }
            return labels.isEmpty ? "none" : labels.joined(separator: "; ")
        }
        var values = [
            "generalizedProfileCanonicalJson": text(input.profile),
            "programName": facts.name,
            "programSummaryFromRulePack": facts.facts,
            "passedCriteriaLabels": list([.pass]),
            "failedCriteriaLabels": list([.fail]),
            "unknownCriteriaLabels": list([.unknown, .mixed]),
            "maxWords": String(maxWords),
        ]
        if let question { values["question"] = text(question) }
        return values
    }

    private static func textRequest(taskId: String, template: PromptTemplate, values: [String: String], locale: AppLocale,
                                    maxWords: Int, fields: [String], route: ExplainRoute?) -> CloudRequest {
        let (mode, reason) = task(taskId)
        let system = PromptTemplate.fill(template.system, ["locale": languageNames[locale] ?? "English"])
        return CloudRequest(taskId: taskId, mode: mode, reason: reason, model: cloudModel,
                            system: CloudText(composed: system), prompt: CloudText(composed: PromptTemplate.fill(template.user, values)),
                            maxOutputTokens: max(256, maxWords * 4), responseSchema: nil, deviceSchema: nil, fields: fields,
                            checks: .general, route: route, locale: locale)
    }

    /// explain.short or explain.long (explain.v3): what the program is and what it checks. Never a result.
    public static func explain(_ input: ExplainInput, long: Bool, template: PromptTemplate, config: AppConfig) -> CloudRequest {
        let route = explainRoute(words: long ? explainWords.long : explainWords.short, locale: input.locale, config: config)
        return textRequest(taskId: route.taskId, template: template, values: explainValues(input, maxWords: route.words, question: nil),
                           locale: input.locale, maxWords: route.words, fields: ["profile-silhouette", "program-facts"], route: route)
    }

    /// ask.chip (ask.v2): a prepared question about the program. Never a result.
    public static func askChip(_ input: ExplainInput, question: Public<String>, template: PromptTemplate) -> CloudRequest {
        textRequest(taskId: "ask.chip", template: template, values: explainValues(input, maxWords: askWords, question: question),
                    locale: input.locale, maxWords: askWords, fields: ["profile-silhouette", "program-facts", "prepared-question"], route: nil)
    }

    /// document.pointer.extract: the document silhouette and nothing else, with structured output
    /// from the model schema derived from the pointer schema (required and nullable).
    public static func pointers(_ skeleton: Skeleton, docType: String = "paystub", language: AppLocale,
                                template: PromptTemplate, pointerSchema: JSON) throws -> CloudRequest {
        let (mode, reason) = task("document.pointer.extract")
        let cloudSchema = try ModelSchema.derive(pointerSchema, requiredNullable: true, dialect: .openapi)
        let deviceSchema = try ModelSchema.derive(pointerSchema, requiredNullable: true, dialect: .jsonschema)
        let prompt = PromptTemplate.fill(template.user, ["docType": docType, "skeleton": text(skeleton)])
        return CloudRequest(taskId: "document.pointer.extract", mode: mode, reason: reason, model: cloudModel,
                            system: CloudText(composed: template.system), prompt: CloudText(composed: prompt), maxOutputTokens: 2048,
                            responseSchema: cloudSchema, deviceSchema: deviceSchema, fields: ["document-silhouette"], checks: nil,
                            route: nil, locale: language)
    }

    // MARK: On-device requests (Raw input)

    static func personalValues(_ r: PersonalResult, includeFacts: Bool) -> [String: String] {
        ["programName": r.programName, "programSummaryFromRulePack": includeFacts ? r.facts : "",
         "verdictLabel": r.verdictLabel, "criteriaLines": r.criteriaLines, "maxWords": String(personalWords)]
    }

    private static func deviceRequest(taskId: String, template: PromptTemplate, values: (Bool) -> [String: String],
                                      locale: AppLocale) -> DeviceRequest {
        let (_, reason) = task(taskId)
        let system = PromptTemplate.fill(template.system, ["locale": languageNames[locale] ?? "English"])
        // Keep the whole request under the on-device input limit: drop the program facts first.
        var prompt = PromptTemplate.fill(template.user, values(true))
        if system.count + prompt.count > onDeviceCharacterBudget { prompt = PromptTemplate.fill(template.user, values(false)) }
        return DeviceRequest(taskId: taskId, reason: reason,
                             call: DeviceCall(taskId: taskId, system: system, prompt: prompt, maxOutputTokens: personalWords * 4),
                             checks: .personal, locale: locale)
    }

    /// explain.personal (explain-personal.v1): the person's own result, on the device only.
    public static func explainPersonal(_ result: Raw<PersonalResult>, template: PromptTemplate) -> DeviceRequest {
        let r = result.value
        return deviceRequest(taskId: "explain.personal", template: template, values: { personalValues(r, includeFacts: $0) }, locale: r.locale)
    }

    /// ask.freeText (ask-personal.v1): a typed question, on the device only.
    public static func askFreeText(_ question: Raw<String>, result: Raw<PersonalResult>, template: PromptTemplate) -> DeviceRequest {
        let r = result.value
        let q = String(question.value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        return deviceRequest(taskId: "ask.freeText", template: template, values: {
            var v = personalValues(r, includeFacts: $0)
            v["question"] = q
            v["maxWords"] = String(min(askWords, personalWords))
            return v
        }, locale: r.locale)
    }

    /// True when a request is too long for the on-device input limit.
    static func exceedsDeviceLimit(_ call: DeviceCall) -> Bool {
        call.system.count + call.prompt.count > onDeviceCharacterBudget
    }
}
