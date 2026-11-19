// The components of the "Brand & UI" design (shared/design/DESIGN.md, tokens version 7) as native iOS
// views: hero blocks, the privacy pill, glass buttons for the navigation layer, primary and redact
// buttons, where-it-ran badges, result markers, token chips, list cards and rows, the segmented
// control, notices and section labels. Content is solid (white cards on the ground, ink heroes); only
// the navigation layer (tab bar, floating round buttons, the privacy pill's accessory) is Liquid Glass.

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UIKit

// MARK: - Colours

extension Theme {
    var redact: Color { color("redact") }
    var redactTint: Color { color("redactTint") }
    var onRedact: Color { color("onRedact") }
    var night: Color { color("night") }
    var ink2: Color { color("ink2") }
    var note: Color { color("note") }
    var icon: Color { color("icon") }
    var faint: Color { color("faint") }
    var onInk: Color { color("onInk") }
    var underline: Color { color("underline") }
    var track: Color { color("track") }
    var raised: Color { color("raised") }
    var sheet: Color { color("sheet") }

    /// The hero block: ink in light; in dark the ground is ink, so the hero is the card colour and stays
    /// a block of its own. Text on it is white in both.
    var hero: Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0x16 / 255, green: 0x18 / 255, blue: 0x1B / 255, alpha: 1)
            : UIColor(red: 0x0E / 255, green: 0x0E / 255, blue: 0x0E / 255, alpha: 1) })
    }
    var onHero: Color { .white }
    /// The privacy pill: solid white in light, ink in dark.
    /// The privacy pill: white in light; in dark the card colour, one step above the ink ground, so it
    /// reads as a control on every background (with `pillEdge`).
    var pillFill: Color {
        Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0x16 / 255, green: 0x18 / 255, blue: 0x1B / 255, alpha: 1) : .white })
    }

    /// The pill's 1 pt edge: ink 12 % in light, white 22 % in dark; stronger with Increase Contrast.
    func pillEdge(_ contrast: ColorSchemeContrast) -> Color {
        let strong = contrast == .increased
        return Color(uiColor: UIColor {
            $0.userInterfaceStyle == .dark ? UIColor(white: 1, alpha: strong ? 0.55 : 0.22) : UIColor(white: 0.055, alpha: strong ? 0.5 : 0.12)
        })
    }
    var onHeroMuted: Color { .white.opacity(0.82) }
    /// The 1 px border that gives cards their edge (ink at 8 %).
    var cardBorder: Color { ink.opacity(tokens.number("alpha.inkBorder") ?? 0.08) }
}

// MARK: - Display type

/// Display type in capitals: Big Shoulders Display 900, stepping down until every word fits.
struct Display: View {
    @Environment(\.locale) private var locale
    let text: String
    var size: CGFloat = 46
    var maxLines = 4
    var color: Color? = nil

    var body: some View {
        DisplayHeadline(text: text.uppercased(with: locale), role: .title, size: size, maxLines: maxLines, color: color)
            .accessibilityLabel(text)
    }
}

// MARK: - Hero block

/// The ink block at the top of Start, Results, Program, Add a paystub and the silhouette: rounded
/// bottom corners (32), the screen's top controls, an optional eyebrow, the display headline, a lead
/// and whatever the screen puts under them.
struct Hero<Top: View, Content: View>: View {
    @Environment(\.theme) private var theme
    var eyebrow: String? = nil
    let title: String
    var size: CGFloat = 54
    var lead: String? = nil
    var titleId: String = ""
    /// A pill above the title (a program's verdict).
    var badge: AnyView? = nil
    /// The most lines the headline may take; it steps down in size to fit (Start keeps three).
    var titleLines = 5
    @ViewBuilder let top: Top
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // The top controls are bars: they stop growing at the largest standard size and show the
            // large content viewer on a long press instead.
            top
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .frame(minHeight: 44)
                .padding(.top, 6)
            if let eyebrow {
                Text(eyebrow).sfFont(15, weight: .semibold).foregroundStyle(theme.onHeroMuted)
                    .padding(.top, 20)
            }
            if let badge { badge.padding(.top, eyebrow == nil ? 20 : 8) }
            Display(text: title, size: size, maxLines: titleLines, color: theme.onHero)
                .accessibilityIdentifier(titleId)
                .padding(.top, badge != nil ? 8 : eyebrow == nil ? 24 : 6)
            if let lead {
                Text(lead).type(.lead).foregroundStyle(theme.onHeroMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 14)
            }
            content
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
        // The block runs on above its top (under the status bar, and when the page is pulled down).
        .background(UnevenRoundedRectangle(bottomLeadingRadius: 32, bottomTrailingRadius: 32).fill(theme.hero).padding(.top, -600))
        .environment(\.colorScheme, .dark)
    }
}

extension Hero where Content == EmptyView {
    init(eyebrow: String? = nil, title: String, size: CGFloat = 54, lead: String? = nil, titleId: String = "", titleLines: Int = 5,
         @ViewBuilder top: () -> Top) {
        self.init(eyebrow: eyebrow, title: title, size: size, lead: lead, titleId: titleId, titleLines: titleLines, top: top) { EmptyView() }
    }
}

/// The wordmark in the hero's top row.
struct Wordmark: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        Button { model.goHome() } label: {
            Text(verbatim: "SILHOUETTE").type(.wordmark).foregroundStyle(.white).frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(model.t("nav.home"))
        .accessibilityIdentifier("nav.home")
        .accessibilityShowsLargeContentViewer { Text(verbatim: "Silhouette") }
    }
}

// MARK: - Glass buttons (navigation layer only)

/// A round glass button (back, close, share, info): 44 pt, an SF Symbol, a spoken label.
struct GlassRound: View {
    let systemImage: String
    let label: String
    var id: String = ""
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage).sfFont(17, weight: .semibold).frame(width: 44, height: 44)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
        .accessibilityShowsLargeContentViewer { Label(label, systemImage: systemImage) }
    }
}

/// A glass capsule with a short label (For judges, the language, Retake).
struct GlassCapsule: View {
    let label: String
    var systemImage: String? = nil
    var spoken: String? = nil
    var id: String = ""
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage).sfFont(15, weight: .semibold) }
                Text(label).sfFont(17, weight: .semibold).lineLimit(1)
            }
            .padding(.horizontal, 6)
            .frame(minHeight: 44)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.capsule)
        .accessibilityLabel(spoken ?? label)
        .accessibilityIdentifier(id)
        .accessibilityShowsLargeContentViewer { Text(label) }
    }
}

/// The language button (EN, ES) that opens the language sheet.
struct LanguageButton: View {
    @Environment(AppModel.self) private var model
    static let short: [AppLocale: String] = [.en: "EN", .es: "ES", .ko: "한국어"]

    var body: some View {
        GlassCapsule(label: Self.short[model.locale] ?? model.locale.rawValue.uppercased(),
                     spoken: "\(model.t("nav.language")), \(model.locale.nativeName)", id: "language.menu") {
            model.sheet = .language
        }
    }
}

// MARK: - Buttons in the content layer

/// The primary action: a 52 pt ink capsule with a white label (17 / 600). A sending action is redact
/// with ink text and the leave glyph (DESIGN.md section 3).
struct PrimaryButton: View {
    @Environment(\.theme) private var theme
    @Environment(\.isEnabled) private var enabled
    let label: String
    var sends = false
    var id: String = ""
    /// Quiet until what it needs is in (an answer chosen): still pressable, it then explains what is
    /// missing. Ready, it fills and shows the arrow.
    var ready = true
    /// Something it started is running: it shows that, and cannot be pressed again.
    var busy = false
    /// An arrow when ready, where the action moves forward (the question flow).
    var showsArrow = false
    let action: () -> Void

    /// Filled when it can act now; an outline when it waits for something or cannot act.
    private var filled: Bool { ready && enabled && !busy }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if busy {
                    ProgressView().tint(filled || sends ? (sends ? theme.onRedact : theme.color("onPrimary")) : theme.ink)
                        .accessibilityHidden(true)
                } else if sends {
                    LeaveGlyph().frame(width: 18, height: 18)
                }
                // The view tree stays the same between quiet and ready (only opacity changes), so a
                // state change never replaces the button under a finger.
                Text(label).sfFont(17, weight: .semibold).multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .overlay(alignment: .trailing) {
                        if showsArrow && !sends {
                            Image(systemName: "arrow.right").sfFont(15, weight: .semibold)
                                .offset(x: filled ? 26 : 20)
                                .opacity(filled ? 1 : 0)
                                .accessibilityHidden(true)
                        }
                    }
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .padding(.horizontal, 16)
            .foregroundStyle(foreground)
            .background {
                ZStack {
                    Capsule().fill(sends ? theme.redact : theme.color("primary"))
                        .opacity(sends ? (filled ? 1 : 0.45) : (filled ? 1 : 0))
                    Capsule().strokeBorder(theme.ink.opacity(enabled ? 1 : 0.35), lineWidth: 1.5)
                        .opacity(sends || filled ? 0 : 1)
                }
            }
            .contentShape(Capsule())
            .animation(Motion.named(Motion.short), value: filled)
            .animation(Motion.named(Motion.short), value: busy)
        }
        .buttonStyle(PressScale())
        .allowsHitTesting(!busy)
        .accessibilityIdentifier(id)
    }

    private var foreground: Color {
        if sends { return theme.onRedact }
        if filled { return theme.color("onPrimary") }
        return theme.ink.opacity(enabled ? 1 : 0.4)
    }
}

/// The secondary action under a primary one: a white capsule (on ground) or a text button.
struct SecondaryButton: View {
    @Environment(\.theme) private var theme
    let label: String
    var filled = true
    var id: String = ""
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label).sfFont(17, weight: .semibold).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: filled ? 52 : 44)
                .padding(.horizontal, 16)
                .foregroundStyle(theme.ink)
                .background(Capsule().fill(filled ? theme.sheet : .clear))
                .contentShape(Capsule())
        }
        .buttonStyle(PressScale())
        .accessibilityIdentifier(id)
    }
}

/// A list row's press: the row darkens at once (a highlight, never movement).
struct RowPress: ButtonStyle {
    @Environment(\.theme) private var theme
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(theme.ink.opacity(configuration.isPressed ? 0.06 : 0))
    }
}

/// A slight press for custom buttons (none under Reduce Motion).
struct PressScale: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.75 : 1)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
    }
}

/// A text link: ink with a 1 px underline in underline grey, never default blue.
struct LinkText: View {
    @Environment(\.theme) private var theme
    let label: String
    var size: CGFloat = 15
    var onHero = false
    var id: String = ""
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label).sfFont(size, weight: .semibold)
                .underline(true, color: onHero ? .white.opacity(0.35) : theme.underline)
                .foregroundStyle(onHero ? .white : theme.ink)
                .multilineTextAlignment(.leading)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}

// MARK: - Glyphs

/// The leave glyph: a box with an arrow out. Reserved for actions that send.
struct LeaveGlyph: View {
    var body: some View {
        Image(systemName: "rectangle.portrait.and.arrow.forward").resizable().scaledToFit().fontWeight(.semibold)
            .accessibilityHidden(true)
    }
}

// MARK: - Badges and pills

enum WhereRan { case device, cloud, noModel }

/// Where an answer was written: "On this device" (ink), "Cloud" (redact tint, dashed), "No model"
/// (track). Height 26, text 12 / 700. On a hero the device badge is outlined.
struct WhereBadge: View {
    @Environment(\.theme) private var theme
    let kind: WhereRan
    let label: String
    var onHero = false

    var body: some View {
        HStack(spacing: 6) {
            if kind != .noModel {
                Circle().fill(kind == .cloud ? theme.redact : (onHero ? .white : theme.color("onPrimary"))).frame(width: 6, height: 6)
            }
            Text(label).sfFont(12, weight: .bold).lineLimit(2).multilineTextAlignment(.leading)
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 26)
        .foregroundStyle(foreground)
        .background(background)
        .accessibilityElement(children: .combine)
    }

    private var foreground: Color {
        switch kind {
        case .device: onHero ? .white : theme.color("onPrimary")
        case .cloud: onHero ? .white : theme.onRedact
        case .noModel: onHero ? .white : theme.ink
        }
    }

    @ViewBuilder private var background: some View {
        switch kind {
        case .device:
            if onHero { Capsule().strokeBorder(.white.opacity(0.85), lineWidth: 1) } else { Capsule().fill(theme.color("primary")) }
        case .cloud:
            if onHero {
                Capsule().strokeBorder(.white.opacity(0.5), style: StrokeStyle(lineWidth: 1.25, dash: [3, 2]))
            } else {
                Capsule().fill(theme.redactTint).overlay(Capsule().strokeBorder(Color(red: 0.055, green: 0.055, blue: 0.055), style: StrokeStyle(lineWidth: 1.25, dash: [3, 2])))
            }
        case .noModel:
            Capsule().fill(onHero ? .white.opacity(0.12) : theme.track)
        }
    }
}

/// A small pill on a hero ("Checked on this iPhone", "No AI used", the verdict): white 12 % fill.
struct HeroPill: View {
    let label: String
    var systemImage: String? = nil
    var filled = false
    var verdict: Verdict? = nil

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage { Image(systemName: systemImage).sfFont(11, weight: .semibold).accessibilityHidden(true) }
            if let verdict { VerdictMarker(verdict: verdict, size: 10, color: filled ? Color(red: 0.055, green: 0.055, blue: 0.055) : .white) }
            Text(label).sfFont(13, weight: .semibold).lineLimit(2)
        }
        .padding(.horizontal, 10)
        .frame(minHeight: 28)
        .foregroundStyle(filled ? Color(red: 0.055, green: 0.055, blue: 0.055) : .white)
        .background(Capsule().fill(filled ? .white : .white.opacity(0.12)))
        .accessibilityElement(children: .combine)
    }
}

/// A status pill in a list ("May qualify", "Sent", "On iPhone"): 12 / 600.
struct StatusPill: View {
    @Environment(\.theme) private var theme
    enum Style { case plain, ink, redact, outline, muted }
    let label: String
    var style: Style = .plain
    var dot = false

    var body: some View {
        HStack(spacing: 5) {
            if dot { Circle().fill(style == .redact ? theme.onRedact : style == .ink ? theme.color("onPrimary") : theme.ink).frame(width: 6, height: 6) }
            Text(label).sfFont(12, weight: .semibold).lineLimit(1).fixedSize()
        }
        .padding(.horizontal, 8)
        .frame(minHeight: 24)
        .foregroundStyle(style == .redact ? theme.onRedact : style == .ink ? theme.color("onPrimary") : style == .muted ? theme.note : theme.ink)
        .background {
            switch style {
            case .plain: Capsule().fill(theme.raised)
            case .ink: Capsule().fill(theme.color("primary"))
            case .redact: Capsule().fill(theme.redact)
            case .outline: Capsule().strokeBorder(theme.ink, lineWidth: 1)
            case .muted: Capsule().fill(theme.track)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Result markers

/// A 20 pt circle whose fill level carries the verdict: filled, half, dashed ring, thin ring. Never
/// alone: the verdict word is always next to it.
struct VerdictMarker: View {
    @Environment(\.theme) private var theme
    let verdict: Verdict
    var size: CGFloat = 20
    var color: Color? = nil

    var body: some View {
        let c = color ?? theme.ink
        ZStack {
            switch verdict {
            case .likely: Circle().fill(c)
            case .maybe:
                Circle().strokeBorder(c, lineWidth: 1.5)
                HalfCircle().fill(c).padding(1)
            case .depends: Circle().strokeBorder(c, style: StrokeStyle(lineWidth: 1.5, dash: [2.6, 2.2]))
            case .unlikely: Circle().strokeBorder(c.opacity(0.7), lineWidth: 1)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

private struct HalfCircle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: rect.width / 2, startAngle: .degrees(90), endAngle: .degrees(270), clockwise: false)
        p.closeSubpath()
        return p
    }
}

// MARK: - Token chips

/// A placeholder token: IBM Plex Mono 12 / 600, redact fill, ink text, radius 6.
struct TokenChip: View {
    @Environment(\.theme) private var theme
    let id: String
    var size: CGFloat = 12
    /// Inside a document line: tighter padding so the line keeps its rhythm.
    var compact = false

    var body: some View {
        Text(verbatim: id)
            .font(Font(DesignFonts.uiFont(.mono, weight: 600, size: size)))
            .tracking(0.24)
            .foregroundStyle(theme.onRedact)
            .padding(.horizontal, compact ? 3 : 6)
            .padding(.vertical, compact ? 1 : 2)
            .background(RoundedRectangle(cornerRadius: 6).fill(theme.redact))
            .fixedSize()
    }
}

/// A masked value: a solid ink bar standing for something that stays (no value).
struct MaskBar: View {
    @Environment(\.theme) private var theme
    var width: CGFloat = 80
    var body: some View {
        RoundedRectangle(cornerRadius: 2).fill(theme.ink).frame(width: width, height: 14).accessibilityHidden(true)
    }
}

// MARK: - Counter

/// The counter: an empty ring at 0, a solid redact disc with an ink digit once anything left.
struct CounterDisc: View {
    @Environment(\.theme) private var theme
    let count: Int
    var size: CGFloat = 28

    var body: some View {
        // When something leaves, the ring fills to the redact disc from its centre and the number
        // rolls to the new count (both a cross-fade under Reduce Motion).
        Text(verbatim: String(count))
            .font(Font(DesignFonts.uiFont(.display, weight: 900, size: size * 0.58)))
            .foregroundStyle(count == 0 ? theme.ink : theme.onRedact)
            .contentTransition(Motion.reduceMotion ? .opacity : .numericText(value: Double(count)))
            .frame(width: size, height: size)
            .background {
                ZStack {
                    Circle().strokeBorder(theme.ink, lineWidth: 1.5).opacity(count == 0 ? 1 : 0)
                    Circle().fill(theme.redact)
                        .scaleEffect(count == 0 ? (Motion.reduceMotion ? 1 : 0.2) : 1)
                        .opacity(count == 0 ? 0 : 1)
                }
            }
            .animation(Motion.named(Motion.medium), value: count)
            .accessibilityHidden(true)
    }
}

// MARK: - Cards, rows and labels

/// A white card on the ground: radius 24 (20 for compact), a 1 px ink-8 % border, no shadow.
struct Card<Content: View>: View {
    @Environment(\.theme) private var theme
    var radius: CGFloat = 24
    var padding: CGFloat = 16
    var fill: Color? = nil
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: radius).fill(fill ?? theme.sheet))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(theme.cardBorder, lineWidth: 1))
    }
}

/// A list card: rows separated by hairlines, no inner padding.
struct ListCard<Content: View>: View {
    @Environment(\.theme) private var theme
    var radius: CGFloat = 24
    /// "Choose an answer": a dashed ink outline on the card's own shape (drawn outside the clip, so
    /// the rounded corners never cut it).
    var attention = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: radius).fill(theme.sheet))
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .strokeBorder(attention ? theme.ink : theme.cardBorder,
                                  style: StrokeStyle(lineWidth: attention ? 1.5 : 1, dash: attention ? [5, 4] : []))
            )
            .animation(Motion.named(Motion.short), value: attention)
    }
}

/// A hairline between rows, inset from the leading edge.
struct RowDivider: View {
    @Environment(\.theme) private var theme
    var inset: CGFloat = 16
    var body: some View { Rectangle().fill(theme.line.opacity(0.7)).frame(height: 0.5).padding(.leading, inset) }
}

/// A list row: an optional leading view, a title (15 / 600 or 17 regular) with a subtitle, an optional
/// trailing view and a chevron. At accessibility sizes the trailing view stacks under the text.
struct ListRow<Leading: View, Trailing: View>: View {
    @Environment(\.theme) private var theme
    @Environment(\.dynamicTypeSize) private var dynamicType
    let title: String
    var subtitle: String? = nil
    var chevron = true
    var dimmed = false
    var titleSize: CGFloat = 17
    var titleWeight: Font.Weight = .regular
    @ViewBuilder let leading: Leading
    @ViewBuilder let trailing: Trailing

    var body: some View {
        let layout = dynamicType.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
        HStack(spacing: 12) {
            leading
            layout {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).sfFont(titleSize, weight: titleWeight).foregroundStyle(dimmed ? theme.note : theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if let subtitle {
                        Text(subtitle).sfFont(13).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                trailing
            }
            if chevron {
                Image(systemName: "chevron.right").sfFont(14, weight: .semibold).foregroundStyle(theme.icon).accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }
}

extension ListRow where Leading == EmptyView, Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, chevron: Bool = true, dimmed: Bool = false, titleSize: CGFloat = 17, titleWeight: Font.Weight = .regular) {
        self.init(title: title, subtitle: subtitle, chevron: chevron, dimmed: dimmed, titleSize: titleSize, titleWeight: titleWeight,
                  leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

extension ListRow where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil, chevron: Bool = true, dimmed: Bool = false, titleSize: CGFloat = 17, titleWeight: Font.Weight = .regular,
         @ViewBuilder leading: () -> Leading) {
        self.init(title: title, subtitle: subtitle, chevron: chevron, dimmed: dimmed, titleSize: titleSize, titleWeight: titleWeight,
                  leading: leading, trailing: { EmptyView() })
    }
}

/// An icon tile: a raised square (radius 12) with an SF Symbol, or ink with a white symbol.
struct IconTile: View {
    @Environment(\.theme) private var theme
    let systemImage: String
    var ink = false
    var size: CGFloat = 36

    var body: some View {
        Image(systemName: systemImage).sfFont(size * 0.45, weight: .semibold)
            .foregroundStyle(ink ? theme.color("onPrimary") : theme.ink)
            .frame(width: size, height: size)
            .background(RoundedRectangle(cornerRadius: size * 0.3).fill(ink ? theme.color("primary") : theme.raised))
            .accessibilityHidden(true)
    }
}

/// A section label above a card ("Worth checking", "Ask next"): 22 / 700 or 13 / 600 note.
struct SectionLabel: View {
    @Environment(\.theme) private var theme
    let text: String
    var large = true

    var body: some View {
        Text(text)
            .sfFont(large ? 22 : 13, weight: large ? .bold : .semibold)
            .foregroundStyle(large ? theme.ink : theme.note)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A plain paragraph in note grey (help under a section).
struct NoteText: View {
    @Environment(\.theme) private var theme
    let text: String
    var size: CGFloat = 13

    var body: some View {
        Text(text).sfFont(size).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// An ink-outlined notice card (unreliable reading, App Check failure, offline) with optional actions.
struct NoticeCard<Actions: View>: View {
    @Environment(\.theme) private var theme
    let text: String
    var systemImage = "exclamationmark.circle"
    @ViewBuilder let actions: Actions

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: systemImage).sfFont(15, weight: .semibold).accessibilityHidden(true)
                Text(text).sfFont(15).fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(theme.ink)
            actions
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20).fill(theme.sheet))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(theme.ink, lineWidth: 1.5))
    }
}

extension NoticeCard where Actions == EmptyView {
    init(text: String, systemImage: String = "exclamationmark.circle") {
        self.init(text: text, systemImage: systemImage) { EmptyView() }
    }
}

// MARK: - Segmented control

/// A two-way segmented control: a track-grey capsule; the selected segment is white with an 8 % border.
struct Segmented<Value: Hashable>: View {
    @Environment(\.theme) private var theme
    let options: [(value: Value, label: String, id: String)]
    @Binding var selection: Value
    var dotFor: Value? = nil
    @Environment(\.dynamicTypeSize) private var dynamicType
    @Namespace private var slide

    var body: some View {
        // Side by side while every label fits on one line whole; otherwise (a long language, a small
        // iPhone, accessibility sizes) the options stack. A label never breaks inside a word.
        if dynamicType.isAccessibilitySize {
            control(stacked: true)
        } else {
            ViewThatFits(in: .horizontal) {
                control(stacked: false)
                control(stacked: true)
            }
        }
    }

    private func control(stacked: Bool) -> some View {
        let shape = stacked ? AnyShape(RoundedRectangle(cornerRadius: 18)) : AnyShape(Capsule())
        return (stacked ? AnyLayout(VStackLayout(spacing: 0)) : AnyLayout(HStackLayout(spacing: 0))) {
            ForEach(options, id: \.value) { option in
                let on = option.value == selection
                Button { withMotion(Motion.reveal) { selection = option.value } } label: {
                    HStack(spacing: 6) {
                        if dotFor == option.value { Circle().fill(theme.redact).frame(width: 6, height: 6) }
                        Text(option.label).sfFont(13, weight: on ? .semibold : .medium)
                            .lineLimit(stacked ? nil : 1)
                            .fixedSize(horizontal: !stacked, vertical: stacked)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundStyle(theme.ink)
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .padding(.horizontal, 6)
                    .background {
                        // The selected segment slides to the new choice (a fade under Reduce Motion).
                        if on {
                            Group {
                                if stacked {
                                    RoundedRectangle(cornerRadius: 16).fill(theme.sheet).overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(theme.cardBorder, lineWidth: 1))
                                } else {
                                    Capsule().fill(theme.sheet).overlay(Capsule().strokeBorder(theme.cardBorder, lineWidth: 1))
                                }
                            }
                            .matchedGeometryEffect(id: Motion.reduceMotion ? AnyHashable(option.value) : AnyHashable("selected"), in: slide)
                        }
                    }
                    .contentShape(shape)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? [.isSelected] : [])
                .accessibilityIdentifier(option.id)
            }
        }
        .padding(3)
        .background(shape.fill(theme.track))
        .frame(minHeight: 44)
        .sensoryFeedback(Haptic.selection, trigger: selection)
    }
}

// MARK: - Spinner line

/// A note line with a small ink spinner (reading stages, read-ahead, loading answers).
struct SpinnerLine: View {
    @Environment(\.theme) private var theme
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small).tint(theme.ink)
            // A new stage cross-fades in; the line never jumps.
            Text(text).sfFont(15).foregroundStyle(theme.note).fixedSize(horizontal: false, vertical: true)
                .contentTransition(.opacity)
                .animation(Motion.named(Motion.fade), value: text)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Layout helpers

/// A screen's scrolling content on the ground, with a 16 pt gutter.
struct GroundScroll<Content: View>: View {
    @Environment(\.theme) private var theme
    var spacing: CGFloat = 16
    @ViewBuilder let content: Content

    var body: some View {
        RevealingScroll {
            VStack(alignment: .leading, spacing: spacing) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 24)
        }
        .background(theme.ground.ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
    }
}

extension View {
    /// The content gutter (16 pt).
    func gutter() -> some View { padding(.horizontal, 16) }

    /// A screen that starts with a hero: the hero colour runs under the status bar (and shows when the
    /// page is pulled down), the ground below; the navigation bar is hidden (the hero draws its own
    /// glass buttons and the edge swipe still goes back).
    func heroScreen(_ theme: Theme) -> some View {
        modifier(HeroScreen(theme: theme))
    }
}

/// Once the hero has scrolled away, content never runs under the status bar: a ground-coloured band
/// fades in behind it (none while the ink hero is still there).
private struct HeroScreen: ViewModifier {
    let theme: Theme
    @State private var scrolledPast = false

    func body(content: Content) -> some View {
        content
            .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 120 } action: { _, past in
                withMotion(Motion.fade) { scrolledPast = past }
            }
            .overlay(alignment: .top) {
                // A zero-height line at the top of the safe area whose background reaches up under
                // the status bar, and only there.
                Color.clear
                    .frame(maxWidth: .infinity)
                    .frame(height: 0)
                    .background { theme.ground.ignoresSafeArea(edges: .top).opacity(scrolledPast ? 1 : 0) }
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            .background(theme.ground.ignoresSafeArea())
            .toolbarVisibility(.hidden, for: .navigationBar)
    }
}

// MARK: - Layout and motion

/// Snapshot capture turns animations off (end states only).
enum MotionSwitch {
    nonisolated(unsafe) static var off = false
}

/// Pieces side by side, wrapping to the next line when they do not fit (chips, pills).
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal offered: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = offered.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0 && x + size.width > width { y += line + lineSpacing; x = 0; line = 0 }
            x += size.width + spacing
            line = max(line, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: width.isFinite ? width : widest, height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal offered: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX && x + size.width > bounds.maxX { y += line + lineSpacing; x = bounds.minX; line = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: min(size.width, bounds.width), height: size.height))
            x += size.width + spacing
            line = max(line, size.height)
        }
    }
}
