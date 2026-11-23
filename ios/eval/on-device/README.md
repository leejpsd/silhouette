# On-device runs (iPhone)

Each `*.json` file here is one run of the app's on-device check (`shared/validation/DEVICE_CHECK.md`) made on an iPhone with Apple's on-device model, through Firebase AI Logic. A run shown in the app is labelled as a recording, with its date, client and platform. It is never presented as a live run.

## Which runs the app shows

The app bundles only the `*.json` files directly in this folder (the build copies them into the app as `Shared/recordings/`) and lists them on the on-device check screen. Exactly two are kept here:

- the first run, `device-check-2026-11-17T0505-silhouette0-ios2652.json`, as the baseline;
- the latest run (by the `date` in the file).

Every other run is kept in [`history/`](history/). It is not bundled; any copy of the app can still show it with **Open a run file**. When a newer run is added, move the previous latest run into `history/` and put the new file here.

The package tests read every file in this folder and in `history/`: each must validate against `shared/schemas/device-check-run.v3.json` and be named as the spec says, and each recorded reading, replayed under the current reading rules, must leave no wrong value with the person. The tests name no file and no figure, so adding a run needs no test change.

## How a run file is produced

1. On an iPhone with Apple Intelligence turned on and its model ready, open the app.
2. Tap **More** on the "Draft rules" line, then **Check the on-device model**.
3. Optionally turn on "Run each extraction case 3 times". Tap **Run the check** and keep the app open until the status line says "Finished."
4. The run file is saved at once in the app's Documents folder: in the Files app under On My iPhone, Silhouette. **Share the results** sends the same file.
5. Copy that file into this folder unchanged and move the previous latest run into `history/`.

A run can also be started without tapping: launch the app with the argument `-DeviceCheckRun 1` (or `3` for three repetitions). The check opens and runs, and the file is saved when it finishes.

Every input is synthetic: the bundled sample, the evaluation paystubs of `shared/fixtures/device-check/` and the judges' household.

## Progression

Figures are taken from the files. The photo case is not counted: on iPhone the on-device model takes text only. "Readings" are the extraction cases. "Wrong values reaching the person": readings in which any field the person is shown has a value that is not the document's.

| Run (UTC) | File | Cases on this device / in the cloud after a failed on-device attempt | First-attempt fields right | Readings with all yearly-income inputs right | Readings with a wrong value reaching the person | Time per paystub on the device, median (range) |
|---|---|---|---|---|---|---|
| 2026-11-17 05:05 | `device-check-2026-11-17T0505-silhouette0-ios2652.json` (baseline) | 12 / 1 of 13 | 34 of 60 | 5 of 5 | 3 of 5 | 8.5 s (6.2–10.9 s) |
| 2026-11-17 05:08 | `history/device-check-2026-11-17T0508-silhouette0-ios2652.json` | 12 / 1 of 13 | 34 of 60 | 5 of 5 | 2 of 5 | 6.7 s (5.7–8.7 s) |
| 2026-11-17 05:11 | `history/device-check-2026-11-17T0511-silhouette0-ios2652.json` (three repetitions) | 17 / 6 of 23 | 95 of 180 | 14 of 15 | 6 of 15 | 7.4 s (4.4–10.6 s) |
| 2026-11-17 06:13 | `history/device-check-2026-11-17T0613-silhouette0-ios2652.json` (three repetitions; values shown only when confirmed; greedy sampling; the cloud retry was refused for lack of an App Check token, so three readings did not run) | 20 / 0 of 23; 3 did not run | 102 of 180 | 12 of 15 | 0 of 15 | 6.5 s (5.8–12.0 s) |
| 2026-11-17 06:25 | `history/device-check-2026-11-17T0625-silhouette0-ios2652.json` (three repetitions; the App Check debug token registered, so a reading the device refuses is read in the cloud) | 20 / 3 of 23 | 102 of 180 | 15 of 15 | 0 of 15 | 6.5 s (5.7–11.9 s) |
| 2026-11-19 15:49 | `history/device-check-2026-11-19T1549-silhouette0-ios2652.json` (app of contract v1.42) | 13 / 0 of 13 | 41 of 60 | 5 of 5 | 0 of 5 | 6.6 s (5.8–9.0 s) |
| 2026-11-19 15:50 | `device-check-2026-11-19T1550-silhouette0-ios2652.json` (latest; app of contract v1.42; three repetitions) | 23 / 0 of 23 | 123 of 180 | 15 of 15 | 0 of 15 | 8.3 s (6.1–13.0 s) |

The 11-17 runs were made with the app of contract v1.17, the 11-19 runs with the app of contract v1.42; all on an iPhone 17 Pro (iOS 26.5.2). In the 11-19 runs every case, the evaluation paystub L10 included, was answered on the device: none went to the cloud. In the 11-17 runs every wrong value was in a field that feeds no result: hourly rate, hours worked, net pay, and once a pay date. In those runs the evaluation paystub L10 never ran on the device: its core part failed in about 10 ms, before the model answered, and was read in the cloud; those files record only `error:on-device-unavailable`. Runs made since record where such a call stopped and why (`failure:` in the pass's problems).

Replayed under `shared/validation/DEVICE_READING.md` v2 (values that feed no result are shown only when confirmed), the 25 readings recorded on 11-17 give 17 that stay on the device, and none of them leaves a wrong value with the person.

## The held-out paystubs on the iPhone

The 24 paystubs of `web/eval/heldout/` (`hp-*`, frozen before measuring: see its `FROZEN.md`) are bundled with the app as they are, with their answer keys. On an iPhone with the on-device model ready, the on-device check screen offers **Read the 24 held-out paystubs** under its own run. Each paystub is read as the app reads a document: the silhouette is made on the iPhone, the on-device model reads it in parts with the checks of `shared/validation/DEVICE_READING.md`, and the same silhouette is read once in the cloud only when the device's answer fails them. The run takes several minutes; the screen stays on until it finishes. It can also be started without tapping: launch the app with the argument `-HeldOutRun`.

The run file (`heldout-device-<date>-silhouette0-ios<version>.json`) has the shape of the web's held-out run and is saved in the app's Documents folder (Files, On My iPhone, Silhouette); **Share the results** sends the same file. It can be copied from the phone with

```sh
xcrun devicectl device copy from --device <device id> --domain-type appDataContainer --domain-identifier app.silhouette.benefits \
  --source Documents/heldout-device-<date>-silhouette0-ios<version>.json --destination .
```

and scored with `node web/eval/heldout-score.mjs <file>`. Put the file in [`heldout/`](heldout/), unchanged: the app then bundles it and lists it under the recordings, with its figures scored in the app the way that script scores them (names word for word).
