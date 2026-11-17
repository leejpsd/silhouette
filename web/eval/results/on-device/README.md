# On-device runs

Each `*.json` file here is one run of the app's on-device check, made in a browser that has Chrome's built-in model. A run shown in the app is labelled in the page heading as a recording, with its date, browser and platform. It is never presented as a live run.

## Which runs the app shows

The app bundles only the `*.json` files directly in this folder, and lists them at `#/device-check`. Exactly two are kept here:

- the first run, `device-check-2026-11-16-chrome157-macos.json`, as the baseline;
- the latest run (by the `date` in the file).

The tests read both from this folder; they name no file and no figure of the latest run, so adding a newer run needs no test change.

Every other run is kept in [`history/`](history/). It is not bundled, and any browser can still show it with **Open a run file**. When a newer run is added, move the previous latest run into `history/` and put the new file here, so this folder again holds the baseline and the latest run.

## How a run file is produced

1. Open the app in desktop Chrome on a machine where Chrome's on-device model (Gemini Nano) is installed and ready.
2. Open `#/device-check`. It is also reached from the start screen: "Demo rules … More", then "Check the on-device model".
3. Press **Run the check**. The page runs the fixed set of cases one after another and fills the table as each one finishes:
   - pointer extraction on the bundled English sample and four evaluation paystubs;
   - the general explanation and two prepared questions, in English and in Spanish;
   - the explanation of a person's own result and a typed question;
   - reading a picture of the sample paystub, when the model accepts images.
   To see how stable the device's reading is, tick "Run each extraction case 3 times" first: the extraction cases then run three times each (15 readings).
4. When the status line says "Finished.", press **Download results**. The browser saves `device-check-YYYY-MM-DDTHHMM-<browser><major>-<platform>.json` (UTC time of the run, for example `device-check-2026-11-16T1744-chrome157-macos.json`).
5. Copy that file into this folder unchanged and move the previous latest run into `history/` (see above). The file name becomes the label of the recording.

Every input is synthetic: the bundled sample, generated evaluation paystubs and an invented household.

## Progression

Figures are taken from the files. "Readings" are the extraction cases (5 per run, 15 with three repetitions). "Wrong values reaching the person": readings in which any field the person is shown has a value that is not the document's (a value not found is not counted). Where a file does not record per-field results for its final answer, the figure is worked out from its per-field record of the device's answer and its final field count; the first run has neither.

| Run (UTC) | File | What changed in the app before this run | Cases answered on this device / in the cloud after a failed on-device attempt | First-attempt fields right | Readings with all yearly-income inputs right | Readings with a wrong value reaching the person | Time per paystub, median (range) |
|---|---|---|---|---|---|---|---|
| 2026-11-16 | `device-check-2026-11-16-chrome157-macos.json` | Baseline: one pass on the device, no check of the answer | 14 / 0 of 14 | 37 of 60 | not recorded | not recorded | 4.5 s (3.5–9.3 s) |
| 2026-11-16 17:44 | `history/device-check-2026-11-16T1744-chrome157-macos.json` | Deterministic check of the answer; a failed answer is read once in the cloud | 9 / 5 of 14 | 48 of 60 | 5 of 5 | 0 of 5 | 17.8 s (14.0–22.4 s), including the cloud retry |
| 2026-11-16 18:07 | `history/device-check-2026-11-16T1807-chrome157-macos.json` | Reading in two parts (core, deductions) with a strict per-document constraint; deductions optional | 13 / 1 of 14 | 54 of 60 | 3 of 5 | 3 of 5 | 5.7 s (5.1–10.7 s) |
| 2026-11-16 18:24 | `history/device-check-2026-11-16T1824-chrome157-macos.json` | Year-to-date rules (same line, larger amount); gross part when only gross pay or year to date fail; names sharing a placeholder not read | 14 / 0 of 14 | 52 of 60 | 3 of 5 | 1 of 5 | 6.3 s (5.4–10.7 s) |
| 2026-11-16 18:36 | `history/device-check-2026-11-16T1836-chrome157-macos.json` | Gross part also when year to date is left out; one placeholder per field; deductions asked once more; three repetitions | 24 / 0 of 24 | 164 of 180 | 15 of 15 | 2 of 15 | 7.4 s (5.3–14.9 s) |
| 2026-11-17 00:38 | `device-check-2026-11-17T0038-chrome157-macos.json` | A name cut short (the next word on its line left out) is left out as not read; three repetitions | 24 / 0 of 24 | 161 of 180 | 13 of 15 (2 with a value not found, 0 wrong) | 0 of 15 | 7.6 s (5.1–14.6 s) |

In the 18:36 run both wrong values were names cut short; the 00:38 run is the first with that rule. Its two readings with a value not found: L01 run 3 (the gross part answered another line's year to date, the checks rejected it, and year to date stayed empty) and L07 run 3 (period start and end left empty; the yearly income used the pay date).

The rules of the on-device reading are specified in `shared/validation/DEVICE_READING.md` (version 2, contract v1.18), with the prompts `shared/prompts/pointer-extract.v5.md` and `pointer-extract-device.v1.md`.

## Recomputed under the confirmation rules (contract v1.18)

These figures are **recomputed from the recorded answers, not new runs**. Each recorded on-device reading was replayed, part by part, through the current app with a stand-in device that gives the answer recorded for each part (a part the recording did not have gets the recorded answer of the part it replaces). Readings that end in the cloud under the current rules are not counted, because their cloud answer was not recorded. The rules: hours and rate shown only when rate × hours is an earnings amount; net pay only when the deductions add up or it sits on a net-pay line; a pay date before the period end left out (`shared/validation/DEVICE_READING.md` section 5.1).

| Run | File | Readings with a wrong value reaching the person, as recorded | Readings that stay on the device when replayed | …with a wrong value under the confirmation rules |
|---|---|---|---|---|
| Chrome 157, 2026-11-16 | `device-check-2026-11-16-chrome157-macos.json` | not recorded | none (no per-part answers recorded) | — |
| Chrome 157, 17:44 | `history/device-check-2026-11-16T1744-chrome157-macos.json` | 0 of 5 | 2 | 0 |
| Chrome 157, 18:07 | `history/device-check-2026-11-16T1807-chrome157-macos.json` | 3 of 5 | 2 | 0 |
| Chrome 157, 18:24 | `history/device-check-2026-11-16T1824-chrome157-macos.json` | 1 of 5 | 5 | 0 |
| Chrome 157, 18:36 | `history/device-check-2026-11-16T1836-chrome157-macos.json` | 2 of 15 | 15 | 0 |
| Chrome 157, 2026-11-17 00:38 | `device-check-2026-11-17T0038-chrome157-macos.json` | 0 of 15 | 15 | 0 |
| iPhone 17 Pro, iOS 26.5.2, 05:05 | `device-check-2026-11-17T0505-silhouette0-ios2652.json` (kept with the iOS app) | 3 of 5 | 4 | 0 |
| iPhone 17 Pro, iOS 26.5.2, 05:08 | `device-check-2026-11-17T0508-silhouette0-ios2652.json` (kept with the iOS app) | 2 of 5 | 4 | 0 |
| iPhone 17 Pro, iOS 26.5.2, 05:11 | `device-check-2026-11-17T0511-silhouette0-ios2652.json` (kept with the iOS app) | 6 of 15 | 9 | 0 |

On the iPhone the wrong values were all secondary: hourly rate 11 times, hours worked 8, net pay 3, the pay date once (answered as the period start). The confirmation rules leave every one of them out. The right values they also leave out are 1 hours value and 12 rates whose other half was wrong or missing.

## What a run file contains

The format is specified for every platform in `shared/validation/DEVICE_CHECK.md` (contract v1.18), with the JSON Schema `shared/schemas/device-check-run.v3.json`; every file here and in `history/` validates against it (`src/ui/device-check/run.test.ts`). The cases and the check documents are `shared/fixtures/device-check/`.

| Field | Meaning |
|---|---|
| `date` | When the run started (ISO 8601) |
| `browser`, `platform`, `userAgent` | From the browser that ran it |
| `availability` | What `LanguageModel.availability()` reported before the run, for each set of options the tasks use |
| `jurisdiction` | The rule pack the app had |
| `version` | 3 since `ran` became the final location and the two parts of an on-device reading were recorded; version 1 and 2 files still open and replay |
| `cases[]` | One per case: `id`, `task`, the inference `mode` the app asked for, where it was finally answered (`ran`: `ON_DEVICE`, `IN_CLOUD`, or `not-run`), `latencyMs`, `outputCheck` (`passed` or `blocked` for model text), and any `error` or `note`. In versions 1 and 2, `ran` is where the first attempt ran and `fields` the fields correct in the first answer |
| `cases[].first` (v3, extraction) | The first attempt: where it `ran` and the `fields` correct in it (the device's whole answer, when the device answered) |
| `cases[].final` (v2, extraction) | What the person ends up with after the deterministic check and any retry: where it `ran`, the `fields` correct, whether it was `retried` in the cloud, and (v3) whether the deductions were left out as `deductionsNotRead` |
| `cases[].device` (v2, extraction) | The device's answer: its raw text (placeholder ids and field names only), whether it `parsed` and `passed` the check, the `problems` found, and for each field the expected (`gold`) and `answered` placeholder ids and a `status` (`correct`, `wrong`, `missing`, `spurious`, `absent`) |
| `cases[].device` (v3 additions) | `scoredBy`: `value` (a field is right when the answered placeholder holds the expected value; `gold` lists every placeholder that holds it, so a paystub that writes an amount twice has two right ids); `core`: the core fields correct (all fields but the deductions); `deductions`: the status of the deductions the device gave (`not-asked` when the core failed first); `deductionsNotRead`; `passes`: for each request to the device (`core`, `gross` when gross pay and year to date were asked again, `deductions`, then `deductions-again` when the list did not add up), its `rawText`, `parsed`, `parsedValue`, `problems`, `marked` (problems that only left fields out as not read: names sharing a placeholder, hours or rate on an amount's placeholder), `extraKeys` (ignored), `missingKeys` and `latencyMs` |
| `cases[].final` (v3 additions) | `notRead`: every field left out as not read on this device; `incomeInputsCorrect`: gross pay, year to date, pay frequency, period start, period end and pay date all right (or absent where the document has none); `incomeInputs`: those inputs split into `right`, `notFound` (left empty) and `wrong` (a value that is not the document's); `wrongFields`: every field whose value reached the person wrong |
| `repetitions`, `cases[].repetition` (v3) | How many times each extraction case was run, and which run a case is (absent: one run) |
| `device` (v3, optional) | The device block of the schema. A run made in a browser writes platform `web`, the operating system, the Firebase JS SDK version and the app version; phones also write the device model and the on-device model where their platform names it |

A case that ended up in the cloud is recorded as `IN_CLOUD` and counted as a cloud run in the summary; the summary also says how many of them went to the cloud after a failed on-device attempt. A case that may only run on the device is never sent: without the model it is recorded as `not-run` with its error.
