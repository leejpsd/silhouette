// End-to-end Quick Check flows. Question order comes from the zz-test pack's questionOrder:
// householdSize, numChildren, hasEarnedIncome, income, housing, benefits, hasOlderMember,
// residentStatus.

import XCTest

final class QuickCheckUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testCompleteQuickCheckReachesVerdicts() {
        let app = XCUIApplication.silhouette()
        app.launch()
        XCTAssertTrue(app.element("demo.banner").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("leaving.bar").exists)
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this device."))
        app.tapButton("start.begin")

        app.waitForQuestion(1)
        app.setStepper(to: 3)
        app.next()
        app.waitForQuestion(2)
        app.setStepper(to: 2)
        app.next()
        app.waitForQuestion(3)
        app.choose("yes")
        app.next()
        app.waitForQuestion(4)
        // A decimal-comma amount is refused, not misread.
        app.typeExactIncome("28.000,50")
        XCTAssertFalse(app.element("income.understood").exists)
        app.next()
        XCTAssertTrue(app.element("question.error").waitForExistence(timeout: 5))
        app.waitForQuestion(4)
        let field = app.textFields["income.exact"]
        field.tap()
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 12))
        field.typeText("28000.50")
        // The amount as understood is shown before continuing.
        let understood = app.element("income.understood")
        XCTAssertTrue(understood.waitForExistence(timeout: 5))
        XCTAssertTrue(understood.label.contains("28,000.50"), understood.label)
        XCTAssertTrue(app.element("income.private").exists, "exact income shows the stays-on-device note")
        app.next()
        app.waitForQuestion(5)
        app.choose("renter")
        app.next()
        app.waitForQuestion(6)
        app.choose("snap")
        app.next()
        app.waitForQuestion(7)
        app.choose("no")
        app.next()
        app.waitForQuestion(8)
        XCTAssertTrue(app.element("question.sensitive").exists, "the sensitive question shows its note")
        app.choose("eligible")
        app.next()

        XCTAssertTrue(app.element("results.title").waitForExistence(timeout: 5))
        let workCredit = app.buttons["program.work-credit"]
        XCTAssertTrue(workCredit.waitForExistence(timeout: 5))
        XCTAssertEqual(workCredit.value as? String, "You may qualify")
        // min(3000, 10% of 28,000.50) = 2,800. Reading the amount 100× too large would make this "Probably not".
        XCTAssertTrue(workCredit.label.contains("About 2,800 a year"), workCredit.label)
        XCTAssertEqual(app.buttons["program.food-help"].value as? String, "You may qualify")
        XCTAssertFalse(app.element("group.depends").exists)
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this device."))
    }

    func testSkippedSensitiveQuestionGivesDependsAndCanBeAnsweredFromDetail() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.tapButton("start.begin")
        app.waitForQuestion(1)
        app.setStepper(to: 3)
        app.next()
        app.waitForQuestion(2)
        app.skip()
        app.waitForQuestion(3)
        app.skip()
        app.waitForQuestion(4)
        app.typeExactIncome("30524")
        app.next()
        for n in 5...7 {
            app.waitForQuestion(n)
            app.skip()
        }
        app.waitForQuestion(8)
        XCTAssertTrue(app.element("question.sensitive").exists)
        app.skip()

        let food = app.buttons["program.food-help"]
        XCTAssertTrue(food.waitForExistence(timeout: 5))
        XCTAssertEqual(food.value as? String, "Depends on an answer you skipped")
        XCTAssertTrue(food.label.contains("Residency"), food.label)
        food.tap()

        let verdict = app.element("detail.verdict")
        XCTAssertTrue(verdict.waitForExistence(timeout: 5))
        XCTAssertEqual(verdict.value as? String, "depends")
        app.tapButton("depends.residentStatus")
        app.waitForQuestion(8)
        app.choose("eligible")
        app.next()

        XCTAssertTrue(verdict.waitForExistence(timeout: 5))
        let likely = NSPredicate(format: "value == %@", "likely")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: likely, object: verdict)], timeout: 5), .completed)
        XCTAssertFalse(app.buttons["depends.residentStatus"].exists)
    }

    func testDeleteEverythingClearsStoredData() {
        // Answer two questions, then relaunch without reset: the answers were stored.
        var app = XCUIApplication.silhouette()
        app.launch()
        app.tapButton("start.begin")
        app.waitForQuestion(1)
        app.setStepper(to: 2)
        app.next()
        app.waitForQuestion(2)
        app.skip()
        app.terminate()

        app = XCUIApplication.silhouette(reset: false)
        app.launch()
        let begin = app.buttons["start.begin"]
        XCTAssertTrue(begin.waitForExistence(timeout: 5))
        XCTAssertEqual(begin.label, "Continue Quick Check", "saved answers were restored")
        XCTAssertTrue(app.buttons["start.restart"].exists)

        app.tapButton("delete.all")
        let confirm = app.alerts.buttons["Delete everything"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        XCTAssertTrue(app.element("start.notice").waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons["start.begin"].label, "Start Quick Check")
        XCTAssertFalse(app.buttons["start.restart"].exists)
        app.terminate()

        // Nothing comes back after a relaunch.
        app = XCUIApplication.silhouette(reset: false)
        app.launch()
        XCTAssertTrue(app.buttons["start.begin"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons["start.begin"].label, "Start Quick Check")
    }

    func testLanguageSwitch() {
        let app = XCUIApplication.silhouette()
        app.launch()
        let title = app.element("start.title")
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertEqual(title.label, "Find public benefits you may qualify for")

        app.tapButton("language.menu")
        app.tapButton("language.ko")
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertEqual(title.label, "받을 수 있을지도 모르는 공공 지원을 찾아보세요")
        XCTAssertTrue(app.buttons["start.begin"].label.unicodeScalars.contains { (0xAC00...0xD7A3).contains($0.value) })

        app.tapButton("language.menu")
        app.tapButton("language.es")
        XCTAssertEqual(title.label, "Encuentra ayudas públicas para las que podrías calificar")
        app.terminate()

        // The choice is remembered.
        let again = XCUIApplication.silhouette(reset: false)
        again.launch()
        let titleAgain = again.element("start.title")
        XCTAssertTrue(titleAgain.waitForExistence(timeout: 5))
        XCTAssertEqual(titleAgain.label, "Encuentra ayudas públicas para las que podrías calificar")
    }
}
