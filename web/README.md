# Silhouette for the web

Silhouette helps people find public benefits they may qualify for. Exact personal values (document text, amounts, names, answers to sensitive questions) stay on the device. Cloud model calls only ever receive a *silhouette*:

- a document with every value replaced by a placeholder; or
- a generalized profile such as an income band.

The eligibility decision itself is made by a deterministic rules engine, never by a model.

This folder is the web app: TypeScript, React and Vite, with Firebase AI Logic for hybrid on-device and cloud inference. It is installable as a PWA, and the Quick Check works offline. The cross-platform contracts it implements live in [`../shared/`](../shared/README.md).

## How it works

| Step | Where | What happens |
|---|---|---|
| Quick Check | `src/ui/screens/Question.tsx` | One question per screen. Every answer can be skipped; sensitive answers are marked and never leave the device |
| Verdicts | `src/core/rules.ts` | Three-valued rules engine (`shared/rulepacks/SPEC.md`). Results are `likely`, `maybe`, `depends` or `unlikely`, with the criteria and what each result depends on |
| Document silhouette | `src/core/skeleton.ts` | The Skeletonizer replaces every number, date and non-allowlisted word with a placeholder (`shared/skeleton/SPEC.md`). The screen shows exactly this text before anything can be sent |
| Pointer extraction | `src/ai/tasks.ts` | The model returns placeholder ids (`"N12"`), never values. The Rehydrator maps them back to the document's own values on the device |
| Review and annualization | `src/core/review.ts`, `src/core/validate.ts` | Every field is shown next to its highlighted source text, to confirm or edit. Deterministic checks and annualization turn confirmed paystubs into a yearly income |
| Why this result | `src/ui/answers/ProgramAnswers.tsx`, `src/core/rules.ts` (`criterionReasons`) | Always shown, with no model: each criterion with its state from the rules and, where the rule compares a value with a limit, the limit and the person's value. With a model on this device, "Explain my result on this device" (`explain.personal`, `ONLY_ON_DEVICE`) puts the result into words; without one, the page says why there is none |
| About this program | `src/ui/answers/`, `src/ai/tasks.ts` | Only on a tap. A model that only knows the silhouette explains the program in general and answers prepared questions; it is never given or asked for a result (`explain.v3`, `ask.v2`), and its text is checked before it is shown (`shared/prompts/OUTPUT_CHECKS.md`: one retry, then a plain notice instead of the text). Before a request leaves, a step lists what it carries and shows the exact request body; that string is the body sent and the one kept in the record. Agreeing to a device-first request does not cover a cloud-first one. Requests can be cancelled and say when they are slow. Answers are cached for the session |
| Typed questions | `src/ai/on-device.ts` | Answered only by the on-device model (`ask.freeText`), with the person's own result as context; never sent |
| Current information, other help, places, read aloud | `src/ui/answers/`, `src/ai/tasks.ts` | Behind Remote Config flags, off by default. Current information searches for every program of the rule pack in one request, so it says nothing about the person. Other help is listed separately as "Leads — not verified". Places are found near the county's center point, never the device's position. With a flag off, each page still shows the rule pack's official information |
| Leaving your device | `src/data/net-monitor.ts`, `src/data/outbound.ts` | Every request to another host is recorded before it is sent ("attempted"), then marked "sent" with its HTTP status or "failed" with the reason. The record is kept in the encrypted store and listed in the persistent bar at the bottom of the app, with the complete body of every model request. Credentials are never recorded |
| Delete everything | `src/data/store.ts` | Erases every IndexedDB database of the app's origin (the encrypted store and its key, and the Firebase SDK's App Check, heartbeat and installation databases), and the app's and the SDK's localStorage and sessionStorage entries. Only the time of the deletion is kept, so the bar can say that the record was deleted. The service worker's cache of the app's own files is kept |

### Data types decide where a value may go

`src/core/types.ts` defines four types:

- `Raw<T>` (opaque; serializes as `"[Raw]"`);
- `Skeleton`;
- `Generalized<T>`;
- `Public<T>`.

Functions that make cloud-capable model calls accept only `Skeleton | Generalized | Public`, so passing a `Raw` value does not compile. `src/ai/routing.test-d.ts` proves this with `@ts-expect-error`.

`scripts/check-routing.mjs` runs before every typecheck and adds the rules a type system cannot express:

- no casts to cloud-safe types;
- no unwrapping of `Raw` outside `src/core/`, except in the on-device-only photo task;
- `firebase/ai` is imported only under `src/ai/`.

## Where the Firebase AI Logic calls live

Every model call is under `src/ai/`:

| File | Purpose |
|---|---|
| `firebase.ts` | Firebase app, App Check and AI Logic (`GoogleAIBackend`, limited-use App Check tokens). Loaded lazily, so the Quick Check never loads the SDK |
| `tasks.ts` | One function per task in `shared/routing.json`: `extractPointers` (`PREFER_ON_DEVICE`, skeleton input, structured JSON); `explainProgram` (`explain.short` `PREFER_ON_DEVICE` or `explain.long` `PREFER_IN_CLOUD`, chosen by length and language against Remote Config values); `askChip` (`PREFER_ON_DEVICE`); `programCurrentStatus` and `discoverLeads` (`ONLY_IN_CLOUD`, Google Search); `nearbyHelp` (`ONLY_IN_CLOUD`, Google Maps at the county centroid); `readAloud` (speech model). A `PREFER_ON_DEVICE` call that fails on the device is repeated once in the cloud, as `routing.json` says |
| `pointer-config.ts` | Prompt, schema, model and output settings of the pointer task. Remote Config `prompt_pointer_extract_v` selects one of the bundled prompt versions (the newest for an unknown value) |
| `on-device.ts` | `ONLY_ON_DEVICE` tasks: `readPhoto` (`document.photo.read`), `explainPersonal` (`explain.personal`) and `askFreeText` (`ask.freeText`). The only place a `Raw` value may reach a model, and only an on-device one |
| `device-model.ts` | On-device model status (`LanguageModel.availability()`, status only) and the user-started download (`initializeDeviceModel`, requested with the language options only, so it does not depend on any task's prompt fitting the device model) |
| `model-schema.ts` | Converts the shared JSON pointer schemas into the schema form the models accept |
| `prompts.ts` | Loads prompts from `shared/prompts/` at build time |

Task ids, modes and reasons come from `shared/routing.json`. Every model result in the UI shows its source badge (on this device or cloud) and its routing reason; for explanations the reason also says what decided the route (the length against the limit, or the language).

### Remote Config

`src/data/remote-config.ts` holds the values the app reads, with bundled defaults: grounding and read aloud off, pointer prompt 4 (`prompt_pointer_extract_v`) and explanation prompt 3 (`prompt_explain_v`). Settings are never fetched on start. The first fetch follows the first request the person chose to send to the cloud, so nothing leaves the device while everything runs on it. The settings request appears under "Leaving your device" like any other.

## Look and feel

The visual design is "Duplicator" (`shared/design/DESIGN.md`, values in `shared/design/tokens.json`): one ground and one ink colour, the inverted bottom block that carries the screen's main action and the "Leaving your device" count, paper slips for the person's data, and pink only for what can leave. Results are told apart by marker shape, never by colour.

| Where | What |
|---|---|
| `src/ui/tokens.ts` | Turns the tokens into CSS custom properties (design role names only), the grain tile and the checkbox tick |
| `src/ui/styles.css` | All styling, from those properties; the few measures the tokens lack are named once at the top |
| `src/ui/design/` | Shared components: the bottom block and its modes, sheets, paper, placeholder bars, verdict markers, the stamped count, the size-step rule for display type, icons |
| `public/fonts/` | Darker Grotesque, Hanken Grotesk and DM Mono (SIL OFL 1.1, licences beside them), Latin and Latin Extended subsets, copied from `@fontsource` by `npm run fonts:copy`. Nothing is fetched from a font host |

`npm run capture` writes screenshots of every screen and state (390 px light and dark; Start, a question and Results at 320 and 1280 px in English and Spanish) to `visual-captures/`, using the same fakes as the end-to-end tests.

## Run it

Requirements: Node 22 or later.

```bash
npm install
npm run dev          # http://localhost:5173
```

### App Check

**Development.** Cloud calls need App Check. For local development, put a registered debug token in `web/.env.local`, which is ignored by Git:

```
VITE_APPCHECK_DEBUG_TOKEN=<your registered debug token>
```

The token is used only by the dev server; production builds never contain it.

**Production.** Production builds use reCAPTCHA Enterprise through `VITE_RECAPTCHA_SITE_KEY`.

**Without a token.** Everything except cloud requests works: Quick Check, verdicts, sample documents, on-device reading, manual entry and the rule pack's official information.

## Test and build

```bash
npm test                 # Vitest: conformance with shared/fixtures, unit and differential tests
npm run typecheck        # routing check + tsc for core, app, tests, e2e and the evaluation code
npm run build            # typecheck, then a production build in dist/ (service worker included)
npx playwright install chromium
npm run e2e              # Playwright end-to-end tests against the production build
```

The end-to-end tests cover:

- **Flows:** the Quick Check, offline use, keyboard-only use, "Delete everything", and the document flow from a sample PDF to a confirmed yearly income.
- **Leak check:** a canary leak test asserts that no value from `shared/fixtures/canary/` appears in any outgoing request URL, header or body.
- **Accessibility:** WCAG 2.2 A/AA scans with axe, in light and dark themes.
- **Model replies:** the model is replaced at the network edge, and Chrome's `LanguageModel` with a stand-in, so the real Firebase SDK request path runs. Grounded and speech replies are faked in the shapes the API documents (`groundingMetadata.searchEntryPoint.renderedContent`, `groundingChunks`, inline audio).
- **Answers:** nothing is requested before a tap; the step before sending shows the request body byte for byte as it is sent and recorded; consent per silhouette and destination; skipping sends nothing; a reply that states a result is never shown; cancel and the slow notice; the daily limit; language changes; typed questions and the person's own result stay on the device; Search Suggestions, sources and the Google Maps attribution are shown; with the flags off every page is complete and offers the way back.

## Extraction evaluation

`eval/` measures pointer extraction against a synthetic dataset with known answers:

- 38 English paystubs: 30 in ten layouts, plus 8 in a layout with names that contain label words, month-name dates and pay frequencies in words;
- 6 Korean payslips in 3 layouts;
- 4 leases.

```bash
npm run eval:generate                          # regenerate eval/dataset/ (seeded, deterministic)
npm run eval -- --variants v0 --set en         # real cloud calls through the app's own code path
```

`node eval/answers.mjs` makes a small number of real explanation and prepared-question calls on synthetic profiles and checks length, wording, numbers and language.

`npm run eval` starts the dev server (it needs the App Check debug token above) and drives `eval/runner.html` in headless Chromium. It writes per-document results and `eval/results/summary.md`. Calls are sequential and back off on rate limits; `eval/results/calls.json` counts every call made.

## Layout

```
src/core/   pure TypeScript, no DOM: types, skeleton, rules, generalize, validate, review
src/ai/     the only code that talks to models (Firebase AI Logic)
src/data/   encrypted local store (IndexedDB + AES-GCM), PDF text extraction, network monitor
src/ui/     React screens, copy (shared/copy plus local additions), router
e2e/        Playwright tests
eval/       extraction dataset, runner and results
scripts/    routing check, PDF and icon generators
```
