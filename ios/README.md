# Silhouette for iOS

Silhouette finds public benefits a person may qualify for. Exact document values stay on the
device; cloud calls only ever receive a silhouette. This folder holds the iOS app and its
deterministic core.

The cross-platform contracts live in [`../shared`](../shared/README.md). Nothing in this folder
copies them: tests read them from `shared/` directly, and the app build copies them into the app
bundle.

## Layout

| Path | What it is |
|---|---|
| `SilhouetteCore/` | Swift package with no UI or model dependencies: the data types (`Raw`, `Skeleton`, `Generalized`, `Public`, `CloudSafe`), the Skeletonizer and Rehydrator (`shared/skeleton/SPEC.md`), the Generalizer, the expression evaluator and the verdict engine (`shared/rulepacks/SPEC.md`), and a small order-preserving JSON type |
| `SilhouetteCore/Tests/` | Conformance tests over every file in `shared/fixtures/conformance/`, the canary leak test over `shared/fixtures/canary/`, Swift/JavaScript edge cases, and runtime checks of `Raw` |
| `SilhouetteCore/RoutingProof/` | Small Swift files that must, or must not, compile against `SilhouetteCore` |
| `Silhouette/` | SwiftUI app (iOS 26.0 or later) |
| `project.yml` | XcodeGen spec; `Silhouette.xcodeproj` is generated from it |
| `scripts/sync-shared.sh` | Build phase: copies `shared/copy`, `shared/rulepacks/zz-test`, `shared/bands`, `shared/design/tokens.json` and `shared/skeleton/allowlist` into the app bundle under `Shared/` |
| `scripts/routing-proof.sh` | Type-checks the probes in `RoutingProof/` |
| `scripts/gen-edge-cases.mjs` | Regenerates `ios-edge-cases.json` from `shared/reference/silhouette.mjs` |

## Requirements

- Xcode 26 or later (Swift 6.2 or later); developed with Xcode 27.0
- An iOS 26.0 or later simulator. The deployment target is iOS 26.0, the first release with
  Apple's Foundation Models framework, which the on-device inference path uses.
- Optional: XcodeGen (to regenerate the project), Node.js (to regenerate the edge cases)

No signing team is needed for simulator builds.

## Commands

```sh
make test            # swift test in SilhouetteCore
make routing-proof   # compile-time routing check
make build           # xcodebuild for SIMULATOR (default "iPhone 18 Pro")
make project         # xcodegen generate
```

## The routing rule in code

`shared/DATA_TYPES.md`: `Raw` values never reach a cloud-capable call.

- A cloud-capable call takes `some CloudSafe` and sends `CloudBoundary.outbound(value).text`.
  `Skeleton`, `Generalized` and `Public` conform; `Raw` does not.
- `Skeleton` is created only by `Skeletonizer.skeletonize`, `Generalized` only by
  `Generalizer.generalize`, and `CloudText` only inside `SilhouetteCore`.
- `Raw` prints as `[Raw]` (description, debug description, `dump`, `Mirror`), is not `Codable` or
  `Equatable`, and its value is readable only inside the `SilhouetteCore` package.
- `Public` text from app code must be a string literal (`StaticString`).

`make routing-proof` checks each of these with the compiler. The probes also document the limit:
Swift allows a retroactive `extension Raw: CloudSafe` in another module, but such a conformance
can only return a `CloudText` that `SilhouetteCore` created, so it still cannot send the raw value.

## Matching the JavaScript reference

The core follows `shared/reference/silhouette.mjs` byte for byte. Points where Swift's defaults
differ from JavaScript and how the core handles them:

- **Code points, not grapheme clusters.** Tokenization uses `NSRegularExpression` (ICU) and
  slices with UTF-16 ranges, so a digit followed by a combining mark splits as in JavaScript.
- **Exact string comparison.** Swift `==`, `Set` and `Dictionary` treat canonically equivalent
  strings as equal (even `"\u{212A}" == "K"`). Allowlist lookups, object keys, `==`, `in` and
  placeholder ids compare exact code points instead.
- **Regex anchors.** In ICU `$` also matches before a final line break; patterns use `\z`.
- **Numbers.** A hand-written JSON parser keeps booleans and numbers apart and preserves key
  order; numbers are printed with JavaScript's `Number.prototype.toString` rules; `Math.min`/
  `Math.max` handle `-0` as JavaScript does.
- **Lowercasing.** `lowercased()` does not apply JavaScript's Final_Sigma rule. A test checks
  that no allowlist word contains σ or ς, the only case where this could change a skeleton.
- **Unicode tables.** Apple's ICU classifies 68 private-use code points (U+F870 to U+F8D6) as
  letters, so they are masked on iOS but kept as punctuation by the reference.
