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
| `Silhouette/` | SwiftUI app (iOS 26.0 or later): the screens and the app frame |
| `Silhouette/Design/` | The design system: theme and type from the tokens, the screen frame with the bottom block, sheets, controls, paper, markers, bars, grain and motion |
| `Silhouette/Resources/Fonts/` | Darker Grotesque, Hanken Grotesk and DM Mono (TTF) with their SIL Open Font License texts; registered in `Silhouette/Info.plist` |
| `Silhouette/AI/` | Firebase AI Logic, App Check and Remote Config (the only code that imports Firebase), the network monitor, and the scripted model used by UI tests |
| `Silhouette/Resources/copy.local.json` | App strings not in `shared/copy/`: three lines of the on-device check that only iOS shows (where the run file was saved, the case this platform cannot run). Never shadows a shared key (a test checks this) |
| `eval/on-device/` | The on-device check's runs recorded on an iPhone: the baseline and the latest are bundled; earlier runs in `history/` (see its README) |
| `SilhouetteUITests/` | XCUITests for the Quick Check, document and answer flows (including reading kept on the device), and a screenshot tour |
| `Silhouette/Snapshots.swift`, `scripts/snapshots.sh` | Fast snapshots: the app sets each screen's state itself and writes PNG files (`make snapshots`) |
| `project.yml` | XcodeGen spec; `Silhouette.xcodeproj` is generated from it |
| `scripts/sync-shared.sh` | Build phase: copies `shared/copy`, `shared/rulepacks/us-ca` (the pack, its copy and the judges' household), `shared/bands/us-ca.json`, `shared/design/tokens.json`, `shared/skeleton/allowlist`, `shared/schemas/pointer.paystub.json`, `shared/samples`, `shared/prompts` and the on-device check's cases, documents and right answers (`shared/fixtures/device-check/`) into the app bundle under `Shared/`, and the iPhone's recorded runs (`eval/on-device/*.json`) under `Shared/recordings/` |
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
build prints a warning) and runs without models: Firebase AI Logic needs a configured Firebase app
for the on-device model too, so the app shows the rules' own reasons, reads the built-in samples by
their answer keys and takes typed numbers, and makes no request. To enable them, download the configuration of the iOS app
`app.silhouette.benefits` from the Firebase console into `Silhouette/`.

App Check starts only when a cloud request is about to be sent (shared/RECORD.md): automatic token
refresh is off (`FirebaseAppCheckTokenAutoRefreshEnabled` in `Info.plist`), and before each cloud
request the app obtains a limited-use token; without one the request is not made and the record
shows it as stopped before it left. The SDK then obtains its own limited-use token for the request
(it takes none from the app), so a cloud request makes two token exchanges on iOS. App Check uses
the debug provider in debug builds. On the first run the SDK prints
`Firebase App Check debug token: …` in the Xcode console; register that token in the Firebase
console under App Check, Apps, Manage debug tokens. Release builds use App Attest, which needs a
signing team with the App Attest capability.

## Commands

```sh
make test            # swift test in SilhouetteCore (macOS)
make test-ios        # the same package tests on the iOS simulator (the Skeletonizer uses the OS's ICU)
make ui-test         # XCUITests: Quick Check, document and answer flows (scripted model)
make screenshots     # screenshot tour into SCREENSHOT_DIR (default build/screenshots, git-ignored)
make snapshots       # fast snapshots of every screen and state into SNAPSHOT_DIR (default build/snapshots)
make snapshots-device  # the same with a scripted on-device model, into build/snapshots-device
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
  `RulesEngine.verdicts`. The *possible* group sits in an inverted card with the income limit
  that keeps it open. When nothing fits, the card says so; before any answer, the programs are
  listed as not answered yet. A program's page lists each criterion with its state; each answer
  it depends on opens that question and returns to the page. Amounts, limits and income ranges
  are money in the rule pack's `currency`, always grouped and written in the pack's
  `numberFormat` (`$34,000` in every app language), the way the jurisdiction's paperwork writes it.
- **Answers stay `Raw`.** `QuickCheckSession` keeps the answers inside `Raw` and hands them only
  to the verdict engine, the encrypted store, and the question screen that shows the user their
  own answer.
- **Encrypted at rest.** Answers are sealed with AES-GCM using a 256-bit key kept in the
  Keychain (this device only). The file has complete file protection and is excluded from
  backup. *Delete everything* removes the file, the key and the language setting.
- **Leaving your device** (`shared/RECORD.md`). The count row at the bottom of every screen reads
  `OutboundLog`; the line under it splits the requests that left into what carried something of the
  person's and the rest (technical checks, general questions); its record ("3 sent, 1 kept.") opens
  as a sheet. Every request the app makes is recorded before it is made (sending), then marked sent
  with the response status, or not completed with the reason; a request stopped before it left (no
  App Check token) is recorded as not sent and never counted. An answer written on this device is
  recorded as "Answered on this device", with no host and no body, and counted as kept, never as
  sent. Work on the device makes no request: Remote Config is fetched after the first cloud request. A recorded
  request is a `CloudText`, so only cloud-safe content can appear there. The details say what the
  app cannot see: the Firebase SDK renews App Check and installation tokens in the background, and
  iOS updates the system model.
- **Copy and languages.** Strings come from `shared/copy/`, the pack's `copy/` folder and
  `copy.local.json`, with per-key fallback to English. The language (English, Español, 한국어)
  defaults to the device language and can be changed from the header (EN, ES, 한국어).
- **Design.** The look follows `shared/design/DESIGN.md`; every colour, size, radius, rotation,
  shadow and duration comes from `shared/design/tokens.json`, in light and dark. Each screen has
  the header, the one-line demo notice, display headlines that step down in size before they
  would clip, and the inverted bottom block with the screen's one main action above the
  "Leaving your device" count (stamped in pink when something leaves). The block follows the
  keyboard and, when it would cover more than 40 % of the screen, scrolls with the content while
  the count stays pinned. Pink marks only what leaves. Verdicts are told apart by marker shape
  (solid, dotted, dashed, hollow) next to their text, never by colour. Document values and what
  would be sent appear on tilted paper slips; hidden values are bars with their placeholder id.
  The record, the step before sending, the language, the demo rules and *Delete everything* are
  sheets. Motion (rise, wipe, pop, stamp, sheet, the preview cross-fade) shows its end state under
  Reduce Motion; the grain is skipped under Reduce Transparency.
- **Accessibility.** Interface and mono text scale fully with Dynamic Type; display type scales
  up to the token cap (1.3×) and then relies on the size steps. Targets are at least 44 pt.
  Markers, bars and the count have spoken equivalents (verdict text, "hidden word", "hidden
  number", "hidden date", the count's subline).
- **Rules.** The California pack `us-ca` (federal and California programs) is the default. It is a
  draft: every screen says "Draft rules, read November 12, 2026." and "More" opens the draft-rules
  sheet (what the draft means, *Delete everything*, the judges' path and the on-device check). A
  program's page links to its official sources with the date each was read, the documents it asks
  for and how to apply. Periods ("tax year 2026") are written in the reader's language. Investment
  income is asked as an amount of money.
- **Document flow.** A paystub comes from pasted or shared text, a PDF's text layer (PDFKit; no
  OCR), a built-in sample, or the numbers typed by hand. A photo needs an on-device model and
  says so. The document's language decides its allowlist (that language ∪ English), independent
  of the app language. The preview shows what could leave next to the document as it reads on
  this phone; tapping a visible word hides it everywhere (its phrase too), with undo and the
  count of hidden numbers, dates and words.
- **Pointer extraction.** `PointerExtractor` takes a `Skeleton` and nothing else. A model reads it
  (`document.pointer.extract`, device first) after the person taps Send under the silhouette, or on
  the device alone after *Keep everything on this device*. With prompt version 5 or later
  (`prompt_pointer_extract_v`; a version the app does not bundle falls back to the newest bundled
  one) the device reads in parts (`shared/prompts/DEVICE_READING.md`): the core fields, the gross
  pay when needed, the deductions, and the deductions again; the screen names the part being read.
  Each part is checked; fields that fail their check are left out and shown as "Not read on this
  device". Values that feed no result (hours, rate, net pay, a pay date before the period end) are
  shown only when a deterministic check confirms them (DEVICE_READING.md v2 section 5.1). Reading a
  document asks the on-device model for greedy sampling, so the same silhouette gives the same answer. When the reading fails and the person chose to keep everything on the device, nothing is
  filled in and nothing is sent; they can send the silhouette or type the numbers.
  Without a device model and without the network, a built-in sample is read by its answer key
  (`shared/samples/answers.json`, labelled "Sample answers, no AI", reason `sample-answer-key`);
  any other document is typed by hand.
- **Review.** Each value sits next to the document line it came from and can be changed (amounts
  follow the typed-amount rule) or typed when not found. The checks of
  `shared/validation/SPEC.md` are listed in plain words, the yearly income is shown with its
  arithmetic and the date it was worked out from, and using it updates the Quick Check income and
  lists the verdicts that changed.
- **Document data stays `Raw`.** The text, the placeholder map, the values and the hidden words
  live in `Raw<DocumentDraft>`, are saved only in the encrypted store (a second sealed record),
  and are removed by *Delete everything*.

- **Why this result.** Each criterion of a program with its state and, where the rules compare an
  answer with a limit, the limit and the person's value. From the rules on the device; no model.
  With a device model, "Explain my result on this device" puts it into words (`explain.personal`).
- **About this program.** A general explanation (`explain.short` or `explain.long`, prompt version
  5) and prepared questions (`ask.chip`, version 4), written by a model that is given public
  program information only (`{programFacts}`: the program's own text, limits and amounts), nothing
  about the person and never a result. Replies are checked against the verdict the rules reached
  (`shared/prompts/OUTPUT_CHECKS.md` version 2). A typed question
  (`ask.freeText`) is answered on the device only.

UI tests and screenshots use launch arguments that are ignored otherwise: `-UITestResetAll`
(start from a clean state), `-UITestAppearance dark|light`, `-UITestOffline` (show the offline
state), and `-UITestModel none|device|cloud` (a scripted model instead of Firebase: no model
call, no network; `cloud-slow`, `cloud-quota`, `cloud-blocked` script those request states;
`device-unreliable` a device reading that fails its checks; `device-notread` fields left out as not
read). `-SnapshotCapture <folder>` (with a scripted model only) writes the fast snapshots.

### The judges' path and the on-device check

Both open from the draft-rules sheet only. *For judges* runs the prepared synthetic household
(`shared/rulepacks/us-ca/judges-household.json`),
opens the sample paystub and shows the record of what left the device. *Check the on-device model*
runs the fixed synthetic cases of `shared/validation/DEVICE_CHECK.md` through Firebase AI Logic: five
paystubs read in parts, explanations and prepared questions in English and Spanish, and the two
device-only tasks. Reading a photo is not available on iPhone (the on-device model takes text only):
the case stays in the run file and is left out of the figures, with a note. For each case the screen
shows where it finally ran, the time of each part, and whether the yearly-income inputs were right,
not found or wrong; a part that stopped before the model answered records where and why
(`failure:{origin}:{type}: {message}` in its problems). The extraction cases can be repeated three
times. The run file (`shared/schemas/device-check-run.v3.json`, with the `device` block) is saved in
the app's Documents folder as soon as the run finishes (Files, On My iPhone, Silhouette) and can be
shared; the launch argument `-DeviceCheckRun 1` (or `3`) opens the check and runs it without
tapping. Without a device model the screen says so and can show the bundled iPhone runs, labelled as
recordings, or open a run file.

### Snapshots

`make snapshots` builds the app, installs it on `SIMULATOR` and launches it in capture mode: the app
sets the state of every screen itself (no UI automation) and writes each one in light and dark,
English and Spanish, default and largest text, long screens page by page. One configuration takes
about 40 seconds (76 images); all eight about 5 minutes. `SNAPSHOT_CONFIGS=en-light,es-dark-ax5`
and `SNAPSHOT_SCENES=results,program-caleitc` limit the run. `make snapshots-device` captures the
scenes that need an on-device model with a scripted one.

### Fonts

The fonts are bundled; nothing is downloaded at run time. All three are under the SIL Open Font
License 1.1, whose texts are in `Silhouette/Resources/Fonts/` and in the app bundle. The files
come from the Google Fonts repository (`github.com/google/fonts`, folder `ofl/`):

| File | Family | Used for |
|---|---|---|
| `DarkerGrotesque-Variable.ttf` | Darker Grotesque (variable, weights 800 and 900 used) | Headlines, amounts, counts, main actions |
| `HankenGrotesk-Variable.ttf` | Hanken Grotesk (variable, weights 400, 600 and 700 used) | Interface text |
| `DMMono-Regular.ttf`, `DMMono-Medium.ttf` | DM Mono 400 and 500 | Document values, placeholder ids, times, limits |

Darker Grotesque has no Hangul, so Korean display text uses the system typeface at its heaviest
weight, with open leading and line breaks between words.

## Models and Firebase AI Logic

| Task (`shared/routing.json`) | Input | Where it runs |
|---|---|---|
| `document.pointer.extract` | `Skeleton` | Device first; if the device fails, the same silhouette once in the cloud (`on-device-failed`) |
| `explain.short`, `ask.chip` | `Public` | Device first; in the cloud when this device has no model |
| `explain.long` | `Public` | Cloud first; the device only when the cloud cannot be reached |
| `explain.personal`, `ask.freeText` | `Raw` | The device only; never the cloud |
| `document.photo.read` | `Raw` (photo) | Not offered: the on-device model takes text only |

- The SDK's on-device model (`FirebaseAI.SystemLanguageModel`, Apple Foundation Models behind
  Firebase AI Logic) and the cloud Gemini model each run in their own single-turn session. The app
  decides device or cloud itself (instead of the SDK's `HybridModel`) so that every cloud request
  is recorded and agreed to before it is made.
- Structured output: the model schema derived from the pointer schema (`ModelSchema.derive`) is
  the cloud request's response schema. On the device, each reading part's strict constraint
  (`DeviceReading.constraint`) is turned into a generation schema for the system model (a
  `Generable` reply type whose schema is built at run time with `DynamicGenerationSchema`):
  placeholder ids as enums, the deductions list with its item shape and minimum size. The
  constraint's "every key present, null allowed" cannot be expressed there, so fields are optional
  and a field whose only allowed value is null is left out; the core's checks treat a missing field
  as null. The reply is validated and rehydrated by the core.
- When a task may run on the device only and the device has no model, the app stops before any SDK
  call; the SDK's system-model session has no cloud fallback of its own.
- Remote Config: defaults are the bundled copy of `firebase/remoteconfig.template.json`. Nothing
  is fetched at start or for work on the device; the first cloud request is followed by one fetch
  (recorded).
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
