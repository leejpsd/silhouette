# Copy that names the platform

Some sentences name the thing the person holds ("this browser", "this iPhone", "this phone"), the model it may have (Chrome's on-device model, Apple Intelligence, Gemini Nano), or what the app can show ("byte for byte" on the Web; "as the app built it" where the SDK serializes the request). A placeholder such as `{device}` would not do: the noun starts sentences, carries gender in Spanish, and comes with a different model name and a different reason in each case.

**Rule.** Such a key has one variant per platform, `{key}.web`, `{key}.ios`, `{key}.android`, and no plain `{key}`. A platform looks up `{key}.{platform}` and falls back to the plain `{key}` only for keys that have no variants. The copy check in `reference/lint.mjs` can require that a key with one variant has all three.

Keys with variants in v1.18 (en, es; ko holds the English text):

| Key | Web | iOS | Android |
|---|---|---|---|
| `deviceCheck.noModel` | "This browser has no on-device model…" | "This iPhone has no on-device model available (Apple Intelligence is off, not supported, or its model is not ready)…" | "This phone has no on-device model available (Gemini Nano through AICore is not supported here or not ready)…" |
| `deviceCheck.download` | "Download results" | "Share the results" | "Share the results" |
| `deviceCheck.environment` | "Browser: {browser} · Platform: {platform} · Date: {date}" | "Device: {browser} · System: {platform} · Date: {date}" | as iOS |
| `deviceCheck.live` | "Live run in this browser" | "Live run on this iPhone" | "Live run on this phone" |
| `judges.step3.body` | "…each request that left, byte for byte…" | "…each request that left, as the app built it…" | as iOS |
| `judges.withModel` | "This browser has the on-device model…" | "This iPhone has the on-device model…" | "This phone has the on-device model…" |
| `judges.withoutModel` | "…With Chrome’s on-device model, step 2 runs on this device." | "…With Apple Intelligence on, step 2 runs on this device." | "…With Gemini Nano ready on this phone, step 2 runs on this device." |
| `judges.checking` | "Checking whether this browser has the on-device model…" | "…this iPhone…" | "…this phone…" |

The Web and iOS variants are the two apps' current wording, unchanged. The Android variants are proposed here.

Web-only keys that other platforms do not need: `outbound.field.recaptcha-check`, `leaving.recaptchaNote`, `outbound.status.refusedByBrowser` (native apps use App Attest or Play Integrity, and have no content security policy). They stay unsuffixed: they only appear where the Web shows them.

## The device noun

Most sentences do not need a variant: they only name the thing the person holds. The plain copy says "this device", which is what the Web shows. An iPhone app that says "this iPhone" on one line and "this device" on the next reads as unfinished, so iOS and Android rename the device by rule, and no key is tripled for it.

**Rule.** After looking up a string (its own variant when the key has one, the plain key otherwise), iOS and Android replace the phrases in `platform/device-noun.json` for the language of the string. The Web replaces nothing.

- Phrases are matched case-sensitively and whole: the character before and after must not be a letter, a digit or a hyphen. "on-device model" and "device-first" are left alone, and so is "Device first".
- The longest phrase that matches at a position wins. Text inside `{…}` is never changed.
- English: "this device", "your device", "the device" and "on device" (with their capitalised forms) become "this iPhone", "your iPhone", "the iPhone", "on iPhone" on iOS and "this phone", "your phone", "the phone", "on phone" on Android; "this phone" becomes "this iPhone" on iOS.
- Spanish: "este dispositivo" and "tu dispositivo" become "este iPhone" / "este teléfono" and "tu iPhone" / "tu teléfono". "el dispositivo" and "del dispositivo" are left alone: Spanish uses them for "on-device" ("el modelo del dispositivo").
- The rule also runs over a platform's own variants, so "…is read on this device first" inside `judges.withModel.ios` says "this iPhone" too. Applying it twice changes nothing.
- A platform's local copy follows the same wording; the table is only for strings from `shared/copy`.

`fixtures/copy/device-noun.json` lists every string the rule changes, per language and platform (`text` → `shown`). A platform passes when its loader gives `shown` for each case. Reference: `reference/device-noun.mjs`; the fixture is rebuilt with `node reference/device-noun.generate.mjs` whenever the copy changes, and the reference tests fail when it is stale.
