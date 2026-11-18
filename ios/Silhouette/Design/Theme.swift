// The theme: every colour, type size, space, radius and duration comes from
// shared/design/tokens.json (bundled under Shared/design/). Colours follow light and dark.

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UIKit

struct Theme: Sendable {
    let tokens: DesignTokens

    // MARK: Colour roles

    func color(_ name: String) -> Color { Color(uiColor: uiColor(name)) }

    func uiColor(_ name: String) -> UIColor {
        let light = tokens.light[name], dark = tokens.dark[name]
        return UIColor { traits in
            let c = (traits.userInterfaceStyle == .dark ? dark : light) ?? light ?? DesignTokens.RGBA(red: 1, green: 0, blue: 1, alpha: 1)
            return UIColor(red: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
        }
    }

    var ground: Color { color("ground") }
    var ink: Color { color("ink") }
    var inkMuted: Color { color("inkMuted") }
    var card: Color { color("card") }
    var line: Color { color("line") }
    var block: Color { color("block") }
    var onBlock: Color { color("onBlock") }
    var onBlockMuted: Color { color("onBlockMuted") }
    var blockLine: Color { color("blockLine") }
    var paper: Color { color("paper") }
    var onPaper: Color { color("onPaper") }
    var onPaperMuted: Color { color("onPaperMuted") }
    var leave: Color { color("leave") }
    var onLeave: Color { color("onLeave") }
    var mine: Color { color("mine") }
    var onMine: Color { color("onMine") }
    var blockFocus: Color { color("blockFocus") }
    var leaveFocus: Color { color("leaveFocus") }
    var pressedTint: Color { color("surfaceSunken") }

    // MARK: Sizes

    func space(_ name: String) -> CGFloat { CGFloat(tokens.spacing[name] ?? 16) }
    func radius(_ name: String) -> CGFloat { CGFloat(tokens.radius[name] ?? 4) }
    func size(_ name: String) -> CGFloat { CGFloat(tokens.number("size.\(name)") ?? 44) }
    var gutter: CGFloat { space("gutter") }
    var minTapTarget: CGFloat { max(size("minTapTarget"), 44) }
    var border: CGFloat { CGFloat(tokens.number("size.borderStrong") ?? 1.5) }
    var readingWidth: CGFloat { size("readingWidth") }

    // MARK: Motion

    func duration(_ name: String) -> Double { (tokens.number("motion.duration.\(name)") ?? 300) / 1000 }
    func delay(_ name: String) -> Double { (tokens.number("motion.delay.\(name)") ?? 0) / 1000 }

    func curve(_ name: String, duration: String) -> Animation {
        let c = tokens.numbers("motion.easing.\(name)")
        let d = self.duration(duration)
        guard c.count == 4 else { return .easeOut(duration: d) }
        return .timingCurve(c[0], c[1], c[2], c[3], duration: d)
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

extension Theme {
    /// The theme from the bundled tokens: the default for content SwiftUI hosts separately.
    static let bundled: Theme = {
        let url = Bundle.main.resourceURL?.appendingPathComponent("Shared/design/tokens.json")
        let json = url.flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSON.parse($0) } ?? .object(JSONObject())
        return Theme(tokens: (try? DesignTokens(json: json)) ?? DesignTokens.empty)
    }()
}

private struct ThemeKey: EnvironmentKey {
    static let defaultValue: Theme = .bundled
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}
