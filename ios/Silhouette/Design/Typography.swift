// Type: Darker Grotesque 800/900 for display, Hanken Grotesk for interface text, DM Mono for
// document values, ids and times (all SIL OFL 1.1, bundled under Resources/Fonts and registered in
// Info.plist). Sizes come from `typography.scale` in the tokens.
// Dynamic Type: interface and mono text scale fully; display type scales up to
// `typography.sizeSteps.displayScaleCap` and then relies on the size-step rule.
// Korean: Darker Grotesque has no Hangul, so display text uses the system face at its heaviest
// weight, 0.92 of the size, with open leading (1.08) and line breaks between words (tokens displayKo).

import SilhouetteKit
import SwiftUI
import UIKit

enum TypeRole: String {
    case display, title, heading, listItem, action, wordmark, giantNumber, amount, count
    case body, bodyStrong, help, small, label, caption, button, control
    case monoValue, monoDocument, placeholderId
    case stampCount, progressTotal, optionWord, recordHeadline

    var family: Family {
        switch self {
        case .monoValue, .monoDocument, .placeholderId: .mono
        case .body, .bodyStrong, .help, .small, .label, .caption, .button, .control: .text
        default: .display
        }
    }

    enum Family { case display, text, mono }
}

enum DesignFonts {
    /// Korean display size relative to the Latin design size (tokens displayKo).
    static let koreanScale: CGFloat = 0.92
    static let koreanLeading: CGFloat = 1.08

    /// The `wght` axis tag.
    private static let weightAxis = 0x7767_6874

    /// A face at a weight: Darker Grotesque and Hanken Grotesk through their variable `wght` axis,
    /// DM Mono from its static Regular and Medium files. Falls back to the system font.
    static func uiFont(_ family: TypeRole.Family, weight: Double, size: CGFloat, korean: Bool = false) -> UIFont {
        if korean && family == .display { return .systemFont(ofSize: size * koreanScale, weight: .heavy) }
        switch family {
        case .mono:
            return UIFont(name: weight >= 500 ? "DMMono-Medium" : "DMMono-Regular", size: size)
                ?? .monospacedSystemFont(ofSize: size, weight: weight >= 500 ? .medium : .regular)
        case .display, .text:
            let base = family == .display ? "DarkerGrotesque-Light" : "HankenGrotesk-Regular"
            guard let font = UIFont(name: base, size: size) else {
                return .systemFont(ofSize: size, weight: weight >= 700 ? .bold : weight >= 600 ? .semibold : .regular)
            }
            let key = UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String)
            let descriptor = font.fontDescriptor.addingAttributes([key: [weightAxis: weight]])
            return UIFont(descriptor: descriptor, size: size)
        }
    }
}

/// The scale factor for the current Dynamic Type size (1 at the default "Large").
func dynamicTypeScale(_ size: DynamicTypeSize) -> CGFloat {
    let category: UIContentSizeCategory = switch size {
    case .xSmall: .extraSmall
    case .small: .small
    case .medium: .medium
    case .large: .large
    case .xLarge: .extraLarge
    case .xxLarge: .extraExtraLarge
    case .xxxLarge: .extraExtraExtraLarge
    case .accessibility1: .accessibilityMedium
    case .accessibility2: .accessibilityLarge
    case .accessibility3: .accessibilityExtraLarge
    case .accessibility4: .accessibilityExtraExtraLarge
    case .accessibility5: .accessibilityExtraExtraExtraLarge
    @unknown default: .large
    }
    return UIFontMetrics(forTextStyle: .body).scaledValue(for: 100, compatibleWith: UITraitCollection(preferredContentSizeCategory: category)) / 100
}

extension Locale {
    var isKorean: Bool { language.languageCode == .korean }
}

extension Theme {
    struct TypeSpec {
        let size: CGFloat
        let lineHeight: CGFloat
        let weight: Double
        let tracking: CGFloat
        let family: TypeRole.Family
    }

    func spec(_ role: TypeRole) -> TypeSpec {
        let t = tokens.type[role.rawValue]
        return TypeSpec(size: CGFloat(t?.size ?? 16), lineHeight: CGFloat(t?.lineHeight ?? 22), weight: t?.weight ?? 400,
                        tracking: CGFloat(t?.letterSpacing ?? 0), family: role.family)
    }

    var displayScaleCap: CGFloat { CGFloat(tokens.number("typography.sizeSteps.displayScaleCap") ?? 1.3) }
    var headlineFloor: CGFloat { CGFloat(tokens.number("typography.sizeSteps.headlineFloor") ?? 0.6) }
    var labelFloor: CGFloat { CGFloat(tokens.number("typography.sizeSteps.labelFloor") ?? 0.66) }

    /// The Dynamic Type factor for a family: display is capped.
    func scale(_ family: TypeRole.Family, _ size: DynamicTypeSize) -> CGFloat {
        let s = dynamicTypeScale(size)
        return family == .display ? min(s, displayScaleCap) : s
    }
}

private struct TypeModifier: ViewModifier {
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Environment(\.locale) private var locale
    let role: TypeRole
    let size: CGFloat?
    let weight: Double?

    func body(content: Content) -> some View {
        let spec = theme.spec(role)
        let scale = theme.scale(spec.family, dynamicType)
        let points = (size ?? spec.size) * scale
        let korean = locale.isKorean && spec.family == .display
        let font = DesignFonts.uiFont(spec.family, weight: weight ?? spec.weight, size: points, korean: korean)
        let leading = korean ? DesignFonts.koreanLeading : spec.lineHeight / spec.size
        let extra = max(0, leading * points - font.lineHeight)
        content
            .font(Font(font))
            .tracking(korean ? 0 : spec.tracking * (points / spec.size))
            .lineSpacing(spec.family == .display && !korean ? 0 : extra)
    }
}

extension View {
    /// Sets text in a token type role. `size` overrides the design size (for size steps).
    func type(_ role: TypeRole, size: CGFloat? = nil, weight: Double? = nil) -> some View {
        modifier(TypeModifier(role: role, size: size, weight: weight))
    }
}

// MARK: - Display headline with tight leading and the size-step rule

/// A display headline: Darker Grotesque with the token's tight leading. It starts at the design size
/// and steps down (4 pt) until no word overflows its line and it fits `maxLines`, never below the
/// headline floor; it never truncates.
struct DisplayHeadline: View {
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Environment(\.locale) private var locale
    let text: String
    var role: TypeRole = .title
    var size: CGFloat? = nil
    var maxLines = 4
    var color: Color? = nil

    var body: some View {
        let spec = theme.spec(role)
        let design = (size ?? spec.size) * theme.scale(.display, dynamicType)
        HeadlineLabel(text: text, designSize: design, leading: spec.lineHeight / spec.size,
                      trackingRatio: spec.tracking / spec.size, weight: spec.weight, maxLines: maxLines,
                      floor: theme.headlineFloor, step: 4, color: UIColor(color ?? theme.ink), korean: locale.isKorean)
            .accessibilityElement()
            .accessibilityLabel(text)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A single-line display label (actions, amounts, counts, option words) that steps down 2 pt until it
/// fits, to the label floor, then wraps to two lines.
struct DisplayLabel: View {
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Environment(\.locale) private var locale
    let text: String
    var role: TypeRole = .action
    var size: CGFloat? = nil
    var maxLines = 2
    var color: Color? = nil
    var alignment: NSTextAlignment = .natural
    /// Labels prefer one line (stepping down first); list rows keep their size and wrap first.
    var singleLineFirst = true

    var body: some View {
        let spec = theme.spec(role)
        let design = (size ?? spec.size) * theme.scale(.display, dynamicType)
        HeadlineLabel(text: text, designSize: design, leading: max(spec.lineHeight / spec.size, 0.9),
                      trackingRatio: spec.tracking / spec.size, weight: spec.weight, maxLines: maxLines,
                      floor: theme.labelFloor, step: 2, color: UIColor(color ?? theme.ink), alignment: alignment,
                      singleLineFirst: singleLineFirst, korean: locale.isKorean)
            .accessibilityElement()
            .accessibilityLabel(text)
    }
}

private struct HeadlineLabel: UIViewRepresentable {
    let text: String
    let designSize: CGFloat
    let leading: CGFloat
    let trackingRatio: CGFloat
    let weight: Double
    let maxLines: Int
    let floor: CGFloat
    let step: CGFloat
    let color: UIColor
    var alignment: NSTextAlignment = .natural
    /// Labels: prefer one line while it fits at or above the floor.
    var singleLineFirst = false
    var korean = false

    private var lineFactor: CGFloat { korean ? max(leading, DesignFonts.koreanLeading) : leading }
    private func font(_ size: CGFloat) -> UIFont { DesignFonts.uiFont(.display, weight: weight, size: size, korean: korean) }

    func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.numberOfLines = 0
        label.lineBreakMode = .byWordWrapping
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        label.setContentHuggingPriority(.required, for: .vertical)
        label.isAccessibilityElement = false
        return label
    }

    func updateUIView(_ label: UILabel, context: Context) {
        let width = label.bounds.width
        label.attributedText = attributed(size: width > 0 ? chosenSize(width: width) : designSize)
    }

    private func attributed(size: CGFloat) -> NSAttributedString {
        let p = NSMutableParagraphStyle()
        p.minimumLineHeight = size * lineFactor
        p.maximumLineHeight = size * lineFactor
        p.alignment = alignment
        p.lineBreakMode = .byWordWrapping
        if korean { p.lineBreakStrategy = .hangulWordPriority }
        return NSAttributedString(string: text, attributes: [
            .font: font(size), .foregroundColor: color, .kern: korean ? 0 : trackingRatio * size, .paragraphStyle: p,
        ])
    }

    /// Words fit their line and the text fits `lines` at this size.
    private func fits(_ size: CGFloat, width: CGFloat, lines: Int) -> Bool {
        let kern = korean ? 0 : trackingRatio * size
        for word in text.split(whereSeparator: \.isWhitespace) {
            let w = (String(word) as NSString).size(withAttributes: [.font: font(size), .kern: kern]).width
            if w > width { return false }
        }
        let rect = attributed(size: size).boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude),
                                                        options: [.usesLineFragmentOrigin], context: nil)
        return Int((rect.height / (size * lineFactor)).rounded()) <= lines
    }

    private func chosenSize(width: CGFloat) -> CGFloat {
        let minimum = designSize * floor
        var size = designSize
        if singleLineFirst {
            while size > minimum, !fits(size, width: width, lines: 1) { size -= step }
            if fits(size, width: width, lines: 1) { return size }
            size = designSize
        }
        while size > minimum, !fits(size, width: width, lines: maxLines) { size -= step }
        return max(size, minimum)
    }

    func sizeThatFits(_ offered: ProposedViewSize, uiView label: UILabel, context: Context) -> CGSize? {
        // Without a width (ideal size), the text on one line at its design size.
        let ideal = ceil(attributed(size: designSize).boundingRect(
            with: CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin], context: nil).width) + 1
        let width = offered.width.map { $0.isFinite ? $0 : ideal } ?? ideal
        let size = chosenSize(width: width)
        label.attributedText = attributed(size: size)
        label.preferredMaxLayoutWidth = width
        let rect = label.attributedText!.boundingRect(with: CGSize(width: width, height: .greatestFiniteMagnitude),
                                                      options: [.usesLineFragmentOrigin], context: nil)
        // Darker Grotesque's descenders reach below the tight line box (tokens size.displayDescenderPad).
        return CGSize(width: width, height: ceil(rect.height) + (korean ? 0 : size * 0.1))
    }
}
