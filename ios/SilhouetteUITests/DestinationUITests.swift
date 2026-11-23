// Where a request goes, beside the button that sends it (contract v1.43): on the silhouette screen and on
// the step before sending, with the exact request one press away; the record opens on the latest request
// with where it went, the model, the response and the time. A scripted cloud model; nothing is sent.

import XCTest

final class DestinationUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testDestinationBesideSendOnTheSilhouette() {
        let app = XCUIApplication.silhouette(model: "cloud")
        app.launch()
        app.openSample()
        let line = app.element("preview.where")
        XCTAssertTrue(line.waitForExistence(timeout: 5))
        XCTAssertTrue(line.label.contains("Goes to Firebase AI Logic in the cloud"), line.label)
        let send = app.buttons["preview.send"]
        XCTAssertTrue(send.exists)
        XCTAssertLessThan(send.frame.minY - line.frame.maxY, 60, "the line sits just above the button")
        app.tapButton("preview.showRequest")
        let request = app.element("preview.request")
        XCTAssertTrue(request.waitForExistence(timeout: 5))
        XCTAssertTrue(request.label.contains("N12") && !request.label.contains("1,271.88"), "the silhouette, never the values")
        app.tapButton("request.close")
        XCTAssertTrue(send.waitForExistence(timeout: 5))
    }

    func testDestinationBesideSendOnTheStepBeforeSendingAndTheRecordOpensOnTheLatest() {
        let app = XCUIApplication.silhouette(model: "cloud")
        app.launch()
        app.runPreparedHousehold()
        app.tapButton("program.federal-eitc")
        app.tapButton("about.explain")
        let line = app.element("send.destination")
        XCTAssertTrue(line.waitForExistence(timeout: 5))
        XCTAssertTrue(line.label.contains("Goes to Firebase AI Logic in the cloud: only what is shown above"), line.label)
        XCTAssertTrue(app.buttons["send.showRequest"].label.hasPrefix("Show the exact request"))
        app.tapButton("send.send")
        XCTAssertTrue(app.element("answer.badge").waitForExistence(timeout: 10))

        app.tapButton("leaving.details")
        let status = app.element("record.status")
        XCTAssertTrue(status.waitForExistence(timeout: 5), "the latest request is open")
        XCTAssertEqual(status.label, "Sent, response 200")
        XCTAssertTrue(app.element("record.endpoint").label.hasPrefix("Request to firebasevertexai.googleapis.com"))
        XCTAssertTrue(app.element("record.time").exists)
        XCTAssertTrue(app.element("record.whatLeft").exists, "opens on what left, in plain words")
        app.tapButton("record.technical")
        XCTAssertTrue(app.element("record.payload").waitForExistence(timeout: 5), "with exactly what was sent")
    }
}
