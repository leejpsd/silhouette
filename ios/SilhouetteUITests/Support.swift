import XCTest

extension XCUIApplication {
    /// Launches with a clean device state unless `reset` is false.
    /// `model`: the scripted model (`none`, `device` or `cloud`); UI tests never reach a real model.
    static func silhouette(reset: Bool = true, model: String = "none", extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-UITestResetAll"] : []) + ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-UITestModel", model] + extra
        return app
    }

    func element(_ id: String) -> XCUIElement { descendants(matching: .any)[id] }

    func tapButton(_ id: String, file: StaticString = #filePath, line: UInt = #line) {
        let button = buttons[id]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "missing button \(id)", file: file, line: line)
        scrollIntoView(button)
        button.tap()
    }

    /// Controls can sit below the fold or under the floating tab bar and the privacy pill above it
    /// (the system's glass chrome, drawn over the scrolling content).
    func scrollIntoView(_ element: XCUIElement) {
        func chrome() -> [CGRect] {
            [tabBars.firstMatch, buttons["leaving.details"].firstMatch].filter(\.exists).map(\.frame)
        }
        func covered() -> Bool {
            guard element.isHittable else { return true }
            let frame = element.frame
            let rects = chrome()
            // The pill and the tab bar themselves are never covered.
            if rects.contains(where: { $0.insetBy(dx: -1, dy: -1).contains(frame) }) { return false }
            return rects.contains { $0.intersects(frame) }
        }
        var attempts = 0
        while covered() && attempts < 8 {
            let scroll = scrollViews.firstMatch
            let above = element.exists && element.frame.midY < scroll.frame.minY + scroll.frame.height * 0.3
            let from = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: above ? 0.2 : 0.55))
            let to = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: above ? 0.55 : 0.2))
            from.press(forDuration: 0.05, thenDragTo: to, withVelocity: .default, thenHoldForDuration: 0.05)
            attempts += 1
        }
    }

    /// Taps + until the stepper shows `value` (the first tap sets the minimum).
    func setStepper(to value: Int, file: StaticString = #filePath, line: UInt = #line) {
        let shown = element("stepper.value")
        XCTAssertTrue(shown.waitForExistence(timeout: 5), file: file, line: line)
        scrollIntoView(buttons["stepper.increase"])
        for _ in 0..<25 where (shown.value as? String) != String(value) {
            buttons["stepper.increase"].tap()
        }
        XCTAssertEqual(shown.value as? String, String(value), file: file, line: line)
    }

    /// Taps Next; while the number pad is up, the Next button above the keyboard.
    func next() {
        if keyboards.firstMatch.exists, buttons["keyboard.next"].exists {
            buttons["keyboard.next"].tap()
        } else {
            tapButton("q.next")
        }
    }
    func skip() { tapButton("q.skip") }

    func choose(_ value: String) { tapButton("choice.\(value)") }

    func typeExactIncome(_ amount: String) {
        choose("exact")
        let field = textFields["income.exact"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(amount)
    }

    func waitForQuestion(_ n: Int, file: StaticString = #filePath, line: UInt = #line) {
        let progress = element("question.progress")
        let predicate = NSPredicate(format: "label BEGINSWITH %@", "Question \(n) of")
        let found = expectation(for: predicate, evaluatedWith: progress)
        XCTAssertEqual(XCTWaiter.wait(for: [found], timeout: 5), .completed, "not on question \(n)", file: file, line: line)
    }
}


extension XCUIApplication {
    /// The judges' path from the draft-rules sheet: the prepared household's answers, then the results.
    func runPreparedHousehold(file: StaticString = #filePath, line: UInt = #line) {
        let more = buttons["demo.more"]
        XCTAssertTrue(more.waitForExistence(timeout: 5), file: file, line: line)
        more.tap()
        tapButton("demo.judges", file: file, line: line)
        tapButton("judges.quickCheck", file: file, line: line)
        XCTAssertTrue(element("results.title").waitForExistence(timeout: 5), file: file, line: line)
    }

    /// Opens a sample paystub's silhouette from the start screen.
    func openSample(_ id: String = "paystub-en-01", file: StaticString = #filePath, line: UInt = #line) {
        tapButton("start.sample", file: file, line: line)
        tapButton("doc.sample.\(id)", file: file, line: line)
        XCTAssertTrue(element("preview.title").waitForExistence(timeout: 5), file: file, line: line)
    }
}

private func expectation(for predicate: NSPredicate, evaluatedWith object: Any) -> XCTestExpectation {
    XCTNSPredicateExpectation(predicate: predicate, object: object)
}
