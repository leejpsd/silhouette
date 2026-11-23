// The on-device check with a scripted on-device model: reached from the draft-rules sheet; nothing on
// the page sits under the pinned block (the repeat switch can be turned on without starting a run);
// a finished run is saved in the app's Documents folder at once.

import XCTest

final class DeviceCheckUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    private func openCheck(_ app: XCUIApplication) {
        app.tapButton("demo.more")
        app.tapButton("demo.deviceCheck")
        XCTAssertTrue(app.element("deviceCheck.title").waitForExistence(timeout: 5))
    }

    func testRepeatSwitchIsNotCoveredAndARunIsSavedWhenItFinishes() {
        let app = XCUIApplication.silhouette(model: "device")
        app.launch()
        openCheck(app)
        let toggle = app.switches["deviceCheck.repeat"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        app.scrollIntoView(toggle)
        toggle.switches.firstMatch.exists ? toggle.switches.firstMatch.tap() : toggle.tap()
        XCTAssertEqual(toggle.value as? String, "1", "the switch turned on")
        XCTAssertFalse(app.element("deviceCheck.status").exists, "tapping the switch did not start a run")
        toggle.switches.firstMatch.exists ? toggle.switches.firstMatch.tap() : toggle.tap()
        XCTAssertEqual(toggle.value as? String, "0")

        app.tapButton("deviceCheck.run")
        let saved = app.element("deviceCheck.saved")
        XCTAssertTrue(saved.waitForExistence(timeout: 120), "the run file is saved when the run finishes")
        XCTAssertTrue(saved.label.contains("silhouette") && saved.label.contains(".json"), saved.label)
        XCTAssertTrue(app.buttons["deviceCheck.share"].exists)
        // 13 cases counted: the photo case is left out of the figures on iPhone.
        let headlines = app.element("deviceCheck.headlines")
        XCTAssertTrue(headlines.waitForExistence(timeout: 5))
        let counted = headlines.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "/ 13")).firstMatch
        XCTAssertTrue(counted.exists, "the cases answered on this device out of 13")
        // The photo case cannot run on iPhone: it is not counted, and says so.
        let notCounted = app.element("deviceCheck.notCounted")
        app.scrollIntoView(notCounted)
        XCTAssertTrue(notCounted.exists)
    }

    /// Without a model on this iPhone, "Run the check" on the judges' page opens the latest recording: no
    /// "no model here" card and no live-run button over another phone's figures, the headline names the
    /// device that made it, and the baseline stays listed as the baseline.
    func testWithoutAModelTheLatestRecordingOpens() {
        let app = XCUIApplication.silhouette(model: "none")
        app.launch()
        app.openJudges()
        app.tapButton("judges.deviceCheck")
        let meta = app.element("deviceCheck.recordingMeta")
        XCTAssertTrue(meta.waitForExistence(timeout: 5), "the latest recording is shown")
        XCTAssertTrue(meta.label.replacingOccurrences(of: "\u{00A0}", with: " ").contains("November 19, 2026"), meta.label)
        XCTAssertFalse(app.element("deviceCheck.noModel").exists, "no 'no model' card over a recording")
        XCTAssertFalse(app.buttons["deviceCheck.live"].exists, "no live run where none can run")
        XCTAssertFalse(app.buttons["deviceCheck.run"].exists)
        let headlines = app.element("deviceCheck.headlines")
        XCTAssertTrue(headlines.waitForExistence(timeout: 5))
        let onDevice = headlines.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "on the iPhone that made this recording")).firstMatch
        XCTAssertTrue(onDevice.exists, "the headline names the recording's device")
        XCTAssertTrue(onDevice.label.hasPrefix("23 / 23"), onDevice.label)
        XCTAssertFalse(app.element("deviceCheck.baselineNote").exists)

        let rows = app.buttons.matching(identifier: "deviceCheck.recording")
        app.scrollIntoView(rows.element(boundBy: 1))
        XCTAssertTrue(rows.element(boundBy: 0).label.hasPrefix("Latest recording"), rows.element(boundBy: 0).label)
        XCTAssertTrue(rows.element(boundBy: 1).label.hasPrefix("Baseline recording"), rows.element(boundBy: 1).label)
        rows.element(boundBy: 1).tap()
        XCTAssertTrue(app.element("deviceCheck.baselineNote").waitForExistence(timeout: 5), "the baseline says it is the baseline")
        XCTAssertTrue(app.element("deviceCheck.recordingMeta").label.replacingOccurrences(of: "\u{00A0}", with: " ").contains("November 17, 2026"))
    }

    /// The held-out paystubs with the scripted model: one button under the check's live run starts the
    /// reading of all 24, the progress counts them, and the run file is saved when it finishes, with the
    /// figures scored from it.
    func testHeldOutRunStartsAndFinishes() {
        let app = XCUIApplication.silhouette(model: "device")
        app.launch()
        openCheck(app)
        let button = app.buttons["heldout.run"]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "the held-out run is offered where the check's live run is")
        XCTAssertTrue(button.label.contains("24"), button.label)
        let started = Date()
        app.tapButton("heldout.run")
        let status = app.element("heldout.status")
        XCTAssertTrue(status.waitForExistence(timeout: 10), "the run shows its progress")
        XCTAssertTrue(status.label.contains("of 24"), status.label)
        XCTAssertFalse(app.buttons["deviceCheck.run"].isEnabled, "one run at a time")
        let saved = app.element("heldout.saved")
        XCTAssertTrue(saved.waitForExistence(timeout: 300), "the run file is saved when the run finishes")
        print("held-out run with the scripted model: \(Int(Date().timeIntervalSince(started))) s")
        XCTAssertTrue(saved.label.contains("heldout-device-") && saved.label.contains(".json"), saved.label)
        XCTAssertTrue(app.element("heldout.status").label.hasPrefix("Finished: 24 paystubs"), app.element("heldout.status").label)
        XCTAssertTrue(app.buttons["heldout.share"].exists)
        // The figures, scored from the file (the check itself did not run, so these are the held-out run's).
        let onDevice = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "cases answered on this iPhone")).firstMatch
        app.scrollIntoView(onDevice)
        XCTAssertTrue(onDevice.waitForExistence(timeout: 5) && onDevice.label.contains("/ 24"), onDevice.debugDescription)
        let wrong = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "wrong value reached the person")).firstMatch
        XCTAssertTrue(wrong.label.hasPrefix("0 / 24"), wrong.label)
    }

    /// Without a model there is no held-out run to start.
    func testWithoutAModelThereIsNoHeldOutRun() {
        let app = XCUIApplication.silhouette(model: "none")
        app.launch()
        openCheck(app)
        XCTAssertTrue(app.element("deviceCheck.recordingMeta").waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["heldout.run"].exists)
    }
}
