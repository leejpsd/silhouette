// End-to-end Quick Check flows with the California draft pack (the pack people see). Question order
// comes from its questionOrder: householdSize, numQualifyingChildren, hasChildUnder6, income,
// hasEarnedIncome, ageGroup, housing, benefits, energyProvider, hasElderlyOrDisabledMember,
// filingStatus, taxIdType, investmentIncome, calfreshEligibleMember.

import XCTest

final class QuickCheckUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    func testCompleteQuickCheckReachesVerdicts() {
        let app = XCUIApplication.silhouette()
        app.launch()
        XCTAssertTrue(app.element("demo.banner").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this device."))
        app.tapButton("start.begin")

        app.waitForQuestion(1)
        app.setStepper(to: 3)
        app.next()
        app.waitForQuestion(2)
        app.setStepper(to: 1)
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
        let understood = app.element("income.understood")
        XCTAssertTrue(understood.waitForExistence(timeout: 5))
        XCTAssertTrue(understood.label.contains("$28,000.50"), understood.label)
        XCTAssertTrue(app.element("income.private").exists, "exact income shows the stays-on-device note")
        app.next()
        app.waitForQuestion(5)
        app.choose("yes")
        app.next()
        app.waitForQuestion(6)
        app.choose("25-64")
        app.next()
        app.waitForQuestion(7)
        app.choose("renter")
        app.next()
        app.waitForQuestion(8)
        app.next()  // no benefit ticked: "none of these"
        app.waitForQuestion(9)
        app.choose("pge")
        app.next()
        app.waitForQuestion(10)
        XCTAssertTrue(app.element("question.sensitive").exists, "a sensitive question shows its note")
        app.choose("no")
        app.next()
        app.waitForQuestion(11)
        app.choose("head-of-household")
        app.next()
        app.waitForQuestion(12)
        app.choose("ssn-valid-for-work")
        app.next()
        app.waitForQuestion(13)
        // Investment income is asked as money.
        let amount = app.textFields["amount.field"]
        XCTAssertTrue(amount.waitForExistence(timeout: 5))
        amount.tap()
        amount.typeText("0")
        app.next()
        app.waitForQuestion(14)
        app.choose("yes")
        app.next()

        XCTAssertTrue(app.element("results.title").waitForExistence(timeout: 5))
        let eitc = app.buttons["program.federal-eitc"]
        XCTAssertTrue(eitc.waitForExistence(timeout: 5))
        XCTAssertEqual(eitc.value as? String, "You may qualify")
        XCTAssertTrue(eitc.label.contains("About $"), eitc.label)
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this device."))
    }

    func testSkippedSensitiveQuestionGivesDependsAndCanBeAnsweredFromDetail() {
        let app = XCUIApplication.silhouette()
        app.launch()
        app.runPreparedHousehold()  // leaves "calfreshEligibleMember" unanswered
        let calfresh = app.buttons["program.calfresh"]
        XCTAssertTrue(calfresh.waitForExistence(timeout: 5))
        XCTAssertEqual(calfresh.value as? String, "Depends on an answer you skipped")
        XCTAssertTrue(calfresh.label.contains("Citizenship"), calfresh.label)
        app.tapButton("program.calfresh")

        let verdict = app.element("detail.verdict")
        XCTAssertTrue(verdict.waitForExistence(timeout: 5))
        XCTAssertEqual(verdict.value as? String, "depends")
        app.tapButton("depends.calfreshEligibleMember")
        app.waitForQuestion(14)
        app.choose("yes")
        app.next()

        XCTAssertTrue(verdict.waitForExistence(timeout: 5))
        let answered = NSPredicate(format: "value != %@", "depends")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: answered, object: verdict)], timeout: 5), .completed)
        XCTAssertFalse(app.buttons["depends.calfreshEligibleMember"].exists)
    }

    func testDraftNoticeAndOfficialSources() {
        let app = XCUIApplication.silhouette()
        app.launch()
        let banner = app.element("demo.banner")
        XCTAssertTrue(banner.waitForExistence(timeout: 5))
        XCTAssertTrue(banner.staticTexts["Draft rules, read November 12, 2026."].exists, "the draft notice with the date its sources were read")
        app.runPreparedHousehold()
        app.tapButton("program.federal-eitc")
        let readOn = app.element("official.readOn").firstMatch
        app.scrollIntoView(readOn)
        XCTAssertTrue(readOn.waitForExistence(timeout: 5))
        XCTAssertTrue(readOn.label.contains("Read from this source on November 12, 2026"), readOn.label)
        XCTAssertTrue(app.element("program.period").label.contains("tax year 2026"), "the period in the reader's language")
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

        // "Delete everything" is in the record of what left this device, behind a confirmation.
        app.tapButton("leaving.details")
        app.tapButton("delete.all")
        let confirm = app.buttons["delete.confirm"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        XCTAssertEqual(confirm.label, "Delete everything")
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
        app.tapButton("language.es")
        XCTAssertTrue(title.waitForExistence(timeout: 5))
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
