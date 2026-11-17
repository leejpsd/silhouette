# On-device check specification (v1)

The on-device check runs a fixed set of synthetic cases through Firebase AI Logic and the app's own tasks on the device it is opened on, records where each one was answered, scores the paystub readings against known answers, and saves the result as a run file. A run file is evidence: platforms bundle recorded runs and show them, labelled as recordings, on devices without a model.

Reference implementation: `reference/device-check.mjs`. Fixtures: `fixtures/device-check/` (cases, documents, right answers, a recorded run) and `fixtures/conformance/device-check.json` (scoring and summary). Schema: `schemas/device-check-run.v3.json`.

## 1. Cases

`fixtures/device-check/cases.json` lists the 14 cases in order: pointer extraction on the bundled sample and four evaluation paystubs, the general explanation and two prepared questions in English and Spanish, the person's own result and a typed question (on the device only), and reading a picture of the sample (on the device only; `not-run` with a note when the device model does not accept images). Inputs are synthetic: the documents in `fixtures/device-check/documents/` and `samples/`, and the judges' prepared household (`rulepacks/us-ca/judges-household.json`) for the person's own result.

Every case runs through the same task functions as the app, with the routing of `routing.json`: a `PREFER_ON_DEVICE` case that fails on the device is repeated in the cloud as `onDeviceFailure` says, and the extraction cases use the on-device reading of `validation/DEVICE_READING.md`. `ONLY_ON_DEVICE` cases are never sent.

**Repetitions.** An option runs the five extraction cases three times each (15 readings), before the other cases. Each reading carries `repetition` (1, 2, 3) and the file carries `repetitions: 3`. The default is one run.

`fixtures/device-check/answers.json` holds the right answer of each check document per part of the reading, for tests with a fake device model.

## 2. Scoring a reading

A reading is scored on its values, not its placeholder ids: the answer is rehydrated (`skeleton/SPEC.md` section 5) and each field is compared with the gold answer.

| Status | When |
|---|---|
| `correct` | the field has a value and it equals the gold value (numbers within 0.005); a placeholder that holds the same amount as the gold one is right |
| `wrong` | the field has a value that is not the gold value |
| `missing` | the gold answer has a value and the reading has none (not found, or left out as not read) |
| `spurious` | the reading has a value and the gold answer has none |
| `absent` | neither has a value |

Deductions are one field: `correct` when the reading has as many items as the gold answer and every gold amount is among the reading's amounts.

- **Fields right**: fields with status `correct` out of the fields the gold answer has.
- **Yearly-income inputs** (`grossPay`, `ytdGross`, `payFrequency`, `periodStart`, `periodEnd`, `payDate`): **right** when `correct` or `absent`, **not found** when `missing`, **wrong** when `wrong` or `spurious`. A reading has all inputs right when none is not found or wrong.
- **A wrong value reached the person** when any field of what the person ends up with is `wrong` or `spurious`. A value not found can be typed in; a wrong one may go unnoticed. This count must be zero.

## 3. Where a case was answered

- `ran`: where the case was finally answered, after the checks and any retry (`ON_DEVICE`, `IN_CLOUD`, `not-run`). In version 1 and 2 files, `ran` is where the first attempt ran and the final place is `final.ran`.
- `first`: the first attempt (the device's, when the device answered) and the fields right in it.
- A case answered in the cloud is counted as a cloud run, never as an on-device one. A case is "in the cloud after a failed on-device attempt" when `final.retried` is true and it ended in the cloud.

The summary (reference `summarize`) gives: cases answered on this device, in the cloud after a failed on-device attempt, in the cloud, not run; first attempts on the device; fields right in first answers and in final answers; readings with every yearly-income input right, with a value not found (and none wrong), with a wrong input; readings in which a wrong value reached the person. A screen showing a recording shows three of these first, before any table: cases answered on this device, readings with every yearly-income input right (with the readings that have a value not found beside it), and readings in which a wrong value reached the person, shown as met when it is zero.

## 4. Run file (version 3)

`schemas/device-check-run.v3.json` is normative. A run file holds placeholder ids and field names only, never document values.

| Field | Meaning |
|---|---|
| `kind` | `silhouette-device-check` |
| `version` | 3. Files of versions 1 and 2 (Web, before version 3) still open and are read as section 3 says |
| `date` | when the run started, ISO 8601, UTC |
| `browser` | the client: on the Web the browser and version (`Chrome 157.0.0.0`); in an app the app and version (`Silhouette 1.0`) |
| `platform` | the operating system as the client names it (`macOS`, `iOS 26.5`, `Android 16`) |
| `userAgent` | the browser's user agent; an app writes `App/version (device model; OS version; Firebase AI Logic version)` |
| `availability` | what the on-device model reported before the run, per set of options the tasks use |
| `jurisdiction` | the rule pack's jurisdiction |
| `repetitions` | optional; 3 when the extraction cases were repeated |
| `device` | optional: `platform` (`web`, `ios`, `android`), `os`, `osVersion`, `model` (device model name or identifier), `onDeviceModel` (the on-device model as the platform names it, where exposed), `sdk` (Firebase AI Logic and version), `appVersion`. Phones fill what their platform exposes; the Web may leave it out |
| `cases[]` | one per case, in order: `id`, `task`, `mode`, `ran`, `latencyMs`, `outputCheck` (`passed`, `blocked` or null), and for extraction `first`, `final` (with `retried`, `deductionsNotRead`, `notRead`, `incomeInputsCorrect`, `incomeInputs`, `wrongFields`) and `device` (the diagnosis: raw text, problems, each pass of the reading, field-by-field ids and statuses, `scoredBy: "value"`), plus `error`, `note`, `repetition` |

**File name.** `device-check-{YYYY-MM-DD}T{HHMM}-{client}{major}-{platform}.json`: the UTC date and time of `date`, the first word of `browser` in lower case with non-alphanumerics removed followed by its major version, and `platform` the same way. Examples: `device-check-2026-11-16T1744-chrome157-macos.json`, `device-check-2026-11-17T1012-silhouette1-ios265.json`.

## 5. What a platform bundles

- A platform bundles **its own** recorded runs: its first (baseline) and its latest. Earlier runs are kept in the repository and open as files; they are not bundled.
- Until a platform has a recorded run of its own, it may bundle the Web's latest run (`fixtures/device-check/runs/`) as a reference. A recording is always labelled as one with its date, client and platform, so a run recorded in Chrome on macOS is never shown as if it had run on the phone.
- Tests derive the bundled runs and their figures from the files, never from a file name or a number written in the test, so adding a newer run needs no test change.
