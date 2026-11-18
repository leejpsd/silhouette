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
    /// A disclosure opening or closing, and the scroll that brings it into view (`reveal`, 250 ms).
    static let reveal = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.25)
    /// The privacy counter and the progress bar (`medium`, 450 ms).
    static let medium = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.45)
    /// A cross-fade (`fade` curve, 150 ms): what every movement becomes under Reduce Motion.
    static let fade = Animation.timingCurve(0.25, 0.1, 0.25, 1, duration: 0.15)
    /// The gap between items that arrive one after another (`tokenStagger`, 60 ms), capped.
    static let stagger = 0.06
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

/// The scroll view's proxy, for content that reveals more and must bring it into view.
private struct RevealProxyKey: EnvironmentKey {
    static var defaultValue: ScrollViewProxy? { nil }
}

extension EnvironmentValues {
    var revealProxy: ScrollViewProxy? {
        get { self[RevealProxyKey.self] }
        set { self[RevealProxyKey.self] = newValue }
    }
}

/// A vertical scroll view that hands its proxy to its content, so a disclosure can bring what it
/// opened into view.
struct RevealingScroll<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                content.environment(\.revealProxy, proxy)
            }
        }
    }
}

/// On the content a disclosure inserts: once it has opened, if it is not fully in view (clear of the
/// pill, the tab bar and the keyboard), scroll just enough to show it, timed with the reveal.
struct RevealIntoView: ViewModifier {
    @Environment(\.revealProxy) private var proxy
    @State private var id = UUID()
    @State private var fullyVisible = false
    @State private var height: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .id(id)
            .onScrollVisibilityChange(threshold: 0.98) { fullyVisible = $0 }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
            .task {
                try? await Task.sleep(for: .milliseconds(MotionSwitch.off ? 0 : 280))
                guard !fullyVisible, let proxy else { return }
                // Taller than about half the screen: show where it starts; otherwise all of it.
                let tall = height > UIScreen.main.bounds.height * 0.5
                withMotion(Motion.reveal) { proxy.scrollTo(id, anchor: tall ? .top : .bottom) }
            }
    }
}

extension View {
    /// Brings this (newly revealed) view fully into view.
    func revealsIntoView() -> some View { modifier(RevealIntoView()) }
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
