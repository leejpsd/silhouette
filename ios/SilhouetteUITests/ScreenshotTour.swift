// Captures every screen and state in light and dark, English and Spanish, plus the largest
// accessibility text size. Runs only when the runner has SCREENSHOT_DIR set (xcodebuild:
// TEST_RUNNER_SCREENSHOT_DIR=/path); otherwise it is skipped. SCREENSHOT_CONFIGS (for example
// "en-light,es-dark") limits the run. A scripted model stands in for Firebase AI Logic.

import XCTest

final class ScreenshotTour: XCTestCase {
    struct Config {
        let locale: String
        let appearance: String
        var contentSize: String?
        var name: String { [locale, appearance, contentSize == nil ? nil : "ax5"].compactMap { $0 }.joined(separator: "-") }
    }

    private var dir = ""
    private var config = Config(locale: "en", appearance: "light")

    func testTour() throws {
        guard let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] else { throw XCTSkip("SCREENSHOT_DIR not set") }
        self.dir = dir
        let wanted = ProcessInfo.processInfo.environment["SCREENSHOT_CONFIGS"].flatMap { $0.isEmpty ? nil : Set($0.split(separator: ",").map(String.init)) }
        let configs = [
            Config(locale: "en", appearance: "light"), Config(locale: "en", appearance: "dark"),
            Config(locale: "es", appearance: "light"), Config(locale: "es", appearance: "dark"),
            Config(locale: "en", appearance: "light", contentSize: "UICTContentSizeCategoryAccessibilityXXXL"),
        ]
        for c in configs where wanted?.contains(c.name) ?? true {
            config = c
            if c.contentSize != nil { largeTextTour() } else if ProcessInfo.processInfo.environment["SCREENSHOT_PART"] == "documents" { documentTail() } else { fullTour() }
        }
    }

    // MARK: Helpers

    private func launch(model: String = "none", reset: Bool = true, extra: [String] = []) -> XCUIApplication {
        var args = ["-silhouette.locale", config.locale, "-UITestAppearance", config.appearance] + extra
        if let size = config.contentSize { args += ["-UIPreferredContentSizeCategoryName", size] }
        let app = XCUIApplication.silhouette(reset: reset, model: model, extra: args)
        app.launch()
        XCTAssertTrue(app.buttons["language.menu"].waitForExistence(timeout: 10))
        return app
    }

    private func shot(_ name: String, settle: Double = 1.0) {
        Thread.sleep(forTimeInterval: settle)  // let motion and transitions finish
        let path = "\(dir)/\(config.name)-\(name).png"
        FileManager.default.createFile(atPath: path, contents: XCUIScreen.main.screenshot().pngRepresentation)
    }

    /// Lets a sheet finish closing before the next tap.
    private func settle() { Thread.sleep(forTimeInterval: 0.9) }

    private func scrollDown(_ app: XCUIApplication, _ times: Int = 1) {
        for _ in 0..<times {
            let scroll = app.scrollViews.firstMatch
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                .press(forDuration: 0.1, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)),
                       withVelocity: .slow, thenHoldForDuration: 0.1)
        }
    }

    private func scrollToTop(_ app: XCUIApplication) {
        for _ in 0..<4 {
            let scroll = app.scrollViews.firstMatch
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
                .press(forDuration: 0.1, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)),
                       withVelocity: .fast, thenHoldForDuration: 0.1)
        }
    }

    /// Household of 3, earned income yes, the given income, the rest skipped; ends on Results.
    private func quickCheck(_ app: XCUIApplication, income: (XCUIApplication) -> Void) {
        app.tapButton("start.begin")
        app.waitForQuestionNumber(1)
        app.setStepper(to: 3)
        app.next()
        app.skip()
        app.choose("yes")
        app.next()
        income(app)
        app.next()
        for _ in 5...8 { app.skip() }
        XCTAssertTrue(app.element("results.title").waitForExistence(timeout: 5))
    }

    private func openAbout(_ app: XCUIApplication) {
        app.tapButton("program.food-help")
        XCTAssertTrue(app.element("detail.verdict").waitForExistence(timeout: 5))
        app.tapButton("about.explain")
    }

    // MARK: Tours

    private func fullTour() {
        // Start, the sheets of the header and the demo line.
        var app = launch()
        shot("01-start")
        app.buttons["language.menu"].tap()
        shot("02-language-sheet")
        app.buttons["sheet.close"].tap()
        settle()
        app.buttons["demo.more"].tap()
        shot("03-demo-sheet")
        app.tapButton("delete.all")
        shot("04-delete-sheet")
        app.tapButton("delete.cancel")
        settle()
        app.tapButton("demo.close")
        settle()

        // Every question type.
        app.tapButton("start.begin")
        app.waitForQuestionNumber(1)
        shot("05-question-number")
        app.tapButton("q.next")
        _ = app.element("question.error").waitForExistence(timeout: 5)
        shot("06-question-validation")
        app.setStepper(to: 3)
        shot("07-question-number-set")
        app.next()
        app.skip()
        app.choose("yes")
        shot("08-question-yes-no")
        app.next()
        _ = app.buttons["choice.exact"].waitForExistence(timeout: 5)
        shot("09-question-income")
        app.typeExactIncome("30524")
        shot("10-question-income-exact")
        app.next()
        app.choose("renter")
        shot("11-question-choice-rows")
        app.next()
        app.choose("snap")
        shot("12-question-multiple")
        app.next()
        app.skip()
        _ = app.element("question.sensitive").waitForExistence(timeout: 5)
        shot("13-question-sensitive")
        app.skip()

        // Results and program pages.
        XCTAssertTrue(app.element("results.title").waitForExistence(timeout: 5))
        shot("14-results")
        scrollDown(app)
        shot("15-results-scrolled")
        scrollToTop(app)
        app.tapButton("program.senior-food")
        shot("16-program-amount")
        app.tapButton("nav.back")
        app.tapButton("program.food-help")
        shot("17-program")
        scrollDown(app)
        shot("18-program-why")
        scrollDown(app, 2)
        shot("19-program-about")
        app.tapButton("leaving.details")
        shot("20-record-empty")
        app.tapButton("leaving.hide")
        settle()
        app.tapButton("nav.back")

        // The document flow with a built-in sample.
        app.tapButton("results.addDocument")
        _ = app.element("doc.title").waitForExistence(timeout: 5)
        shot("21-add-document")
        scrollDown(app, 2)
        shot("22-add-document-scrolled")
        app.tapButton("doc.sample.paystub-en-01")
        _ = app.element("preview.title").waitForExistence(timeout: 5)
        scrollDown(app)
        shot("23-preview-could-leave", settle: 2)
        app.tapButton("preview.mode.phone")
        shot("24-preview-on-this-phone", settle: 2)
        app.tapButton("preview.mode.leave")
        let word = app.links["Gross"].firstMatch
        if word.waitForExistence(timeout: 5) { word.tap() }
        scrollDown(app, 2)
        shot("25-preview-hidden-word", settle: 2)
        app.tapButton("preview.undo")
        app.tapButton("preview.sampleButton")
        _ = app.element("review.title").waitForExistence(timeout: 5)
        shot("26-review")
        scrollDown(app, 2)
        shot("27-review-income-checks")
        app.tapButton("review.more")
        scrollDown(app)
        shot("28-review-more-values")
        scrollToTop(app)
        app.tapButton("review.confirmAll")
        shot("29-review-confirmed")
        app.tapButton("review.useIncome")
        _ = app.element("results.docEffect").waitForExistence(timeout: 5)
        shot("30-results-document-effect")

        // Delete everything from the record; the record after deleting.
        app.tapButton("leaving.details")
        app.tapButton("delete.all")
        shot("31-delete-from-record")
        app.tapButton("delete.confirm")
        _ = app.element("start.notice").waitForExistence(timeout: 5)
        shot("32-start-after-delete")
        app.tapButton("leaving.details")
        shot("33-record-deleted")
        app.terminate()

        // The step before sending, an answer from the cloud, and the record.
        app = launch(model: "cloud")
        quickCheck(app) { $0.choose("C") }
        openAbout(app)
        _ = app.buttons["send.send"].waitForExistence(timeout: 5)
        shot("34-send-step")
        app.tapButton("send.showRequest")
        shot("35-send-step-request")
        app.tapButton("send.skip")
        settle()
        _ = app.element("send.skipped").waitForExistence(timeout: 5)
        shot("36-kept-on-device")
        app.tapButton("chip.apply")
        app.tapButton("send.send")
        settle()
        _ = app.element("answer.badge").waitForExistence(timeout: 10)
        shot("37-answer-cloud")
        app.tapButton("leaving.details")
        shot("38-record-sent")
        scrollDown(app)
        shot("39-record-sent-entries")
        app.tapButton("leaving.hide")
        app.terminate()

        // Loading, slow and cancelled.
        app = launch(model: "cloud-slow")
        quickCheck(app) { $0.choose("C") }
        openAbout(app)
        app.tapButton("send.send")
        _ = app.element("answer.loading").waitForExistence(timeout: 5)
        shot("40-loading")
        Thread.sleep(forTimeInterval: 15)
        shot("41-loading-slow")
        app.tapButton("answer.cancel")
        shot("42-cancelled")
        app.terminate()

        // Daily limit and a blocked answer.
        for (mode, name) in [("cloud-quota", "43-daily-limit"), ("cloud-blocked", "44-blocked")] {
            app = launch(model: mode)
            quickCheck(app) { $0.choose("C") }
            openAbout(app)
            app.tapButton("send.send")
            _ = app.element("answer.error").waitForExistence(timeout: 5)
            shot(name)
            app.terminate()
        }

        // An answer written on this device, and the kept count.
        app = launch(model: "device")
        quickCheck(app) { $0.choose("C") }
        app.tapButton("program.food-help")
        app.tapButton("why.explain")
        _ = app.element("answer.badge").waitForExistence(timeout: 10)
        shot("45-why-on-device")
        app.tapButton("about.explain")
        if app.buttons["send.send"].waitForExistence(timeout: 5) { app.tapButton("send.send") }
        Thread.sleep(forTimeInterval: 1)
        app.tapButton("leaving.details")
        shot("46-record-kept")
        app.terminate()

        // Results: offline, before any answer, nothing fits.
        app = launch(extra: ["-UITestOffline"])
        quickCheck(app) { $0.choose("C") }
        shot("47-results-offline")
        app.terminate()

        app = launch()
        app.tapButton("start.begin")
        for _ in 1...8 { app.skip() }
        _ = app.element("results.title").waitForExistence(timeout: 5)
        shot("48-results-before-answers")
        app.terminate()

        app = launch()
        app.tapButton("start.begin")
        app.setStepper(to: 1)
        app.next()
        app.setStepper(to: 0)
        app.next()
        app.choose("no")
        app.next()
        app.choose("E")
        app.next()
        app.choose("owner")
        app.next()
        app.next()  // no benefits ticked: "none of these"
        app.choose("no")
        app.next()
        app.choose("not-eligible")
        app.next()
        _ = app.element("results.title").waitForExistence(timeout: 5)
        shot("49-results-none")
        app.terminate()

        documentTail()
    }

    /// A pasted document that is not a paystub, read in the cloud; typing the numbers; a value that
    /// fails a check.
    private func documentTail() {
        var app = launch(model: "cloud")
        app.tapButton("start.sample")
        app.tapButton("doc.paste")
        let paste = app.textViews["doc.paste.text"]
        app.scrollIntoView(paste)
        paste.tap()
        paste.typeText("Residential lease agreement. Tenant Jordan Avery. Monthly rent 1450 due on the first day.")
        app.tapButton("doc.paste.keyboardContinue")
        _ = app.element("preview.title").waitForExistence(timeout: 5)
        shot("50-preview-cloud")
        app.tapButton("preview.send")
        _ = app.element("review.notDocument").waitForExistence(timeout: 10)
        shot("51-not-a-paystub")
        app.tapButton("review.typeIn")
        _ = app.element("review.title").waitForExistence(timeout: 5)
        shot("52-review-type-numbers")
        app.terminate()

        // A value that fails a check.
        app = launch()
        app.tapButton("start.sample")
        app.tapButton("doc.sample.paystub-en-01")
        app.tapButton("preview.sampleButton")
        app.tapButton("field.grossPay.edit")
        let input = app.textFields["field.grossPay.input"]
        if input.waitForExistence(timeout: 5) {
            input.tap()
            input.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 12) + "99999")
            shot("53-review-editing")
            app.tapButton("field.grossPay.keyboardSave")
        }
        scrollDown(app, 2)
        shot("54-review-check-warning")
        app.terminate()
    }

    private func largeTextTour() {
        let app = launch()
        shot("01-start")
        scrollDown(app, 2)
        shot("02-start-scrolled")
        app.tapButton("start.begin")
        shot("03-question-number")
        app.setStepper(to: 3)
        app.next()
        app.skip()
        app.choose("yes")
        shot("04-question-yes-no")
        app.next()
        shot("05-question-income")
        app.typeExactIncome("30524")
        shot("06-question-income-exact")
        app.next()
        for _ in 5...8 { app.skip() }
        _ = app.element("results.title").waitForExistence(timeout: 5)
        shot("07-results")
        app.tapButton("program.food-help")
        shot("08-program")
        scrollDown(app, 2)
        shot("09-program-why")
        app.tapButton("leaving.details")
        shot("10-record")
        app.terminate()
    }
}

extension XCUIApplication {
    /// Waits for question n, in any language (the giant number is hidden; the progress line has n).
    func waitForQuestionNumber(_ n: Int) {
        let progress = element("question.progress")
        let predicate = NSPredicate(format: "label CONTAINS %@", " \(n) ")
        let found = XCTNSPredicateExpectation(predicate: predicate, object: progress)
        _ = XCTWaiter.wait(for: [found], timeout: 5)
    }
}
