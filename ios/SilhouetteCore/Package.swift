// swift-tools-version: 6.2
// SilhouetteCore: the deterministic contract pieces of shared/ (Skeletonizer, Rehydrator,
// Generalizer, expression evaluator, verdict engine) and the Raw/CloudSafe data types.
// SilhouetteKit: the app's logic without UI.
// No UIKit, SwiftUI, Firebase or model frameworks. Builds and tests on macOS with `swift test`.
import PackageDescription

let package = Package(
    name: "SilhouetteCore",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "SilhouetteCore", targets: ["SilhouetteCore"]),
        .library(name: "SilhouetteKit", targets: ["SilhouetteKit"]),
    ],
    targets: [
        .target(name: "SilhouetteCore"),
        // App logic without UI: the Quick Check flow, the encrypted answer store, the outbound
        // log, UI copy and design tokens.
        .target(name: "SilhouetteKit", dependencies: ["SilhouetteCore"]),
        .testTarget(
            name: "SilhouetteCoreTests",
            dependencies: ["SilhouetteCore"],
            exclude: ["ios-edge-cases.json"]
        ),
        .testTarget(name: "SilhouetteKitTests", dependencies: ["SilhouetteKit", "SilhouetteCore"]),
    ],
    swiftLanguageModes: [.v6]
)
