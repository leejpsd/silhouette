# On-device reading specification (v2)

How a paystub silhouette is read by the device's own model, and how every answer is checked before a person sees it. It applies to task `document.pointer.extract` (`routing.json`) when the on-device model is available, with `prompts/pointer-extract.v5.md` and `prompts/pointer-extract-device.v1.md`.

Reference implementation: `reference/device-reading.mjs`. Fixture: `fixtures/conformance/device-reading.json`. The checks use rehydration (`skeleton/SPEC.md` section 5) and the checks of `validation/SPEC.md` section 5.

## 1. Principles

1. **Code only rejects.** Deterministic code may reject an answer, leave a field out, or ask the device again. It never picks a placeholder, extends a name, fills in a missing value, or chooses between two candidates. Every value the person is shown was answered by a model.
2. **Missing is not wrong.** A field left empty is shown as "not found", and the person can type it in. A wrong value may go unnoticed. The checks therefore turn doubtful values into missing ones, or into a failed attempt; they never turn a missing value into a guessed one.
3. **Device first, the cloud only after Send.** Every part runs `ONLY_ON_DEVICE` inside the `PREFER_ON_DEVICE` task, and only once the device model reports `available` for the task's options. A failed on-device attempt is repeated in the cloud exactly as `routing.json` `onDeviceFailure` says: once, `ONLY_IN_CLOUD`, with the same silhouette, reason `on-device-failed`, and only when the person chose to send the silhouette. When the person chose to keep everything on the device, nothing is sent (section 7).
4. **Shown only when confirmed.** On the device, a value that feeds no result (hours worked, hourly rate, net pay, the pay date when the period gives the date) is shown only when a deterministic check confirms it; otherwise it is left out and marked not read (section 5.1). Missing is not wrong, and code still never picks a value.
5. **Value-free.** Prompts, problem codes, records and logs hold placeholder ids and field names only, never document values.

## 2. Parts and the response constraint

A paystub's pointer schema (`schemas/pointer.paystub.json`) is split into parts:

| Part | Fields |
|---|---|
| `core` | every field that is not a list: `employerName`, `employeeName`, `payFrequency`, `payDate`, `periodStart`, `periodEnd`, `grossPay`, `netPay`, `ytdGross`, `hoursWorked`, `hourlyRate` |
| `gross` | `grossPay`, `ytdGross` |
| `deductions` | `deductions` |
| `deductions-again` | `deductions` (same constraint as `deductions`; different wording) |

A document type without a list field (a lease) is read in one request with the strict constraint of all its fields, and sections 3.2 to 3.5 do not apply.

Each request carries a **response constraint** (JSON Schema) built for this silhouette. The placeholder ids of a silhouette are collected by kind (`N`, `D`, `W`) in order of first appearance.

- `"type": "object"`, `"additionalProperties": false`, and `"required"` lists every field of the part in schema order.
- A field of `x-kind` **text** (a name): `{"type": ["array","null"], "minItems": 1, "items": {"type": "string", "enum": [W ids]}}`; `{"type": "null"}` when the silhouette has no W id.
- **date**: `{"type": ["string","null"], "enum": [D ids, null]}`; `{"type": "null"}` when there is no D id. (The checks still accept a date written as three N ids, for cloud answers.)
- **number**: `{"type": ["string","null"], "enum": [N ids, null]}`; `{"type": "null"}` when there is no N id.
- **enum**: `{"type": ["string","null"], "enum": [options, null]}`.
- **list** (deductions): `{"type": "array", "items": {"type": "object", "properties": {"amount": {"type": "string", "enum": [N ids]}, "kind": {"type": "string", "enum": [kinds]}}, "required": ["amount","kind"], "additionalProperties": false}}`.

The fixture's `constraints` give the exact objects for the bundled sample. A platform whose on-device API takes a different schema dialect converts this one without loosening it; where a restriction cannot be expressed, the checks below still apply unchanged.

**Reading an answer.** The model's text is parsed as JSON. Text that does not parse, or that is not a JSON object, gives the pass the problem `not-json`. Keys with the value `null` are removed. Keys that are not fields of the part are ignored and recorded as `extraKeys`; fields of the part that the answer does not contain are recorded as `missingKeys`. Neither is a problem.

**A missing key equals null.** A field the answer does not contain is treated exactly as a field whose value is `null`: "not in the document". Every check, every trigger and every outcome is the same either way. A platform whose on-device API cannot express "required and nullable" (Apple's guided generation, where a field is either required or optional) declares every field optional instead; it must still forbid other keys and keep every other restriction of the constraint. `missingKeys` is then informative only.

## 3. Order of the parts

1. **Core.** Ask `core`; check it (section 4.1).
2. **Gross part, when needed.** Ask `gross` once when either holds:
   - the core has problems and every problem concerns gross pay or year to date: a code starting with `grossPay:` or `ytdGross:`, or `check:ytd-gross`, or `check:ytd-periods`;
   - the core has no problem, its answer has no `ytdGross`, and the missing-year-to-date trigger holds (section 4.4).

   The gross part's `grossPay` and `ytdGross` replace those of the core, and the whole core is checked again. The replaced core is used only if it then has no problem, and, when the gross part was asked for a missing year to date, only if it answered a year to date. Otherwise:
   - when the core had problems, they stand;
   - when the year to date was missing, the core is kept without it. The gross pass records `ytdGross:still-missing` when it answered no year to date, or its own problems when it answered a wrong one.
3. **Failed core.** A core that does not parse, or that still has problems, is a **failed on-device attempt** (section 7). Nothing more is asked of the device.
4. **Fields not read.** On the core that passed, the contradictions of section 5 leave fields out, marked "not read". The reading stays on the device.
5. **Deductions.** Ask `deductions`; check them against the core without the fields left out (section 6). When the check finds `check:net-sum`, ask `deductions-again` once and check that answer instead. Deductions that do not parse, or whose last answer still has a problem, are left out and marked "not read". Deductions never make the attempt fail.

6. **Shown only when confirmed.** On the answer about to be used (the core without the fields left out, plus the deductions when they passed), the rules of section 5.1 leave out every value no check confirms. This applies whatever the gross part changed: a first answer whose gross pay or year to date was repaired keeps its other amounts only if they are confirmed on their own.

The answer used is the core, without the fields not read, plus the deductions when they passed, without the values section 5.1 leaves out.

## 4. Core checks

Problems are reported as codes; every problem found is reported, in the order below.

### 4.1 The core check

An answer that is not a JSON object has the single problem `not-an-object` (in a reading it is already `not-json`, section 2). For each field of the core whose value is present:

| Problem | When |
|---|---|
| `{field}:not-an-option` | an enum field whose value is not one of its options |
| `{field}:bad-reference` | a reference to an id that is not in the silhouette, or of the wrong kind: a name must be a non-empty list of W ids; a date one D id, or a list of exactly three N ids; a number one N id |
| `{field}:not-money` | `grossPay`, `netPay` or `ytdGross` refers to an N id whose text is not money with cents (section 4.3), while some N placeholder of the silhouette is: a ZIP code, an id or a year answered as an amount. A silhouette with no amount in cents (won) never has this problem |

Then, on the values rehydrated from the core (deductions ignored):

| Problem | When |
|---|---|
| `grossPay:missing` | gross pay has no value |
| `netPay:above-gross` | net pay is greater than gross pay |
| `check:period-length`, `check:pay-date`, `check:ytd-gross`, `check:ytd-periods`, `check:dates-parsed` | that check of `validation/SPEC.md` section 5 is `warn` for this one paystub (`rate-hours` is not used: overtime makes it warn on correct readings; `net-sum` belongs to the deductions) |
| `values:malformed` | the values raise `ValidationInputError` |
| `ytdGross:not-on-gross-line` | the same-line rule (4.2) |
| `ytdGross:ambiguous` | the larger-candidate rule (4.3) |

`check:ytd-gross` means year to date below the period's gross pay. It is always a problem.

### 4.2 Fits as year to date

An amount `a` **fits as year to date** for a reading when gross pay `g` has a value, `a ≥ g`, and the checks `ytd-gross` and `ytd-periods` of `validation/SPEC.md` section 5 are not `warn` for the paystub `{grossPay: g, ytdGross: a, payFrequency, periodEnd, payDate}` of that reading. When the frequency or both dates are missing, `ytd-periods` is skipped and only `a ≥ g` remains. When those values raise `ValidationInputError`, the amount fits.

Amounts are the placeholders' text read with `parseNumber` (`skeleton/SPEC.md` section 5). Two amounts are **the same** when they differ by less than 0.005.

**Same-line rule.** Take the first skeleton line that contains the answered `grossPay` placeholder. Collect the other N placeholders on that line whose amount fits as year to date. When there is exactly one, and the answer has a year to date, the year to date's amount must be the same as that placeholder's amount; otherwise the problem is `ytdGross:not-on-gross-line`. Amounts are compared, not ids: a paystub that writes the same amount twice (an only earnings line and the gross line) has two right answers. With no candidate or several, the rule says nothing.

### 4.3 Larger-candidate rule

When the answer has a year to date `y` and gross pay: for every N placeholder of the silhouette whose text is **money with cents** (it ends with `.` or `,` followed by exactly two digits), if its amount is greater than `y`, not the same as `y`, and fits as year to date, the problem is `ytdGross:ambiguous` (reported once). Numbers without cents (ids, ZIP codes, years) are never candidates.

### 4.4 Missing-year-to-date trigger

It holds when the core answer has a `grossPay` placeholder whose amount is a number, has no `ytdGross`, and:

- the answered gross line (as in 4.2) holds at least one other N placeholder that fits as year to date, and exactly one; or
- that line holds none, and among the N placeholders of the silhouette whose text is money with cents, whose amount is not the same as gross pay and fits as year to date, there is exactly one distinct amount.

On the 38 English evaluation paystubs, leaving out the year to date triggers the gross part in 32 of the 35 that have one; it never triggers on the 3 that have none, and not on the 3 whose year-to-date block holds both a gross and a net amount that fit.

## 5. Fields left out as not read

These contradictions concern fields that feed no rule and no yearly income. The fields are left out of the answer and marked not read; the reading stays on the device.

| Problem (recorded as `marked`) | When | Fields left out |
|---|---|---|
| `names:shared-placeholder` | `employerName` and `employeeName` share a W id | both names |
| `{name}:incomplete` | a name cut short: on some line, a W id of the answered name has a neighbouring placeholder (the one directly before or after it) that is a W id the name does not include, and the text between the two is one or two spaces exactly | that name |
| `hoursWorked:shares-placeholder`, `hourlyRate:shares-placeholder` | the field's placeholder is the one answered for `grossPay`, `netPay` or `ytdGross` | that field |

A gap of three or more spaces, a tab, or any visible character between two placeholders does not count: a layout may put two names on one line separated by spaces. Code never extends a name.

### 5.1 Shown only when confirmed

Applied last, on the answer about to be used (step 6 of section 3). Each value below is shown only when its check confirms it; otherwise it is left out, marked not read (its problem is added to `marked` on the core pass), and the review shows `review.fieldNotRead`. Amounts are the placeholders' text read with `parseNumber`; "money" means text that ends with `.` or `,` and exactly two digits.

| Problem | Value left out | Confirmed when |
|---|---|---|
| `hoursWorked:unconfirmed`, `hourlyRate:unconfirmed` | both, whichever of the two was answered | both are answered, gross pay has a value, and some money placeholder of the silhouette has an amount `m` with `m ≤ grossPay + 0.005` and `abs(hourlyRate × hoursWorked − m) ≤ 0.01`: rate × hours is the amount of an earnings line (the gross line itself when there is only one) |
| `netPay:unconfirmed` | net pay | the deductions were read and passed (section 6: net pay = gross − deductions), or, when they were not read, the net-pay placeholder is on a skeleton line whose visible text contains a net-pay label of the document's language: en `net`, `take home` (whole words); es `neto`, `neta`, `líquido`, `liquido`; ko `실수령`, `실지급`, `차인지급` (as substrings). The English labels also apply to documents in other languages |
| `payDate:before-period-end` | the pay date | the pay date parses and is neither on or before the period start nor before the period end (dates as `validation/SPEC.md` section 3 reads them). Without a pay date, the yearly income uses the period end (`validation/SPEC.md` section 7) |

Measured before adoption:
- On the 38 English evaluation paystubs, no right value is lost: every right reading, with every right placeholder for gross pay, year to date, hours, rate and net pay, and the gold deductions (101 readings), is fully confirmed.
- On every real on-device answer recorded (six Chrome runs and three iPhone runs; 56 on-device readings when replayed under these rules), the rules leave out all 8 wrong hours, 11 wrong rates, 3 wrong net pays and 1 wrong pay date. The cost is right values that went out with a wrong partner: 1 hours value and 12 rates whose other half was wrong or missing. No wrong value is left in any reading.

`validation/SPEC.md`'s `pay-date` check warns only when the pay date is more than 31 days from the period end, so a pay date answered as the period start (14 days before the end) passed it; this rule closes that.

## 6. Deductions

The deductions are checked on the core's answer (without fields not read) plus the deductions part's answer:

| Problem | When |
|---|---|
| `deductions:missing` | no deductions list |
| `deductions:not-a-list` | not a list |
| `deductions:bad-reference` | an item that is not an object, or whose `amount` is not an N id of the silhouette |
| `deductions:not-money` | an `amount` whose text is not money with cents, while some N placeholder of the silhouette is (as `{field}:not-money`, section 4.1) |
| `deductions:not-an-option` | an item's `kind` is present and not one of the schema's kinds |
| `deductions:cannot-check` | gross pay or net pay has no value |
| `check:net-sum` | `net-sum` of `validation/SPEC.md` section 5 is `warn` |

Each problem is reported once. An empty list is checked like any other: it passes only when net pay equals gross pay within the check's tolerance. Only `check:net-sum` leads to `deductions-again`.

## 7. Outcomes and what the person is shown

| Outcome | When | What happens |
|---|---|---|
| Answered on this device | the core passed (with or without the gross part) | the values are shown for confirmation with the badge `ON_DEVICE` and reason `document-silhouette-only`; nothing was sent. A field marked not read shows "Not read on this device…" (`review.fieldNotRead`); deductions not read show `review.deductionsNotRead` and the net-sum check is not shown while no deduction has been added. A year to date still missing shows as "not found" |
| Failed on-device attempt, person chose Send | the core did not parse or kept problems | the status line says `preview.stage.sendingAfterDevice`; the silhouette is read once in the cloud with `pointer-extract.v5.md` (single request, the cloud model schema); the result carries reason `on-device-failed` |
| Failed on-device attempt, person chose to keep everything on the device | same | nothing is sent and nothing is filled in; the page shows `error.on-device-unreliable` with the actions `preview.sendSilhouette` and `error.typeInstead` |

While the device works, the status line says which step it is on: `preview.stage.deviceReading` (core), `preview.stage.deviceGross`, `preview.stage.deviceDeductions` (deductions, and asked again), `preview.stage.checking` after each answer.

## 8. Records

A platform may record each pass for diagnosis: its part, the model's text, whether it parsed, the parsed value, the problems, `marked`, `extraKeys`, `missingKeys`, and its time. Records hold placeholder ids and field names only.

## 9. Known limits

- Hours and rate both taken from another earnings line (for example Overtime) multiply to that line's amount and are confirmed: they are shown, as answered. No recorded reading did this.

- A wrong year to date with the same amount as the right one (an only earnings line) is accepted; it cannot change the yearly income.
- A year to date answered as a number without cents that happens to fit (an employee number) is not caught when the document's gross line holds no year to date: in a simulation over the evaluation set, 1 of 34 such wrong answers (en-l04-1). A year to date answered where the document has none (en-l03-1, 2 of 34) is not caught either.
- A name cut short at the edge of a wide gap is not caught (section 5).
