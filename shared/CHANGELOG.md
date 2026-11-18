# Contract changelog

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
