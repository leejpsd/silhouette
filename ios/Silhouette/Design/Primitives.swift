// The parts every screen shares: what a piece of UI sits on (ground, the block, paper), verdict
// markers by shape, criterion icons, paper slips, placeholder bars, the stamped count, dotted fills,
// dashed notes, the loading lines, the grain, and the motion of the design.

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UIKit

// MARK: - Surface

/// What a control sits on. Ink, rings and fills follow it.
enum Surface { case ground, block, paper }

private struct SurfaceKey: EnvironmentKey { static let defaultValue = Surface.ground }

extension EnvironmentValues {
    var surface: Surface {
        get { self[SurfaceKey.self] }
        set { self[SurfaceKey.self] = newValue }
    }
}

extension Theme {
    func ink(on surface: Surface) -> Color {
        switch surface {
        case .ground: ink
        case .block: onBlock
        case .paper: onPaper
        }
    }

    func muted(on surface: Surface) -> Color {
        switch surface {
        case .ground: inkMuted
        case .block: onBlockMuted
        case .paper: onPaperMuted
        }
    }

    func hairline(on surface: Surface) -> Color { surface == .block ? blockLine : line }
}

// MARK: - Verdict markers

enum MarkerKind: Equatable {
    case verdict(Verdict)
    /// Before any answer: dots only ("not yet").
    case unanswered
    /// Sending or writing: the dots march.
    case loading
}

/// 20 × 10, radius 2: solid = may qualify, dotted = possible, dashed = depends on a skipped answer,
/// hollow = probably not. Always followed by its text; hidden from VoiceOver.
struct Marker: View {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let kind: MarkerKind

    var body: some View {
        let size = theme.tokens.numbers("size.marker")
        let w = CGFloat(size.first ?? 20), h = CGFloat(size.dropFirst().first ?? 10)
        let r = theme.radius("marker"), lw = theme.border
        let color = theme.ink(on: surface)
        let shape = RoundedRectangle(cornerRadius: r)
        Group {
            switch kind {
            case .verdict(.likely): shape.fill(color)
            case .verdict(.maybe):
                ZStack { DotFill(color: color).clipShape(shape); shape.strokeBorder(color, lineWidth: lw) }
            case .verdict(.depends): shape.strokeBorder(color, style: StrokeStyle(lineWidth: lw, dash: [3, 2]))
            case .verdict(.unlikely): shape.strokeBorder(color, lineWidth: lw)
            case .unanswered: DotFill(color: color).clipShape(shape)
            case .loading: DotFill(color: color, marching: true).clipShape(shape)
            }
        }
        .frame(width: w, height: h)
        .accessibilityHidden(true)
    }
}

/// The dot grid that means "not yet" (tokens size.dotPattern); `marching` moves it (loading only).
struct DotFill: View {
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let color: Color
    var marching = false

    var body: some View {
        let pitch = CGFloat(theme.tokens.number("size.dotPattern") ?? 4)
        if marching && !reduceMotion {
            TimelineView(.animation) { context in
                let period = theme.duration("march")
                let phase = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
                dots(pitch: pitch, offset: CGFloat(phase) * pitch * 2)
            }
        } else {
            dots(pitch: pitch, offset: 0)
        }
    }

    private func dots(pitch: CGFloat, offset: CGFloat) -> some View {
        Canvas { context, size in
            let dot = pitch * 0.4
            var y = pitch / 2 - dot / 2
            while y < size.height {
                var x = -pitch * 2 + offset.truncatingRemainder(dividingBy: pitch) + pitch / 2 - dot / 2
                while x < size.width {
                    context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: dot, height: dot)), with: .color(color))
                    x += pitch
                }
                y += pitch
            }
        }
    }
}

// MARK: - Criterion state

/// Met = filled circle with a check; not met = x in a circle; depends on the exact income = minus in
/// a circle; needs a skipped answer = dashed circle.
struct StateIcon: View {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let state: CriterionState
    @ScaledMetric(relativeTo: .body) private var size: CGFloat = 18

    var body: some View {
        let color = theme.ink(on: surface)
        let lw = theme.border
        ZStack {
            switch state {
            case .pass:
                Circle().fill(color)
                Image(systemName: "checkmark").font(.system(size: size * 0.5, weight: .heavy)).foregroundStyle(background)
            case .fail:
                Circle().strokeBorder(color, lineWidth: lw)
                Image(systemName: "xmark").font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(color)
            case .mixed:
                Circle().strokeBorder(color, lineWidth: lw)
                Capsule().fill(color).frame(width: size * 0.5, height: lw)
            case .unknown:
                Circle().strokeBorder(color, style: StrokeStyle(lineWidth: lw, dash: [2.5, 2]))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var background: Color {
        switch surface {
        case .ground: theme.ground
        case .block: theme.block
        case .paper: theme.paper
        }
    }
}

// MARK: - Paper

enum PaperSize { case normal, large, small }

private struct PaperModifier: ViewModifier {
    @Environment(\.theme) private var theme
    let tilt: Angle
    let size: PaperSize
    var padded = true

    func body(content: Content) -> some View {
        let shadow = theme.shadow(size == .large ? "paperLarge" : size == .small ? "paperSmall" : "paper")
        let r = theme.radius("paper")
        content
            .environment(\.surface, .paper)
            .foregroundStyle(theme.onPaper)
            .padding(.vertical, padded ? 14 : 0)
            .padding(.horizontal, padded ? 12 : 0)
            .background {
                ZStack {
                    // CSS box-shadow with a negative spread: a smaller, offset, blurred copy.
                    RoundedRectangle(cornerRadius: r)
                        .fill(Theme.shadowColor.opacity(shadow.opacity))
                        .padding(-shadow.spread)
                        .offset(y: shadow.y)
                        .blur(radius: shadow.blur / 2)
                    RoundedRectangle(cornerRadius: r).fill(theme.paper)
                }
            }
            .rotationEffect(tilt)
    }
}

extension View {
    /// A paper slip: the person's data or what would be sent. Green ink on paper, slightly turned.
    func paper(tilt: Angle = .zero, size: PaperSize = .normal, padded: Bool = true) -> some View {
        modifier(PaperModifier(tilt: tilt, size: size, padded: padded))
    }
}

/// A label and a value on paper (labels 12 in onPaperMuted, values in DM Mono 12.5).
struct PaperField: View {
    @Environment(\.theme) private var theme
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).type(.caption, size: 12).foregroundStyle(theme.onPaperMuted)
            Text(value).type(.monoValue).foregroundStyle(theme.onPaper)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Placeholder bar

/// A bar over a hidden value: 20 high, pink, with its id in DM Mono 12/500. A word the person hid is
/// green with a cream id. VoiceOver reads "hidden word", "hidden number" or "hidden date".
struct PlaceholderBar: View {
    @Environment(\.theme) private var theme
    @Environment(AppModel.self) private var model
    let id: String
    var mine = false
    var width: CGFloat? = nil

    var body: some View {
        Text(id)
            .type(.placeholderId)
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(mine ? theme.onMine : theme.onLeave)
            .padding(.horizontal, 6)
            .frame(minWidth: width, minHeight: theme.size("bar"))
            .background(mine ? theme.mine : theme.leave, in: RoundedRectangle(cornerRadius: theme.radius("bar")))
            .accessibilityElement()
            .accessibilityLabel(model.t(Self.labelKey(id)))
    }

    static func labelKey(_ id: String) -> String {
        switch id.first {
        case "N": "placeholder.number"
        case "D": "placeholder.date"
        default: "placeholder.word"
        }
    }
}

// MARK: - Stamp

/// The count of what has left: plain at 0; a pink stamp at −8° (a pill from 10) that stamps in when
/// the count goes up. In the dark theme (cream block) the pink gets a ring.
struct CountStamp: View {
    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(AppModel.self) private var model
    let count: Int
    var compactHeight = false
    @State private var scale: CGFloat = 1

    var body: some View {
        if count == 0 {
            Text(verbatim: model.number(0))
                .type(.count)
                .foregroundStyle(theme.onBlock)
                .frame(minWidth: 26)
                .padding(.bottom, 4)
        } else {
            let d = theme.size("stamp")
            Text(verbatim: model.number(Double(count)))
                .type(.stampCount)
                .foregroundStyle(theme.onLeave)
                .padding(.horizontal, count >= 10 ? 10 : 0)
                .padding(.bottom, 3)
                .frame(minWidth: d, minHeight: d)
                .background {
                    Capsule().fill(theme.leave)
                    if scheme == .dark { Capsule().strokeBorder(theme.leaveFocus, lineWidth: theme.border) }
                }
                .rotationEffect(theme.rotation("stamp"))
                .scaleEffect(scale)
                .onAppear(perform: stampIfNew)
                .onChange(of: count) { stampIfNew() }
        }
    }

    private func stampIfNew() {
        guard count > model.stampedCount else { return }
        model.stampedCount = count
        guard !reduceMotion else { return }
        scale = 1.5
        withAnimation(theme.curve("stamp", duration: "stamp").delay(theme.delay("stamp"))) { scale = 1 }
    }
}

// MARK: - Notes

/// A dashed note: "not available" or "depends" in this design (offline, no device model).
struct DashedNote<Content: View>: View {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    @ViewBuilder let content: Content

    var body: some View {
        content
            .type(.help)
            .foregroundStyle(theme.ink(on: surface))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: theme.radius("control"))
                .strokeBorder(theme.ink(on: surface), style: StrokeStyle(lineWidth: theme.border, dash: [4, 3])))
    }
}

/// Three marching dotted lines and a sentence: an answer is being written.
struct LoadingLines: View {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(0..<3, id: \.self) { i in
                DotFill(color: theme.ink(on: surface), marching: true)
                    .frame(height: 6)
                    .frame(maxWidth: i == 2 ? 180 : .infinity)
            }
            Text(text).type(.label).foregroundStyle(theme.ink(on: surface)).padding(.top, 4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

/// A small display heading for sections (h2): Darker Grotesque 28.
struct SectionHeading: View {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let text: String

    var body: some View {
        Text(text)
            .type(.heading)
            .foregroundStyle(theme.ink(on: surface))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 2)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Body text in a role and colour, wrapping.
struct Para: View {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let text: String
    var role: TypeRole = .body
    var muted = false

    init(_ text: String, _ role: TypeRole = .body, muted: Bool = false) {
        self.text = text
        self.role = role
        self.muted = muted
    }

    var body: some View {
        Text(text)
            .type(role)
            .foregroundStyle(muted ? theme.muted(on: surface) : theme.ink(on: surface))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A marker followed by its verdict text (13/700).
struct MarkerLine: View {
    @Environment(\.theme) private var theme
    @Environment(\.surface) private var surface
    let kind: MarkerKind
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Marker(kind: kind)
            Text(text).type(.label).foregroundStyle(theme.ink(on: surface)).fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Grain

/// Film grain over the whole screen: a 256 px noise tile at 10 %, overlay in dark and multiply in light.
/// Skipped under Reduce Transparency.
struct GrainOverlay: View {
    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        if !reduceTransparency, let tile = Self.tile {
            Image(decorative: tile, scale: 2)
                .resizable(resizingMode: .tile)
                .opacity(theme.tokens.number("grain.opacity") ?? 0.1)
                .blendMode(scheme == .dark ? .overlay : .multiply)
                .ignoresSafeArea()
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    /// Two octaves of value noise at a high base frequency (tokens grain), generated once.
    static let tile: CGImage? = {
        let n = 256
        var rng = SystemRandomNumberGenerator()
        func lattice(_ cells: Int) -> [Double] { (0..<(cells * cells)).map { _ in Double.random(in: 0...1, using: &rng) } }
        let fine = lattice(n), coarse = lattice(n / 2)
        var pixels = [UInt8](repeating: 0, count: n * n * 4)
        for y in 0..<n {
            for x in 0..<n {
                let a = fine[y * n + x]
                let b = coarse[(y / 2) * (n / 2) + x / 2]
                let v = UInt8(max(0, min(255, (a * 0.65 + b * 0.35) * 255)))
                let i = (y * n + x) * 4
                pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v; pixels[i + 3] = 230
            }
        }
        let provider = CGDataProvider(data: Data(pixels) as CFData)
        return provider.flatMap {
            CGImage(width: n, height: n, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: n * 4,
                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
                    provider: $0, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
        }
    }()
}

// MARK: - Motion

enum Motion { case rise, wipe, pop }

private struct AppearMotion: ViewModifier {
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let motion: Motion
    let delay: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let on = shown || reduceMotion
        Group {
            switch motion {
            case .rise: content.offset(y: on ? 0 : 14).opacity(on ? 1 : 0)
            case .wipe: content.scaleEffect(x: on ? 1 : 0.15, y: 1, anchor: .leading)
            case .pop: content.scaleEffect(on ? 1 : 0.9, anchor: .bottomLeading).opacity(on ? 1 : 0)
            }
        }
        .onAppear {
            guard !shown, !reduceMotion else { return }
            let animation: Animation = switch motion {
            case .rise: theme.curve("standard", duration: "rise")
            case .wipe: theme.curve("standard", duration: "wipe")
            case .pop: theme.curve("overshoot", duration: "pop").delay(theme.delay("pop"))
            }
            withAnimation(animation.delay(delay)) { shown = true }
        }
    }
}

extension View {
    /// Rise (translateY 14 → 0), wipe (scaleX .15 → 1 from the leading edge) or pop (scale .9 → 1).
    /// Shows the end state under Reduce Motion.
    func appear(_ motion: Motion, delay: Double = 0) -> some View {
        modifier(AppearMotion(motion: motion, delay: delay))
    }
}
