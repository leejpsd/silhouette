// "Why this result" (rules, no model) and the step before sending. A scripted model stands in for
// Firebase AI Logic: no real model call and no network.

import XCTest

final class AnswersUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// Household of three, the rest skipped except income; opens Test Food Help.
    private func openFoodHelp(_ app: XCUIApplication, income: () -> Void) {
        app.tapButton("start.begin")
        app.waitForQuestion(1)
        app.setStepper(to: 3)
        app.next()
        app.waitForQuestion(2)
        app.skip()
        app.waitForQuestion(3)
        app.skip()
        app.waitForQuestion(4)
        income()
        app.next()
        for n in 5...8 {
            app.waitForQuestion(n)
            app.skip()
        }
        app.tapButton("program.food-help")
        XCTAssertTrue(app.element("detail.verdict").waitForExistence(timeout: 5))
    }

    func testWhyThisResultFromTheRules() {
        let app = XCUIApplication.silhouette(model: "none")
        app.launch()
        openFoodHelp(app) { app.typeExactIncome("30524") }
        let income = app.element("why.income-limit")
        XCTAssertTrue(income.waitForExistence(timeout: 5))
        XCTAssertTrue(income.label.contains("limit $34,000, yours $30,524"), income.label)
        XCTAssertTrue(app.element("why.residency").exists)
        // Without a device model the person's own result is not put into words, and typed questions are off.
        XCTAssertTrue(app.element("why.unavailable").exists)
        XCTAssertFalse(app.buttons["why.explain"].exists)
        XCTAssertTrue(app.element("ask.free.unavailable").exists)
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this device."))
    }

    func testStepBeforeSendingKeepAndSend() {
        let app = XCUIApplication.silhouette(model: "cloud")
        app.launch()
        openFoodHelp(app) { app.choose("C") }

        app.tapButton("about.explain")
        let lines = app.element("send.lines")
        XCTAssertTrue(lines.waitForExistence(timeout: 5))
        XCTAssertTrue(lines.label.contains("(C)"), lines.label)
        XCTAssertTrue(app.buttons["send.send"].exists)
        app.tapButton("send.skip")
        XCTAssertTrue(app.element("send.skipped").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this device."), "keeping sends nothing")

        // Consent is asked again for the next request; after Send, the answer says where it was written.
        app.tapButton("chip.apply")
        XCTAssertTrue(app.buttons["send.send"].waitForExistence(timeout: 5))
        app.tapButton("send.send")
        let badge = app.element("answer.badge")
        XCTAssertTrue(badge.waitForExistence(timeout: 10))
        XCTAssertTrue(badge.label.contains("cloud"), badge.label)
        XCTAssertTrue(app.element("answer.text").label.contains("in general"))
        let status = app.element("leaving.status")
        XCTAssertTrue(status.label.hasPrefix("1 sent"), status.label)
    }
}
