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
