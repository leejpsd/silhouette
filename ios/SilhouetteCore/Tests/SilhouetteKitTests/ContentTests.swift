import Foundation
import Testing
@testable import SilhouetteCore
@testable import SilhouetteKit

@Suite("Copy, tokens and outbound log")
struct ContentTests {
    @Test("per-key fallback to English and placeholder formatting")
    func fallback() throws {
        let copy = try Repo.bundle().copy
        #expect(copy.text("promise.line1", .ko) != copy.text("promise.line1", .en))
        #expect(copy.text("q.progress", .en, ["n": "2", "total": "8"]) == "Question 2 of 8")
        #expect(CopyBook.format("{a} and {b} and {c}", ["a": "1", "b": "2"]) == "1 and 2 and {c}")
        let book = CopyBook(tables: [.en: [.shared: JSONObject([("only.en", .string("English"))])], .ko: [.shared: JSONObject()]])
        #expect(book.text("only.en", .ko) == "English")
        #expect(book.text("missing.key", .ko) == "missing.key")
    }

    @Test("every key the app builds from the pack exists in English")
    func packKeys() throws {
        let (b, s) = try Repo.session()
        var keys: [String] = ["pack.\(b.packInfo.jurisdiction).name"]
        for step in s.steps {
            keys.append("question.\(step.id).label")
            switch step.kind {
            case .single(let values), .multiple(let values): keys += values.map { "option.\(step.id).\($0)" }
            case .boolean: keys += ["option.\(step.id).true", "option.\(step.id).false"]
            default: break
            }
            if !step.isIncome { keys.append("variable.\(step.id)") }
        }
        keys.append("variable.annualIncome")
        for program in b.pack.programs {
            keys += program.criteria.map { "criterion.\(program.id).\($0.id)" }
        }
        for program in b.packInfo.programs { keys += program.caveats.map { "caveat.\($0)" } }
        for key in keys { #expect(b.copy.has(key), "missing copy key \(key)") }
    }

    @Test("every static key the app uses exists in English")
    func appKeys() throws {
        let copy = try Repo.bundle().copy
        let keys = [
            "start.title", "start.lead", "start.rules", "start.begin", "start.continue", "start.restart", "promise.line1", "promise.line2",
            "promise.line3", "q.progress", "q.next", "q.finish", "q.skip", "q.back", "q.increase", "q.decrease", "q.private",
            "q.error.integer", "q.error.choose", "q.error.amount", "sensitive.note", "income.band.range", "income.band.top",
            "income.band.under", "income.exact.option", "income.exact.label", "results.title", "results.lead", "results.dependsOn",
            "results.estimate", "results.open", "results.edit", "results.maybeHint", "detail.amount", "detail.period", "detail.caveats",
            "detail.criteria", "detail.dependsOn", "detail.answer", "detail.unverified", "detail.back", "rules.verifiedOn",
            "state.pass", "state.fail", "state.mixed", "state.unknown", "verdict.likely", "verdict.maybe", "verdict.depends",
            "verdict.unlikely", "demo.title", "demo.body", "leaving.title", "leaving.none", "leaving.body", "leaving.network",
            "leaving.details", "leaving.hide", "outbound.count", "outbound.sentTo", "outbound.showPayload", "delete.all",
            "delete.title", "delete.body", "delete.confirm", "delete.cancel", "delete.done", "nav.language", "nav.home", "q.amountUnderstood", "start.resume",
        ]
        for key in keys { #expect(copy.has(key), "missing copy key \(key)") }
    }

    @Test("the app's local copy never shadows a shared or pack key")
    func localDoesNotShadow() throws {
        let copy = try Repo.bundle().copy
        for locale in AppLocale.allCases {
            let shared = Set(copy.keys(.shared, .en) + copy.keys(.pack, .en))
            let local = copy.keys(.local, locale)
            #expect(Set(local).isDisjoint(with: shared), "\(locale): \(Set(local).intersection(shared))")
            #expect(Set(local).isSubset(of: Set(copy.keys(.local, .en))), "\(locale) has keys missing in en")
        }
    }

    @Test("band labels and numbers follow the locale")
    func bandLabels() throws {
        let b = try Repo.bundle()
        let bands = b.bands.annualIncome
        #expect(b.copy.bandLabel(bands[0], .en) == "Less than 15,000")
        #expect(b.copy.bandLabel(bands[1], .en) == "15,000 to 29,999")
        #expect(b.copy.bandLabel(bands.last!, .en) == "60,000 or more")
        #expect(CopyBook.formatNumber(3000, .ko) == "3,000")
        #expect(CopyBook.formatNumber(30000, .es) == "30.000")
    }

    @Test("the preferred locale comes from the device languages, else English")
    func preferredLocale() {
        #expect(AppLocale.preferred(from: ["ko-KR", "en-US"]) == .ko)
        #expect(AppLocale.preferred(from: ["fr-FR", "es-MX"]) == .es)
        #expect(AppLocale.preferred(from: ["fr-FR"]) == .en)
        #expect(AppLocale.preferred(from: []) == .en)
    }

    @Test("design tokens: every light color has a dark counterpart; scale, spacing and radii are present")
    func tokens() throws {
        let t = try Repo.bundle().tokens
        #expect(Set(t.light.keys) == Set(t.dark.keys))
        #expect(t.light["primary"] == DesignTokens.RGBA(red: 0x2F / 255.0, green: 0x43 / 255.0, blue: 0xA0 / 255.0, alpha: 1))
        for name in ["display", "title", "heading", "body", "bodyStrong", "small"] { #expect(t.type[name] != nil, "\(name)") }
        for name in ["xs", "sm", "md", "lg", "xl"] { #expect(t.spacing[name] != nil, "\(name)") }
        #expect(t.radius["control"] == 12)
        #expect((t.size["minTapTarget"] ?? 0) >= 44)
    }

    @Test("the outbound log records before sending and notifies observers")
    func outboundLog() async throws {
        let log = OutboundLog()
        #expect(log.entries.isEmpty)
        let seen = Counter()
        log.observe { seen.set($0.count) }
        let skeleton = Skeletonizer.skeletonize(Raw("Net Pay 1,000.00"), allowlist: Allowlist(words: ["net", "pay"])).skeleton
        let result = await log.send(OutboundEntry(channel: .aiCloud, destination: "example.invalid", fields: ["document-silhouette"],
                                                  payload: CloudBoundary.outbound(skeleton))) {
            log.entries.count
        }
        #expect(result == 1)
        #expect(seen.value == 1)
        #expect(log.entries.first?.payload?.text == "Net Pay \u{27E6}N1\u{27E7}")
        log.clear()
        #expect(log.entries.isEmpty)
        #expect(seen.value == 0)
    }
}

@Suite("Routing reasons")
struct RoutingReasonTests {
    @Test("every reason in shared/routing.json has a case and copy, and no case is extra")
    func reasonsMatchRouting() throws {
        let routing = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("routing.json")))
        var reasons = Set<String>()
        for (_, task) in routing["tasks"]?.objectValue?.entries ?? [] {
            if let r = task["reason"]?.stringValue { reasons.insert(r) }
        }
        if let r = routing["onDeviceFailure"]?["reason"]?.stringValue { reasons.insert(r) }
        #expect(reasons == Set(RoutingReason.allCases.map(\.rawValue)))
        let copy = try Repo.bundle().copy
        for reason in RoutingReason.allCases { #expect(copy.has(reason.copyKey), "missing \(reason.copyKey)") }
    }
}

final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var n = 0
    var value: Int { lock.withLock { n } }
    func set(_ v: Int) { lock.withLock { n = v } }
}
