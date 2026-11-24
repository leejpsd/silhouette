// How large an on-device reading request is, in the on-device model's tokens, estimated without the model.
//
// Apple's on-device model has a 4,096-token window for the instruction, the prompt and the answer. With
// guided generation the constraint is also written into the prompt in full: every allowed id of every
// field (a long paystub has 60 to 90 number ids, offered to each of five amount fields, and 50 to 110 word
// ids, offered to each of two names). On iOS 26.5 each allowed value took about 16 tokens there, so every
// one of the 24 held-out paystubs (1,000 to 2,500 characters) went past the window on its first part
// (5,239 to 9,615 tokens, of which the constraint's text was 3,800 to 8,000).
//
// The constraint still decides what can be written when its text is left out of the prompt. So a part
// keeps the constraint's text in its prompt when the request fits with it (the bundled sample and the
// evaluation paystubs read as before), and leaves it out when it does not: the request is then the
// instruction and the silhouette, about 2,500 tokens for a 3,500-character paystub.
//
// Calibration, on the bundled sample, the 38 evaluation paystubs, the 24 held-out texts and the long
// synthetic paystubs of ios/eval/long-paystubs, every part (284 requests):
// - text (`textTokens`): the instruction and the prompt as the model counts them (`tokenCount`, macOS 27
//   and the iOS 27 simulator): within -60 and +80 tokens;
// - constraint (`schemaTokens`): on macOS 27 the model counts 5 tokens per allowed value plus a constant
//   per part; the iPhone (iOS 26.5.2) reported, for the 24 held-out first parts, the text plus 3.2 times
//   that, which `textTokens + schemaTokens` matches within -35 and +85 tokens.
// A request the estimate lets through and the model still refuses for its length is asked once more
// without the constraint's text (TaskRunner).

import Foundation
import SilhouetteCore

public enum DeviceBudget {
    /// The on-device model's window: instruction, prompt and answer.
    public static let window = 4096
    /// `TaskError.origin` when the model refused a request for its length.
    public static let contextWindowOrigin = "context-window"

    private static let spaceRun = try! NSRegularExpression(pattern: " {2,}")

    /// Room kept for the answer: a list of deductions is longer than the other parts' answers.
    public static func answerReserve(_ constraint: JSON?) -> Int {
        let list = constraint?["properties"]?.objectValue?.entries.contains { $0.value["type"]?.stringValue == "array" && $0.value["items"]?["type"]?.stringValue == "object" } ?? false
        return list ? 400 : 128
    }

    /// Tokens of instruction and prompt text: characters outside runs of spaces, the runs of spaces (a
    /// column gap is a few tokens whatever its width) and the placeholders.
    public static func textTokens(_ text: String) -> Int {
        let ns = text as NSString
        let runs = spaceRun.matches(in: text, range: NSRange(location: 0, length: ns.length))
        let inRuns = runs.reduce(0) { $0 + $1.range.length }
        let placeholders = text.components(separatedBy: "\u{27E6}").count - 1
        return Int((0.264 * Double(ns.length - inRuns) + 0.32 * Double(runs.count) + 4.73 * Double(placeholders) + 5).rounded(.up))
    }

    /// Tokens the constraint takes when its text is in the prompt, as the iPhone counts them.
    public static func schemaTokens(_ constraint: JSON) -> Int {
        let fields = constraint["properties"]?.objectValue?.entries.count ?? 0
        return 16 * allowedValues(constraint) + 28 * fields + 120 + (answerReserve(constraint) > 128 ? 200 : 0)
    }

    /// Every allowed value of every field of a constraint (enum entries, `null` not counted).
    static func allowedValues(_ constraint: JSON) -> Int {
        var n = (constraint["enum"]?.arrayValue ?? []).filter { !$0.isNull }.count
        for (_, value) in constraint.objectValue?.entries ?? [] where value.objectValue != nil { n += allowedValues(value) }
        return n
    }

    /// The estimated size of a request, with the constraint's text in the prompt or not as the call says.
    public static func estimate(_ call: DeviceCall) -> Int {
        textTokens(call.system + call.prompt) + (call.schemaInPrompt ? call.constraint.map(schemaTokens) ?? 0 : 0)
    }

    /// Whether a request fits the window with the constraint's text in its prompt, room for the answer kept.
    static func fitsWithSchema(system: String, prompt: String, constraint: JSON) -> Bool {
        textTokens(system + prompt) + schemaTokens(constraint) + answerReserve(constraint) <= window
    }
}
