# Contract changelog

## v1.43 — 2026-11-20

Which way the silhouette goes, shown as it happens; a ceiling for the credit whose amount exists only as a table; the judged path in one press.

| Change | Why |
|---|---|
| `programs[].amountUpTo` (`rulepacks/SPEC.md` sections 3 and 5): the most a program pays a household like this one, from the agency's published maximums, given as `upToAmount` when the verdict is `likely` or `maybe` and there is no `estimatedAmount`. CalEITC: the FTB maximum credit for the number of qualifying children (one child: 2,016). Copy `results.upTo`, `results.upToNote`: shown as "Up to", always with the note that it is a ceiling | Reviewers: CalEITC was the one tax credit with no figure. The exact amount exists only as the FTB's 2,632-row table (`OPEN_QUESTIONS.md` Q9), so the app gives the published maximum and says so |
| `preview.stage.toDevice`, `preview.stage.toCloud`, `preview.stage.pointersBack`: the reading is shown as it happens, the silhouette going to the model on this device or to the cloud, and the placeholders coming back and turning into values on this device | Reviewers: the moment the product exists for appeared with no transition |
| `send.destination.device`, `send.destination.cloud`: where a request goes, beside the button that sends it | Reviewers: the destination was above the fold, the button below it |
| `judges.runAll.button`, `judges.runAll.body`: the judges' path in one press, from the sample paystub to the results | Reviewers: six presses to the payoff |
| `tasks.appRoutes.ios`: why the iOS app chooses device or cloud itself | Reviewers asked why the SDK's hybrid mode is not used on iOS |
| `send.destination.*` reworded (same day): the lines that go are above the button, not below; and a reading or answer that starts on this device goes on to the cloud, as the silhouette, when the device cannot answer, so the device line says so | The first wording was not true on every screen |

Platforms: the conformance fixtures `verdict.json` and `judges-household.json` now carry `upToAmount`. Reference tests: 30.

## v1.42 — 2026-11-19

The cloud half of the reading can be seen without sending anything.

| Change | Why |
|---|---|
| `routing.json` `recordedCloud`, reason `recorded-in-cloud`: the bundled sample can be read from a real cloud reading of its silhouette, recorded with the exact request body and the response (`web/eval/results/cloud-recording/`, `web/eval/record-cloud.mjs`). The values are put back on this device; nothing is sent now; the record lists it as kept and shows the request exactly as it was sent when recorded, with the answer it got | Reviewers who did not press Send (and anyone who would rather not) saw only the on-device half of the hybrid |
| Copy: `badge.recordedCloud`, `reason.recorded-in-cloud`, `preview.useRecordedCloud`, `review.pointer.recordedCloud`, `results.incomeFrom.RECORDED_CLOUD`, `record.recordedCloud.*` | The words for it |

Platforms: the same choice beside the recorded on-device reading, with the same recording file. Reference tests: 30.

## v1.41 — 2026-11-19

The sample household is said to be a sample, wherever its results are shown.

| Change | Why |
|---|---|
| `results.sample.*`: when the answers are the prepared household's (judges' path, "Try with a sample paystub"), the results open with "Sample household, not you", a way to see or change its answers and a way to use one's own; `why.leadSample` says the reasons use the sample household's answers | Five reviewers: the sample path said "using your exact answers" and "It answered 1 of your questions" for an invented household the visitor never saw |
| `results.docEffect.filled` no longer says "your questions" (and has a `.one` form) | The same |
| The reasons' badge says "Rules + paystub" (or W-2) when the yearly income came from a document, as the results' badge does | A reviewer: "Rules only" beside "Rules + paystub" |
| `review.pointer.modelLine`, `review.pointer.deviceLine`: the pointer card shows the value's line twice, as the model saw it (placeholders) and as this device shows it (the value put back marked) | The point of the product in one picture: the model never sees the value |

Platforms: the same note wherever the prepared household's results are shown. Reference tests: 30.

## v1.40 — 2026-11-19

What the document did, first on the results.

| Change | Why |
|---|---|
| `results.docEffect.*`: a card first on the results, "What your paystub changed" (or W-2): how it was read, the yearly income, the questions it answered, how many results it changed; each changed row says what it was (`results.docEffect.was`); how the income was worked out behind a disclosure (`results.docEffect.how`) | Reviewers: the model's part was buried under the arithmetic and an 11-value review; the payoff (results that changed, with amounts) was not shown as the document's doing |
| `results.whoDecided.{paystub,w2}`: the rules decided each result; the AI only found where the values are, without seeing them | Why the AI does not decide eligibility, said where the result is |
| A paystub or W-2 used for the yearly income also answers "money from work" with yes when it was not already | Wages on a paystub or W-2 are earned income: one document, two answers |
| Review: `review.confirmLeadCount` ("Confirm the {count} values that decide the result"), `review.pendingLead`; `review.moreValues` and `review.moreValues.notFound` now say "Other values, not used for the result". The other values start folded; found values that do not decide the result still feed the reading's checks (net pay against the deductions, hours times rate), and a check that flags one brings it up to be confirmed | Reviewers: eleven values to confirm, when four decide the result |
| Results: within a verdict, programs with an estimated amount first, the largest first | The results looked alike; the amount is the point |

Platforms: the same card and answers. Reference tests: 30.

## v1.39 — 2026-11-19

The "unlikely" result no longer reads as a no.

| Change | Why |
|---|---|
| `verdict.unlikely` "Probably not" → "Not from these answers — you can still apply"; `verdict.short.unlikely` → "Not from these answers" (es, ko likewise) | A reviewer speaking for the people it is for: a household that is eligible after all (a limit that is close, an answer that changed, a rule the check does not cover) could stop at "Probably not" in the list, before the program page says it is not a decision |
| `results.stillApply` "You can still apply", under the short word on wide result rows | Wide rows show only the short word |

Platforms: the same words wherever the unlikely result is shown. Reference tests: 30.

## v1.38 — 2026-11-19

Form W-2: boxes 1 and 2 that do not fit together are both left out, and one box that does not fit no longer stops the other checks.

| Change | Why |
|---|---|
| `validation/DEVICE_READING.md` section 9: `wages:below-withheld` when box 2 is not below box 1 (both money); **both boxes are left out**, since code cannot tell which is wrong. Copy `review.leftOut.notConsistent` | On the second held-out W-2 set (`web/eval/heldout-2/`, frozen before measuring), 2 of 12 cloud answers still showed a wrong box 1: boxes 1 and 2 swapped, and every box moved by one on a form that prints values before labels. Both have tax withheld above wages |
| A reference that does not fit (`{field}:bad-reference`) is reported and **the other boxes are still checked** without it; before, it stopped the checks | One of those answers pointed the employee name at a number, which stopped every other check |
| Copy `tasks.heldout.*`: the never-seen sets on "Where each task runs", with a recount from their files | Reviewers asked for figures from documents the prompts were not tuned on |

**The second W-2 set no longer counts as held out** after this change: it was made after seeing it. The same stored answers, checked again with these rules (`web/eval/heldout-recheck.mjs`, no model call): box 1 right 6 of 12, left out 6, wrong 0; on the first set's six W-2s, right 4, left out 2, wrong 0. These are figures after seeing the sets, not held-out figures.

Platforms: the same checks on every W-2 answer. Reference tests: 30.

## v1.37 — 2026-11-19

Form W-2: a box answered from a number that is not an amount is left out, from the device or the cloud.

| Change | Why |
|---|---|
| `validation/DEVICE_READING.md` section 9 (Form W-2): `{field}:not-money` for boxes 1, 2, 3, 5 and 16 (the rule of section 4.1), `wages:missing`, `taxYear:not-a-year` (an integer from 2000 to 2100). On the device a W-2 answer with a problem is a failed attempt. **Every answer used, from the device or the cloud, leaves out the boxes with `not-money` or `not-a-year`**, which the person types. Reference `w2Problems`, `w2LeftOut`; fixture `device-reading.json` `w2` (8 cases on the W-2 sample). Known limits renumbered to section 10 | On the held-out set (`web/eval/heldout/`, frozen before measuring), box 1 was answered from a box number ("12") or a street number ("1530", "4120") on 3 of 6 W-2s, and the tax year from "1", "15" or "4706"; a cloud answer was not checked, so those values reached the review screen. Every wrong box 1 was a number without cents |
| Copy: `review.leftOut.notMoney`, `review.leftOut.notAYear` | The review says why a box is empty and that the person types it from the form |

**The W-2 part of the held-out set no longer counts as held out**: this change was made after seeing it. A second W-2 set, written independently and frozen before measuring, measures the change (`web/eval/heldout-2/`). The paystub part is unchanged and still held out.

Platforms: the same checks and boxes left out on every W-2 answer. Reference tests: 30.

## v1.36 — 2026-11-19

The checks and the evidence a reviewer can verify.

| Change | Why |
|---|---|
| `validation/DEVICE_READING.md` section 4.1: `{field}:not-money` for `grossPay`, `netPay` and `ytdGross`, and section 6: `deductions:not-money`, when the answered N placeholder has no cents while the silhouette prints amounts with cents. Cases `gross-and-ytd-on-zip`, `net-on-zip`, `deduction-on-zip`, `gross-on-zip-then-right`, `gross-on-zip-twice` | A device answer that pointed gross pay and year to date at the ZIP code of the address passed every check on a paystub whose pay date allowed it. On the 38 English evaluation paystubs the check rejects no right answer; of the 34 wrong year-to-date placeholders the other checks let through, it catches 14 (ids, ZIP codes, years), the employee number of en-l04-1 among them. Won amounts have no cents, so a Korean silhouette never has the problem |
| `tasks.recount.*`: "Recount from the file" recounts the cloud evaluation in the browser from the evaluation file itself (every document, its answers and every request body saved), and downloads it | The page showed the file's own totals; a reviewer could not check them without the repository |
| `review.confirmFirst`: said when "Check these values" is pressed before the values are confirmed | Every value is in view from the start, with one "Confirm all" |
| One model status everywhere: `preview.useRecorded.notDownloaded`, `preview.seeRecorded.notDownloaded`, `preview.cloud.notDownloaded`, `why.notDownloaded`, `ask.free.notDownloaded`, `reason.detail.notDownloaded` (the reason chip when a cloud request went because the model can be downloaded but is not yet) | In a browser that can download the model, one screen said "not downloaded yet" and another "this device doesn't have one" |
| `preview.error.useRecorded`: after a failed Send, the way on that sends nothing | The error named its cause but offered only sending again or typing |
| `record.recorded.{title,status,note}`: the record lists a recorded on-device reading as kept, with the device and date it was recorded on | On the recorded path the record was empty, as if nothing had happened |
| `tasks.enforce.appCheck`: App Check on every cloud request, limited-use tokens requested only when one is about to go | Reviewers could not see App Check anywhere |
| `judges.step1.button`: "Read the sample paystub" | Step 1 reads the paystub; "Open" undersold it |

Platforms: the same checks in their device reading (fixture `device-reading.json`); the recount where the platform shows the cloud evaluation; the model status words where the platform's model can be downloaded; the recorded reading in the record. Reference tests: 30.

## v1.35 — 2026-11-19

"Where each task runs" shows how the routing is enforced and the Remote Config values in use.

| Change | Why |
|---|---|
| `tasks.enforce.*`: the guard before every `ONLY_ON_DEVICE` call (the SDK sends such a request to the cloud in a browser without the on-device model), this browser's model status, the network check that lets an AI Logic request leave only when a cloud task registered it, and the `Raw` type that a cloud-capable call does not accept | A reviewer asked how `ONLY_ON_DEVICE` holds in Safari or Firefox; the answer was in the code only |
| `tasks.config.*`: the Remote Config values in use (`route_short_text_max_words`, `route_ondevice_locales_{platform}`, prompt versions, feature flags), and whether they are the built-in defaults or fetched | Remote Config drives the routing thresholds and prompt versions, and was not visible anywhere |

| W-2 screens: `review.addAnotherW2`, `review.pointer.cloudW2`, `review.pointer.deviceW2`, `results.incomeFromW2.lead`, `badge.rulesAndW2`, and the wording for a W-2 without a tax year (`review.basis.w2NoYear`, `review.basis.w2ManyNoYear`, `results.incomeBasis.w2NoYear`, `results.incomeBasis.w2ManyNoYear`, `results.incomeBasis.w2NoteNoYear`) | The W-2's own words on the review and the results (v1.34 named only the paystub's), and no empty year when the form has none |

Platforms: the same section on their "Where each task runs" screen, with their own guard and their own `route_ondevice_locales_{platform}`. Reference tests: 30.

## v1.34 — 2026-11-19

A second document: Form W-2.

| Change | Why |
|---|---|
| `schemas/pointer.w2.json` (employer, employee, tax year, wages in box 1, boxes 2, 3, 5 and 16), with model-schema cases `w2-required-nullable-openapi` and `w2-required-nullable-jsonschema` | One paystub projects a year from year-to-date pay; a W-2 states the year's wages. The annual tax credits count the whole year |
| `validation/SPEC.md` section 9: checks `w2-medicare-wages` and `w2-year`; annualization `method: "w2"` (box 1 as it is; the forms of the latest year summed, one per employer); `failure: "no-wages"`. Cases in `validate.json` under `w2Cases` | A second job is a second W-2: the forms of a year are added together |
| Sample `samples/w2-en-01.txt` (tax year 2025, the paystub's invented employee), its answer key in `answers.json`, skeleton case `w2-en-01`, rehydrate case `w2-en-01-correct` | A W-2 to try without a real one |
| English allowlist version 4 adds `b`, `code`, `compensation`, `copy`, `etc`, `filed`, `form`, `identification`, `return`, `w`, `withheld`, `zip`. No existing skeleton case changes: the paystub sample's silhouette and placeholder ids are the same, so its answer key and the on-device recordings stay valid | The labels of a W-2 stay readable: "Wages, tips, other compensation", "Federal income tax withheld" |
| Copy: `doc.title` "Add a paystub or W-2"; `doc.type.*`, `doc.sample.w2Text`, `doc.detected.w2`, `field.w2.*`, `check.w2-*`, `review.failure.no-wages`, `review.basis.w2`, `review.basis.w2Many`, `results.incomeBasis.w2`, `results.incomeBasis.w2Many`, `results.incomeBasis.w2Note`, `results.addDocumentW2` | The screens for a W-2 |

Platforms: read a W-2 like a paystub (one request on the device, since it has no list field); validate and annualize with section 9; show the tax year with the income. Reference tests: 30.

## v1.33 — 2026-11-19

The results say how the yearly income was worked out.

| Change | Why |
|---|---|
| `results.incomeBasis.ytd`, `results.incomeBasis.average`, `results.incomeBasis.note`, `results.incomeBasis.change`: when the yearly income came from a paystub, the results show the basis kept with it (`validation/SPEC.md` section 7: year-to-date gross through the reference date over the months elapsed, or the gross per period × periods), say that a tax credit counts the whole year's earned income, and offer to change it | The basis was shown only on the review, before the income was used; on the results a reader saw "read from the paystub" and assumed one paycheck × a year |

Platforms: keep the annualization's basis with the income when it is used, and show it with the results. Reference tests: 30.

## v1.32 — 2026-11-19

The model's reading leads the judges' path, and it can be seen without sending anything.

| Change | Why |
|---|---|
| Judges' path reordered: step 1 reads the sample paystub (the invented household's other answers are filled in with it), step 2 shows the results it sharpens, step 3 compares what left. `judges.lead`, `judges.step1.*`, `judges.step2.*` reworded; `judges.withModel.*`, `judges.withoutModel.*`, `judges.canDownload` now say "step 1" | The first result a judge met was "Rules only"; the AI came after it, as an option. Now the first result already uses the income the model read |
| `routing.json` `recordedSample` and reason `recorded-on-device`; `badge.recorded`, `reason.recorded-on-device`, `preview.useRecorded`, `preview.useRecordedNote`, `review.pointer.recorded` | A browser with no on-device model could only send the silhouette (behind reCAPTCHA) or open a statistics page. It can now continue with the same paystub as Chrome's on-device model read it (the recorded answer), put back on this device now, labelled as a recording |
| `results.sharpenHelpCloud` ("Read as a silhouette in the cloud. Your values stay on this device."), shown instead of `results.sharpenHelp` when this device has no model for the paystub; Add a paystub uses `doc.where.cloud` the same way | A browser without a model was told "Read on this device" one screen before it said "Cloud" |
| `results.incomeFrom.lead`, `results.incomeFrom.{ON_DEVICE,IN_CLOUD,RECORDED,SAMPLE_KEY}`, `badge.rulesAndPaystub` | When the yearly income came from a paystub reading, the results say so and how it was read, instead of "Rules only" |

Platforms: iOS and Android reorder the judges' path the same way and show where the income came from; `recordedSample` is for the web (its recordings are Chrome runs). Reference tests: 30.

## v1.31 — 2026-11-19

The folded values count the same way as the button above them.

| Change | Why |
|---|---|
| `review.moreValues.notFound` ("More values ({count} found · {missing} not found)"), used when some folded fields were not found | "See all 9 values" counts the values found (the ones to confirm); "More values (7)" counted the fields not found too, so 4 + 7 did not make 9 |

Platforms: count the folded values the way the confirm button does, and name the fields not found separately. Reference tests: 30.

## v1.30 — 2026-11-19

The pointer, shown with the reading's own answer.

| Change | Why |
|---|---|
| `review.pointer.said`, `review.pointer.put`, `review.pointer.cloud`, `review.pointer.device`: at the top of the values found, the model's own answer for one field (`"grossPay": "N12"`) next to the value this device put back (`1,271.88`), and what the model saw | What is new in Silhouette is that the model points and never sees or writes a value; the screen where a reading comes back now shows it with that reading's answer, not only the first screen's example |

Platforms: show it for a reading by a model (on the device or in the cloud), not for the bundled sample's answer key or typed numbers; with reduced motion it is shown without movement. Reference tests: 30.

## v1.29 — 2026-11-19

Why hybrid, in measured numbers.

| Change | Why |
|---|---|
| `tasks.measured.*` (11 keys): on "Where each task runs", the figures from the recorded on-device runs (per device: readings answered on the device, readings the device's checks rejected and repeated once in the cloud, readings with a wrong value reaching the person; answers that use exact values) and from the cloud evaluation (paystubs read entirely right, requests with a document value), with the conclusion they support | The routing table said where each task runs but not why; the reasons are measured and the files are in the repository |

Platforms: the figures are computed from the run files and the evaluation file, never typed in. Reference tests: 30.

## v1.28 — 2026-11-19

A refused security check says why.

| Change | Why |
|---|---|
| `error.appCheck.automation`, `error.appCheck.refused`, `error.appCheck.unreachable`, `error.appCheck.typeInstead` | When App Check could not get a token, the app said only that it "happens now and then". It now says which of three causes it was: a browser controlled by automation software (treated as a bot), a visit reCAPTCHA did not accept as ordinary (403, after which the SDK waits a day), or no answer from reCAPTCHA at all. Each says the silhouette was not sent |

Platforms: the web tells the three apart (`navigator.webdriver`; a 403 or the SDK's throttle in the error). iOS uses App Attest, which has no bot score; it keeps `error.app-check`. Reference tests: 30.

## v1.27 — 2026-11-19

The California rules are checked against their sources, and one rule is corrected.

| Change | Why |
|---|---|
| `rulepacks/us-ca/pack.json` version 2: `verifiedOn: "2026-11-19"`, no `status`, every `sources[].checkedAt` set. Every source was opened again and each number compared: all 84 constants, the rates and the ages match | The apps said "Draft rules" on every screen because no one had compared the numbers with their sources |
| Married filing separately with a qualifying child (a child under 6 for YCTC): the `filing-status` criterion of `federal-eitc`, `caleitc` and `yctc` gains `uncertainIf`, so these programs are "Possible", not "Probably not". Case `married-filing-separately` in `cases.json` now expects `maybe` for the three credits | The IRS EITC page and the FTB CalEITC page allow it when the spouses lived apart for the last 6 months of the year or are legally separated, which the app does not ask |
| Pack copy `exception.{programId}.{criterionId}` (`rulepacks/SPEC.md` section 5): what a criterion made `mixed` by `uncertainIf` depends on, in words, in place of `why.exception` | "Over this limit, but still possible because of: filing status" is wrong for a criterion that is not a limit |
| `pack.checked.short`, `pack.checked.title`, `pack.checked.body` (`rulepacks/SPEC.md` section 2), and `rail.checkedRules` for the link to that sheet on wide screens | A checked pack says so where a draft pack said "Draft rules" |

Platforms: show `pack.checked.*` for a pack with `verifiedOn` and no `status`; use the `exception.*` key where it exists. Reference tests: 30.

## v1.26 — 2026-11-19

Words for a result that is not a "may qualify", and for the recorded runs.

| Change | Why |
|---|---|
| `detail.unlikelyNote` ("This is a first check from the answers you gave, not a decision. The agency decides, and you can still apply.") on the page of a program whose result is "Probably not" | A person who does qualify must not stop at a first check |
| `results.dependsOn` reads "Needs an answer: {list}" ("Falta una respuesta: {list}") | The same result was worded differently on a narrow and on a wide screen; one wording, and it says what to do |
| `judges.recorded.title`, `judges.recorded.row`, `judges.recorded.note` | The judges' page shows the latest run recorded on an iPhone and in Chrome, each one press from the whole recording |

Platforms: iOS and Android take `detail.unlikelyNote` and the new `results.dependsOn` wording on the same screens. Reference tests: 30.

## v1.25 — 2026-11-19

The app's own sample paystub no longer raises a warning.

| Change | Why |
|---|---|
| **`rate-hours` check** (`validation/SPEC.md` section 4): `ok` when rate × hours is not more than 1 % above gross pay. It may be less, because overtime and other earnings add to the regular pay. Before, any difference over 1 % was a warning. Fixture `fixtures/conformance/validate.json`: case `rate-hours-overtime-warn` is now `rate-hours-overtime-ok`, and `rate-hours-above-gross-warn` is new | Every paystub with overtime, the bundled sample among them, showed "Please check" on a correct reading; on the review three correct values were flagged |
| `check.rate-hours` reads "Rate × hours is not more than gross pay (overtime and other pay add to it)" | The sentence says what is checked |
| `deviceCheck.headline.onRecordingDevice` ("cases answered on the device that made this recording") | A recording shown on another device said "answered on this device" |

Platforms: port the one-line rule and run the validate fixture; a recording's headline uses the new key. Reference tests: 30.

## v1.24 — 2026-11-19

Words for what a review of the main path asked for.

| Change | Why |
|---|---|
| `pack.audience` in the rule pack's copy ("For households in California") | The first screen names who it is for |
| `start.promiseShort` reworded and `start.pointer` added: "The model answers “gross pay is N12”. It never sees 1,271.88: this device puts the value back." | The first screen says what is different (the model points and never sees a value), not only that something is hidden |
| `preview.readHere` ("Read on this device"): the primary action of the silhouette screen when the device has a model | With a model on the device the reading starts there; the action is not a "Send" |
| `judges.canDownload`, `judges.next`, `preview.seeRecorded.web`, `detail.confirmWithPaystub`, `review.seeAllCount` | The judges' page says when the model can be downloaded; the path names its next step; a browser without a model is led to the recorded on-device reading; a result a document can confirm leads to the document; the button that first shows folded values says so |

Platforms: iOS and Android take `pack.audience`, `start.pointer`, `preview.readHere` and `detail.confirmWithPaystub` where they show the same screens. Reference tests: 30.

## v1.23 — 2026-11-19

What two independent hands-on passes (Web and iOS) found in the words and the tokens.

| Change | Why |
|---|---|
| **Spanish in one register.** The rule pack's Spanish (`rulepacks/us-ca/copy/es.json`: questions, help, options, criteria, caveats; 48 strings) now addresses the person as "tú", like the app copy | One screen said "Cuente… contándose usted" above "Escribe un número…" |
| Four Spanish app strings say "este dispositivo" where they mean this device (`answers.criterion.notSent`, `deviceCheck.repeat`, `reason.long-or-unsupported-locale`, `judges.withModel.*`), so the device-noun rule names the iPhone or the phone there too | "el dispositivo" is left alone by the rule, because Spanish also uses it for "on-device" |
| `layout.wide.twoColumnsFrom` 1100 (`design/tokens.json`): from 808 px the rail, from 1100 px two columns (the list beside a program, the two documents, Start's example); between them one column | At 808 to 950 px the second column was 27 to 65 px wide |
| `color.*.underline` is `#7C828B` in light and dark (was `#C5C9D0` / `#5C6068`) | The underline of a text link was 1.4:1 on the ground: links did not read as links |
| New keys (en, es; ko holds the English text): `state.offlineSend`, `q.error.money`, `review.notTyped`, `review.manualNothing`, `why.atLeast`, `error.server`, `send.firstAlso`, `send.sessionNote` | Offline is said before Send is pressed; a money field's message does not say "whole number"; typed entry does not say "Not found"; a floor ("at least 1") is not shown as "2 / 1" under a full bar; a 5xx answer does not tell the person to check their connection; the step before sending says what a yes covers |
| `delete.erased` says what was erased in plain words (no count of databases, no "Firebase SDK") | Jargon in the one sentence that confirms a deletion |

Behaviour both platforms now share (`design/DESIGN.md` section 8 unchanged): a pinned action never covers content, what opened or a result; Back keeps a chosen answer; a refused amount is never read back as understood; the step before sending shows where the request will really run (never "On this device" when the device has no model).

Platforms: iOS reads the changed keys and tokens at its next build; Android with its design pass. Reference tests: 30.

## v1.22 — 2026-11-18

Counted sentences read right for one.

| Change | Why |
|---|---|
| **One and many** (`copy/PLATFORM_VARIANTS.md`, new section): a counted key may have `{key}.one`, used when `count` is 1, looked up in the same language. Eleven keys have it (`results.mayQualifyCount`, `review.pending`, `review.confirmAllCount`, `send.sendLines`, the four `leaving.split.*`, `leaving.sentCount`, `leaving.keptCount`, `outbound.count`) | "You may qualify for 1 programs", "Confirm all 1 values", "1 enviadas" |
| `preview.counts` is worded without plurals: "Hidden on this device: numbers {numbers}, dates {dates}, words {words}." | Three counts in one sentence cannot each have a singular form |
| `q.range` ("From {min} to {max}" / "De {min} a {max}") | The range under a counter that is set with a stepper only; "Enter a whole number…" stays for a field that is typed into |

Platforms: apply the `.one` rule in the copy loader; iOS and Android use `q.range` where the number cannot be typed. Reference tests: 30.

## v1.21 — 2026-11-18

How the interface moves, as tokens every platform shares, and one sentence for the multi-choice question.

| Change | Why |
|---|---|
| **Motion tokens** (`design/tokens.json`, `motion`; the file stays version 7, keys are only added): `duration.reveal` 250 (something opening or arriving, and the scroll that brings it into view), `duration.exit` 180 (leaving is faster than arriving), `delay.stagger` 40 (items arriving one after another, capped at 8), `distance.step` 24, `distance.sheet` 32, `distance.press` 0.98 (the scale of a pressed control), and `motion.use`: one sentence per named motion (press, short, reveal, exit, medium, stagger, fade) saying where it is used | 150 ms is too short for a height change and 450 ms is slow under the hand; the platforms had started to choose their own values |
| `q.noneOfThese` ("None of these" / "Ninguna de estas"): the label of the primary action on a multi-choice question while nothing is ticked | Pressing "Next" with nothing ticked records "none of these"; the action now says what it records |

Platforms: use the motion names for the same moments (`motion.use`); under reduced motion every movement becomes at most a short fade. iOS already uses 250 ms for reveals. Reference tests: 29.

## v1.20 — 2026-11-18

One name for the thing the person holds, per platform. On the iPhone a single screen said "this iPhone", "On this phone" and "Keep everything on this device".

| Change | Why |
|---|---|
| **The device noun** (`copy/PLATFORM_VARIANTS.md`, new section; table `copy/platform/device-noun.json`; fixture `fixtures/copy/device-noun.json`, 368 cases; reference `reference/device-noun.mjs`): iOS shows "this iPhone" and Android "this phone" wherever the plain copy says "this device", by a whole-phrase replacement after lookup. The Web shows the plain text. No key is tripled | The design names the device the same way on every line of a platform |
| `preview.onPhone` is now "On this device" / "En este dispositivo" (was "On this phone"): the Web shows it on computers too; iOS and Android get their noun from the rule | The label was wrong on a computer |
| **9 copy keys** (en, es; ko holds the English text): `doc.languageShort` ("Paystub language", a label that fits beside a three-option picker), `doc.where.device`, `doc.where.cloud` (the one-line reading place on the add-a-paystub screen), `judges.factModel`, `judges.factAvailable`, `judges.factNotAvailable`, `judges.factFallback`, `judges.factReplays`, `judges.more` (the compact on-device check card and the disclosure for the long step descriptions) | iOS needed them for the denser screens; every platform shows the same words |

Platforms: iOS and Android apply the rule in their copy loader and run the fixture. The Web has nothing to apply. Reference tests: 29.

## v1.19 — 2026-11-18

The "Brand & UI" design replaces the Duplicator look on every platform: ink, a grey ramp and one orange (redact, only for what can leave or has left) on a cool grey ground; Big Shoulders Display, Inter Tight (web) and IBM Plex Mono; result markers by fill; the privacy dock (narrow), the ink rail (wide), and a dark scheme by the Android conventions.

| Change | Why |
|---|---|
| **`design/tokens.json` version 7** (from the System board). The top-level shape and every key the three platforms read are kept; new keys are added, none renamed. Retired keys stay for the parsers at neutral values (below) | One token file for Web, iOS and Android |
| **`design/DESIGN.md`** rewritten: where redact may appear, markers by fill, the three where-it-ran badges, token chips, the leave glyph, the counter, dock and rail, buttons, lists, segmented control, sheets and modals, the leaving label, edges and depth, layout, display type, a section per platform, and how the screens the boards do not draw are derived | |
| **92 copy keys** in en and es (ko holds the English text), `copy/*.additions.json`: the rail (`rail.*`), the badges (`badge.noModel`, `badge.noAi`, `badge.rulesOnly`, `badge.checkedHere.{web,ios,android}`), short lines where the screens are denser than the long copy (`start.leadShort`, `start.promiseShort`, `start.exampleNote`, `start.fact*`, `verdict.short.*`, `results.sharpen*`, `official.howToApply`, `official.office`, `doc.moreSamples`, `doc.photo.short`, `doc.photo.notHere`, `doc.pdf.short`, `doc.paste.short`, `doc.manual.short`, `send.keepShort`, `preview.leadShort`, `preview.more`), the step before sending (`send.beforeLeaves`, `send.goesCloud`, `send.staysHere`, `send.stays.*`, `send.byteForByte`, `send.sendLines`), the document preview (`preview.hideToo`, `preview.legend.*`, `preview.labelsStay`), the record (`record.*`: exactly what was sent, bytes, Copy, the answer received), "Where each task runs" (`tasks.*`, one name per task of `routing.json`), `judges.start`, `judges.tasks`, `results.mayQualifyCount`, `results.worthChecking`, and the web's keyboard hints (`keys.*`). Program facts and the pack's text are never shortened. Results still say "may qualify", never more | The boards name these sentences; their text was placeholder |

### Token keys

**Added.** Colours (light and dark): `night`, `redact`, `redactTint`, `onRedact`, `ink2`, `note`, `icon`, `faint`, `onInk`, `underline`, `track`, `raised`, `sheet`. A top-level `alpha` (`onInk.ring/border/divider/fill` 0.85 / 0.22 / 0.08 / 0.04, `inkBorder` 0.08, `inkBorderStrong` 0.10, `onInkUnderline` 0.35, `scrimSheet` 0.42, `scrimModal` 0.48, `cloudBorderOnInk` 0.5) — opacities, because the parsers read `color` as `#RRGGBB` only. `typography.fontFamilyByPlatform` (text: Inter Tight on the web, the system font on iOS, Google Sans Flex on Android). Type scale: `lead`, `rowTitle`, `meta`, `documentLine`, `displayPc` (104), `titlePc` (64), `tile`, and a `use` note on most entries. `spacing.scale` [4, 8, 12, 16, 20, 24, 32]. Radii: `token` 6, `input` 12, `button` 16, `card` 20, `cardLarge` 24, `dock`, `sheetTop`, `modal` 28. Sizes: `primary` 56, `compactAction` 44, `arrowChip` 36, `counterRing` 1.5, `markerStroke` 1.5, `confirmCheck` 18, `rail` 248, `contentMax` 760, `contentMaxWide` 1100, `breakpoint` 808, `modalMax` 520, `grabHandle` [36, 4], `iconGrid` 16, `badgeHeight` 22. `layout.wide.rail`, `oneColumnMax`, `twoColumnMax`, `paddingMin`, `paddingMax`; `layout.phone.gutter`; `motion.retired`; `colorNotes.*`.

**Changed in meaning.** Every colour value (roles and aliases follow the new palette; in dark the dock, the rail and sheets flip to light, and `night` becomes the light inset `#E2E4E8`); `onLeave` is ink (white on redact is 3.1:1). Font families. `listItem`, `action` and `progressTotal` move from display to text (15 / 17 / 13); `count` and `stampCount` are the counter digit (18); `optionWord` is the yes / no tile word (40); `recordHeadline` 64; `display` 54 and `title` 46 (mobile), with `displayPc` / `titlePc` for wide. `size.counter` is the counter disc (32, was the counter question's value), `size.counterButton` 44, `size.marker` a 20 × 20 circle, `size.optionTileHeight` 120, `size.actionHeight` 56. Radii: `control` 12, `panel` 24, `paper` 20, `option` 20, `tile` 12, `action` 16, `toggleTrack` 14, `toggleThumb` 10, `block` 28, `marker` and `bar` pills. `spacing.blockPadding` [16, 16, 18, 16]. `layout.wide.from` 808 (was 960); `layout.wide.blockWidth` is the rail (248); `layout.wide.contentMax` 1100.

**Retired (kept at neutral values for parsers).** `shadow.*` ("none"), `rotation.*` (0), `grain.opacity` (0), `typography.scale.giantNumber` (no longer drawn), `size.stamp`, and the motion entries `stamp`, `wipe`, `pop`, `docTilt`, `march`, `tokenFade` (only `short`, `medium`, `press`, `sheetUp` and the standard and fade easings are used).

## v1.18 — 2026-11-17

So that every platform can build the judges' path, the on-device check and the record from `shared/` alone.

| Change | Why |
|---|---|
| **The on-device check is shared** (`validation/DEVICE_CHECK.md`): the 14 fixed cases (`fixtures/device-check/cases.json`), the four evaluation paystubs with their gold answers and the right answers per part for fake device models (`fixtures/device-check/`), scoring by value (right, not found, wrong; yearly-income inputs; wrong values that reach the person), where a case was finally answered, the run-file format version 3 with a JSON Schema (`schemas/device-check-run.v3.json`, with an optional `device` block for phones), the file-name rule, and what a platform bundles | iOS ported the Web's check from copies of the Web's files; Android needs the same without reading web/ |
| **The judges' prepared household** (`rulepacks/us-ca/judges-household.json`) with its results before and after the sample paystub (`fixtures/conformance/judges-household.json`, 29,233 a year: CalEITC and the Young Child Tax Credit go from "possible" to "may qualify") | Every platform shows the same two-minute path |
| **The record** (`RECORD.md`): device-only work makes no request; App Check starts only before a cloud request; no token, no request; the statuses and their wording, so a request that did not complete never reads as sent; the line under the count that separates what carried something of the person's from technical checks; the hosted Web app's first-Send requests as an informative note | Found on the hosted Web app: a reading that stayed on the device still showed "5 sent" |
| **Shown only when confirmed** (`validation/DEVICE_READING.md` v2, section 5.1; principle 4): on the device, a value that feeds no result is shown only when a deterministic check confirms it, otherwise left out and marked not read. Hours and rate only together and only when rate × hours is, within a cent, an earnings amount of the silhouette not above gross pay (`hoursWorked:unconfirmed`, `hourlyRate:unconfirmed`); net pay only when the deductions add up, or, when they were not read, on a line with a net-pay label (`netPay:unconfirmed`); a pay date on or before the period start or before the period end is left out (`payDate:before-period-end`). Applied last, whatever the gross part repaired | Three iPhone runs (Apple's on-device model, 25 readings): a wrong value reached the person in 11, all secondary (rate 11, hours 8, net pay 3, pay date 1). On the 38 evaluation paystubs no right value is lost; replayed over every recorded Chrome and iPhone answer, the rules leave out all 23 wrong values and no wrong value remains; the cost is 13 right values whose partner was wrong |
| `validation/DEVICE_READING.md`: a missing key equals null | Apple's guided generation cannot express "required and nullable" |
| `rulepacks/SPEC.md` section 2: a draft pack shows `pack.draft.notice` where a confirmed pack would show `detail.unverified`, never both | Found by the iOS port |
| 113 copy keys in en and es (ko holds the English text): the draft-rules sheet, the judges' path, the on-device check page, record labels and statuses, the line under the count, App Check messages, the read-ahead line, the date the yearly income uses, the tax year, and the keys parked earlier (`why.*`, `leaving.notCompleted`, `answers.facts.uses`). Keys that name the platform have `.web`, `.ios` and `.android` variants (`copy/PLATFORM_VARIANTS.md`) | |
| `reference/device-check.mjs` with `fixtures/conformance/device-check.json` (6 readings, 3 runs of versions 1 to 3, 3 file names, schema validation of a recorded run) | |
| `fixtures/conformance/device-reading.json` (`confirmedOnly`): 39 checks with the confirmation result, 34 readings part by part (including 5 real iPhone readings and the real Chrome ones), gold set confirmed with the gold deductions; `reference/device-reading.mjs` `unconfirmedFields` | |

## v1.17 — 2026-11-17

From five recorded on-device runs of the Web app in Chrome 157 (`web/eval/results/on-device/`): the last, with each paystub read three times, answered 24 of 24 cases on the device with every yearly-income input right in 15 of 15 readings.

| Change | Why |
|---|---|
| **On-device reading in parts** (`validation/DEVICE_READING.md`, `prompts/pointer-extract-device.v1.md`): on a device whose model is available, a paystub is read as a core part, then a deductions part; a gross part is asked again when only gross pay or year to date fail, or when year to date is left out although the document has one place for it; the deductions are asked once more when they do not add up. Each part runs `ONLY_ON_DEVICE` inside the `PREFER_ON_DEVICE` task | Read in one request, the device's answers were right in their core fields but failed as a whole on a short deductions list, and every failure went to the cloud |
| **A strict response constraint per document and part**: no other keys, every key required, names only W ids, dates only D ids, amounts only N ids of this silhouette, each deduction exactly an N id and a fixed kind | Real answers carried extra keys (`netPayPay`, an echoed `required`) and ids of the wrong kind |
| **Deterministic checks that only reject**: the core check (references, gross pay present, net pay not above gross, the period, pay-date and year-to-date checks), the same-line and larger-candidate rules for year to date, with amounts compared and only money with cents as candidates; names sharing a placeholder or cut short, and hours or rate on an amount's placeholder, are left out as not read; deductions are optional | The device took a Regular line's year to date for the gross one, and it passed every earlier check. No right reading of the 38 English evaluation paystubs raises any of these alarms |
| `prompts/pointer-extract.v5.md`: v4's text, word for word, with notes that make "the same prompt on device and in the cloud" and "one page per request" true again: a device request is this prompt plus one part's text, one page each | The device wording is added only on the device |
| `fixtures/conformance/device-reading.json` (`reference/device-reading.mjs`): 4 constraints, 27 checks, 24 readings part by part (including the real mistakes recorded on the device), and the 38 evaluation paystubs with every right reading (89) for zero false alarms | |
| 9 copy keys in en and es: the stage lines while the device reads, the unreliable-reading message, "Send the silhouette", and the not-read notes | |
| Remote Config: `prompt_pointer_extract_v` = 5. Apps that bundle v5 read in parts on the device when the value is 5 or more | |

`pointer-extract.v4.md` remains for the record. Korean copy is not added; `ko.json` falls back to English for these keys.

## v1.16 — 2026-11-17

| Change | Why |
|---|---|
| **The California rule pack ships as a labelled draft** (`rulepacks/us-ca/`, `bands/us-ca.json`): seven real programs (federal EITC, CalEITC, Young Child Tax Credit, CalFresh, California LifeLine, CARE, FERA) with official sources, a source audit with verbatim quotes, 27 hand-worked households (189 results reproduced by the reference engine), and program copy in English and Spanish | An app that can only show invented programs cannot show what it is for |
| Packs may carry `status: "draft"` and `sourcesReadOn`; an app that loads a draft pack shows a notice everywhere and the official source with its date on each program (`rulepacks/SPEC.md` section 2). 5 copy keys | A pack is confirmed only when a person has compared every number with its source; until then it must say so |

`zz-test` remains for the conformance fixtures only. Apps bundle `us-ca` as the pack people see.

## v1.15 — 2026-11-13

From a third independent test of the Web app, with real replies.

| Change | Why |
|---|---|
| **The general explanation and prepared questions are given nothing about the person** (`prompts/explain.v5.md`, `prompts/ask.v4.md`; `routing.json`: input `Public` only). No profile, no criterion states | Given "not met from the general facts", real replies told the person "your income is not under the limit": a model stating part of the result |
| **Checks on model text, version 2** (`OUTPUT_CHECKS.md`, `output-checks.json`): wider lists (`you will qualify`, `you're approved`, `you won't qualify`…), a `criterion` list for claims about a single rule, invisible characters removed before matching, the answer language decides the list, and scope `personal` takes the verdict on screen so a hedge that contradicts it is blocked. 39 fixture cases | Replies such as "You will qualify." and text split by a soft hyphen were shown; Spanish replies were matched against the English list |
| Rule packs may name a `numberFormat`; money is written the way the jurisdiction's paperwork writes it, in every interface language, always grouped | In Spanish the app showed `34.000 $` beside `3000 $` while asking people to type `60,000` |
| 5 copy keys in en, es and ko: the request carries nothing about the person, the daily limit on a program page, a visible privacy sentence and an example label for the start screen | |
| Remote Config: `prompt_explain_v` = 5, `prompt_ask_v` = 4 | |

`explain.v3`, `explain.v4`, `ask.v2` and `ask.v3` remain in the folder for the record; apps bundle only versions that send nothing about the person (explain 5, ask 4).

## v1.14 — 2026-11-13

From 36 real replies of the general explanation and the prepared questions, in English and Spanish (`web/eval/results/answers-v3.md`). No reply stated or hinted at a result, and the check on model text blocked nothing and missed nothing.

| Change | Why |
|---|---|
| **Program copy for a model** (`rulepacks/SPEC.md` section 2.1): optional `program.{id}.summary`, `apply`, `documents`, `renewal`, `office`, and the rule that builds `{programFacts}`, including the answers a program uses. `zz-test` carries them in en, es and ko | With only criterion labels to go on, 13 of 18 replies about applying, papers and what the program offers said the information did not cover it |
| `prompts/explain.v4.md`, `prompts/ask.v3.md`: say what a program offers only when the information says so; "the information about this program"; never "mobile app"; the advice disclaimer is about the text, not the program; mention sharing only when something is checked on the device | 6 replies guessed a purpose from the program's name; Spanish replies wrote "los hechos del programa" and "la aplicación móvil"; 2 replies said the benefit program does not give tax advice |
| 7 sentences from real replies added to `output-check.json` as text that must stay allowed | |
| Remote Config: `prompt_explain_v` = 4, new key `prompt_ask_v` = 3 | |

In `explain-personal.v1.md` and `ask-personal.v1.md` the placeholder `{programSummaryFromRulePack}` is filled with the same `{programFacts}` text.

## v1.13 — 2026-11-13

| Change | Why |
|---|---|
| 2 copy keys in en, es and ko: `review.moreValues`, `review.confirmAllCount` | The review screen folds the values that do not decide the result |
| `design/tokens.json` version 6: phone frame width and headline measure, the wide panel's top position, and the last structural sizes that were written in CSS (strong border, dot pattern, radio and checkbox, record time column) | Every value an app uses comes from the tokens |

## v1.12 — 2026-11-13

From the iOS integration of Firebase AI Logic.

| Change | Why |
|---|---|
| 4 copy keys in en, es and ko: a request shown as the app builds it, what the record cannot list, a platform-neutral "erased" line | On Android and iOS the SDK serializes the request and keeps its own token caches; the copy must not claim more than the app can show or erase |
| `routing.json` `onDeviceLocales`: where the SDK cannot be asked for the device model's languages, the Remote Config list is the only check | iOS |

## v1.11 — 2026-11-13

From applying the design on Web.

| Change | Why |
|---|---|
| Rule packs may name a `currency` (ISO 4217); `zz-test` uses `USD` | Amounts and limits were shown as bare numbers |
| `design/tokens.json` version 5: values the first implementation had to invent (counter, record sheet, stamp count, option word, control and small text, row heights, compact-height mode, inline spacing, scale cap and floors), the Android tap target, and a `layout.wide` section | Every value an app uses must come from the tokens |
| `design/DESIGN.md`: wide-screen layout, how to read the tokens, what may be called "what is sent", and counting answers that stayed on the device | A parser crashed on non-numeric values; the wide layout and the "kept" count were left open |

## v1.10 — 2026-11-13

| Change | Why |
|---|---|
| **New visual design** (`design/tokens.json` version 4, `design/DESIGN.md`): ground, ink, the inverted block, paper, and one colour for what leaves the device; three open-licence typefaces; type scale with size steps; rotation, shadow, grain and motion tokens. The earlier token names remain as aliases | The product gets its own look; the earlier tokens were a neutral placeholder |
| `samples/answers.json`: answer keys for the bundled samples, generated from the reference cases | `routing.json` `offlineSample` needs them on every platform |
| `prompts/OUTPUT_CHECKS.md`: scope `general` also covers the text of `program.currentStatus` and `discover.leads` | Grounded text must not state a result either |
| 10 copy keys in en, es and ko: screen-reader sentences for where an answer was written, hidden word / number / date, amounts as understood on the review screen, what changed after using an income | |

## v1.9 — 2026-11-13

From a second independent test of the Web app.

| Change | Why |
|---|---|
| **A model that only knows the silhouette no longer states a result.** `prompts/explain.v3.md` and `prompts/ask.v2.md` are sent criterion states from the silhouette and no verdict, and are told not to say whether the person may qualify. They replace `explain.v2` and `ask.v1` | With a household that answered a private question "No", the screen said "Probably not" and the explanation under it began "You may qualify": the silhouette-only verdict differs from the result on screen, and the model restated it |
| **`explain.personal`, `ONLY_ON_DEVICE`** (`routing.json`, `prompts/explain-personal.v1.md`), and `prompts/ask-personal.v1.md` for typed questions: the person's own result, with exact values and limits, is explained only by the on-device model. Without one, the app shows the rule engine's reasons as plain lines | The explanation of a person's own result needs `Raw` input, so it cannot be cloud-capable |
| `rulepacks/SPEC.md` section 7: a `pass` or `fail` state from the silhouette always equals the state on screen; a test in the reference checks it | States the property the general explanation relies on |
| **Checks on model text** (`prompts/OUTPUT_CHECKS.md`, `prompts/output-checks.json`, `modelTextIsBlocked()`, fixture `output-check.json`, 15 cases) | Nothing stopped a reply such as "You qualify for this program." from being shown |
| **Typed amounts have at most two digits after the dot** (`skeleton/SPEC.md` section 5.1 rule 4; 6 more `typedAmounts` cases) | `60.000`, typed by someone who groups thousands with a dot, was read as 60 and every program showed "may qualify" |
| 43 copy keys in en, es and ko: reasons from the rules, the general explanation, a blocked or cancelled answer, the daily limit of the cloud service, results after something was sent, labels used by the new visual design | |
| Remote Config default `prompt_explain_v` = 3 | |

Notes for implementers, from the same test: the request shown before sending and in the record must be the bytes that are sent (serialize once; do not drop keys that merely contain the word "token"); consent to "may be sent if this device can't" does not cover a later cloud-first request; a results screen must not say that nothing was sent once something was.

## v1.8 — 2026-11-13

From the Android integration of Firebase AI Logic.

| Change | Why |
|---|---|
| Validation: the `dates-parsed` check ignores `null` dates, like every other check. Fixture `null-fields-are-absent` now expects `skipped` | v1.6 said `null` is absent, but the reference still counted `null` dates as given and reported `warn` |
| `schemas/MODEL_SCHEMA.md`: when an on-device API has no schema parameter, the on-device schema is appended to the prompt text | Android's on-device request takes text and images only |
| `routing.json`: `offlineSample` with reason `sample-answer-key` | A bundled sample must still work with no network and no device model, and say plainly that no model was used |
| 13 copy keys in en, es and ko: a request answered on this device, camera and gallery, device wording for model states, sample answers, text shared from another app | |

## v1.7 — 2026-11-13

From building explanations and questions in the Web app.

| Change | Why |
|---|---|
| **Verdicts from the silhouette** (`rulepacks/SPEC.md` section 7, `DATA_TYPES.md`): a verdict or criterion state computed from exact or sensitive answers is `Raw`. Cloud-capable tasks get the verdict the engine reaches from the `Generalized` profile alone. `silhouetteVerdicts()` in the reference, fixture `silhouette-verdict.json` (8 cases) | A passed residency criterion in a prompt tells the cloud what the person answered to a question marked as never leaving the device |
| `prompts/explain.v2.md`: criteria not met are listed apart from criteria that are not known because the answer stays on the device; the model is told not to ask for that information or to call it skipped | With one combined list, real answers told people they had skipped questions they had answered privately |
| New prompts: `ask.v1`, `current-status.v1`, `discover.v1`, `nearby.v1`, `read-aloud.v1` | Tasks in `routing.json` that had no shared prompt |
| `prompts/pointer-extract.v4.md`: hours worked and hourly rate are those of the Regular (base pay) line | With v3, a layout with four earnings lines lost both fields in 4 of 6 documents. With v4: all fields correct on 38 English paystubs in two runs |
| 92 copy keys in en, es and ko: explanations, prepared and typed questions, the step before a request is sent, current information, official information, other help, help nearby, read aloud, labels of outgoing fields | |
| Remote Config defaults: `prompt_pointer_extract_v` = 4, `prompt_explain_v` = 2 | |

## v1.6 — 2026-11-13

| Change | Why |
|---|---|
| **Amounts typed by the user** (`skeleton/SPEC.md` section 5.1), `parseTypedAmount()` in the reference, 41 cases under `typedAmounts` in `rehydrate.json` | All three apps had stripped punctuation before reading the number, so `28000.50` became 2,800,050. Each fixed it separately; the rule and the set of characters trimmed are now shared |
| Validation input: a `null` field is absent, for every field | The reference raised an error for `grossPay: null`, crashed on `payDate: null` and treated `deductions: null` as empty |
| A platform may refuse money values of 10^15 or more | Fixed-width integer arithmetic on some platforms |
| Fixtures: 3 validation cases for `null` | |

## v1.5 — 2026-11-12

| Change | Why |
|---|---|
| `prompts/pointer-extract.v3.md`: one added line, "Gross pay is the total of all earnings for the period … never a single earnings line such as Regular or Overtime." | On v1.4 skeletons with prompt v2, one paystub layout (earnings table followed by `Gross Pay ⟦N⟧`) had `grossPay` pointed at the Regular line in 4 of 6 documents. With v3: 0 wrong `grossPay` pointers in two runs, nothing else changed (`web/eval/results/summary.md`) |
| **Words the user hides** (`skeleton/SPEC.md` section 4.3): `skeletonize()` takes a fourth argument `hide`; a hidden word is masked wherever it occurs and its phrase is masked whole, introducers included | The preview lets the user hide words that are still visible. The rule has to be the same on every platform |
| Fixtures: 4 skeleton cases with a `hide` array | |
| Remote Config default `prompt_pointer_extract_v` = 3 | |

## v1.4 — 2026-11-12

From re-running the extraction evaluation on v1.3 skeletons, and from an independent test of the Web app.

| Change | Why |
|---|---|
| **Introducers at the start of a phrase are kept** (`skeleton/SPEC.md` section 4.2). Allowlist files gain a closed `introducers` list; `skeletonize()` takes it as a third argument | The phrase rule turned `Employee Lucia Lindqvist` into three placeholders. The model could not tell the label from the name, and all-fields-correct on English paystubs fell from 100 % to about 60 % |
| English allowlist gains `stub` | `Pay Stub` was masked |
| `routing.json`: `onDeviceFailure` describes the single retry of a failed `PREFER_ON_DEVICE` task with `ONLY_IN_CLOUD`, shown with reason `on-device-failed` | A device model that fails after it was reported available left the user with nothing. The input of such a task is cloud-safe by the routing rule, so the retry sends nothing new |
| 21 copy keys: resume, the amount as understood, the record of outgoing requests (attempted, sent, failed, deleted), hiding more words in the preview, a document that is not a paystub, the averaging formula | |
| Fixtures: 7 new skeleton cases for introducers | |

Existing skeleton fixtures whose output changes are listed by `npm run generate`; a port that passed v1.3 fails those until it implements section 4.2.

## v1.3 — 2026-11-12

Found while porting the engine to Kotlin and Swift.

| Change | Why |
|---|---|
| **The Skeletonizer is deny by default.** A character survives only if it is on an explicit safe list or belongs to an allowlisted word. Digits of other scripts, emoji, control and zero-width characters, private-use and unassigned code points are now masked | The v1.1 tokenizer kept every character that was not an ASCII digit or a letter according to the platform's Unicode tables. Non-ASCII digits passed through unmasked everywhere, and a platform with older tables left newer letters unmasked |
| **A phrase is masked as a whole.** If any word of a run of words separated by single spaces, `, ` or ` & ` is not allowlisted, all of them are masked | An independent test sent `Employee: Jordan Gross` and `Federal Security Services` and found "Gross", "Federal" and "Security" in the outgoing skeleton, because those words are also labels |
| `@` and `_` are word characters | `payroll@example.com` left `payroll@` in the skeleton |
| Month-name dates (`October 17, 2026`, `17 de octubre de 2026`) are one date token and are parsed by the validation spec | They were split into a masked word and two numbers, so no date field could be filled |
| Tokenization no longer uses Unicode property classes | Behaviour is identical on V8, the JVM, Android's ICU and Apple's ICU regardless of their Unicode version |
| The allowlist is the document's language ∪ `en`, not the app language | A Korean payslip read in an English UI kept none of its labels |
| Strings compare by code point everywhere (allowlist lookups, `==`, `!=`, `in`, `var` paths, band ids) | Swift's default string equality treats canonically equivalent strings as equal |
| Patterns match the whole string; a trailing line break never matches | In ICU and Java `$` matches before a final line break |
| `constants` is required in a pack; `householdSizeCap` is a positive integer; allowlist files are linted | Removes behaviour that differed between JavaScript `undefined` and `null` elsewhere |
| Fixtures: 18 new skeleton cases, 6 number tokens, 4 generalize errors, 6 evaluator cases, 5 validation cases for month-name dates | Every item above is pinned by a case that fails on a naive port |

Two of the eight v1.1 skeleton cases change, both because of the phrase rule (`CA SDI` and a word next to an injected bracket are now fully masked).

Also in v1.3, from the Web reference app and its extraction evaluation:

| Change | Why |
|---|---|
| **Pointer schemas v2: every field is required and nullable**, prompt `pointer-extract.v2.md` says "Answer every field. Use null when the field is not in the document." | With optional fields the cloud model answered 4 of 12 fields. With required, nullable fields it got 30 of 30 synthetic English paystubs fully correct in two runs (`web/eval/results/summary.md`) |
| `schemas/MODEL_SCHEMA.md` and `reference/model-schema.mjs`: the deterministic conversion from a pointer schema to the schema a model accepts (cloud and on-device dialects), with fixture `model-schema.json` | The shared schemas use keywords the model APIs reject |
| `validation/SPEC.md`, `reference/validate.mjs`, fixture `validate.json` (64 cases): consistency checks on confirmed paystub values, date parsing per jurisdiction, annualization from year-to-date pay or from average gross | Turns confirmed document values into the exact annual income the verdict engine uses, identically on every platform |
| `prompts/photo-read.v1.md` for the on-device photo task | |
| English allowlist gains 23 grammar and document words | Lease sentences lost their structure when words such as "between" were masked |
| App-wide copy from the Web app merged into `copy/` | |

## v1.2 — 2026-11-12

Driven by the first real rule pack draft (`us-ca`), which could not express several rules.

| Change | Why |
|---|---|
| **Three-valued logic.** Reading an unanswered variable gives *unknown*; `and`/`or`/`if` follow Kleene logic. The engine no longer gates on `requires` (kept as linter-checked documentation) | "Income below the limit **or** enrolled in a qualifying program" must pass when the program answer is yes even if income is unknown |
| `uncertainIf` on a criterion turns a `fail` into `mixed` | A fact outside the modelled rules (for example an elderly or disabled household member) can still make the person eligible; the honest verdict is "maybe" |
| New operator `floor` | Step tables for credit amounts |
| `cat` accepts safe integers | Table lookups keyed by household size or number of children without nested `if` |
| New question type `multi` | "Which of these benefits do you receive?" |
| Optional `programs[].period` and `programs[].caveats[]` | Show which year the figures are for, and warnings such as a pending rule change |
| Fixtures: `evaluator.json` gains `unavailable`, `expectedUnknown` and `expectedUnknownReads`; `verdict.json` gains 12 cases; the `zz-test` pack gains two programs and two questions | |

The ten v1.1 verdict cases produced identical results under the v1.2 engine before the pack changes below.

Also in v1.2, found while building the Web reference app:

| Change |
|---|
| `zz-test`: earned income is now a question (`hasEarnedIncome`) instead of `annualIncome > 0`; the linter rejects comparisons of `annualIncome` with 0 |
| `verdicts()` validates input: non-numeric income or unknown band id raises `InputError`; negative income is evaluated as 0 |
| `int` questions carry `min`/`max`; optional `questionOrder` with the reserved step id `"income"`; pack copy lives in `rulepacks/{jurisdiction}/copy/` with defined key conventions |
| `shared/copy/es.json` and `ko.json` filled in; app-wide strings from the Web app promoted to `shared/copy/` |
| Design tokens promoted to `shared/design/tokens.json` |

## v1.1 — 2026-11-12

Resolves ambiguities found while porting the reference implementation to TypeScript. Kotlin and Swift cannot copy JavaScript behaviour by accident, so every one of these is now pinned by the spec and a fixture.

| Change | Files |
|---|---|
| Expression evaluator is strict: typed operands, fixed argument counts, own-property lookup, lazy `and`/`or`/`if`, `RuleError` on any violation. New fixture `fixtures/conformance/evaluator.json` | `rulepacks/SPEC.md` §3, `reference/silhouette.mjs` |
| Rule pack linter (`reference/lint.mjs`): ids, `requires` covers every variable read, operators and arity, contiguous bands, smoke evaluation | `reference/lint.mjs` |
| Generalized profile fields are nullable (unanswered = `null`); invalid input raises `GeneralizeError`; county and jurisdiction must be slugs; canonical form needs no escaping. New fixture cases | `rulepacks/SPEC.md` §6, `schemas/generalized-profile.json` |
| `childAgeBands` are in bands-file order (schema text fixed) | `schemas/generalized-profile.json` |
| Open top band sample point worded as `max(L, min) + 1` | `rulepacks/SPEC.md` §5 |
| Rehydrated dates are unparsed text; parsing is deferred to the validation spec | `skeleton/SPEC.md` §5 |
| Prepared question chips are `Public`, not `Generalized` | `DATA_TYPES.md` |
| Unicode version note for `\p{L}` / `\p{M}` | `skeleton/SPEC.md` §2 |
| Pointer and answer lookups use own properties only | `reference/silhouette.mjs` |

Fixtures regenerated: `generalize.json` (new null and error cases), `evaluator.json` (new), `verdict.json`, `rehydrate.json`, `skeleton.json` (unchanged content).

## v1 — 2026-11-12

Initial contracts.
