# Silhouette for Android

The Android app of Silhouette, which finds public benefits a person may qualify for. Exact values
stay on the device. A cloud call only ever receives a silhouette: a document skeleton, a
generalized profile, or public content.

The cross-platform contract lives in [`../shared`](../shared/README.md). This project implements it
and tests itself against the shared fixtures, read in place.

What works today:

- the **Quick Check**: a few questions, one per screen, then verdicts for every program in the
  rule pack, decided on the device by the deterministic rules engine;
- the **document flow**: add a paystub (shared or pasted text, a text PDF, a photo read on the
  device, typing the numbers, or a built-in sample), see its silhouette exactly as it would be sent
  and hide any word that is still visible, review each value next to its source line, run the
  consistency checks and use the worked-out yearly income.

Models run through **Firebase AI Logic** with hybrid inference:

| Task (shared/routing.json) | Mode | Input |
|---|---|---|
| `document.pointer.extract` | `PREFER_ON_DEVICE`; an on-device failure is retried once with `ONLY_IN_CLOUD` (reason `on-device-failed`) | `Skeleton` only |
| `document.photo.read` | `ONLY_ON_DEVICE`, one Bitmap per request; a result reported from the cloud is discarded | the photo (Raw), never sent |

Every model result on screen carries the `ON_DEVICE` / `IN_CLOUD` badge and the routing reason. The
built-in samples also have a fixed answer key, labelled "Sample answers, no AI", used only when no
model can be reached (no network and no on-device model).

## Modules

| Module | What it is |
|---|---|
| `:core` | Pure Kotlin/JVM library with no Android dependencies: data types, Skeletonizer, Rehydrator, Generalizer, expression evaluator, verdict engine, and the shared conformance suite |
| `:app` | Android application (Jetpack Compose, Material 3, minSdk 26) |

### `:core`

| File | Contract |
|---|---|
| `DataTypes.kt` | `Raw<T>`, `Skeleton`, `Generalized<T>`, `Public<T>` and the sealed `CloudSafe` (`shared/DATA_TYPES.md`) |
| `Skeletonizer.kt` | Document text → skeleton plus placeholder map (`shared/skeleton/SPEC.md` sections 1–4.1): deny by default from an explicit safe-character list, month-name dates, phrases masked as a whole, leading introducers (`Employee`, `between`) kept in front of a masked name. Optional user-hidden words for the preview |
| `Rehydrator.kt` | Model pointers → exact values (`shared/skeleton/SPEC.md` section 5); `parseTypedAmount` for amounts typed by the user |
| `Review.kt` | Review fields with their highlighted source lines, from a pointer schema and the model's pointers |
| `Validation.kt` | Paystub checks, date parsing per jurisdiction and annualization in integer cents with exact arithmetic (`shared/validation/SPEC.md`) |
| `ModelSchema.kt` | The schema a model accepts, derived from a pointer schema (`shared/schemas/MODEL_SCHEMA.md`) |
| `Generalizer.kt` | Exact profile → profile silhouette and its canonical JSON (`shared/rulepacks/SPEC.md` section 6) |
| `Evaluator.kt` | Strict, three-valued expression language (`shared/rulepacks/SPEC.md` section 3) |
| `Verdicts.kt` | Rule pack model (questions, order, programs) and verdicts with income-band sample points (`shared/rulepacks/SPEC.md` sections 2, 4, 5) |
| `JsonValues.kt` | JSON trees as engine values, with JavaScript number formatting so output is byte-identical across platforms |
| `conformance/ConformanceSuite.kt` | Every case of the seven files in `shared/fixtures/conformance/` and of `shared/fixtures/canary/`, plus a check that the safe-character list and month names equal those of `shared/reference/silhouette.mjs`. The same suite runs on the JVM and on an Android runtime |

How the routing rule is enforced:

- A `Raw` value prints as `[Raw]`, compares by identity and has no serializer. Only code inside
  `:core` can read it (`reveal()` is `internal`).
- `CloudSafe` is sealed, and the constructors of `Skeleton` and `Generalized` are internal, so only
  `skeletonize()`, `generalize()` and `canonical()` turn `Raw` input into a cloud-safe value.
  `Public.of` accepts plain text and JSON trees only.
- `core/src/routingProof/` holds snippets that must **fail to compile** for exactly these reasons.
  `RoutingProofTest` compiles each one with the Kotlin compiler against the compiled `:core`
  classes and checks for the expected compiler diagnostic. A control snippet that uses the allowed
  path must compile.

### `:app`

| Package | What it does |
|---|---|
| `quickcheck` | Pure flow logic: steps in the pack's `questionOrder`, validation, drafts, the conversion to engine answers, grouping by verdict, and the storage format. A typed income accepts only the document number format (`28,000.50`, `28000.5`) after removing spaces and a leading currency symbol, and the screen shows the amount as understood |
| `document` | The document session, review rows and the conversion of confirmed values into validation input |
| `ai` | `PointerExtractor` (input: `Skeleton`; output: pointers, inference source and routing reason). `ModelPointerExtractor` applies the routing rules over a `ModelPort`; `PointerRequestBuilder` builds the request (prompt version from Remote Config, model schema derived from the pointer schema); `LoggedModelPort` records every request in the outbound log before it is made; `SampleAnswerKeyExtractor` answers only for the exact silhouettes of the built-in samples |
| `ai/firebase` | The only code that calls Firebase AI Logic: `FirebaseModelPort` (hybrid model, `responseSchema`, `inferenceSource`), `FirebaseDeviceModel` (check status, download, warm up) and `FirebasePhotoReader` (`ONLY_ON_DEVICE`) |
| `config` | Remote Config: every key in `shared/routing.json`, with in-app defaults read from `firebase/remoteconfig.template.json` (copied in by the build); fetched only right before the first model request |
| `i18n` | Copy with per-key fallback: `shared/copy/{lang}` → `shared/rulepacks/{pack}/copy/{lang}` → app keys, then the same in English. English, Spanish and Korean |
| `data` | `EncryptedStore` (AES-256-GCM, key in the Android Keystore), the answer and ledger repository, the language setting, `OutboundLog`, `PdfText` (the platform `PdfRenderer` text layer, Android 15 and later) and `PhotoDecoder` |
| `content` | Loads the rule pack, bands, copy and design tokens from the synced assets |
| `ui` | `AppController` (state, navigation, persistence), the Compose screens and the app chrome |
| `ui/theme` | Material 3 theme built from `shared/design/tokens.json`: light and dark colors, type scale, spacing, radii |

Screens: start, one question per screen, results grouped by verdict, program detail, add a
document, silhouette preview and review. Every
question can be skipped. Sensitive questions, and the exact-income field, say that the answer
never leaves the device. In a multi-choice question, ticking nothing is a valid answer ("none of
these") and is different from skipping. From a program's detail, "Answer: …" opens the question it
depends on and comes back.

App chrome:

- **Demo banner** whenever a synthetic rule pack (`zz-test`) is active.
- **"Leaving your device" bar** on every screen. It reads only `OutboundLog`, which records every
  request before it is made (attempted), then sent with its response, failed with a reason, or
  answered on this device, with the request path, the model and the exact cloud-safe payload. It
  is stored encrypted. App Check token requests are recorded when the SDK reports a new token;
  Remote Config fetches are recorded like model requests. Nothing is requested at start-up.
- **"Delete everything"**, behind a confirmation. It deletes the stored answers, the Keystore key,
  the language choice and the outbound log.

Answers:

- **In memory:** answers are a `QuickCheckAnswers` value. It is not `CloudSafe`, and its string
  form does not reveal values. It is wrapped in `Raw` when handed to the verdict engine.
- **At rest:** answers are encrypted with a non-exportable Keystore key in the no-backup folder.
  Backup and device transfer are disabled.

Language: chosen in the app, defaulting to the device language. On Android 13 and later it is the
system per-app language (`res/xml/locales_config.xml`). On older versions it is an app preference.

Accessibility:

- Every screen announces a pane title, and headings are marked.
- Choices are full-row radio buttons or checkboxes with targets of at least 48 dp.
- Verdict marks (solid, half-filled, dashed and faint silhouettes) and criterion icons always sit
  next to text, so color is never the only signal.
- Text carries the app language, so Korean keeps words whole when lines wrap and screen readers
  use the right voice.
- UI tests run the Accessibility Test Framework checks on every action.

The build task `syncSharedContract` copies `shared/copy`, `shared/rulepacks/zz-test`,
`shared/bands`, `shared/design/tokens.json`, `shared/skeleton/allowlist`, the pointer schemas and
`shared/samples` and the prompts into generated assets
(`assets/shared/…`). `syncConformanceFixtures` does the same for the instrumented-test APK. Nothing
is copied by hand.

## Firebase setup

- Add `app/google-services.json` for the Firebase project (it is git-ignored and never committed).
- App Check: debug builds use the debug provider, release builds Play Integrity. On the first run
  of a debug build, logcat prints `Firebase App Check debug token: …`
  (`adb logcat | grep "App Check debug token"`). Register that token in the Firebase console under
  App Check → Apps → Manage debug tokens. Never put the token in the repository.
- Dependencies: Firebase BoM 35.2.0 (`firebase-ai` 18.2.0, `firebase-config` 24.0.1,
  `firebase-appcheck-playintegrity` / `firebase-appcheck-debug` 20.1.0),
  `firebase-ai-ondevice` 16.0.0-beta08 (not in the BoM yet; it brings the platform's on-device
  model runtime), Google services Gradle plugin 4.6.0.

## Requirements

- JDK 21 on `PATH` (Gradle runs on it; bytecode targets Java 17).
- Android SDK with platform `android-36.1` and Build Tools `36.1.0`. Put `sdk.dir=/path/to/sdk` in
  `local.properties`. The build never downloads SDK components
  (`android.builder.sdkDownload=false`), so a missing component fails the build.
- The `../shared` folder next to this one.

## Build and test

```bash
./gradlew :core:test                 # conformance, canary, number format, data types, routing proof (JVM)
./gradlew :app:testDebugUnitTest     # Quick Check, documents, model routing with fakes, Remote Config, routing rule (JVM)
./gradlew :app:assembleDebug         # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:connectedDebugAndroidTest   # on a device or emulator, see below
```

`connectedDebugAndroidTest` runs:

- `ConformanceOnDeviceTest`: the whole conformance suite on the Android runtime. There, regex,
  Unicode tables and case mapping come from the platform's ICU instead of the JDK. The runtime's
  ICU and Unicode versions are logged under the tag `Conformance`.
- `EncryptedStoreTest`: round trip, no plaintext on disk, the key is not exportable, tampering is
  detected, and deletion removes the key.
- `QuickCheckFlowTest`: completing the Quick Check; skipping the sensitive question and answering
  it from the program detail; "Delete everything"; the language switch.
- `DocumentFlowUiTest`: a sample paystub from silhouette to "use this as my yearly income"; hiding
  a word and undoing it; a typed income with decimals.
- `ShareAndPdfTest`: text shared from another app; reading a PDF text layer on the device.
- `ScreenshotTour` (skipped unless asked for): saves a screenshot of every screen.

```bash
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=app.silhouette.benefits.ScreenshotTour \
  -Pandroid.testInstrumentationRunnerArguments.screenshots=true \
  -Pandroid.testInstrumentationRunnerArguments.language=ko
# → app/build/outputs/connected_android_test_additional_output/…
# Dark mode and font size follow the device: adb shell cmd uimode night yes,
# adb shell settings put system font_scale 2.0
```

## Known limits

- The bundled typeface is the system font; the token font family (Atkinson Hyperlegible) is not
  shipped.
- `Raw` resists accidental leaks (logging, string templates, serialization). Reflection can still
  read the private field.
- The document text is kept in memory only; leaving the app discards a document in progress.
- Reading a PDF needs Android 15 or later (the platform text API); older versions offer paste and
  typing instead. A scanned PDF has no text layer.
- Photos are read only by an on-device model; on a phone without one the photo option says why
  and the other inputs stay available.
