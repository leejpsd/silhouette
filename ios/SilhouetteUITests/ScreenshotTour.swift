// Captures every screen in several languages and appearances. Runs only when the runner has
// SCREENSHOT_DIR set (xcodebuild: TEST_RUNNER_SCREENSHOT_DIR=/path); otherwise it is skipped.

import XCTest

final class ScreenshotTour: XCTestCase {
    struct Config {
        let locale: String
        let appearance: String
        var contentSize: String?
        var name: String { [locale, appearance, contentSize == nil ? nil : "ax"].compactMap { $0 }.joined(separator: "-") }
    }

    func testTour() throws {
        guard let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] else { throw XCTSkip("SCREENSHOT_DIR not set") }
        let configs = [
            Config(locale: "en", appearance: "light"), Config(locale: "en", appearance: "dark"),
            Config(locale: "ko", appearance: "light"), Config(locale: "ko", appearance: "dark"),
            Config(locale: "es", appearance: "light"),
            Config(locale: "en", appearance: "light", contentSize: "UICTContentSizeCategoryAccessibilityXXXL"),
            Config(locale: "ko", appearance: "light", contentSize: "UICTContentSizeCategoryAccessibilityXXXL"),
        ]
        for config in configs { tour(config, dir: dir) }
    }

    private func tour(_ config: Config, dir: String) {
        var extra = ["-silhouette.locale", config.locale, "-UITestAppearance", config.appearance]
        if let size = config.contentSize { extra += ["-UIPreferredContentSizeCategoryName", size] }
        let app = XCUIApplication.silhouette(extra: extra)
        app.launch()
        func shot(_ name: String) {
            Thread.sleep(forTimeInterval: 0.6)  // let selection and transitions settle
            let path = "\(dir)/\(config.name)-\(name).png"
            FileManager.default.createFile(atPath: path, contents: XCUIScreen.main.screenshot().pngRepresentation)
        }
        XCTAssertTrue(app.buttons["start.begin"].waitForExistence(timeout: 5))
        shot("01-start")
        app.tapButton("start.begin")
        app.setStepper(to: 3)
        shot("02-question-int")
        app.next()
        app.skip()
        _ = app.buttons["choice.yes"].waitForExistence(timeout: 5)
        app.choose("yes")
        shot("03-question-enum")
        app.next()
        app.typeExactIncome("30524")
        shot("04-question-income-exact")
        app.next()
        app.choose("renter")
        app.next()
        app.choose("snap")
        shot("05-question-multi")
        app.next()
        app.choose("no")
        app.next()
        _ = app.element("question.sensitive").waitForExistence(timeout: 5)
        shot("06-question-sensitive")
        app.skip()
        _ = app.element("results.title").waitForExistence(timeout: 5)
        shot("07-results")
        app.swipeUp()
        shot("08-results-scrolled")
        app.buttons["program.food-help"].tap()
        _ = app.element("detail.verdict").waitForExistence(timeout: 5)
        shot("09-program")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.element("leaving.bar").tap()
        _ = app.buttons["leaving.hide"].waitForExistence(timeout: 5)
        shot("10-leaving-details")
        app.buttons["leaving.hide"].tap()
        app.buttons["delete.all"].tap()
        _ = app.alerts.firstMatch.waitForExistence(timeout: 5)
        shot("11-delete-confirm")
        app.alerts.buttons.element(boundBy: 1).tap()
        app.terminate()
    }
}
