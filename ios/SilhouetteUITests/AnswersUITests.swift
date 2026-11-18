// "Why this result" (rules, no model) and the step before sending. A scripted model stands in for
// Firebase AI Logic: no real model call and no network.

import XCTest

final class AnswersUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// The prepared household (income range $25,000–$32,999); opens the federal credit.
    private func openFederalCredit(_ app: XCUIApplication) {
        app.runPreparedHousehold()
        app.tapButton("program.federal-eitc")
        XCTAssertTrue(app.element("detail.verdict").waitForExistence(timeout: 5))
    }

    func testWhyThisResultFromTheRules() {
        let app = XCUIApplication.silhouette(model: "none")
        app.launch()
        openFederalCredit(app)
        let income = app.element("why.income-limit")
        app.scrollIntoView(income)
        XCTAssertTrue(income.waitForExistence(timeout: 5))
        XCTAssertTrue(income.label.contains("limit $") && income.label.contains("$25,000") && income.label.contains("$32,999"), income.label)
        XCTAssertTrue(app.element("why.investment-income").exists)
        // Without a device model the person's own result is not put into words, and typed questions are off.
        XCTAssertTrue(app.element("why.unavailable").exists)
        XCTAssertFalse(app.buttons["why.explain"].exists)
        XCTAssertTrue(app.element("ask.free.unavailable").exists)
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
    }

    func testStepBeforeSendingKeepAndSend() {
        let app = XCUIApplication.silhouette(model: "cloud")
        app.launch()
        openFederalCredit(app)

        app.tapButton("about.explain")
        let lines = app.element("send.lines")
        XCTAssertTrue(lines.waitForExistence(timeout: 5))
        // Explanations take public information only: nothing about the person.
        XCTAssertTrue(lines.label.contains("Nothing about you"), lines.label)
        XCTAssertTrue(lines.label.contains("Federal Earned Income Tax Credit"), lines.label)
        XCTAssertFalse(lines.label.contains("25,000"), lines.label)
        XCTAssertTrue(app.buttons["send.send"].exists)
        app.tapButton("send.skip")
        XCTAssertTrue(app.element("send.skipped").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."), "keeping sends nothing")

        // Consent is asked again for the next request; after Send, the answer says where it was written.
        app.tapButton("chip.apply")
        XCTAssertTrue(app.buttons["send.send"].waitForExistence(timeout: 5))
        app.tapButton("send.send")
        let badge = app.element("answer.badge")
        XCTAssertTrue(badge.waitForExistence(timeout: 10))
        XCTAssertTrue(badge.label.contains("cloud"), badge.label)
        XCTAssertTrue(app.element("answer.text").label.contains("in general"))
        // The line under the count: nothing of the person's left, one request with general material.
        let status = app.element("leaving.status")
        XCTAssertTrue(status.label.contains("Nothing of yours sent") && status.label.contains("1 check or general question,"), status.label)
    }
}
