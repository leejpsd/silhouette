// The SwiftUI theme, built from shared/design/tokens.json (bundled under Shared/design/).
// Colors resolve per light/dark appearance; type sizes scale with Dynamic Type.

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UIKit

struct Theme: Sendable {
    let tokens: DesignTokens

    func color(_ name: String) -> Color {
        let light = tokens.light[name], dark = tokens.dark[name]
        return Color(uiColor: UIColor { traits in
            let c = (traits.userInterfaceStyle == .dark ? dark : light) ?? light ?? DesignTokens.RGBA(red: 1, green: 0, blue: 1, alpha: 1)
            return UIColor(red: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
        })
    }

    var background: Color { color("background") }
    var surface: Color { color("surface") }
    var surfaceSunken: Color { color("surfaceSunken") }
    var text: Color { color("text") }
    var textMuted: Color { color("textMuted") }
    var border: Color { color("border") }
    var borderStrong: Color { color("borderStrong") }
    var primary: Color { color("primary") }
    var onPrimary: Color { color("onPrimary") }
    var notice: Color { color("notice") }
    var onNotice: Color { color("onNotice") }
    var privateFill: Color { color("private") }
    var onPrivate: Color { color("onPrivate") }
    var danger: Color { color("danger") }

    func verdict(_ verdict: String) -> Color {
        color("verdict" + verdict.prefix(1).uppercased() + verdict.dropFirst())
    }

    func space(_ name: String) -> CGFloat { CGFloat(tokens.spacing[name] ?? 16) }
    func radius(_ name: String) -> CGFloat { CGFloat(tokens.radius[name] ?? 12) }
    var minTapTarget: CGFloat { CGFloat(max(tokens.size["minTapTarget"] ?? 48, 44)) }
    var readingWidth: CGFloat { CGFloat(tokens.size["readingWidth"] ?? 640) }
}

extension Theme {
    /// The theme from the bundled tokens. Views normally receive the app model's theme through the
    /// environment; this is the default for content SwiftUI hosts separately (menus, alerts).
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

// MARK: - Type scale

enum TypeStyle: String {
    case display, title, heading, body, bodyStrong, small

    /// The Dynamic Type style each token size scales with.
    var textStyle: Font.TextStyle {
        switch self {
        case .display: .largeTitle
        case .title: .title
        case .heading: .title3
        case .body, .bodyStrong: .body
        case .small: .callout
        }
    }
}

private struct TokenFont: ViewModifier {
    @Environment(\.theme) private var theme
    let style: TypeStyle
    @ScaledMetric private var scale: CGFloat = 1

    init(_ style: TypeStyle) {
        self.style = style
        _scale = ScaledMetric(wrappedValue: 1, relativeTo: style.textStyle)
    }

    func body(content: Content) -> some View {
        let token = theme.tokens.type[style.rawValue]
        // The display sizes are set for a condensed display typeface the app does not bundle; in the
        // system font they are capped so headings stay readable until the design is applied here.
        let designSize = token?.family == "display" ? min(token?.size ?? 17, Self.displayCap[style] ?? 34) : (token?.size ?? 17)
        let size = CGFloat(designSize) * scale
        let weight = Self.weight(token?.weight ?? 400)
        content
            .font(.system(size: size, weight: weight))
            .tracking(CGFloat(token?.letterSpacing ?? 0))
            // Extra leading grows more slowly than the text at accessibility sizes.
            .lineSpacing(max(0, CGFloat(token?.lineHeight ?? 24) - CGFloat(token?.size ?? 17) * 1.2) * min(scale, 1.5))
    }

    static let displayCap: [TypeStyle: Double] = [.display: 34, .title: 28, .heading: 22]

    static func weight(_ w: Double) -> Font.Weight {
        switch w {
        case ..<350: .light
        case ..<500: .regular
        case ..<600: .medium
        case ..<700: .semibold
        default: .bold
        }
    }
}

extension View {
    func tokenFont(_ style: TypeStyle) -> some View { modifier(TokenFont(style)) }
}
