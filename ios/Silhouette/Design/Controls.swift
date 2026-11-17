// Controls of the design: the main action in the block, the pink Send button, outline and secondary
// buttons, text links, chips, the back link, option tiles and rows, the income grid, the counter,
// the text field and the "On this phone / What could leave" toggle. Every target is at least 44 pt;
// disabled controls are dashed, not faded.

import SilhouetteCore
import SilhouetteKit
import SwiftUI

/// Under 700 pt tall: smaller tiles, question number and action (tokens size.compact).
private struct CompactHeightKey: EnvironmentKey { static let defaultValue = false }

extension EnvironmentValues {
    var compactHeight: Bool {
        get { self[CompactHeightKey.self] }
        set { self[CompactHeightKey.self] = newValue }
    }
}

// MARK: - Main action

/// The screen's one main action, in the block: 62 high, radius 22, ground fill with ink text, the
/// label in Darker Grotesque 30 (steps down, then wraps), ending in a 44 pt circle with an arrow.
struct BlockActionStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.compactHeight) private var compact
    var arrow = true
    var centered = false

    func makeBody(configuration: Configuration) -> some View {
        let r = theme.radius("action")
        let height = compact ? CGFloat(theme.tokens.number("size.compact.actionHeight") ?? 54) : theme.size("actionHeight")
        HStack(spacing: 10) {
            configuration.label
                .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
            if arrow {
                Image(systemName: "arrow.right")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(isEnabled ? theme.onBlock : theme.onBlock)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(isEnabled ? theme.block : .clear))
                    .overlay { if !isEnabled { Circle().strokeBorder(theme.onBlock, style: StrokeStyle(lineWidth: theme.border, dash: [4, 3])) } }
                    .accessibilityHidden(true)
            }
        }
        .padding(.leading, centered ? 9 : 18)
        .padding(.trailing, 9)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, minHeight: height)
        .foregroundStyle(isEnabled ? theme.ink : theme.onBlock)
        .background {
            if isEnabled {
                RoundedRectangle(cornerRadius: r).fill(theme.ground)
            } else {
                RoundedRectangle(cornerRadius: r).strokeBorder(theme.onBlock, style: StrokeStyle(lineWidth: theme.border, dash: [5, 4]))
            }
        }
        .contentShape(RoundedRectangle(cornerRadius: r))
        .scaleEffect(configuration.isPressed ? 0.97 : 1)
        .opacity(configuration.isPressed ? 0.9 : 1)
        .animation(.easeOut(duration: theme.duration("press")), value: configuration.isPressed)
    }
}

/// The main action button: label in display type, with an accessibility identifier.
struct BlockAction: View {
    @Environment(\.theme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    let label: String
    var id: String? = nil
    var arrow = true
    var centered = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            DisplayLabel(text: label, role: .action, color: isEnabled ? theme.ink : theme.onBlock,
                         alignment: centered ? .center : .natural)
        }
        .buttonStyle(BlockActionStyle(arrow: arrow, centered: centered))
        .accessibilityLabel(label)
        .accessibilityIdentifier(id ?? "")
    }
}

/// Pink Send: 62 / 22, Darker Grotesque 32 with an up arrow; a ring where pink meets cream.
struct SendButton: View {
    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var scheme
    let label: String
    var id: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: "arrow.up").font(.system(size: 20, weight: .bold)).accessibilityHidden(true)
                DisplayLabel(text: label, role: .action, size: 32, color: theme.onLeave, alignment: .center)
                    .fixedSize(horizontal: true, vertical: false)
                    .layoutPriority(1)
            }
            .foregroundStyle(theme.onLeave)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: theme.size("actionHeight"))
            .background {
                RoundedRectangle(cornerRadius: theme.radius("action")).fill(theme.leave)
                if scheme == .dark {
                    RoundedRectangle(cornerRadius: theme.radius("action")).strokeBorder(theme.leaveFocus, lineWidth: theme.border)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: theme.radius("action")))
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel(label)
        .accessibilityIdentifier(id ?? "")
    }
}

/// Pressed: scale .97.
struct PressStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: theme.duration("press")), value: configuration.isPressed)
    }
}

// MARK: - Outline, secondary, link, chip

/// Outline: 1.5 pt in the current ink, 15/700, two lines allowed. `large` is 62 / 22, otherwise 44 / 14.
struct OutlineStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    @Environment(\.isEnabled) private var isEnabled
    var large = false
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        let r = large ? theme.radius("action") : theme.radius("control")
        let ink = theme.ink(on: surface)
        configuration.label
            .type(.button)
            .multilineTextAlignment(.center)
            .foregroundStyle(ink)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: large ? theme.size("actionHeight") : theme.minTapTarget)
            .overlay(RoundedRectangle(cornerRadius: r).strokeBorder(ink, style: StrokeStyle(lineWidth: theme.border, dash: isEnabled ? [] : [5, 4])))
            .contentShape(RoundedRectangle(cornerRadius: r))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Secondary action in the block (46 / 16, ground fill, ink text), e.g. "Add a paystub".
struct SecondaryStyle: ButtonStyle {
    @Environment(\.theme) private var theme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .type(.button)
            .multilineTextAlignment(.center)
            .foregroundStyle(theme.ink)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(minHeight: max(46, theme.minTapTarget))
            .background(RoundedRectangle(cornerRadius: theme.radius("secondary")).fill(theme.ground))
            .contentShape(RoundedRectangle(cornerRadius: theme.radius("secondary")))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Text link: 44 high, 15/700, underlined.
struct TextLinkStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    var role: TypeRole = .button

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .type(role)
            .underline()
            .foregroundStyle(theme.ink(on: surface))
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(minHeight: theme.minTapTarget)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Chip (prepared questions): 44 high, radius 14, 1.5 pt outline, 14/700; asked = ink fill.
struct ChipStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    var selected = false

    func makeBody(configuration: Configuration) -> some View {
        let ink = theme.ink(on: surface)
        let r = theme.radius("control")
        configuration.label
            .type(.control)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(selected ? theme.ground : ink)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(minHeight: theme.minTapTarget)
            .background(RoundedRectangle(cornerRadius: r).fill(selected ? ink : .clear))
            .overlay(RoundedRectangle(cornerRadius: r).strokeBorder(ink, lineWidth: theme.border))
            .contentShape(RoundedRectangle(cornerRadius: r))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// "< Back" / "< Back to results": a 44 pt text button with a chevron.
struct BackLink: View {
    @Environment(\.theme) private var theme
    let label: String
    var id = "nav.back"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "chevron.left").font(.system(size: 14, weight: .bold)).accessibilityHidden(true)
                Text(label).type(.button)
            }
            .foregroundStyle(theme.ink)
            .frame(minHeight: theme.minTapTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .accessibilityIdentifier(id)
    }
}

/// A disclosure with a caret ("Show the request", "More values (11)").
struct Disclosure<Content: View>: View {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let label: String
    @Binding var open: Bool
    var id: String? = nil
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(theme.curve("standard", duration: "medium")) { open.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "triangle.fill")
                        .font(.system(size: 8))
                        .rotationEffect(.degrees(open ? 180 : 90))
                        .accessibilityHidden(true)
                    Text(label).type(.control).fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(theme.ink(on: surface))
                .frame(minHeight: theme.minTapTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(open ? "expanded" : "collapsed")
            .accessibilityIdentifier(id ?? "")
            if open { content }
        }
    }
}

// MARK: - Choice controls

/// The radio of the design: 24 pt circle; selected has a solid dot in the row's ink. (Pink is only
/// for what leaves the device, never for a selection.)
struct RadioMark: View {
    @Environment(\.theme) private var theme
    let selected: Bool
    let ink: Color
    var size: CGFloat = 24

    var body: some View {
        ZStack {
            Circle().strokeBorder(ink, lineWidth: theme.border)
            if selected { Circle().fill(ink).padding(size * 0.25) }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// The checkbox: 24 pt square, radius 6; selected is filled with the row's ink and checked.
struct CheckMark: View {
    @Environment(\.theme) private var theme
    let selected: Bool
    let ink: Color
    /// The colour of the check: the row's fill.
    var mark: Color? = nil

    var body: some View {
        ZStack {
            if selected {
                RoundedRectangle(cornerRadius: 6).fill(ink)
                Image(systemName: "checkmark").font(.system(size: 13, weight: .heavy)).foregroundStyle(mark ?? theme.block)
            } else {
                RoundedRectangle(cornerRadius: 6).strokeBorder(ink, lineWidth: theme.border)
            }
        }
        .frame(width: 24, height: 24)
        .accessibilityHidden(true)
    }
}

/// Yes / no tile: 128 high (80 under 700 pt), radius 22, the word in Darker Grotesque 60.
struct OptionTile: View {
    @Environment(\.theme) private var theme
    @Environment(\.compactHeight) private var compact
    let word: String
    let selected: Bool
    var error = false
    let action: () -> Void

    var body: some View {
        let ink = selected ? theme.onBlock : theme.ink
        let r = theme.radius("tile")
        let height = compact ? CGFloat(theme.tokens.number("size.compact.optionTileHeight") ?? 80) : theme.size("optionTileHeight")
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                DisplayLabel(text: word, role: .optionWord, size: compact ? 44 : 60, maxLines: 2, color: ink)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                    .padding(.trailing, 4)
                RadioMark(selected: selected, ink: ink)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: height)
            .background(RoundedRectangle(cornerRadius: r).fill(selected ? theme.block : .clear))
            .overlay(RoundedRectangle(cornerRadius: r).strokeBorder(theme.ink, style: StrokeStyle(lineWidth: theme.border, dash: error ? [5, 4] : [])))
            .contentShape(RoundedRectangle(cornerRadius: r))
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel(word)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// Radio and checkbox rows: min 56, radius 18, the label in Darker Grotesque 30; selected = block fill.
/// "None of these" is dashed.
struct OptionRow<Extra: View>: View {
    @Environment(\.theme) private var theme
    let label: String
    let selected: Bool
    var multiple = false
    var dashed = false
    var error = false
    /// The identifier of the row's button.
    var id = ""
    let action: () -> Void
    @ViewBuilder var extra: Extra

    var body: some View {
        let ink = selected ? theme.onBlock : theme.ink
        let r = theme.radius("option")
        VStack(alignment: .leading, spacing: 10) {
            Button(action: action) {
                HStack(alignment: .center, spacing: 12) {
                    DisplayLabel(text: label, role: .optionWord, maxLines: 3, color: ink, singleLineFirst: false)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if multiple { CheckMark(selected: selected, ink: ink) } else { RadioMark(selected: selected, ink: ink) }
                }
                .padding(.vertical, 8)
                .frame(minHeight: theme.size("optionRowHeight") - 16)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())
            .accessibilityLabel(label)
            .accessibilityAddTraits(selected ? [.isSelected] : [])
            .accessibilityIdentifier(id)
            extra.environment(\.surface, selected ? .block : .ground)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: r).fill(selected ? theme.block : .clear))
        .overlay(RoundedRectangle(cornerRadius: r)
            .strokeBorder(theme.ink, style: StrokeStyle(lineWidth: theme.border, dash: dashed || error ? [5, 4] : [])))
        .accessibilityElement(children: .contain)
    }
}

extension OptionRow where Extra == EmptyView {
    init(label: String, selected: Bool, multiple: Bool = false, dashed: Bool = false, error: Bool = false, id: String = "",
         action: @escaping () -> Void) {
        self.init(label: label, selected: selected, multiple: multiple, dashed: dashed, error: error, id: id, action: action) { EmptyView() }
    }
}

/// An income range in the two-column grid: 48 high, 14 pt bold label, 20 pt radio.
struct IncomeCell: View {
    @Environment(\.theme) private var theme
    let label: String
    let selected: Bool
    var error = false
    let action: () -> Void

    var body: some View {
        let ink = selected ? theme.onBlock : theme.ink
        let r = theme.radius("option")
        Button(action: action) {
            HStack(spacing: 8) {
                Text(label).type(.control).foregroundStyle(ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                RadioMark(selected: selected, ink: ink, size: 20)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(RoundedRectangle(cornerRadius: r).fill(selected ? theme.block : .clear))
            .overlay(RoundedRectangle(cornerRadius: r).strokeBorder(theme.ink, style: StrokeStyle(lineWidth: theme.border, dash: error ? [5, 4] : [])))
            .contentShape(RoundedRectangle(cornerRadius: r))
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

// MARK: - Text field

/// 56 high, radius 16, 1.5 pt border in the current ink, the value in DM Mono 20.
struct FieldStyle: ViewModifier {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    var error = false
    var mono = true

    func body(content: Content) -> some View {
        let ink = theme.ink(on: surface)
        content
            .type(mono ? .monoDocument : .body, size: mono ? 20 : nil)
            .foregroundStyle(ink)
            .tint(ink)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .frame(minHeight: 56)
            .overlay(RoundedRectangle(cornerRadius: 16)
                .strokeBorder(ink, style: StrokeStyle(lineWidth: theme.border, dash: error ? [5, 4] : [])))
    }
}

extension View {
    func fieldStyle(error: Bool = false, mono: Bool = true) -> some View { modifier(FieldStyle(error: error, mono: mono)) }
}

// MARK: - Toggle

/// "On this phone / What could leave": card track (radius 18, padding 4), two 44 pt segments.
struct LeaveToggle: View {
    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var scheme
    let phoneLabel: String
    let leaveLabel: String
    @Binding var leave: Bool

    var body: some View {
        HStack(spacing: 4) {
            segment(phoneLabel, selected: !leave) { leave = false }
                .accessibilityIdentifier("preview.mode.phone")
            segment(leaveLabel, selected: leave, pink: true) { leave = true }
                .accessibilityIdentifier("preview.mode.leave")
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: theme.radius("toggleTrack")).fill(theme.card))
        .accessibilityElement(children: .contain)
    }

    private func segment(_ label: String, selected: Bool, pink: Bool = false, action: @escaping () -> Void) -> some View {
        let r = theme.radius("toggleThumb")
        let fill: Color = selected ? (pink ? theme.leave : theme.block) : .clear
        let ink: Color = selected ? (pink ? theme.onLeave : theme.onBlock) : theme.ink
        return Button(action: action) {
            Text(label)
                .type(.button)
                .foregroundStyle(ink)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)
                .frame(maxWidth: .infinity, minHeight: theme.minTapTarget)
                .background {
                    RoundedRectangle(cornerRadius: r).fill(fill)
                    if selected && pink && scheme == .light {
                        RoundedRectangle(cornerRadius: r).strokeBorder(theme.leaveFocus, lineWidth: theme.border)
                    }
                }
                .contentShape(RoundedRectangle(cornerRadius: r))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

// MARK: - Flow layout

/// Lays children out in rows, wrapping (chips, document tokens).
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
