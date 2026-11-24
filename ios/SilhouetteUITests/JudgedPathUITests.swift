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
        XCTAssertTrue(headline.label.contains("Nothing has left this iPhone") && headline.label.contains("1 recording shown, nothing sent now"),
                      headline.label)
        // The latest entry opens on what went to the cloud when it was recorded, as chips; the exact request is folded.
        XCTAssertTrue(app.element("record.whatLeft").waitForExistence(timeout: 5))
        XCTAssertTrue(app.element("record.recordedOn").firstMatch.label.hasPrefix("Recorded "))
        let body = app.element("record.recordedBody")
        XCTAssertFalse(body.exists, "the JSON is closed until asked for")
        app.tapButton("record.technical")
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
        // One date format: the paystub's dates as the review writes them (10/20/2026), never 2026-10-20.
        XCTAssertNotNil(app.element("results.incomeBasis").label.range(of: #"\d{2}/\d{2}/\d{4}"#, options: .regularExpression),
                        app.element("results.incomeBasis").label)
        XCTAssertNil(app.element("results.incomeBasis").label.range(of: #"\d{4}-\d{2}-\d{2}"#, options: .regularExpression))
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

final class JudgesRunAllUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// A long program name takes at most three lines of a smaller headline; "Where each task runs" says who
    /// picks device or cloud: the SDK's hybrid model, with the app's own steps around it.
    func testProgramTitleIsTightAndTasksSayWhoPicksDeviceOrCloud() {
        let app = XCUIApplication.silhouette(model: "none")
        app.launch()
        app.runPreparedHousehold()
        app.tapButton("program.caleitc")
        let title = app.element("program.title")
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertLessThan(title.frame.height, 140, "three lines at most")
        app.tapButton("program.back")
        app.tapButton("results.info")
        app.tapButton("demo.tasks")
        let routes = app.element("tasks.appRoutes")
        app.scrollIntoView(routes)
        XCTAssertTrue(routes.waitForExistence(timeout: 5))
        XCTAssertTrue(routes.label.contains("Firebase AI Logic's hybrid model tries Apple's on-device model first"), routes.label)
        XCTAssertFalse(routes.label.contains("iOS 27"), routes.label)
    }

    /// One press on the judges' page, without a model on this iPhone: both halves of the hybrid, one after the
    /// other, from recordings: the on-device model's answer recorded on an iPhone, then the cloud's. The review
    /// shows both answers side by side, value by value, and uses the device's; then the results open with what
    /// the paystub changed. Nothing is sent.
    func testRunAllWithoutAModelPlaysBothHalvesThenTheReviewSideBySide() {
        let app = XCUIApplication.silhouette(model: "none")
        app.launch()
        app.openJudges()
        let run = app.buttons["judges.runAll"]
        XCTAssertTrue(run.waitForExistence(timeout: 5))
        XCTAssertEqual(run.label, "Run all three steps")
        XCTAssertTrue(app.element("judges.runAll.body").label.contains("Only the silhouette is sent"), "the button says what leaves")
        run.tap()
        let route = app.element("reading.route")
        XCTAssertTrue(route.waitForExistence(timeout: 8), "the reading is shown")
        XCTAssertEqual(route.label, "On a device")
        XCTAssertTrue(app.element("reading.recordedOn").label.hasPrefix("Recorded on iPhone"), app.element("reading.recordedOn").label)
        XCTAssertTrue(app.element("reading.badge").label.contains("Recorded on a device"))
        let cloud = NSPredicate(format: "label == %@", "In the cloud")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: cloud, object: route)], timeout: 15), .completed,
                       "then the cloud half")
        XCTAssertTrue(app.element("reading.cloud").exists)
        let both = app.element("review.both")
        XCTAssertTrue(both.waitForExistence(timeout: 15), "the review shows both answers")
        XCTAssertTrue(app.element("review.both.deviceColumn").label.contains("On a device"))
        XCTAssertTrue(app.element("review.both.deviceColumn").label.contains("recorded on iPhone"))
        XCTAssertTrue(app.element("review.both.cloudColumn").label.contains("gemini"))
        let gross = app.element("review.both.pair.grossPay").label
        XCTAssertTrue(gross.contains("N12 1,271.88") && gross.components(separatedBy: "1,271.88").count == 3, gross)
        XCTAssertTrue(app.element("review.both.same").label.hasPrefix("Same value from both:"))
        XCTAssertTrue(app.element("review.both.onlyCloud").label.hasPrefix("Only the cloud's answer has:"), "what the iPhone's checks left out is not a difference")
        XCTAssertFalse(app.element("review.both.differs").exists)
        XCTAssertTrue(app.element("review.both.uses").label.contains("the iPhone's answer"))
        // Without a connection the live cloud half is not tried: the recording, and why (contract v1.47).
        XCTAssertTrue(app.element("review.both.cloudColumn").label.contains("recorded"), app.element("review.both.cloudColumn").label)
        XCTAssertEqual(app.element("review.both.cloudFallback").label,
                       "The cloud did not answer now (no connection). Shown instead: the recorded cloud reading of the same silhouette.")
        XCTAssertTrue(app.element("review.both.note").label.hasPrefix("Both answers are recordings"), app.element("review.both.note").label)
        XCTAssertTrue(app.element("results.docEffect").waitForExistence(timeout: 20), "the results open with what the paystub changed")
        XCTAssertTrue(app.element("results.sample").exists)
        XCTAssertTrue(app.element("results.incomeFrom").label.contains("from a recorded on-device reading"))
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
        // The record lists both recordings, nothing sent now.
        app.tapButton("leaving.details")
        let headline = app.element("record.headline")
        XCTAssertTrue(headline.waitForExistence(timeout: 5))
        XCTAssertTrue(headline.label.contains("2 recordings shown, nothing sent now"), headline.label)
        XCTAssertTrue(app.staticTexts["Recorded on-device reading of the sample paystub"].exists)
        XCTAssertTrue(app.staticTexts["Recorded cloud reading of the sample paystub"].exists)
    }

    /// With the model on this iPhone, the one press reads it here, now; the cloud half is the recording, and the
    /// review compares the two. Nothing leaves.
    func testRunAllWithTheModelReadsOnThisIPhoneThenShowsTheCloudRecording() {
        let app = XCUIApplication.silhouette(model: "device")
        app.launch()
        app.openJudges()
        app.tapButton("judges.runAll")
        let route = app.element("reading.route")
        XCTAssertTrue(route.waitForExistence(timeout: 8))
        XCTAssertEqual(route.label, "Stays on this iPhone")
        let cloud = NSPredicate(format: "label == %@", "In the cloud")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: cloud, object: route)], timeout: 30), .completed)
        XCTAssertTrue(app.element("review.both").waitForExistence(timeout: 15))
        XCTAssertTrue(app.element("review.both.deviceColumn").label.contains("On this iPhone, now"))
        XCTAssertTrue(app.element("review.both.note").label.hasPrefix("Read now on this iPhone"))
        XCTAssertTrue(app.element("review.both.cloudFallback").label.contains("(no connection)"))
        XCTAssertTrue(app.element("results.docEffect").waitForExistence(timeout: 30))
        XCTAssertTrue(app.element("results.badge").label.contains("Rules + paystub"))
        XCTAssertTrue(app.element("results.incomeFrom").label.contains("by the model on this iPhone"), app.element("results.incomeFrom").label)
        XCTAssertTrue(app.element("leaving.status").label.contains("Nothing has left this iPhone."))
    }

    /// The cloud half read now (contract v1.47): without a model here, the recorded on-device answer, then the
    /// same silhouette sent once to the (scripted) cloud, shown going there with its reason; the review names the
    /// live cloud answer, and the record lists the request with the silhouette that left.
    func testRunAllReadsTheCloudHalfNow() {
        let app = XCUIApplication.silhouette(model: "cloud")
        app.launch()
        app.openJudges()
        app.tapButton("judges.runAll")
        let route = app.element("reading.route")
        XCTAssertTrue(route.waitForExistence(timeout: 8))
        let cloud = NSPredicate(format: "label == %@", "In the cloud")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: cloud, object: route)], timeout: 15), .completed)
        XCTAssertEqual(app.element("reading.reason").label, "read in the cloud too, to compare")
        XCTAssertTrue(app.element("reading.stage").label.hasPrefix("The silhouette goes to Firebase AI Logic in the cloud")
                      || app.element("reading.stage").label.hasPrefix("The model answered with placeholders"), app.element("reading.stage").label)
        XCTAssertFalse(app.element("reading.recordedOn").exists, "not a recording")
        XCTAssertTrue(app.element("review.both").waitForExistence(timeout: 15))
        XCTAssertEqual(app.element("review.both.cloudColumn").label, "In the cloud, gemini-3.5-flash-lite, read now")
        XCTAssertTrue(app.element("review.both.deviceColumn").label.contains("recorded on iPhone"))
        XCTAssertFalse(app.element("review.both.cloudFallback").exists)
        XCTAssertEqual(app.element("review.both.note").label, "The iPhone's answer is a recording; the cloud answer was read now, from the silhouette only.")
        XCTAssertTrue(app.element("review.both.uses").label.contains("the iPhone's answer"))
        XCTAssertTrue(app.element("results.docEffect").waitForExistence(timeout: 20))
        XCTAssertTrue(app.element("results.incomeFrom").label.contains("from a recorded on-device reading"), "the values used are the device's")
        let leaving = app.element("leaving.status").label
        XCTAssertFalse(leaving.contains("Nothing has left"), leaving)
        app.tapButton("leaving.details")
        let headline = app.element("record.headline")
        XCTAssertTrue(headline.waitForExistence(timeout: 5))
        XCTAssertTrue(headline.label.contains("left this iPhone") && headline.label.contains("None of them carried your names, numbers or dates."), headline.label)
        let lines = app.element("record.whatLeft")
        XCTAssertTrue(lines.waitForExistence(timeout: 5), "the request opens on what left")
        XCTAssertTrue(lines.label.contains("N12") && !lines.label.contains("1,271.88"), "placeholders, never values")
        XCTAssertTrue(app.element("record.whatStayed").label.hasPrefix("Kept on this iPhone:"))
    }

    /// With the model here and the cloud reachable: both read now.
    func testRunAllWithTheModelAndTheCloudReadsBothNow() {
        let app = XCUIApplication.silhouette(model: "device-cloud")
        app.launch()
        app.openJudges()
        app.tapButton("judges.runAll")
        XCTAssertTrue(app.element("review.both").waitForExistence(timeout: 40))
        XCTAssertTrue(app.element("review.both.deviceColumn").label.contains("On this iPhone, now"))
        XCTAssertTrue(app.element("review.both.cloudColumn").label.hasSuffix("read now"), app.element("review.both.cloudColumn").label)
        XCTAssertTrue(app.element("review.both.note").label.hasPrefix("Both read now: on this iPhone"), app.element("review.both.note").label)
        XCTAssertTrue(app.element("results.docEffect").waitForExistence(timeout: 30))
        XCTAssertTrue(app.element("results.incomeFrom").label.contains("by the model on this iPhone"), app.element("results.incomeFrom").label)
    }

    /// App Check refuses: no model request is made; the recording is shown with the reason, and the path goes on.
    func testRunAllFallsBackToTheRecordingWhenAppCheckRefuses() {
        let app = XCUIApplication.silhouette(model: "cloud-appcheck")
        app.launch()
        app.openJudges()
        app.tapButton("judges.runAll")
        let fallback = app.element("review.both.cloudFallback")
        XCTAssertTrue(fallback.waitForExistence(timeout: 40))
        XCTAssertEqual(fallback.label,
                       "The cloud did not answer now (the security check refused the request). Shown instead: the recorded cloud reading of the same silhouette.")
        XCTAssertTrue(app.element("review.both.cloudColumn").label.contains("recorded"))
        XCTAssertTrue(app.element("review.both.note").label.hasPrefix("Both answers are recordings"))
        XCTAssertTrue(app.element("results.docEffect").waitForExistence(timeout: 20), "the path never stops on an error")
    }

    /// What the paystub changed, as amounts: the results without and with it, from the rules, and the yearly total.
    func testResultsShowWithoutAndWithThePaystubAndTheTotal() {
        let app = XCUIApplication.silhouette(model: "none")
        app.launch()
        app.openJudges()
        app.tapButton("judges.runAll")
        let compare = app.element("results.docEffect.compare")
        XCTAssertTrue(compare.waitForExistence(timeout: 40))
        app.scrollIntoView(compare)
        let may = app.element("results.docEffect.row.may").label
        XCTAssertTrue(may.hasPrefix("May qualify: Without the paystub 3, With the paystub 5"), may)
        let amount = app.element("results.docEffect.row.amount").label
        XCTAssertTrue(amount.hasPrefix("With an amount: Without the paystub 0, With the paystub 3"), amount)
        let total = app.element("results.docEffect.total")
        XCTAssertTrue(total.exists)
        XCTAssertTrue(total.label.hasPrefix("About $") && total.label.contains("a year, plus up to $2,016"), total.label)
        // The title counts the same programs.
        XCTAssertTrue(app.element("results.title").firstMatch.label.contains("5"), app.element("results.title").firstMatch.label)
    }
}

/// "Leaving your iPhone" in plain words before any JSON (contract v1.44).
final class RecordPlainWordsUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// A request that left: the headline counts it and says each carried only a silhouette; the request opens on
    /// the silhouette lines that left, as chips, and what stayed, counted; the exact request is folded.
    func testSentRequestOpensOnWhatLeftThenTheJSONForDevelopers() {
        let app = XCUIApplication.silhouette(model: "cloud")
        app.launch()
        app.openSample()
        app.tapButton("preview.send")
        XCTAssertTrue(app.element("review.title").waitForExistence(timeout: 15))
        app.tapButton("leaving.details")
        let headline = app.element("record.headline")
        XCTAssertTrue(headline.waitForExistence(timeout: 5))
        XCTAssertTrue(headline.label.contains("left this iPhone") && headline.label.contains("None of them carried your names, numbers or dates."), headline.label)
        let lines = app.element("record.whatLeft")
        XCTAssertTrue(lines.waitForExistence(timeout: 5), "the latest request is open on what left")
        XCTAssertTrue(lines.label.contains("N12") && !lines.label.contains("1,271.88"), "placeholders, never values")
        XCTAssertTrue(app.element("record.whatStayed").label.hasPrefix("Kept on this iPhone:"), app.element("record.whatStayed").label)
        XCTAssertFalse(app.element("record.payload").exists, "the JSON is closed until asked for")
        app.tapButton("record.technical")
        XCTAssertTrue(app.element("record.payload").waitForExistence(timeout: 5))
    }
}
