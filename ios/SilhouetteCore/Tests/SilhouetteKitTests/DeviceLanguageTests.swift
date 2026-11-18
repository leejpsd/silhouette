// The on-device model refuses a request whose user turn reads as a language it does not support
// (FoundationModels `unsupportedLanguageOrLocale`). A silhouette is mostly placeholders, and alone it
// can read as Polish: the evaluation paystub L10 was refused on an iPhone every time. Each reading
// part's user turn must read as a supported language for every evaluation paystub.

import Foundation
import NaturalLanguage
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

@Suite("on-device reading: the language of the user turn")
struct DeviceLanguageTests {
    /// The languages Apple's on-device model lists as supported (iOS 26), by language code.
    static let supported: Set<String> = ["da", "de", "en", "es", "fr", "it", "ja", "ko", "nb", "nl", "pt", "sv", "tr", "vi", "zh-Hans", "zh-Hant"]

    static func language(_ text: String) -> String {
        let r = NLLanguageRecognizer()
        r.processString(text)
        return r.dominantLanguage?.rawValue ?? "none"
    }

    @Test("every part of every evaluation paystub reads as English, and the silhouette alone would not")
    func everyPartReadsAsEnglish() throws {
        let bundle = try Repo.bundle()
        let docs = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("reference/device-reading.docs.json")))["docs"]?.arrayValue ?? []
        let template = try #require(bundle.prompts["pointer-extract.v5"])
        let allowlist = try bundle.allowlist(for: .en)
        var aloneUnsupported: [String] = []
        #expect(docs.count == 38)
        for doc in docs {
            let id = doc["id"]?.stringValue ?? ""
            let skeleton = Skeletonizer.skeletonize(Raw(doc["text"]?.stringValue ?? ""), allowlist: allowlist).skeleton
            let alone = PromptTemplate.fill(template.user, ["docType": "paystub", "skeleton": skeleton.text])
            if !Self.supported.contains(Self.language(alone)) { aloneUnsupported.append(id) }
            for (part, text) in bundle.prompts.deviceParts {
                let call = Planner.devicePart(skeleton, template: template, partText: text, part: part, constraint: .object(JSONObject()))
                #expect(Self.language(call.prompt) == "en", "\(id) \(part)")
            }
        }
        // The finding the order fixes: without the part's text first, some silhouettes read as another language.
        #expect(aloneUnsupported.contains("en-l10-1"), "\(aloneUnsupported)")
    }
}
