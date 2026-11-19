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
}
