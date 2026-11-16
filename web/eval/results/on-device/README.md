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
4. When the status line says "Finished.", press **Download results**. The browser saves `device-check-YYYY-MM-DD.json`.
5. Copy that file into this folder unchanged. The file name becomes the label of the recording.

Every input is synthetic: the bundled sample, generated evaluation paystubs and an invented household.

## What a run file contains

| Field | Meaning |
|---|---|
| `date` | When the run started (ISO 8601) |
| `browser`, `platform`, `userAgent` | From the browser that ran it |
| `availability` | What `LanguageModel.availability()` reported before the run, for each set of options the tasks use |
| `jurisdiction` | The rule pack the app had |
| `cases[]` | One per case: `id`, `task`, the inference `mode` the app asked for, where it actually `ran` (`ON_DEVICE`, `IN_CLOUD`, or `not-run`), `latencyMs`, `outputCheck` (`passed` or `blocked` for model text), `fields` correct against the gold answers for extraction, and any `error` or `note` |

A case that fell back to the cloud is recorded as `IN_CLOUD` and counted as a cloud run in the summary. A case that may only run on the device is never sent: without the model it is recorded as `not-run` with its error.
