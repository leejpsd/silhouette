// The document flow with a built-in sample: nothing is sent, and the yearly income from the
// paystub turns a possible result into a clearer one.

import XCTest

final class DocumentFlowUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// Household of one, income band B: food help is "possible" until the paystub's yearly income
    /// (29,233 from year-to-date pay) shows it is over the limit.
    func testSampleDocumentChangesVerdict() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.tapButton("start.begin")
        app.waitForQuestion(1)
        app.setStepper(to: 1)
        app.next()
        app.waitForQuestion(2)
        app.skip()
        app.waitForQuestion(3)
        app.skip()
        app.waitForQuestion(4)
        app.choose("B")
        app.next()
        for n in 5...8 {
            app.waitForQuestion(n)
            app.skip()
        }
        let food = app.buttons["program.food-help"]
        XCTAssertTrue(food.waitForExistence(timeout: 5))
        XCTAssertEqual(food.value as? String, "Possible — a document can confirm")

        app.tapButton("results.addDocument")
        app.tapButton("doc.sample.paystub-en-01")
        XCTAssertTrue(app.element("preview.title").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("source.badge").exists, "sample answers are labelled")
        app.tapButton("preview.sampleButton")
        XCTAssertTrue(app.element("review.title").waitForExistence(timeout: 5))
        let gross = app.staticTexts.matching(NSPredicate(format: "label == %@", "1,271.88")).firstMatch
        XCTAssertTrue(gross.waitForExistence(timeout: 5), "gross pay from the sample is shown")
        app.tapButton("review.confirmAll")
        app.tapButton("review.useIncome")
        let change = app.element("review.change.food-help")
        XCTAssertTrue(change.waitForExistence(timeout: 5))
        XCTAssertTrue(change.label.contains("Probably not"), change.label)
        app.tapButton("review.results")
        XCTAssertTrue(food.waitForExistence(timeout: 5))
        XCTAssertEqual(food.value as? String, "Probably not")
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this device."))
    }

    func testHideAWordInThePreview() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.tapButton("start.sample")
        app.tapButton("doc.sample.paystub-en-01")
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
}
