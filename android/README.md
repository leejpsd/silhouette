# Silhouette for Android

The Android app of Silhouette, which finds public benefits a person may qualify for. Exact values
from a person's documents stay on the device. A cloud call only ever receives a silhouette: a
document skeleton, a generalized profile, or public content.

The cross-platform contract lives in [`../shared`](../shared/README.md). This project implements it
and tests itself against the shared fixtures in place.

## Modules

| Module | What it is |
|---|---|
| `:core` | Pure Kotlin/JVM library with no Android dependencies: the data types, Skeletonizer, Rehydrator, Generalizer, expression evaluator and verdict engine |
| `:app` | Android application (Jetpack Compose, minSdk 26). It currently shows the app name and the first line of the privacy promise |

### `:core`

| File | Contract |
|---|---|
| `DataTypes.kt` | `Raw<T>`, `Skeleton`, `Generalized<T>`, `Public<T>` and the sealed `CloudSafe` (`shared/DATA_TYPES.md`) |
| `Skeletonizer.kt` | Document text → skeleton plus placeholder map (`shared/skeleton/SPEC.md` sections 1–4) |
| `Rehydrator.kt` | Model pointers → exact values (`shared/skeleton/SPEC.md` section 5) |
| `Generalizer.kt` | Exact profile → profile silhouette and its canonical JSON (`shared/rulepacks/SPEC.md` section 6) |
| `Evaluator.kt` | Strict, three-valued expression language (`shared/rulepacks/SPEC.md` section 3) |
| `Verdicts.kt` | Rule pack verdicts with income band sample points (`shared/rulepacks/SPEC.md` sections 4–5) |
| `JsonValues.kt` | JSON trees as engine values, with JavaScript number formatting so output is byte-identical across platforms |
| `CopyStrings.kt` | UI strings from `shared/copy`, falling back to English |

How the routing rule is enforced:

- A `Raw` value prints as `[Raw]`, compares by identity and has no serializer. Only code inside
  `:core` can read it (`reveal()` is `internal`).
- `CloudSafe` is sealed, and the constructors of `Skeleton` and `Generalized` are internal, so only
  `skeletonize()`, `generalize()` and `canonical()` can turn `Raw` input into a cloud-safe value.
  `Public.of` accepts plain text and JSON trees only.
- `core/src/routingProof/` holds snippets that must **fail to compile** for exactly these reasons
  (passing a `Raw` where `CloudSafe` is required, calling `reveal()`, constructing a `Skeleton`,
  implementing `CloudSafe`, …). `RoutingProofTest` compiles each one with the Kotlin compiler
  against the compiled `:core` classes and checks the expected compiler diagnostic. A control
  snippet that uses the allowed path must compile.

### `:app`

The build task `syncSharedContract` copies `shared/copy`, `shared/rulepacks/zz-test`,
`shared/bands`, `shared/design/tokens.json` and `shared/skeleton/allowlist` into generated assets
(`assets/shared/…`). The files are never copied by hand. The app has no network permission.

## Requirements

- JDK 21 on `PATH` (Gradle runs on it; bytecode targets Java 17).
- Android SDK with platform `android-36.1` and Build Tools `36.1.0`. Create `local.properties`
  with `sdk.dir=/path/to/Android/sdk`. The build never downloads SDK components
  (`android.builder.sdkDownload=false`); a missing component fails the build.
- The `../shared` folder next to this one.

## Build and test

```bash
./gradlew :core:test          # contract conformance, canary, number format, data types, routing proof
./gradlew :app:assembleDebug  # app/build/outputs/apk/debug/app-debug.apk
```

`:core:test` reads `../shared/fixtures/conformance/` and `../shared/fixtures/canary/` directly. It
fails when the conformance folder contains a file it has no runner for, or when a runner's file is
missing. Each fixture case is reported as its own test.

## Known limits

- Conformance runs on the JVM (`java.util.regex`, JDK Unicode tables). On a device, Android's
  regex engine and Unicode tables come from ICU and depend on the OS version, so letters added in
  recent Unicode versions can be classified differently there.
- `Raw` resists accidental leaks (logging, string templates, serialization). Reflection can still
  read the private field.
