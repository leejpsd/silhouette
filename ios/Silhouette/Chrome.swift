// The app's frame: three tabs (Check, Results, Paystub) in the system's floating
// Liquid Glass tab bar, the privacy pill above it on every screen (the tab view's bottom accessory),
// each tab with its own navigation stack, and the sheets over them.

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UIKit

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Namespace private var zoom
    @Environment(\.dynamicTypeSize) private var dynamicType
    @State private var windowHeight: CGFloat = 874

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab(model.t("tab.check"), systemImage: "list.bullet.clipboard", value: AppTab.check) {
                NavigationStack(path: $model.checkPath) {
                    StartScreen().destinations()
                }
            }
            .accessibilityIdentifier("tab.check")
            Tab(model.t("tab.results"), systemImage: "list.bullet.rectangle", value: AppTab.results) {
                NavigationStack(path: $model.resultsPath) {
                    ResultsScreen().destinations()
                }
            }
            .accessibilityIdentifier("tab.results")
            Tab(model.t("tab.paystub"), systemImage: "doc.text", value: AppTab.paystub) {
                NavigationStack(path: $model.paystubPath) {
                    DocumentAddScreen().destinations()
                }
            }
            .accessibilityIdentifier("tab.paystub")
        }
        .environment(\.zoomSpace, zoom)
        // A short iPhone (SE) or accessibility text sizes: actions stay in the content (Motion.swift).
        .environment(\.pinsActions, windowHeight >= 720 && !dynamicType.isAccessibilitySize)
        .onGeometryChange(for: CGFloat.self) { $0.size.height + $0.safeAreaInsets.top + $0.safeAreaInsets.bottom } action: { windowHeight = $0 }
        .tabViewBottomAccessory { PrivacyPill() }
        // The last line of every page scrolls clear of the pill and the tab bar, which sit over a
        // hard scroll edge so nothing shows through them.
        .contentMargins(.bottom, 76, for: .scrollContent)
        .scrollEdgeEffectStyle(.hard, for: .bottom)
        .tint(theme.ink)
        .modifier(SheetHost())
        // The fast snapshot capture shows end states: no transitions.
        .transaction { if MotionSwitch.off { $0.disablesAnimations = true; $0.animation = nil } }
    }
}

private extension View {
    /// Every screen a tab's stack can push.
    func destinations() -> some View {
        navigationDestination(for: Route.self) { route in
            switch route {
            case .question(let id, let returnTo): QuestionScreen(stepId: id, returnTo: returnTo).id(route)
            case .program(let id): ProgramScreen(programId: id).zoomDestination("program.\(id)")
            case .documentPreview: DocumentPreviewScreen()
            case .documentReview: DocumentReviewScreen()
            case .judges: JudgesScreen()
            case .deviceCheck: DeviceCheckScreen()
            case .tasks: TasksScreen()
            case .answer(let key): AnswerScreen(key: key)
            }
        }
    }
}

/// The privacy pill: "Nothing has left this iPhone" with the 0 ring, or "n sent from this
/// iPhone" with the redact disc and what was last sent. Opens the record as a sheet.
struct PrivacyPill: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        let count = model.sentCount
        Button { model.sheet = .record } label: {
            HStack(spacing: 10) {
                CounterDisc(count: count, size: 28)
                VStack(alignment: .leading, spacing: 0) {
                    Text(count == 0 ? model.t("pill.none") : model.t("pill.sent", ["count": model.number(Double(count))]))
                        // The words change at once (two cross-fading strings overlapped); the disc beside
                        // them carries the moment.
                        .sfFont(15, weight: .semibold)
                        .lineLimit(1)
                        // Large text on a small iPhone: shrink a little before truncating.
                        .minimumScaleFactor(0.8)
                        .accessibilityIdentifier("leaving.title")
                    if placement != .inline, count > 0, let last = model.outbound.last(where: \.left) {
                        Text("\(model.outboundFieldName(last.fields.first ?? "model-request")) · \(model.time(last.at))")
                            .sfFont(12).foregroundStyle(theme.note).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").sfFont(13, weight: .semibold).foregroundStyle(theme.icon)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            // Solid, as drawn: white in light, ink in dark, so content never shows through it.
            .background(theme.pillFill)
            .overlay(Capsule().strokeBorder(theme.pillEdge(contrast), lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // One distinct feedback when the count goes up: something left the device.
        .sensoryFeedback(Haptic.sent, trigger: model.sentCount) { old, new in new > old }
        // A bar: it stops growing at the largest standard size; the large content viewer shows it bigger.
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.countSubline)
        .accessibilityHint(model.t("leaving.details"))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("leaving.details")
        .overlay {
            // The line under the count, for tests and VoiceOver.
            Text(model.countSubline).font(.caption2).opacity(0.001).frame(width: 1, height: 1).clipped()
                .accessibilityIdentifier("leaving.status")
        }
        .accessibilityShowsLargeContentViewer { Label(model.countSubline, systemImage: "shield") }
    }
}

/// Screens with a hero hide the navigation bar and draw a glass back button; keep the edge swipe back.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}
