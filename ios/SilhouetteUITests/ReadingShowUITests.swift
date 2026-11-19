// The reading shown as it happens (contract v1.43): the silhouette going to the model on this iPhone or in
// the cloud, labelled with where and why, then the placeholders coming back and turning into values on this
// iPhone, then the review. The scripted model answers in about 0.3 s; the staging holds each stage long
// enough to be seen.

import XCTest

final class ReadingShowUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func expectShow(_ app: XCUIApplication, route: String, stage: String, file: StaticString = #filePath, line: UInt = #line) {
        let show = app.element("reading.show")
        XCTAssertTrue(show.waitForExistence(timeout: 5), "the reading is shown as it happens", file: file, line: line)
        XCTAssertEqual(app.element("reading.route").label, route, file: file, line: line)
        // The stage goes on to the placeholders coming back; each answered one turns into its value here.
        let pair = app.element("reading.pair.grossPay")
        XCTAssertTrue(pair.waitForExistence(timeout: 5), file: file, line: line)
        XCTAssertTrue(pair.label.contains("N12") && pair.label.contains("1,271.88"), pair.label, file: file, line: line)
        XCTAssertTrue(app.element("reading.stage").label.hasPrefix("The model answered with placeholders"), file: file, line: line)
        XCTAssertTrue(app.element("review.title").waitForExistence(timeout: 10), "then the review", file: file, line: line)
        _ = stage
    }

    func testReadingOnThisIPhoneIsShownStayingHere() {
        let app = XCUIApplication.silhouette(model: "device")
        app.launch()
        app.openSample()
        app.tapButton("preview.send")
        let show = app.element("reading.show")
        XCTAssertTrue(show.waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("reading.badge").label.contains("On this iPhone"), app.element("reading.badge").label)
        XCTAssertTrue(app.element("reading.deviceModel").exists, "the model is inside this iPhone's block")
        XCTAssertFalse(app.element("reading.cloud").exists, "no cloud on this way")
        expectShow(app, route: "Stays on this iPhone", stage: "The silhouette goes to the model on this iPhone…")
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
    }

    func testReadingInTheCloudIsShownLeaving() {
        let app = XCUIApplication.silhouette(model: "cloud")
        app.launch()
        app.openSample()
        app.tapButton("preview.send")
        XCTAssertTrue(app.element("reading.show").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("reading.cloud").exists, "the cloud is outside this iPhone's block")
        XCTAssertFalse(app.element("reading.deviceModel").exists)
        XCTAssertTrue(app.element("reading.reason").label.contains("document silhouette only"), app.element("reading.reason").label)
        expectShow(app, route: "Goes to the cloud", stage: "The silhouette goes to Firebase AI Logic in the cloud…")
    }

    func testRecordedCloudReadingIsShownAsARecording() {
        let app = XCUIApplication.silhouette(model: "none")
        app.launch()
        app.openSample()
        app.tapButton("preview.useRecordedCloud")
        XCTAssertTrue(app.element("reading.show").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("reading.reason").label.contains("nothing sent now"), app.element("reading.reason").label)
        expectShow(app, route: "Recorded in the cloud", stage: "")
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
    }
}
