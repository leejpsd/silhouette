# On-device runs

Each `*.json` file here is one run of the app's on-device check, made in a browser that has Chrome's built-in model. The app bundles these files, so the hosted app can show them at `#/device-check` in a browser without the model. A run shown this way is labelled in the page heading as a recording, with its date, browser and platform. It is never presented as a live run.

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
5. Copy that file into this folder unchanged. The file name becomes the label of the recording.

Every input is synthetic: the bundled sample, generated evaluation paystubs and an invented household.

## What a run file contains

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

A case that ended up in the cloud is recorded as `IN_CLOUD` and counted as a cloud run in the summary; the summary also says how many of them went to the cloud after a failed on-device attempt. A case that may only run on the device is never sent: without the model it is recorded as `not-run` with its error.
