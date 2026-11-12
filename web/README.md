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
| Leaving your device | `src/data/net-monitor.ts` | Every request to another host is recorded before it is sent and listed in the persistent bar at the bottom of the app |

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
| `tasks.ts` | `extractPointers` for `document.pointer.extract`: `PREFER_ON_DEVICE`, skeleton input, structured JSON output |
| `pointer-config.ts` | Prompt, schema, model and output settings of the pointer task. `ACTIVE_POINTER_CONFIG` in `tasks.ts` selects the one in use |
| `on-device.ts` | `readPhoto` for `document.photo.read`: `ONLY_ON_DEVICE`. The only place a `Raw` value may reach a model, and only an on-device one |
| `device-model.ts` | On-device model status (`LanguageModel.availability()`, status only) and the user-started download (`initializeDeviceModel`) |
| `model-schema.ts` | Converts the shared JSON pointer schemas into the schema form the models accept |
| `prompts.ts` | Loads prompts from `shared/prompts/` at build time |

Task ids, modes and reasons come from `shared/routing.json`. Every model result in the UI shows its source badge (on this device or cloud) and its routing reason.

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

**Without a token.** Everything except cloud extraction works: Quick Check, verdicts, sample documents, on-device reading and manual entry.

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
- **Model replies:** the model is replaced at the network edge, and Chrome's `LanguageModel` with a stand-in, so the real Firebase SDK request path runs.

## Extraction evaluation

`eval/` measures pointer extraction against a synthetic dataset with known answers:

- 30 English paystubs in 10 layouts;
- 6 Korean payslips in 3 layouts;
- 4 leases.

```bash
npm run eval:generate                          # regenerate eval/dataset/ (seeded, deterministic)
npm run eval -- --variants v0 --set en         # real cloud calls through the app's own code path
```

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
