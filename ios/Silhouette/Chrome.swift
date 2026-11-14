// The app's frame: navigation between screens (each screen draws its own header, demo line and
// bottom block), the sheets over them, and the grain over everything.

import SilhouetteCore
import SilhouetteKit
import SwiftUI
import UIKit

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.theme) private var theme

    var body: some View {
        @Bindable var model = model
        ZStack {
            NavigationStack(path: $model.path) {
                StartScreen()
                    .navigationDestination(for: Route.self) { route in
                        switch route {
                        case .question(let id, let returnTo):
                            QuestionScreen(stepId: id, returnTo: returnTo).id(route)
                        case .results:
                            ResultsScreen()
                        case .program(let id):
                            ProgramScreen(programId: id)
                        case .documentAdd:
                            DocumentAddScreen()
                        case .documentPreview:
                            DocumentPreviewScreen()
                        case .documentReview:
                            DocumentReviewScreen()
                        }
                    }
            }
            .tint(theme.ink)
            .accessibilityHidden(model.sheet != nil)
            SheetHost()
            GrainOverlay()
        }
        .background(theme.ground.ignoresSafeArea())
    }
}

/// Screens hide the navigation bar and draw their own back links; keep the edge swipe to go back.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}
