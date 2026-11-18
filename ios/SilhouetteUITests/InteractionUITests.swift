// How the app behaves under the hand: what opens comes into view and takes focus, a hint is shown
// where it is needed, inputs take only what they can use, and a quick double tap does one thing.
// With SCREENSHOT_DIR set (xcodebuild: TEST_RUNNER_SCREENSHOT_DIR=/path) each step also saves a
// screenshot, for checking by eye what an assertion cannot see.

import XCTest

final class InteractionUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func shot(_ name: String, settle: Double = 0.6) {
        guard let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] else { return }
        Thread.sleep(forTimeInterval: settle)
        FileManager.default.createFile(atPath: "\(dir)/interaction-\(name).png", contents: XCUIScreen.main.screenshot().pngRepresentation)
    }

    /// Fully on screen, and not under the keyboard, the tab bar, the privacy pill or a pinned action.
    private func assertClear(_ element: XCUIElement, in app: XCUIApplication, _ what: String, pinned: [String] = [],
                             file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: 5), "missing \(what)", file: file, line: line)
        Thread.sleep(forTimeInterval: 0.8)
        var frame = element.frame
        let window = app.windows.firstMatch.frame
        // Taller than the screen (the largest text sizes): its start must be in view.
        if frame.height > window.height * 0.6 { frame = CGRect(x: frame.minX, y: frame.minY, width: frame.width, height: 60) }
        XCTAssertTrue(window.contains(frame), "\(what) is not fully on screen: \(frame)", file: file, line: line)
        for cover in [app.keyboards.firstMatch, app.tabBars.firstMatch, app.buttons["leaving.details"].firstMatch] + pinned.map({ app.buttons[$0].firstMatch })
            where cover.exists && cover.isHittable {
            XCTAssertFalse(cover.frame.intersects(frame), "\(what) is under \(cover.identifier) (\(frame) / \(cover.frame))", file: file, line: line)
        }
    }

    func testNextWithoutAnAnswerShowsTheHintInView() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.tapButton("start.begin")
        app.waitForQuestion(1)
        shot("q1-empty")
        app.tapButton("q.next")
        let hint = app.element("question.error")
        assertClear(hint, in: app, "the hint")
        app.waitForQuestion(1)
        shot("q1-hint")
        // Pressing again keeps the hint and stays on the question.
        app.tapButton("q.next")
        app.waitForQuestion(1)
        app.setStepper(to: 2)
        XCTAssertFalse(hint.exists, "the hint stays after an answer")
        shot("q1-answered")
        app.next()
        app.waitForQuestion(2)
        app.setStepper(to: 1)
        app.next()
        app.waitForQuestion(3)
        app.tapButton("q.next")
        assertClear(app.element("question.error"), in: app, "the hint on a choice question")
        shot("q3-hint")
        app.choose("yes")
        shot("q3-chosen")
        app.next()
        shot("q3-after-next", settle: 1.5)
        app.waitForQuestion(4)
    }

    func testExactAmountOpensFocusedAndTakesOnlyMoney() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.tapButton("start.begin")
        for n in 1...3 { app.waitForQuestion(n); app.skip() }
        app.waitForQuestion(4)
        app.choose("exact")
        let field = app.textFields["income.exact"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "the field does not take focus")
        assertClear(field, in: app, "the exact-amount field")
        field.typeText("ab$28,0x00.5.0")
        XCTAssertEqual(field.value as? String, "28,000.50")
        assertClear(app.element("income.understood"), in: app, "the amount as understood")
        shot("q4-exact")
    }

    func testPasteBoxOpensFocusedAndInView() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.tapButton("start.sample")
        app.tapButton("doc.paste")
        let box = app.textViews["doc.paste.text"]
        XCTAssertTrue(box.waitForExistence(timeout: 5))
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "the paste box does not take focus")
        assertClear(box, in: app, "the paste box")
        shot("paste-open")
    }

    func testDisclosuresBringWhatTheyOpenIntoView() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.tapButton("judges.open")
        app.tapButton("judges.more")
        let more = app.element("judges.moreText")
        XCTAssertTrue(more.waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 0.8)
        // Its start is in view, above the pinned "Run the check" (taller than the screen: its start).
        let run = app.buttons["judges.deviceCheck"]
        // Pinned (below the text) it is the limit; in the content (above it, small iPhones and large
        // text) the screen is.
        let pinnedBelow = run.exists && run.isHittable && run.frame.minY > more.frame.minY
        let limit = pinnedBelow ? run.frame.minY : app.windows.firstMatch.frame.height * 0.7
        XCTAssertLessThan(more.frame.minY + 40, limit, "the judges' longer text did not come into view")
        shot("judges-more")
        app.navigationBars.buttons.firstMatch.tap()
        app.tapButton("leaving.details")
        app.tapButton("more.about")
        assertClear(app.element("more.about.content"), in: app, "More about this")
        shot("record-more")
    }

    func testDoubleTapOpensOneQuestionAndBackReturns() {
        let app = XCUIApplication.silhouette()
        app.launch()
        let begin = app.buttons["start.begin"]
        XCTAssertTrue(begin.waitForExistence(timeout: 5))
        begin.doubleTap()
        app.waitForQuestion(1)
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(app.buttons["start.begin"].waitForExistence(timeout: 5), "two questions were pushed")
        // Back by swipe from the edge.
        app.tapButton("start.begin")
        app.waitForQuestion(1)
        let window = app.windows.firstMatch
        window.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
        XCTAssertTrue(app.buttons["start.begin"].waitForExistence(timeout: 5), "swipe back does not return")
    }

    /// Keeping the document on the device when the reading fails: the result is brought into view,
    /// clear of the actions (it used to arrive under the pinned buttons).
    func testResultOfKeepingComesIntoView() {
        let app = XCUIApplication.silhouette(model: "device-unreliable")
        app.launch()
        app.openSample()
        app.tapButton("preview.keep")
        let notice = app.element("preview.unreliable")
        assertClear(notice, in: app, "the reading result", pinned: ["preview.sendSilhouette", "preview.typeInstead"])
        shot("keep-result")
    }

    /// "Delete everything?": its title and its warning are on screen above the two buttons, at any
    /// text size (at accessibility sizes the sheet opens at full height).
    func testDeleteSheetShowsItsWarning() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.tapButton("leaving.details")
        app.tapButton("delete.all")
        let body = app.element("delete.body")
        XCTAssertTrue(body.waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 1)
        let confirm = app.buttons["delete.confirm"]
        // The warning starts on screen, above the buttons (at the largest sizes the rest scrolls).
        XCTAssertGreaterThan(body.frame.minY, 0, "the warning is above the screen")
        XCTAssertLessThan(body.frame.minY + 30, confirm.frame.minY, "the warning is under the buttons: \(body.frame) / \(confirm.frame)")
        shot("delete-sheet")
    }
}
