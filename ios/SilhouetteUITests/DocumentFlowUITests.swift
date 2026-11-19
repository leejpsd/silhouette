// The document flow with a built-in sample: nothing is sent, and the yearly income from the
// paystub turns a possible result into a clearer one. With a scripted on-device model: the reading in
// parts kept on the device, a reading the device cannot do reliably, and fields left out as not read.

import XCTest

final class DocumentFlowUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// The prepared household (income range $25,000–$32,999): the California credit is "possible" until
    /// the paystub's yearly income (about $29,233 from year-to-date pay) shows it is under the limit.
    func testSampleDocumentChangesVerdict() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.runPreparedHousehold()
        let caleitc = app.buttons["program.caleitc"]
        XCTAssertTrue(caleitc.waitForExistence(timeout: 5))
        XCTAssertEqual(caleitc.value as? String, "Possible — a document can confirm")

        // On the judges' path the next step is one press: the sample paystub.
        app.tapButton("results.openSample")
        XCTAssertTrue(app.element("preview.title").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("source.badge").exists, "sample answers are labelled")
        app.tapButton("preview.sampleButton")
        XCTAssertTrue(app.element("review.title").waitForExistence(timeout: 5))
        let gross = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "1,271.88")).firstMatch
        XCTAssertTrue(gross.waitForExistence(timeout: 5), "gross pay from the sample is shown")
        XCTAssertTrue(app.element("review.basisDate").exists, "the date the yearly income was worked out from")
        XCTAssertFalse(app.element("pointer.card").exists, "the answer key is not a model: no pointer card")
        // One press confirms the values that decide the result; the others stay folded.
        app.tapButton("review.confirmAll")
        app.tapButton("review.useIncome")
        // The results open with what the paystub changed; the changed row says what it was.
        XCTAssertTrue(app.element("results.docEffect").waitForExistence(timeout: 5))
        XCTAssertTrue(caleitc.waitForExistence(timeout: 5))
        XCTAssertEqual(caleitc.value as? String, "You may qualify")
        XCTAssertTrue(caleitc.label.contains("was Possible"), caleitc.label)
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
    }

    func testHideAWordInThePreview() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.openSample()
        let counts = app.element("preview.counts")
        XCTAssertTrue(counts.waitForExistence(timeout: 5))
        let before = counts.label
        XCTAssertTrue(app.buttons["preview.sampleButton"].exists)

        let word = app.links["Gross"].firstMatch
        XCTAssertTrue(word.waitForExistence(timeout: 5))
        word.tap()
        XCTAssertTrue(app.buttons["preview.unhide.gross"].waitForExistence(timeout: 5))
        XCTAssertNotEqual(counts.label, before)
        XCTAssertFalse(app.links["Gross"].exists, "hidden everywhere")
        // A changed silhouette is no longer a built-in sample: nothing can read it automatically.
        XCTAssertTrue(app.element("preview.noExtractor").exists)

        app.tapButton("preview.undo")
        XCTAssertTrue(app.buttons["preview.sampleButton"].waitForExistence(timeout: 5))
        XCTAssertEqual(counts.label, before)
    }

    /// "Keep everything on this device" with a device model: the device reads the silhouette in parts,
    /// nothing is sent, and the record lists one answer kept on the device.
    func testKeepOnDeviceReadsWithTheDeviceModel() {
        let app = XCUIApplication.silhouette(model: "device")
        app.launch()
        app.openSample()
        XCTAssertFalse(app.buttons["preview.sampleButton"].exists, "a device model reads it, not the answer key")
        app.tapButton("preview.keep")
        XCTAssertTrue(app.element("review.title").waitForExistence(timeout: 15))
        let gross = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "1,271.88")).firstMatch
        XCTAssertTrue(gross.waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
        app.tapButton("leaving.details")
        let headline = app.element("record.headline")
        XCTAssertTrue(headline.waitForExistence(timeout: 5))
        XCTAssertTrue(headline.label.contains("0 sent") && headline.label.contains("1 kept"), headline.label)
    }

    /// The device answers a reading that does not pass its checks: nothing is filled in and nothing is
    /// sent; the person can then send the silhouette to be read in the cloud.
    func testUnreliableDeviceReadingSendsNothingUntilAsked() {
        let app = XCUIApplication.silhouette(model: "device-unreliable")
        app.launch()
        app.openSample()
        app.tapButton("preview.keep")
        let unreliable = app.element("preview.unreliable")
        XCTAssertTrue(unreliable.waitForExistence(timeout: 15))
        XCTAssertTrue(unreliable.label.contains("nothing was sent"), unreliable.label)
        XCTAssertFalse(app.element("review.title").exists)
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
        XCTAssertTrue(app.buttons["preview.typeInstead"].exists)

        app.tapButton("preview.sendSilhouette")
        XCTAssertTrue(app.element("review.title").waitForExistence(timeout: 15))
        let status = app.element("leaving.status")
        XCTAssertTrue(status.label.hasPrefix("1 sent with your document"), status.label)
    }

    /// Hours worked answered with the gross pay's placeholder, and no deductions: both are left out and
    /// shown as not read on this device.
    func testFieldsNotReadOnTheDevice() {
        let app = XCUIApplication.silhouette(model: "device-notread")
        app.launch()
        app.openSample()
        app.tapButton("preview.keep")
        XCTAssertTrue(app.element("review.title").waitForExistence(timeout: 15))
        app.tapButton("review.more")
        let hours = app.element("field.hoursWorked.value")
        app.scrollIntoView(hours)
        XCTAssertTrue(hours.waitForExistence(timeout: 5))
        XCTAssertTrue(hours.label.hasPrefix("Not read on this iPhone"), hours.label)
        let deductions = app.element("review.deductionsNotRead")
        app.scrollIntoView(deductions)
        XCTAssertTrue(deductions.exists)
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
    }
}
