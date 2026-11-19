// The scenes that make the product's point on the judged path (contracts v1.32 to v1.42): the judges'
// path starts with the sample paystub; the recorded cloud reading of its silhouette (nothing sent now);
// the pointer card with the value's line as the model saw it and on this iPhone; the review that
// confirms only the values that decide the result; the results that open with the sample household
// and what the paystub changed; the record listing the recording with its exact request.

import XCTest

final class JudgedPathUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// The recorded cloud reading: the pointer card shows the model's answer, the value put back, and the
    /// line twice; nothing leaves, and the record lists it as kept with the exact request as recorded.
    func testRecordedCloudReadingShowsTheLineTwice() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.openSample()
        app.tapButton("preview.useRecordedCloud")
        XCTAssertTrue(app.element("review.title").waitForExistence(timeout: 10))
        let badge = app.element("source.badge")
        XCTAssertTrue(badge.exists)
        XCTAssertTrue(badge.label.contains("Recorded in the cloud"), badge.label)
        XCTAssertTrue(badge.label.contains("nothing sent now"), badge.label)

        let card = app.element("pointer.card")
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        XCTAssertEqual(app.element("pointer.answer").label, "grossPay: N12")
        XCTAssertEqual(app.element("pointer.value").label, "1,271.88")
        let modelLine = app.element("pointer.modelLine").label
        let deviceLine = app.element("pointer.deviceLine").label
        XCTAssertTrue(modelLine.contains("N12") && !modelLine.contains("1,271.88"), "the model's line has placeholders only: \(modelLine)")
        XCTAssertTrue(deviceLine.contains("1,271.88") && !deviceLine.contains("N12"), "this iPhone's line has the values: \(deviceLine)")
        XCTAssertTrue(app.element("pointer.caption").label.contains("Firebase AI Logic in the cloud answered only N12"))

        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
        app.tapButton("leaving.details")
        let headline = app.element("record.headline")
        XCTAssertTrue(headline.waitForExistence(timeout: 5))
        XCTAssertTrue(headline.label.contains("0 sent") && headline.label.contains("1 kept"), headline.label)
        // The latest entry opens with its request shown.
        let body = app.element("record.recordedBody")
        if !body.waitForExistence(timeout: 3) { app.tapButton("record.recordedRequest") }
        XCTAssertTrue(body.waitForExistence(timeout: 5))
        XCTAssertTrue(body.label.contains("\"generationConfig\""), "the request as it was sent")
        XCTAssertTrue(app.element("record.recordedAnswer").label.contains("\"grossPay\": \"N12\""))
    }

    /// The judges' path in its order: step 1 reads the sample paystub for the invented household; the review
    /// confirms the four values that decide the result; the results open with "Sample household, not you"
    /// and what the paystub changed, each changed row with what it was; step 3 is what left.
    func testJudgesPathResultsSayWhatThePaystubChanged() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.openJudges()
        app.tapButton("judges.sample")
        XCTAssertTrue(app.element("preview.title").waitForExistence(timeout: 5))
        app.tapButton("preview.useRecordedCloud")
        XCTAssertTrue(app.element("review.title").waitForExistence(timeout: 10))

        let confirm = app.buttons["review.confirmAll"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        XCTAssertEqual(confirm.label, "Confirm the 4 values that decide the result")
        XCTAssertTrue(app.buttons["review.more"].label.hasPrefix("Other values, not used for the result"), app.buttons["review.more"].label)
        // Pressed before confirming: it says the values above decide the result.
        app.tapButton("review.useIncome")
        XCTAssertTrue(app.element("review.confirmFirst").waitForExistence(timeout: 5))
        app.tapButton("review.confirmAll")
        app.tapButton("review.useIncome")

        XCTAssertTrue(app.element("results.sample").waitForExistence(timeout: 5), "the sample household is said to be a sample")
        XCTAssertTrue(app.element("results.docEffect").exists)
        XCTAssertTrue(app.element("results.incomeFrom").label.contains("from a recorded cloud reading of the silhouette"))
        XCTAssertTrue(app.element("results.docEffect.filled").label.hasPrefix("It answered 1 question: Yearly income"),
                      app.element("results.docEffect.filled").label)
        XCTAssertTrue(app.element("results.docEffect.changed").label.hasPrefix("It changed"))
        XCTAssertTrue(app.element("results.badge").label.contains("Rules + paystub"))
        let caleitc = app.buttons["program.caleitc"]
        XCTAssertTrue(caleitc.waitForExistence(timeout: 5))
        XCTAssertEqual(caleitc.value as? String, "You may qualify")
        XCTAssertTrue(caleitc.label.contains("was Possible"), caleitc.label)
        // How the yearly income was worked out, behind a disclosure.
        app.tapButton("results.docEffect.how")
        XCTAssertTrue(app.element("results.incomeBasis").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("results.incomeBasis").label.contains("year-to-date"))
        // The next step is what left.
        XCTAssertTrue(app.buttons["results.openRecord"].exists || app.buttons["judges.next"].exists)
    }

    /// A result that is not from these answers says the person can still apply, in the list and on its page;
    /// the reasons of the sample household say they use its answers.
    func testUnlikelyResultSaysYouCanStillApply() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.runPreparedHousehold()
        XCTAssertTrue(app.element("results.sample").waitForExistence(timeout: 5))
        let unlikely = app.element("group.unlikely")
        app.scrollIntoView(unlikely)
        XCTAssertTrue(unlikely.exists)
        let row = unlikely.buttons.firstMatch
        XCTAssertTrue(row.exists)
        XCTAssertEqual(row.value as? String, "Not from these answers — you can still apply")
        row.tap()
        // "Why this result" is further down the program's page.
        let lead = app.element("why.lead")
        for _ in 0..<12 where !(lead.exists && lead.isHittable) { app.swipeUp() }
        XCTAssertTrue(lead.waitForExistence(timeout: 5))
        XCTAssertTrue(lead.label.contains("using the sample household's answers"), lead.label)
    }
}
