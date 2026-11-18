// The motion system: a few named animations from the motion tokens (durations and the standard and
// fade curves), the transitions built from them, and the rule for Reduce Motion: movement becomes a
// cross-fade, nothing waits on an animation. Haptics are named here too, so each one means one thing.

import SwiftUI
import UIKit

@MainActor
enum Motion {
    /// Press feedback (`press`, 150 ms, standard curve).
    static let press = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.15)
    /// A state change in place: selection, a ready primary, a stage name (`short`, 150 ms).
    static let short = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.15)
    /// Something opening or arriving, and the scroll that brings it into view (`duration.reveal`, 250 ms).
    static let reveal = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.25)
    /// Leaving is faster than arriving: a disclosure closing (`duration.exit`, 180 ms).
    static let exit = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.18)
    /// The privacy counter and the progress bar (`medium`, 450 ms).
    static let medium = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.45)
    /// A cross-fade (`fade` curve, 150 ms): what every movement becomes under Reduce Motion.
    static let fade = Animation.timingCurve(0.25, 0.1, 0.25, 1, duration: 0.15)
    /// The gap between items that arrive one after another (`delay.stagger`, 40 ms), capped at 8.
    static let stagger = 0.04
    static let staggerCap = 8

    static var reduceMotion: Bool { UIAccessibility.isReduceMotionEnabled }

    /// The animation to use: the named one, or a cross-fade under Reduce Motion; none in snapshots.
    static func named(_ animation: Animation) -> Animation? {
        if MotionSwitch.off { return nil }
        return reduceMotion ? fade : animation
    }

    /// The delay before the n-th item of a staggered arrival (none under Reduce Motion).
    static func staggered(_ animation: Animation, index: Int) -> Animation? {
        guard let base = named(animation) else { return nil }
        return reduceMotion ? base : base.delay(Double(min(index, staggerCap)) * stagger)
    }

    /// Inserting revealed content: height and opacity together, a short rise; a fade under Reduce Motion.
    static var revealTransition: AnyTransition {
        reduceMotion ? .opacity : .opacity.combined(with: .offset(y: -6))
    }
}

/// Runs `body` with a named animation (a cross-fade under Reduce Motion).
@MainActor
func withMotion<Result>(_ animation: Animation, _ body: () throws -> Result) rethrows -> Result {
    try withAnimation(Motion.named(animation), body)
}

// MARK: - Bringing what opens into view

/// What a revealed view needs from its scroll view: the proxy, and the band of the viewport that is
/// really visible (inside the bars, the pill, a pinned action and the keyboard).
struct RevealContext {
    let proxy: ScrollViewProxy
    let top: CGFloat
    let bottom: CGFloat
}

private struct RevealContextKey: EnvironmentKey {
    static var defaultValue: RevealContext? { nil }
}

extension EnvironmentValues {
    var reveal: RevealContext? {
        get { self[RevealContextKey.self] }
        set { self[RevealContextKey.self] = newValue }
    }
}

/// A vertical scroll view that hands its proxy and its visible band to its content, so a disclosure,
/// a hint or the result of an action can bring itself into view.
struct RevealingScroll<Content: View>: View {
    @ViewBuilder let content: Content
    @State private var band: (top: CGFloat, bottom: CGFloat) = (0, .infinity)

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                content.environment(\.reveal, RevealContext(proxy: proxy, top: band.top, bottom: band.bottom))
            }
            // The insets include the bars, the pill's margin, a pinned action and the keyboard.
            .onScrollGeometryChange(for: [CGFloat].self) { g in
                [g.contentInsets.top, g.containerSize.height - g.contentInsets.bottom]
            } action: { _, b in band = (b[0], b[1]) }
        }
    }
}

/// On what a disclosure inserts, a hint, or the result of an action: once it is there, if it is not
/// fully inside the visible band, scroll just enough to show all of it (or its start, when it is
/// taller than the band), timed with the reveal. Content already in view does not move.
struct RevealIntoView<Trigger: Equatable>: ViewModifier {
    @Environment(\.reveal) private var reveal
    let trigger: Trigger
    @State private var id = UUID()
    @State private var frame: CGRect = .zero

    func body(content: Content) -> some View {
        content
            .id(id)
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .scrollView(axis: .vertical)) } action: { frame = $0 }
            .task(id: trigger) {
                try? await Task.sleep(for: .milliseconds(MotionSwitch.off ? 0 : 280))
                guard let reveal else { return }
                let top = reveal.top + 4, bottom = reveal.bottom - 4
                let tall = frame.height > bottom - top
                guard tall || frame.maxY > bottom || frame.minY < top else { return }
                withMotion(Motion.reveal) { reveal.proxy.scrollTo(id, anchor: tall || frame.minY < top ? .top : .bottom) }
            }
    }
}

extension View {
    /// Brings this (newly revealed) view fully into view.
    func revealsIntoView() -> some View { modifier(RevealIntoView(trigger: 0)) }
    /// The same each time `trigger` changes (a hint shown again).
    func revealsIntoView<T: Equatable>(trigger: T) -> some View { modifier(RevealIntoView(trigger: trigger)) }
}

// MARK: - Pinned actions

private struct PinsActionsKey: EnvironmentKey {
    static var defaultValue: Bool { true }
}

extension EnvironmentValues {
    /// Whether a screen may pin its primary action above the bars. Not on a short iPhone and not at
    /// accessibility text sizes: there a pinned action would cover the content, what just opened or
    /// the result of an action, so it goes back into the content.
    var pinsActions: Bool {
        get { self[PinsActionsKey.self] }
        set { self[PinsActionsKey.self] = newValue }
    }
}

// MARK: - First arrival

/// Items that rise in one after another the first time they are shown, never again (results).
@MainActor
private enum Arrivals { static var seen: Set<String> = [] }

private struct ArriveOnce: ViewModifier {
    let key: String
    let index: Int
    @State private var shown: Bool

    init(key: String, index: Int) {
        self.key = key
        self.index = index
        _shown = State(initialValue: MotionSwitch.off || Arrivals.seen.contains(key))
    }

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || Motion.reduceMotion ? 0 : 8)
            .onAppear {
                guard !shown else { return }
                Arrivals.seen.insert(key)
                withAnimation(Motion.staggered(Motion.medium, index: index)) { shown = true }
            }
    }
}

extension View {
    /// Rises in with a short stagger the first time it appears in this run of the app.
    func arrivesOnce(_ key: String, index: Int) -> some View { modifier(ArriveOnce(key: key, index: index)) }
}

// MARK: - A thing that becomes the next screen

private struct ZoomSpaceKey: EnvironmentKey {
    static var defaultValue: Namespace.ID? { nil }
}

extension EnvironmentValues {
    /// The namespace in which a card and the page it opens are matched (the system zoom transition).
    var zoomSpace: Namespace.ID? {
        get { self[ZoomSpaceKey.self] }
        set { self[ZoomSpaceKey.self] = newValue }
    }
}

private struct ZoomSource: ViewModifier {
    @Environment(\.zoomSpace) private var space
    let id: String
    func body(content: Content) -> some View {
        if let space { content.matchedTransitionSource(id: id, in: space) } else { content }
    }
}

private struct ZoomDestination: ViewModifier {
    @Environment(\.zoomSpace) private var space
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let id: String
    func body(content: Content) -> some View {
        // Under Reduce Motion (and in snapshots) the standard push.
        if let space, !reduceMotion, !MotionSwitch.off {
            content.navigationTransition(.zoom(sourceID: id, in: space))
        } else {
            content
        }
    }
}

extension View {
    /// A card that visibly becomes the page it opens.
    func zoomSource(_ id: String) -> some View { modifier(ZoomSource(id: id)) }
    /// The page a card zooms into.
    func zoomDestination(_ id: String) -> some View { modifier(ZoomDestination(id: id)) }
}

// MARK: - Haptics

/// The moments that get a haptic, and only these.
enum Haptic {
    /// An answer chosen, a counter step, a segment switched.
    static let selection = SensoryFeedback.selection
    /// A value confirmed in the review.
    static let confirm = SensoryFeedback.impact(flexibility: .soft, intensity: 0.7)
    /// Something left the device (the counter went up): once per request.
    static let sent = SensoryFeedback.success
    /// A hint that something needs attention.
    static let error = SensoryFeedback.error
}
