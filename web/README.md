# Silhouette for the web

Silhouette helps people find public benefits they may qualify for. Exact personal values (document text, amounts, names, answers to sensitive questions) stay on the device. Cloud model calls only ever receive a *silhouette*:

- a document with every value replaced by a placeholder;
- a generalized profile such as an income band (only for looking for other help); or
- nothing about the person at all: the general explanation and prepared questions carry only the program's public information.

The eligibility decision itself is made by a deterministic rules engine, never by a model.

**Real programs, as a draft.** The app ships the California rule pack (`shared/rulepacks/us-ca/`): the federal Earned Income Tax Credit, the California Earned Income Tax Credit, the Young Child Tax Credit, CalFresh, California LifeLine, CARE and FERA. Every limit and amount was read from the agencies' own publications on November 12, 2026. The pack is marked as a draft until a person has confirmed every number, so:
- every screen says so;
- results say "may qualify", never more;
- every program page links its official sources with the date they were read.

The web engine reproduces the pack's 27 hand-worked households (189 results; `src/core/us-ca.test.ts`). The invented `zz-test` pack is used only by the unit tests and by the end-to-end suite that drives every screen against it (`npm run build:demo-pack`); no build people get contains it.

This folder is the web app: TypeScript, React and Vite, with Firebase AI Logic for hybrid on-device and cloud inference. It is installable as a PWA, and the Quick Check works offline. The cross-platform contracts it implements live in [`../shared/`](../shared/README.md).

## How it works

| Step | Where | What happens |
|---|---|---|
| Quick Check | `src/ui/screens/Question.tsx` | One question per screen. Every answer can be skipped; sensitive answers are marked and never leave the device |
| Verdicts | `src/core/rules.ts` | Three-valued rules engine (`shared/rulepacks/SPEC.md`). Results are `likely`, `maybe`, `depends` or `unlikely`, with the criteria and what each result depends on |
| Document silhouette | `src/core/skeleton.ts` | The Skeletonizer replaces every number, date and non-allowlisted word with a placeholder (`shared/skeleton/SPEC.md`). The screen shows exactly this text before anything can be sent |
| Pointer extraction | `src/ai/tasks.ts`, `src/ai/device-schema.ts`, `src/core/pointer-check.ts` | The model returns placeholder ids (`"N12"`), never values. The Rehydrator maps them back to the document's own values on the device. In the cloud the silhouette is one request with `shared/prompts/pointer-extract.v5.md`. On a device whose model is available, a paystub is read in parts through Firebase AI Logic, same task and routing reason, exactly as `shared/validation/DEVICE_READING.md` (version 2, contract v1.18) specifies, with the wording of `shared/prompts/pointer-extract-device.v1.md`: the core fields first; gross pay and year to date asked again when only they fail, or when year to date is left out although the document has one place for it; then the deductions, asked once more when they do not add up. Each part has a strict response constraint built for the document. Deterministic checks only reject or leave fields out, never pick a value. A core that fails is a failed on-device attempt: after Send it is read once in the cloud (`routing.json` `onDeviceFailure`); kept on the device, nothing is sent and the page says the device could not read it reliably. Deductions, names and hours or rate that contradict each other are left out and marked "not read on this device"; none of them feeds the yearly income or any rule. A value that feeds no result is shown only when a check confirms it (`shared/validation/DEVICE_READING.md` section 5.1): hours and rate only together and only when rate × hours is an earnings amount of the document; net pay only when the deductions add up or it sits on a net-pay line; a pay date before the period end is left out. Recomputed from every recorded answer (Chrome and iPhone), these rules leave no wrong value in any on-device reading (`eval/results/on-device/README.md`). While the preview is open and the device model is available, the whole on-device reading (every part) runs ahead on the device: nothing is sent or stored, the reading is held in memory for exactly that silhouette and used once, and "Send" or "Keep" while it is still running continues from where it is, with the status line showing the real step. A hidden word, leaving the screen, typing the numbers instead or "Delete everything" cancels it before its next part. Remote Config `prompt_pointer_extract_v` picks the bundled prompt version (default 5; 4 reads in one request on the device too). The web implementation passes every case of `shared/fixtures/conformance/device-reading.json` (`src/core/conformance.test.ts`, run part by part with a fake device) |
| Review and annualization | `src/core/review.ts`, `src/core/validate.ts` | Every field is shown next to its highlighted source text, to confirm or edit. Deterministic checks and annualization turn confirmed paystubs into a yearly income |
| Why this result | `src/ui/answers/ProgramAnswers.tsx`, `src/core/rules.ts` (`criterionReasons`) | Always shown, with no model: each criterion with its state from the rules and, where the comparison with a limit is what produced that state, the limit and the person's value. A criterion met another way (such as receiving a benefit) says which way; a state that depends on something other than the income says what; a limit for the largest household size says so. With a model on this device, "Explain my result on this device" (`explain.personal`, `ONLY_ON_DEVICE`) puts the result into words; without one, the page says why there is none |
| About this program | `src/ui/answers/`, `src/ai/tasks.ts` | Only on a tap. The page first shows the rule pack's own information about the program (what it offers, how to apply, the usual papers, the office). A model then explains the program in general and answers prepared questions from that information alone: the request carries nothing about the person, no profile, no rule states and no result (`explain.v5`, `ask.v4`; the task functions accept `Public` input only). Its text is checked before it is shown, in the answer language, on every path (`shared/prompts/OUTPUT_CHECKS.md` version 2: one retry, then a plain notice instead of the text). Before a request leaves, a step lists what it carries and shows the exact request body; that string is the body sent and the one kept in the record. Agreeing to a device-first request does not cover a cloud-first one. Requests can be cancelled and say when they are slow. Answers are cached for the session |
| Typed questions | `src/ai/on-device.ts` | Answered only by the on-device model (`ask.freeText`), with the person's own result as context; never sent |
| Current information, other help, places, read aloud | `src/ui/answers/`, `src/ai/tasks.ts` | Behind Remote Config flags, off by default. Current information searches for every program of the rule pack in one request, so it says nothing about the person. Other help is listed separately as "Leads — not verified". Places are found near the county's center point, never the device's position. With a flag off, each page still shows the rule pack's official information |
| Leaving your device (`shared/RECORD.md`) | `src/data/net-monitor.ts`, `src/data/outbound.ts` | Every request to another host (by `fetch` or `XMLHttpRequest`) is recorded before it is sent ("attempted"), then marked "sent" with its HTTP status or "failed" with the reason; scripts and frames another service loads into the page (reCAPTCHA) are listed once loaded. A request the browser refuses under the site's content security policy never counts as sent: it is listed as "Not sent: the browser refused it". Each entry says in plain words what it was (the silhouette, an App Check token request, a check that this is the real app by reCAPTCHA, a settings request); none is shown as a bare host name. The record is kept in the encrypted store and listed in the persistent bar at the bottom of the app, with the complete body of every model request. Credentials are never recorded. An answer written by the on-device model is listed too, as "Answered on this device", with no destination and no body; the record counts it as kept, and the count in the bar stays the number of requests that left |
| Delete everything | `src/data/store.ts` | Reached from the record of what left and from the rules notice's sheet. Erases every IndexedDB database of the app's origin (the encrypted store and its key, and the Firebase SDK's App Check, heartbeat and installation databases), and the app's and the SDK's localStorage and sessionStorage entries. Only the time of the deletion is kept, so the bar can say that the record was deleted. The service worker's cache of the app's own files is kept |

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

**On-device only means on-device only.** In a browser without Chrome's Prompt API (`LanguageModel`), Firebase AI Logic 3.1 sends a request to the cloud whatever its inference mode, `ONLY_ON_DEVICE` included. So every `ONLY_ON_DEVICE` task (`src/ai/on-device.ts`) stops with a typed error before any SDK call unless the on-device model reports `available`, and the network monitor (`src/data/net-monitor.ts`) lets a request reach Firebase AI Logic only when a cloud-capable task registered it just before, blocking and recording anything else (tests: `src/ai/only-on-device.test.ts`, `e2e/dev/only-on-device.spec.ts`).

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

`src/data/remote-config.ts` holds the values the app reads, with bundled defaults: grounding and read aloud off, pointer prompt 5 (`prompt_pointer_extract_v`; the deployed template sets 5 too), explanation prompt 5 (`prompt_explain_v`) and prepared-question prompt 4 (`prompt_ask_v`). Settings are never fetched on start. The first fetch follows the first request the person chose to send to the cloud, so nothing leaves the device while everything runs on it. The settings request appears under "Leaving your device" like any other.

## Look and feel

The visual design is "Duplicator" (`shared/design/DESIGN.md`, values in `shared/design/tokens.json`): one ground and one ink colour, the inverted bottom block that carries the screen's main action and the "Leaving your device" count, paper slips for the person's data, and pink only for what can leave. Results are told apart by marker shape, never by colour. Amounts are money in the rule pack's currency, written the way the jurisdiction writes them (`numberFormat`, `$34,000` in every interface language), which is also the form the app accepts when an amount is typed. From 600 px the app is one centred column with a floating block. From 960 px it uses two columns: the screen on the left in one fixed-width column, and the block as a 400 px panel on the right, where the sheets open too and where the start screen's example sits. Every sheet keeps the "Leaving your device" count in view.

| Where | What |
|---|---|
| `src/ui/tokens.ts` | Turns the tokens into CSS custom properties (design role names only), the grain tile and the checkbox tick |
| `src/ui/styles.css` | All styling, from those properties (a unit test checks that every property it uses is defined) |
| `src/ui/design/` | Shared components: the bottom block and its modes, sheets, paper, placeholder bars, verdict markers, the stamped count, the size-step rule for display type, icons |
| `public/fonts/` | Darker Grotesque, Hanken Grotesk and DM Mono (SIL OFL 1.1, licences beside them), Latin and Latin Extended subsets, copied from `@fontsource` by `npm run fonts:copy`. Nothing is fetched from a font host |

`npm run capture` writes screenshots of every screen and state (390 px light and dark; Start, a question and Results at 320 px, and the wide layout at 960, 1280, 1440 and 1920 px, in English and Spanish) to `visual-captures/`, using the same fakes as the end-to-end tests.

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

**Production.** Production builds use reCAPTCHA Enterprise through `VITE_RECAPTCHA_SITE_KEY`, with limited-use App Check tokens for Firebase AI Logic. App Check starts only when a request is about to go to the cloud (see "What leaves, and when" below). The site key is public but not committed: `npm run build:hosting` reads it from the environment or from the git-ignored `web/.env.hosting.local`. When App Check cannot get a token, the page says so without blaming the person, and "Try again" starts Firebase again so the SDK's throttling of the failed attempt does not block the retry.

**Without a token.** Everything except cloud requests works: Quick Check, verdicts, sample documents, on-device reading, manual entry and the rule pack's official information.

## For judges, and evidence of on-device runs

- **`#/judges`** ("For judges: try it in two minutes", from the "More" sheet of the rules notice) has three steps, one button each:
  1. Run the Quick Check for a prepared, invented household. Its results show every kind of answer: may qualify, possible, depends on a skipped answer, probably not.
  2. Open the sample paystub's silhouette and send it. Its yearly income turns two "possible" tax credits into "may qualify", with amounts.
  3. Open "Leaving your device" and compare what left. It works in any browser. Without an on-device model the silhouette goes to the cloud, and offline the sample's answer key is used. The page says which steps run on the device when a model is present.
- **`#/device-check`** runs a fixed set of synthetic cases through Firebase AI Logic in a Chrome that has the on-device model, records where each one actually ran, and offers the results as a JSON file. For extraction it records:
  - where each case was finally answered: on this device, in the cloud after a failed on-device attempt, or in the cloud;
  - separately, the first attempt: where it ran and the fields right in it;
  - the fields right in what the person ends up with, after the checks and any retry, and whether the deductions were left unread;
  - for each part of the on-device reading, its raw text, parsed answer, problems and time; the core fields right and the deductions on their own;
  - field by field, the expected and the answered placeholder ids (fields are scored by value: a field is right when the answered placeholder holds the expected value, whichever placeholder that is);
  - for the inputs of the yearly income, how many readings have them all right, some not found (left empty, to be typed), or some wrong; and how many readings let any wrong value reach the person, the number that must be zero.

  An option runs the extraction cases three times, to show how stable the device's reading is; each reading is recorded with its repetition.

  A case that ended up in the cloud is counted as a cloud run, never as an on-device one. Two recorded runs are bundled from `eval/results/on-device/`: the first (baseline) and the latest. The four runs in between are kept in `eval/results/on-device/history/` and open with "Open a run file". A browser without the model can show them, labelled as recordings with their date and machine. The recording page shows three numbers first: cases answered on this device, readings with every yearly-income input right (with the readings that have a value not found beside it), and readings in which a wrong value reached the person, shown as met when it is zero.

  `eval/results/on-device/README.md` explains how a run file is made and lists all six runs in a progression table. The latest, on 2026-11-17 with each paystub read three times in Chrome 157, answered 24 of 24 cases on the device; in 15 readings no wrong value reached the person, and every yearly-income input was right in 13 (in 2, a value was not found and left to be typed in). The rules of the on-device reading are specified in `shared/validation/DEVICE_READING.md`.

  The check itself is shared with the other platforms (contract v1.18, `shared/validation/DEVICE_CHECK.md`): its cases and check documents come from `shared/fixtures/device-check/`, the prepared household of the judges' path and of the check from `shared/rulepacks/us-ca/judges-household.json`, and every run file, bundled or in history, is validated against `shared/schemas/device-check-run.v3.json` (a file that does not validate does not open). A run made in this browser carries the schema's optional `device` block: platform `web`, the operating system, the Firebase JS SDK version and the app version (Chrome does not name its on-device model to pages). The web passes every case of `shared/fixtures/conformance/device-check.json` (scoring, summary, file names) and `judges-household.json` (the household's results before and after the sample paystub).

## Hosting

The app is hosted at https://silhouette-hybrid.web.app.

```bash
VITE_RECAPTCHA_SITE_KEY=<site key> npm run build:hosting   # or put the key in web/.env.hosting.local
```

`build:hosting` typechecks, then builds `dist/` in mode `hosting`. It stops with a clear message if the reCAPTCHA Enterprise site key is missing. Afterwards it runs `scripts/check-bundle.mjs`, which fails if the output contains the App Check debug-token code path or any value from a local env file. A unit test checks the same on a production build.

`hosting/firebase.hosting.json` is the Firebase Hosting section this build expects:
- `public` set to `web/dist`;
- a rewrite to `index.html`;
- long caching for hashed assets, and no caching for the first page (`/` and `index.html`) and the service worker;
- a content security policy that allows only the Firebase endpoints the app calls (AI Logic, App Check, Installations, Remote Config) and reCAPTCHA Enterprise as Google documents it (`script-src` `https://www.google.com/recaptcha/` and `https://www.gstatic.com/recaptcha/`, `frame-src` `https://www.google.com/recaptcha/` and `https://recaptcha.google.com/recaptcha/`, `connect-src` `https://www.google.com/recaptcha/`), with no font or analytics hosts.

`e2e/hosting.spec.ts` runs the app under that policy and fails on any violation. `e2e/hosting/recaptcha.spec.ts` runs the hosting build itself (mode `hosting`, with a test site key) under the policy, with reCAPTCHA Enterprise and App Check answering in the shapes they use in production (the `enterprise.js` loader, the release script, the check frame, the `clr` and `reload` calls, the token exchange): it fails if the policy refuses any of them, checks that the App Check token reaches Firebase AI Logic, and that "Try again" after a failed exchange works without reloading.

**What leaves, and when.** Work on the device leaves nothing: opening the app, the Quick Check, the preview and its read-ahead, an on-device reading with all its parts, on-device explanations, typed questions and the photo reading make no request to any other origin. Firebase runs as two apps (`src/ai/firebase.ts`): requests that run on the device model use an app without App Check; App Check, and with it reCAPTCHA, belongs to a second app that is created only when a request is about to go to the cloud, after the person chose to send. `e2e/hosting/device-only.spec.ts` checks this on the network, under the hosting build and policy, for the two-minute path and the on-device check.

On a first cloud Send in a browser without the device model, the hosted app makes these requests, in this order:

| # | Request | Purpose |
|---|---|---|
| 1 | `GET https://www.google.com/recaptcha/enterprise.js?render=explicit` | reCAPTCHA Enterprise's loader, added by App Check when it starts |
| 2 | `GET https://www.gstatic.com/recaptcha/releases/…/recaptcha__en.js` | reCAPTCHA's script, added by the loader |
| 3 | `GET https://www.google.com/recaptcha/enterprise/anchor?…` | reCAPTCHA's invisible check frame; what the frame itself loads and sends is not visible to the page |
| 4 | `POST https://www.google.com/recaptcha/enterprise/clr?k=…` | reCAPTCHA's check call from the page |
| 5 | `POST https://content-firebaseappcheck.googleapis.com/v1/projects/…/apps/…:exchangeRecaptchaEnterpriseToken` | one limited-use App Check token for this request (no standing token is kept or refreshed) |
| 6 | `POST https://firebasevertexai.googleapis.com/v1beta/projects/…/models/gemini-3.5-flash-lite:generateContent` | the silhouette, with the App Check token in a header |
| 7 | `POST https://firebaseinstallations.googleapis.com/v1/projects/…/installations` | after the first cloud request only: an installation id for Remote Config (once per browser) |
| 8 | `POST https://firebaseremoteconfig.googleapis.com/v1/projects/…/namespaces/firebase:fetch` | the settings, after the first cloud request only |

Every later Send makes the reCAPTCHA check (4) again, one token exchange (5) and one model request (6). If the exchange fails, the model request is not made: nothing carries the silhouette, and the page offers "Try again". The record lists each request in plain words, and the line under its count separates what carried something of the person's from checks that carry none, for example "1 sent with your document’s silhouette · 6 technical checks, no personal data".

**Service worker.** The first page is fetched from the network whenever it answers, so a returning visitor gets the latest deploy with its own headers; the precached copy is used offline or when the server fails. Other files come from the precache. A new worker takes over at once and keeps the previous version's files for a page still open with them (`sw/sw.template.js`, tested in `sw/sw.test.mjs` and `e2e/service-worker.spec.ts`).

## Test and build

```bash
npm test                 # Vitest: conformance with shared/fixtures, unit and differential tests
npm run typecheck        # routing check + tsc for core, app, tests, e2e and the evaluation code
npm run build            # typecheck, then a production build in dist/ (service worker included), California pack
npm run build:demo-pack  # the same with the invented zz-test pack, for the end-to-end suite only
npx playwright install chromium
npm run e2e              # Playwright: every screen against the demo pack, the shipped California build, the hosting build with reCAPTCHA App Check, and module pages
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
src/ui/     React screens, copy (shared/copy, with the `.web` variant of keys that name the platform), router
e2e/        Playwright tests
eval/       extraction dataset, runner and results
scripts/    routing check, PDF and icon generators
```
