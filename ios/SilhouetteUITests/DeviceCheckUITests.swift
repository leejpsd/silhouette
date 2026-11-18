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
}
