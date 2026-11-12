// Shared building blocks: the verdict silhouette mark, criterion state icons, buttons and notes.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

// MARK: - Silhouette mark

/// A head-and-shoulders silhouette whose fill encodes the verdict: likely = solid, maybe = half
/// filled, depends = dashed outline, unlikely = faint outline. Always paired with text, never the
/// only signal. Drawn in a 48 × 48 box, like the web app's mark.
struct SilhouetteShape: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 48
        var p = Path()
        p.addEllipse(in: CGRect(x: rect.minX + (24 - 8.5) * s, y: rect.minY + (14.5 - 8.5) * s, width: 17 * s, height: 17 * s))
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * s, y: rect.minY + y * s) }
        p.move(to: pt(7, 42))
        p.addCurve(to: pt(24, 27), control1: pt(7, 32.6), control2: pt(14.6, 27))
        p.addCurve(to: pt(41, 42), control1: pt(33.4, 27), control2: pt(41, 32.6))
        p.closeSubpath()
        return p
    }
}

enum MarkStyle {
    case brand
    case verdict(Verdict)
}

struct SilhouetteMark: View {
    @Environment(\.theme) private var theme
    let style: MarkStyle
    var size: CGFloat = 40

    var body: some View {
        let shape = SilhouetteShape()
        let lineWidth = size / 48 * 2
        Group {
            switch style {
            case .brand:
                shape.fill(theme.primary)
            case .verdict(.likely):
                shape.fill(theme.verdict("likely"))
            case .verdict(.maybe):
                let color = theme.verdict("maybe")
                ZStack {
                    shape.fill(color).mask(alignment: .leading) { Rectangle().frame(width: size / 2) }
                    shape.stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineJoin: .round))
                }
            case .verdict(.depends):
                shape.stroke(theme.verdict("depends"),
                             style: StrokeStyle(lineWidth: lineWidth, lineJoin: .round, dash: [4 * size / 48, 3.2 * size / 48]))
            case .verdict(.unlikely):
                shape.stroke(theme.verdict("unlikely"), style: StrokeStyle(lineWidth: lineWidth * 0.75, lineJoin: .round))
                    .opacity(0.75)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

// MARK: - Criterion state icon

struct StateIcon: View {
    @Environment(\.theme) private var theme
    let state: CriterionState
    @ScaledMetric(relativeTo: .body) private var size: CGFloat = 24

    var body: some View {
        let lw = size / 24 * 2
        ZStack {
            switch state {
            case .pass:
                Circle().fill(theme.text)
                Image(systemName: "checkmark").font(.system(size: size * 0.5, weight: .bold)).foregroundStyle(theme.surface)
            case .fail:
                Circle().strokeBorder(theme.text, lineWidth: lw)
                Image(systemName: "xmark").font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(theme.text)
            case .mixed:
                Circle().strokeBorder(theme.text, lineWidth: lw)
                Circle().fill(theme.text).mask(alignment: .leading) { Rectangle().frame(width: size / 2) }
            case .unknown:
                Circle().strokeBorder(theme.text, style: StrokeStyle(lineWidth: lw, dash: [3.2 * size / 24, 2.6 * size / 24]))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

// MARK: - Buttons

struct ActionButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, quiet, danger }
    @Environment(\.theme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    let kind: Kind

    func makeBody(configuration: Configuration) -> some View {
        let (fill, fg, stroke): (Color, Color, Color) = switch kind {
        case .primary: (theme.primary, theme.onPrimary, .clear)
        case .secondary: (theme.surface, theme.primary, theme.borderStrong)
        case .quiet: (.clear, theme.primary, .clear)
        case .danger: (theme.surface, theme.danger, theme.danger)
        }
        configuration.label
            .tokenFont(.bodyStrong)
            .multilineTextAlignment(.center)
            .foregroundStyle(fg)
            .padding(.horizontal, theme.space("md"))
            .padding(.vertical, theme.space("sm"))
            .frame(maxWidth: kind == .quiet ? nil : .infinity, minHeight: theme.minTapTarget)
            .background(fill, in: RoundedRectangle(cornerRadius: theme.radius("control")))
            .overlay(RoundedRectangle(cornerRadius: theme.radius("control")).strokeBorder(stroke, lineWidth: 2))
            .contentShape(RoundedRectangle(cornerRadius: theme.radius("control")))
            .opacity(configuration.isPressed ? 0.75 : (isEnabled ? 1 : 0.5))
    }
}

extension ButtonStyle where Self == ActionButtonStyle {
    static var primaryAction: ActionButtonStyle { ActionButtonStyle(kind: .primary) }
    static var secondaryAction: ActionButtonStyle { ActionButtonStyle(kind: .secondary) }
    static var quietAction: ActionButtonStyle { ActionButtonStyle(kind: .quiet) }
    static var dangerAction: ActionButtonStyle { ActionButtonStyle(kind: .danger) }
}

/// A selectable row for single and multiple choice: radio or checkbox look, whole row tappable.
struct ChoiceRow: View {
    @Environment(\.theme) private var theme
    let label: String
    let selected: Bool
    let multiple: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .firstTextBaseline, spacing: theme.space("sm")) {
                Image(systemName: multiple ? (selected ? "checkmark.square.fill" : "square")
                                           : (selected ? "largecircle.fill.circle" : "circle"))
                    .font(.title2)
                    .foregroundStyle(selected ? theme.primary : theme.borderStrong)
                    .accessibilityHidden(true)
                Text(label)
                    .tokenFont(.body)
                    .foregroundStyle(theme.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, theme.space("md"))
            .padding(.vertical, theme.space("sm"))
            .frame(minHeight: theme.minTapTarget)
            .background(selected ? theme.privateFill.opacity(0.6) : theme.surface,
                        in: RoundedRectangle(cornerRadius: theme.radius("control")))
            .overlay(RoundedRectangle(cornerRadius: theme.radius("control"))
                .strokeBorder(selected ? theme.primary : theme.border, lineWidth: 2))
            .contentShape(RoundedRectangle(cornerRadius: theme.radius("control")))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// "Stays on this device" style note with a lock.
struct PrivateNote: View {
    @Environment(\.theme) private var theme
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: theme.space("xs")) {
            Image(systemName: "lock.fill").accessibilityHidden(true)
            Text(text).fixedSize(horizontal: false, vertical: true)
        }
        .tokenFont(.small)
        .foregroundStyle(theme.onPrivate)
        .padding(.horizontal, theme.space("sm"))
        .padding(.vertical, theme.space("xs"))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.privateFill, in: RoundedRectangle(cornerRadius: theme.radius("control")))
        .accessibilityElement(children: .combine)
    }
}

/// A screen heading: header trait for VoiceOver.
struct ScreenHeading: View {
    @Environment(\.theme) private var theme
    let text: String
    var style: TypeStyle = .title

    var body: some View {
        Text(text)
            .tokenFont(style)
            .foregroundStyle(theme.text)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Scrollable screen body with the demo banner on top, laid out at reading width.
struct ScreenScroll<Content: View>: View {
    @Environment(\.theme) private var theme
    @Environment(AppModel.self) private var model
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.space("md")) {
                if model.bundle.packInfo.isDemo { DemoBanner() }
                content
            }
            .padding(.horizontal, theme.space("md"))
            .padding(.vertical, theme.space("md"))
            .frame(maxWidth: theme.readingWidth + 2 * theme.space("md"))
            .frame(maxWidth: .infinity)
        }
        .background(theme.background)
        .scrollDismissesKeyboard(.interactively)
    }
}
