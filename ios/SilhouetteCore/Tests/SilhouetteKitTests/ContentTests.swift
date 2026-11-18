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

    @Test("the device noun: every iOS case of shared/fixtures/copy/device-noun.json, through the loader")
    func deviceNoun() throws {
        let fixture = try JSON.parse(Data(contentsOf: Repo.shared.appendingPathComponent("fixtures/copy/device-noun.json")))
        let cases = (fixture["cases"]?.arrayValue ?? []).filter { $0["platform"]?.stringValue == "ios" }
        // The fixture grows with the copy; what matters is that every case in it holds.
        #expect(cases.count >= 184)
        let book = try Repo.bundle().copy
        for c in cases {
            let locale = try #require(AppLocale(rawValue: c["language"]?.stringValue ?? ""))
            let key = try #require(c["key"]?.stringValue)
            let text = try #require(c["text"]?.stringValue)
            let shown = try #require(c["shown"]?.stringValue)
            // The rule itself, and what the loader gives for the key.
            #expect(book.nouns.apply(text, locale) == shown, "\(locale) \(key)")
            #expect(book.lookup(key, locale) == shown, "\(locale) \(key) through the loader")
            // Applying it twice changes nothing.
            #expect(book.nouns.apply(shown, locale) == shown)
        }
        // Left alone: compounds, placeholders, other capitalisation, Spanish "del dispositivo", Korean.
        #expect(book.nouns.apply("the on-device model on this device-first {this device} Device first", .en)
                == "the on-device model on this device-first {this device} Device first")
        #expect(book.nouns.apply("el modelo del dispositivo en este dispositivo", .es) == "el modelo del dispositivo en este iPhone")
        #expect(book.nouns.apply("this device", .ko) == "this device")
        #expect(book.nouns.apply("On this phone", .en) == "On this iPhone")
        // The app's own strings already name the device the iOS way (the rule changes none of them).
        for locale in [AppLocale.en, .es] {
            for key in book.keys(.local, locale) {
                let text = try #require(book.tables[locale]?[.local]?[key]?.stringValue)
                #expect(book.nouns.apply(text, locale) == text, "\(locale) \(key)")
            }
        }
    }

    @Test("one and many: every .one key is used for a count of 1, in its own language, and only then")
    func oneAndMany() throws {
        let book = try Repo.bundle().copy
        var checked = 0
        for locale in [AppLocale.en, .es] {
            for key in book.keys(.shared, locale) where key.hasSuffix(".one") {
                let plain = String(key.dropLast(4))
                let one = try #require(book.tables[locale]?[.shared]?[key]?.stringValue)
                let params = ["count": "1", "list": "x", "program": "p"]
                #expect(book.text(plain, locale, params) == CopyBook.format(book.nouns.apply(one, locale), params), "\(locale) \(plain)")
                #expect(book.text(plain, locale, ["count": "2", "list": "x"]) == CopyBook.format(book.lookup(plain, locale) ?? "", ["count": "2", "list": "x"]))
                checked += 1
            }
        }
        #expect(checked >= 22)
        #expect(book.text("results.mayQualifyCount", .en, ["count": "1"]) == "You may qualify for 1 program")
        #expect(book.text("results.mayQualifyCount", .es, ["count": "1"]) == "Es posible que califiques para 1 programa")
        #expect(book.text("leaving.sentCount", .es, ["count": "1"]) == "1 enviada,")
        // A Spanish sentence never takes the English singular.
        let mixed = CopyBook(tables: [.en: [.shared: JSONObject([("k", .string("{count} things")), ("k.one", .string("{count} thing"))])],
                                      .es: [.shared: JSONObject([("k", .string("{count} cosas"))])]])
        #expect(mixed.text("k", .es, ["count": "1"]) == "1 cosas")
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

    @Test("every key of the design the app uses exists in English")
    func designKeys() throws {
        let copy = try Repo.bundle().copy
        let keys = [
            "demo.short", "demo.more", "preview.onPhone", "preview.couldLeave", "preview.youHid", "preview.undo", "detail.limit",
            "detail.you", "detail.limitFamily", "detail.yourAnswer", "leaving.noValues", "leaving.recordDeleted", "leaving.sentCount",
            "leaving.keptCount", "leaving.cleared", "leaving.clearedShort", "results.notAnswered", "results.none", "results.noneHelp",
            "state.offline", "doc.photo.staysHere", "answers.retried", "outbound.reason.offline", "outbound.status.answeredShort",
            "nav.close", "nav.languageNote", "review.before", "review.moreValues", "review.confirmAllCount", "review.continue",
            "send.showRequest", "send.requestAsBuilt", "leaving.sdkNote", "delete.erasedDevice", "sample.try", "official.title",
            "official.none", "official.apply", "placeholder.word", "placeholder.number", "placeholder.date",
        ]
        for key in keys { #expect(copy.has(key), "missing copy key \(key)") }
    }

    @Test("money follows the pack's currency and the UI language; without one it is a plain number")
    func money() throws {
        let b = try Repo.bundle()
        #expect(b.packInfo.currency == "USD")
        #expect(CopyBook.formatMoney(3000, .en, currency: "USD") == "$3,000")
        #expect(CopyBook.formatMoney(28000.5, .en, currency: "USD", cents: true) == "$28,000.50")
        #expect(CopyBook.formatMoney(28000, .en, currency: "USD", cents: true) == "$28,000")
        #expect(CopyBook.formatMoney(3000, .en, currency: nil) == "3,000")
        // The pack's number format in every interface language, always grouped.
        #expect(b.packInfo.numberFormat == "en-US")
        for locale in AppLocale.allCases {
            #expect(CopyBook.formatMoney(34000, locale, currency: "USD", format: "en-US") == "$34,000")
            #expect(CopyBook.formatMoney(3000, locale, currency: "USD", format: "en-US") == "$3,000")
        }
        let bands = b.bands.annualIncome
        #expect(b.copy.bandLabel(bands[1], .es, currency: "USD", format: "en-US").contains("$15,000"))
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

    @Test("design tokens: every light color has a dark counterpart; scale, spacing and radii are present; extra structures are skipped")
    func tokens() throws {
        let t = try Repo.bundle().tokens
        #expect(Set(t.light.keys) == Set(t.dark.keys))
        #expect(t.light["primary"] != nil && t.dark["primary"] != nil)
        for name in ["display", "title", "heading", "body", "bodyStrong", "small"] { #expect(t.type[name] != nil, "\(name)") }
        for name in ["xs", "sm", "md", "lg", "xl"] { #expect(t.spacing[name] != nil, "\(name)") }
        #expect((t.radius["control"] ?? 0) > 0)
        #expect((t.size["minTapTarget"] ?? 0) >= 44)
        // Structured values by path: the design's motion, rotation and size steps.
        #expect(t.number("motion.duration.rise") == 700)
        #expect(t.numbers("motion.easing.standard").count == 4)
        // Version 7: nothing is rotated, and the palette's named colours are present.
        #expect(t.number("rotation.stamp") == 0)
        for name in ["redact", "redactTint", "onRedact", "night", "note", "track", "raised", "sheet"] {
            #expect(t.light[name] != nil && t.dark[name] != nil, "\(name)")
        }
        #expect(t.number("typography.sizeSteps.displayScaleCap") == 1.3)
        #expect(t.number("size.compact.optionTileHeight") == 80)
        #expect(t.number("size.marker") == 20)
        #expect(t.number("no.such.path") == nil)
        for role in ["ground", "ink", "block", "onBlock", "paper", "onPaper", "leave", "onLeave", "mine", "onMine"] {
            #expect(t.light[role] != nil && t.dark[role] != nil, "\(role)")
        }
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
        if let r = routing["offlineSample"]?["reason"]?.stringValue { reasons.insert(r) }
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
