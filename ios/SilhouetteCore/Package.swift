// swift-tools-version: 6.2
// SilhouetteCore: the deterministic contract pieces of /shared (Skeletonizer, Rehydrator,
// Generalizer, expression evaluator, verdict engine) and the Raw/CloudSafe data types.
// No UIKit, SwiftUI, Firebase or model frameworks. Builds and tests on macOS with `swift test`.
import PackageDescription

let package = Package(
    name: "SilhouetteCore",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "SilhouetteCore", targets: ["SilhouetteCore"]),
    ],
    targets: [
        .target(name: "SilhouetteCore"),
        .testTarget(
            name: "SilhouetteCoreTests",
            dependencies: ["SilhouetteCore"],
            exclude: ["ios-edge-cases.json"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
