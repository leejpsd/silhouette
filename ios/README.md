# Silhouette for iOS

Silhouette finds public benefits a person may qualify for. Exact document values stay on the
device; cloud calls only ever receive a silhouette. This folder holds the iOS app, its
deterministic core, and the app logic that sits between them.

The app runs the Quick Check on the device (one question per screen, results grouped by
verdict, a card per program with the reasons from the rules) and the document flow (add a
paystub, preview its silhouette, review the values, use the yearly income). Explanations,
questions and document reading use models through Firebase AI Logic: the on-device model first
where routing allows, the cloud only with silhouette content and only after the person agrees.

The cross-platform contracts live in [`../shared`](../shared/README.md). Nothing in this folder
copies them: tests read them from `shared/` directly, and the app build copies them into the app
bundle.

## Layout

| Path | What it is |
|---|---|
| `SilhouetteCore/` | Swift package with no UI or model dependencies: the data types (`Raw`, `Skeleton`, `Generalized`, `Public`, `CloudSafe`), the Skeletonizer and Rehydrator (`shared/skeleton/SPEC.md`), the Generalizer, the expression evaluator and the verdict engine (`shared/rulepacks/SPEC.md`), validation and annualization (`shared/validation/SPEC.md`), the model schema derivation (`shared/schemas/MODEL_SCHEMA.md`), and a small order-preserving JSON type |
| `SilhouetteCore/Sources/SilhouetteKit/` | App logic without UI: the Quick Check flow, the document flow, the encrypted store, the outbound log, copy, prompts and design tokens. `AI/`: the model port, request planning (cloud-capable requests from cloud-safe values only), routing and retry, output checks, consent and the session cache, Remote Config values |
| `SilhouetteCore/Tests/` | Conformance tests over every file in `shared/fixtures/conformance/` (skeleton, rehydrate with typed amounts, generalize, evaluator, verdict, silhouette verdict, validate, model schema, output check; a new file fails the suite until it has a runner), the canary leak test, Swift/JavaScript edge cases, and unit tests for SilhouetteKit with a scripted model port |
| `SilhouetteCore/RoutingProof/` | Small Swift files that must, or must not, compile against `SilhouetteCore` |
| `Silhouette/` | SwiftUI app (iOS 26.0 or later): screens, chrome and the theme |
| `Silhouette/AI/` | Firebase AI Logic, App Check and Remote Config (the only code that imports Firebase), the network monitor, and the scripted model used by UI tests |
| `Silhouette/Resources/copy.local.json` | App strings not yet in `shared/copy/` (never shadows a shared key; a test checks this) |
| `SilhouetteUITests/` | XCUITests for the Quick Check, document and answer flows, and a screenshot tour |
| `project.yml` | XcodeGen spec; `Silhouette.xcodeproj` is generated from it |
| `scripts/sync-shared.sh` | Build phase: copies `shared/copy`, `shared/rulepacks/zz-test`, `shared/bands`, `shared/design/tokens.json`, `shared/skeleton/allowlist`, `shared/schemas/pointer.paystub.json`, `shared/samples` and `shared/prompts` into the app bundle under `Shared/` |
| `scripts/copy-firebase-config.sh` | Build phase: copies `Silhouette/GoogleService-Info.plist` into the bundle when it exists |
| `scripts/routing-proof.sh` | Type-checks the probes in `RoutingProof/` |
| `scripts/gen-edge-cases.mjs` | Regenerates `ios-edge-cases.json` from `shared/reference/silhouette.mjs` |

## Requirements

- Xcode 26 or later (Swift 6.2 or later); developed with Xcode 27.0
- An iOS 26.0 or later simulator. The deployment target is iOS 26.0, the first release with
  Apple's Foundation Models framework, which the on-device inference path uses.
- Firebase Apple SDK 12.19.3 (Swift Package Manager; resolved by Xcode): `FirebaseAILogic`,
  `FirebaseAppCheck`, `FirebaseRemoteConfig`, `FirebaseCore`
- Optional: XcodeGen (to regenerate the project), Node.js (to regenerate the edge cases)

No signing team is needed for simulator builds.

### Firebase configuration

`Silhouette/GoogleService-Info.plist` is not in the repository. Without it the app builds (the
build prints a warning) and runs on the device only: cloud requests report that the build has no
Firebase configuration. To enable them, download the configuration of the iOS app
`app.silhouette.benefits` from the Firebase console into `Silhouette/`.

App Check uses the debug provider in debug builds. On the first run the SDK prints
`Firebase App Check debug token: …` in the Xcode console; register that token in the Firebase
console under App Check, Apps, Manage debug tokens. Release builds use App Attest, which needs a
signing team with the App Attest capability.

## Commands

```sh
make test            # swift test in SilhouetteCore (macOS)
make test-ios        # the same package tests on the iOS simulator (the Skeletonizer uses the OS's ICU)
make ui-test         # XCUITests: Quick Check, document and answer flows (scripted model)
make screenshots     # screenshot tour into SCREENSHOT_DIR (default build/screenshots)
make routing-proof   # compile-time routing check
make build           # xcodebuild for SIMULATOR (default "iPhone 18 Pro")
make project         # xcodegen generate
```

## The app

- **Quick Check.** Steps follow the rule pack's `questionOrder` (the reserved step `income`
  offers the bands and an exact amount). A typed amount accepts spaces and one leading currency
  symbol, then only the number format of `shared/skeleton/SPEC.md` section 5 (`28,000.50` and
  `28000.5` are read as written, `28.000,50` is refused), and the screen shows the amount as
  understood before the user continues. Every question can be skipped. Choosing none of a
  multiple-choice list is an answer, distinct from skipping. Sensitive questions and the exact
  income say that the answer never leaves the device.
- **Results.** Programs grouped as *may qualify*, *possible*, *depends*, *probably not*, from
  `RulesEngine.verdicts`. A program's card lists each criterion with its state; each answer it
  depends on opens that question and returns to the card.
- **Answers stay `Raw`.** `QuickCheckSession` keeps the answers inside `Raw` and hands them only
  to the verdict engine, the encrypted store, and the question screen that shows the user their
  own answer.
- **Encrypted at rest.** Answers are sealed with AES-GCM using a 256-bit key kept in the
  Keychain (this device only). The file has complete file protection and is excluded from
  backup. *Delete everything* removes the file, the key and the language setting.
- **Leaving your device.** The bar at the bottom reads `OutboundLog`. Every request the app makes
  is recorded before it is made (sending), then marked sent with the response status, or not
  completed with the reason; answers written on this device are listed as not sent. A recorded
  request is a `CloudText`, so only cloud-safe content can appear there. The details say what the
  app cannot see: the Firebase SDK renews App Check and installation tokens in the background, and
  iOS updates the system model.
- **Copy and languages.** Strings come from `shared/copy/`, the pack's `copy/` folder and
  `copy.local.json`, with per-key fallback to English. The language (English, Español, 한국어)
  defaults to the device language and can be changed from the globe menu.
- **Theme.** Colors (light and dark), type scale, spacing and radii come from
  `shared/design/tokens.json`. Type scales with Dynamic Type. Verdicts never rely on color: the
  silhouette mark is solid (may qualify), half filled (possible), dashed (depends) or faint
  (probably not), and always sits next to text. The token file's display sizes are meant for a
  condensed display typeface the app does not bundle yet, so display, title and heading sizes are
  capped in the system font.
- **Demo banner.** Shown on every screen while the synthetic `zz-test` pack is in use.
- **Document flow.** A paystub comes from pasted or shared text, a PDF's text layer (PDFKit; no
  OCR), a built-in sample, or the numbers typed by hand. A photo needs an on-device model and
  says so. The document's language decides its allowlist (that language ∪ English), independent
  of the app language. The preview shows what could leave next to the document as it reads on
  this phone; tapping a visible word hides it everywhere (its phrase too), with undo and the
  count of hidden numbers, dates and words.
- **Pointer extraction.** `PointerExtractor` takes a `Skeleton` and nothing else. A model reads it
  (`document.pointer.extract`, device first) after the person taps Send under the silhouette.
  Without a device model and without the network, a built-in sample is read by its answer key
  (`shared/samples/answers.json`, labelled "Sample answers, no AI", reason `sample-answer-key`);
  any other document is typed by hand.
- **Review.** Each value sits next to the document line it came from and can be changed (amounts
  follow the typed-amount rule) or typed when not found. The checks of
  `shared/validation/SPEC.md` are listed in plain words, the yearly income is shown with its
  arithmetic, and using it updates the Quick Check income and lists the verdicts that changed.
- **Document data stays `Raw`.** The text, the placeholder map, the values and the hidden words
  live in `Raw<DocumentDraft>`, are saved only in the encrypted store (a second sealed record),
  and are removed by *Delete everything*.

- **Why this result.** Each criterion of a program with its state and, where the rules compare an
  answer with a limit, the limit and the person's value. From the rules on the device; no model.
  With a device model, "Explain my result on this device" puts it into words (`explain.personal`).
- **About this program.** A general explanation (`explain.short` or `explain.long`) and prepared
  questions (`ask.chip`), written by a model that is given the silhouette, the program facts and
  the criterion states the rules reach from the silhouette alone, never a result. A typed question
  (`ask.freeText`) is answered on the device only.

UI tests and screenshots use launch arguments that are ignored otherwise: `-UITestResetAll`
(start from a clean state), `-UITestAppearance dark|light`, and `-UITestModel none|device|cloud`
(a scripted model instead of Firebase: no model call, no network).

## Models and Firebase AI Logic

| Task (`shared/routing.json`) | Input | Where it runs |
|---|---|---|
| `document.pointer.extract` | `Skeleton` | Device first; if the device fails, the same silhouette once in the cloud (`on-device-failed`) |
| `explain.short`, `ask.chip` | `Generalized`, `Public` | Device first; in the cloud when this device has no model |
| `explain.long` | `Generalized`, `Public` | Cloud first; the device only when the cloud cannot be reached |
| `explain.personal`, `ask.freeText` | `Raw` | The device only; never the cloud |
| `document.photo.read` | `Raw` (photo) | Not offered: the on-device model takes text only |

- The SDK's on-device model (`FirebaseAI.SystemLanguageModel`, Apple Foundation Models behind
  Firebase AI Logic) and the cloud Gemini model each run in their own single-turn session. The app
  decides device or cloud itself (instead of the SDK's `HybridModel`) so that every cloud request
  is recorded and agreed to before it is made.
- Structured output: the model schema derived from the pointer schema (`ModelSchema.derive`) is
  the cloud request's response schema; on the device it is appended to the prompt after
  `Answer with JSON that matches this schema:`. The reply is validated and rehydrated by the core.
- Remote Config: defaults are the bundled copy of `firebase/remoteconfig.template.json`. Nothing
  is fetched at start; the first model request fetches once (and is recorded).
- Before a cloud-capable request the app shows the step before sending: the silhouette lines,
  the request object as the app builds it (the SDK writes the bytes), where it would run and why.
  Consent is per silhouette and destination; agreeing to "may be sent if this device can't" does
  not cover a cloud-first request.
- Every answer shows where it was written and the routing reason. A reply that states a result
  is asked for once more, then refused (`shared/prompts/OUTPUT_CHECKS.md`).

## The routing rule in code

`shared/DATA_TYPES.md`: `Raw` values never reach a cloud-capable call.

- A cloud-capable call takes `some CloudSafe` and sends `CloudBoundary.outbound(value).text`.
  `Skeleton`, `Generalized` and `Public` conform; `Raw` does not.
- A cloud model request is a `CloudRequest`. Only the `Planner` builds one, from `Skeleton`,
  `Generalized` and `Public` values. `ModelPort.generateInCloud` takes nothing else; requests with
  `Raw` input are `DeviceRequest`s, which can only reach the on-device model.
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

- **Code points, not grapheme clusters.** Tokenization uses `NSRegularExpression` (ICU) with the
  spec's explicit safe-character list (no Unicode property classes) and slices with UTF-16
  ranges, so a digit followed by a combining mark splits as in JavaScript.
- **Phrases and introducers.** A phrase of words is masked as a whole when any word is not
  allowlisted, after its leading introducers (`Employee`, `between` …) from the allowlist files
  (`shared/skeleton/SPEC.md` sections 4.1 and 4.2).
- **Month names.** Month-name dates match ASCII case-insensitively, written as explicit
  `[oO][cC][tT]` classes: ICU's case-insensitive mode would also fold `ſ` (U+017F) to `s`.
- **Exact string comparison.** Swift `==`, `Set` and `Dictionary` treat canonically equivalent
  strings as equal (even `"\u{212A}" == "K"`). Allowlist lookups, object keys, `==`, `in` and
  placeholder ids compare exact code points instead.
- **Regex anchors.** In ICU `$` also matches before a final line break; patterns use `\z`.
- **Numbers.** A hand-written JSON parser keeps booleans and numbers apart and preserves key
  order; numbers are printed with JavaScript's `Number.prototype.toString` rules; `Math.min`/
  `Math.max` handle `-0` as JavaScript does.
- **Lowercasing.** `lowercased()` does not apply JavaScript's Final_Sigma rule. A test checks
  that no allowlist word contains σ or ς, the only case where this could change a skeleton.
- **Exact integers.** Validation holds money as integer cents and computes ratios with `Int128`.
- **JavaScript `trim()`.** Date text is trimmed with JavaScript's whitespace set (including
  U+FEFF and U+3000), not Foundation's.
