import XCTest

extension XCUIApplication {
    /// Launches with a clean device state unless `reset` is false.
    static func silhouette(reset: Bool = true, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = (reset ? ["-UITestResetAll"] : []) + ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"] + extra
        return app
    }

    func element(_ id: String) -> XCUIElement { descendants(matching: .any)[id] }

    func tapButton(_ id: String, file: StaticString = #filePath, line: UInt = #line) {
        let button = buttons[id]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "missing button \(id)", file: file, line: line)
        scrollIntoView(button)
        button.tap()
    }

    /// At large text sizes controls can sit below the fold or under the bottom bar.
    func scrollIntoView(_ element: XCUIElement) {
        let bar = self.element("leaving.bar")
        func covered() -> Bool {
            !element.isHittable || (bar.exists && bar.frame.intersects(element.frame))
        }
        var attempts = 0
        while covered() && attempts < 8 {
            let scroll = scrollViews.firstMatch
            let start = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
            start.press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35)))
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

private func expectation(for predicate: NSPredicate, evaluatedWith object: Any) -> XCTestExpectation {
    XCTNSPredicateExpectation(predicate: predicate, object: object)
}
