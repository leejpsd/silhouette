# Rule pack specification (v1.3)

A rule pack describes the programs of one jurisdiction. Eligibility is decided by this deterministic engine. No model is involved.

## 1. Authoring rules

- Every threshold, table and amount is entered by a person from an official source. Each program lists `sources` with `url`, `title`, `checkedAt` and `checkedBy`.
- A pack may be labelled "verified" (`verifiedOn` set) only after the project owner has checked every number against its source.
- Do not write a criterion that hinges on a single boundary value of the income scale (such as "income is above zero"). With only a band known it evaluates to `mixed`. Ask a question instead ("Did you have earned income?").
- `rulepacks/zz-test/` is synthetic and exists only for conformance tests.

### Copy for a pack

Labels live in `rulepacks/{jurisdiction}/copy/{locale}.json` with these keys. Every key must exist in `en`; other locales fall back to `en`.

| Key | Text |
|---|---|
| `pack.{jurisdiction}.name` | Name of the rule set |
| `question.{id}.label`, `question.{id}.help` | Question and optional help line |
| `option.{questionId}.{value}` | Choice label for `enum` and `multi` questions |
| `variable.{id}` | Short name used in "Depends on: …" (also `variable.annualIncome`) |
| `program.{programId}.name` | Program name (falls back to `programs[].name`) |
| `criterion.{programId}.{criterionId}` | What the criterion checks, as a statement about the user |
| `caveat.{key}` | Text for a key listed in `programs[].caveats[]` |

## 2. File layout

`rulepacks/{jurisdiction}/pack.json`:

| Field | Meaning |
|---|---|
| `jurisdiction`, `version`, `verifiedOn` | Identity and sign-off date (`null` until verified) |
| `status`, `sourcesReadOn` | Optional. `status: "draft"` marks a pack whose numbers were read from official sources (on `sourcesReadOn`) but are not all confirmed by a person. An app that loads a draft pack shows `pack.draft.notice` on every screen and, on each program, the official source link with `official.readOn` or `official.confirmedOn`. Where a confirmed pack would show a program's unverified note (`detail.unverified`), a draft pack shows `pack.draft.notice` instead: never both on the same screen. A pack without `status` and with `verifiedOn` set is confirmed |
| `currency`, `numberFormat` | Optional. `currency` is an ISO 4217 code (`USD`); `numberFormat` is a BCP 47 tag (`en-US`) naming the number conventions of the jurisdiction. When `currency` is present, amounts, limits and income ranges are shown as money, always with digit grouping, written the way the jurisdiction's own paperwork writes it (`$34,000` in every interface language), which is also the form the app accepts when an amount is typed (`skeleton/SPEC.md` section 5.1). Without `currency`, plain grouped numbers |
| `constants` | Named numbers and lookup tables used by the rules. Required; use `{}` when there are none |
| `questions[]` | Questions the app asks. `type` is `int` (with integer `min` and `max`), `bool`, `enum` (one of `values`) or `multi` (a list drawn from `values`). Every question can be skipped. `sensitive: true` means the answer is `Raw`, is asked with the "never leaves your device" note, and never feeds the Generalizer |
| `questionOrder` | Optional. Every question id plus the reserved step id `"income"`, in the order the app asks them. Default: `"income"` first, then `questions[]` order |
| `programs[].criteria[]` | `{ id, requires[], logic, uncertainIf? }`. `logic` is an expression (section 3) that returns true or false. `requires` lists every variable the criterion reads; it is documentation checked by the linter, and the engine does not use it |
| `programs[].period`, `programs[].caveats[]` | Optional. The period the figures apply to, and copy keys for warnings shown on the card |
| `programs[].amount` | Optional expression that returns an estimated amount |
| `programs[].docsRequired`, `applyUrl`, `sources` | Shown in the app |

### 2.1 Program copy and the information given to a model

`rulepacks/{jurisdiction}/copy/{locale}.json` holds the labels of the pack. Besides `program.{id}.name` and the criterion labels, a pack may carry these optional keys per program, each one or two plain sentences:

| Key | Content |
|---|---|
| `program.{id}.summary` | What the benefit is and its form (a tax credit, a discount on a bill, a monthly food benefit) |
| `program.{id}.apply` | How to apply (online, by phone, in person) and who handles it |
| `program.{id}.documents` | The papers people are usually asked for |
| `program.{id}.renewal` | How long the benefit lasts and how it is renewed, when `period` does not already say it |
| `program.{id}.office` | The name of the office or agency. Links stay in `sources` and `applyUrl` |

They are `Public`. The app shows them on the program screen, and they are what a model is given as `{programFacts}`, built in this order, one item per line, skipping what is absent:

1. `summary`, `apply`, `documents`, `renewal`, `office`;
2. `This program uses: ` followed by the `variable.*` labels of every answer named in the program's criteria `requires`, in pack question order, with `annualIncome` first;
3. `This program checks: ` followed by the criterion labels.

Line 2 lets a model answer "what could change this result" without knowing the result. Like every text in a pack, these sentences are checked by a person against the official source before the pack is published.

## 3. Expression language

A strict, typed subset of JSON Logic with **three-valued logic**. Each platform implements exactly these operators and no implicit type conversion. `fixtures/conformance/evaluator.json` pins the behaviour.

| Operator | Arguments | Meaning |
|---|---|---|
| `{"var": path}` | 1 | Look up a dotted path in the data using **own properties only**. `path` is a non-empty string, or an expression that returns one. A missing key, or a path that walks into a non-object or an array, gives `null`. JSON Logic's default-value form is not supported |
| `==`, `!=` | 2 | Strict equality between primitives (number, string, boolean, `null`). Different types are never equal. A list operand is an error |
| `<`, `<=`, `>`, `>=` | 2 | Both operands must be numbers |
| `and`, `or` | 1 or more | Operands must be booleans or unknown. Evaluated left to right. `and` returns false at the first false operand; otherwise unknown if any operand was unknown; otherwise true. `or` mirrors this with true |
| `!` | 1 | Operand must be a boolean |
| `if` | exactly 3 | `[condition, then, else]`. The condition must be a boolean or unknown. An unknown condition gives unknown and neither branch is evaluated. Otherwise only the chosen branch is evaluated |
| `+`, `*` | 2 or more | Operands must be numbers |
| `-`, `/` | exactly 2 | Operands must be numbers. Division by zero is an error |
| `min`, `max` | 1 or more | Operands must be numbers |
| `floor` | 1 | Operand must be a number. Rounds toward negative infinity |
| `in` | 2 | `[primitive, list of primitives]` |
| `cat` | 1 or more | Operands must be strings or safe integers. An integer is written in decimal with no fraction, so table keys can be built from numbers |

- **Unknown.** Reading a variable the user has not answered gives the value *unknown* and records the variable's name. For every operator other than `and`, `or` and `if`, the argument count is checked first; then, if any operand is unknown, the result is unknown and no type check runs. Unknown is never a `RuleError`.
- Numbers are finite IEEE-754 doubles.
- **Strings compare by code point.** `==`, `!=`, `in` and `var` paths never treat canonically equivalent strings as equal (the Kelvin sign U+212A is not `K`). Use an exact comparison even where the platform's default string equality is looser.
- Fixtures compare numbers by IEEE value: `0` equals `-0`, and `0.1 + 0.2` is `0.30000000000000004`.
- A value that is not an object evaluates to itself. A list evaluates element by element. An object must have exactly one key, which is the operator.
- Any violation (wrong type, wrong argument count, unknown operator) raises `RuleError`. A pack that raises `RuleError` is invalid and must not ship; `reference/lint.mjs` checks this at authoring time.
- A criterion's `logic` and `uncertainIf` must return a boolean or unknown. `amount` must return a number or unknown.

### Authoring constraints (checked by the linter)

- Question ids match `^[a-z][A-Za-z0-9]*$` and are not reserved names (`annualIncome`, `incomeBand`, `constants`, `householdSizeCapped`, or `Object` member names such as `constructor`). Program and criterion ids are lowercase slugs.
- A criterion may read only the variables listed in its `requires`, plus `constants.*`. Reading `householdSizeCapped` requires `householdSize`. `uncertainIf` must not read `annualIncome`.
- A computed `var` path must be a `cat` whose first argument is a string starting with `constants.`.
- Income bands start at 0, are contiguous, and the last band is open-ended.

## 4. Data passed to expressions

| Variable | Source |
|---|---|
| `annualIncome` | Exact annualized income, or a sample point when only a band is known (section 5). Unavailable when neither is known |
| answers to `questions[]` | By question id (own properties only). Unavailable when skipped or `null` |
| `householdSizeCapped` | `String(min(householdSize, householdSizeCap))`. Unavailable when `householdSize` is |
| `constants` | The pack's `constants` object |

Only question ids, `annualIncome` and `householdSizeCapped` can be unavailable. Any other missing name evaluates to `null`.

**Input validation.** An `annualIncome` that is given but is not a finite number, or an `incomeBand` id that is not in the bands file, raises `InputError` (the message never contains the value). A negative `annualIncome` is evaluated as 0, the same way the Generalizer treats it.

## 5. Verdict algorithm

For each criterion:

1. Evaluate `logic`. If `annualIncome` is exact or unavailable, evaluate once. If only a band `[min, max]` is known, evaluate at every **sample point**.
2. Combine the results:

   | Results contain | State |
   |---|---|
   | both true and false | `mixed` |
   | otherwise, any unknown | `unknown` |
   | only true | `pass` |
   | only false | `fail` |

3. If the state is `fail` and the criterion has `uncertainIf`, evaluate it once (it cannot read `annualIncome`): true → `mixed`, unknown → `unknown`, false → stays `fail`. Use this when a fact outside the modelled rules can still make the person eligible.
4. If the state is `unknown`, every unavailable variable read while evaluating this criterion is added to `dependsOn` (`householdSizeCapped` is reported as `householdSize`).

Sample points for a band:

- `min` and `max`. For the open-ended top band, `max` is `max(L, min) + 1`, where `L` is the largest numeric literal in the pack's `constants` and in this criterion's `logic` (or `min` when there is none).
- For every numeric literal `v` in the pack's `constants` and in this criterion's `logic` with `min ≤ v ≤ max`: `v − 1`, `v` and `v + 1`, clipped to `[min, max]`.

Program verdict:

| Condition (checked in this order) | Verdict |
|---|---|
| Any criterion is `fail` | `unlikely` |
| Any criterion is `mixed` | `maybe` |
| Any criterion is `unknown` | `depends` |
| All criteria are `pass` | `likely` |

The result lists `dependsOn` sorted, without duplicates.

`amount` is evaluated only when the verdict is `likely` and `annualIncome` is exact. A numeric result is rounded down to an integer; an unknown result means no estimate is shown.

## 6. Generalization

`bands/{jurisdiction}.json` defines how exact values become the profile silhouette (`schemas/generalized-profile.json`):

- `jurisdiction`: required, a lowercase slug.
- `incomeBand`: the band whose `[min, max]` contains `floor(max(annualIncome, 0))`. If the user only chose a band, that band.
- `householdSize`: the integer, or `"{cap}+"` when it exceeds `householdSizeCap`.
- `childAgeBands`: the ids of bands that contain at least one child's age, **in bands-file order**. Ages outside every band are ignored. An answered empty list gives `[]`.
- `county`: a lowercase slug (`^[a-z0-9]+(?:-[a-z0-9]+)*$`). `housing`: `renter`, `owner` or `other`.

Patterns match the **whole** string. In ICU and Java, `$` also matches before a final line break, which would accept `"testshire\n"`; use `\z` or a full-match call. Band ids are compared exactly, by code point. `householdSizeCap` in the bands file is a positive integer.

**Unanswered fields are `null`.** The user may skip questions, and a partial silhouette is still valid. A task that needs a specific field (for example `nearby.help` needs `county`) is unavailable until that field is answered.

**Invalid input raises `GeneralizeError`** and produces no profile: an unknown band id, an income that is not a finite number or falls in no band, a household size that is not a positive integer, a county that is not a slug, an unknown housing value. Error messages never contain user values.

Canonical serialization: all six keys in schema order, no whitespace, `null` for unanswered fields, integers without a fraction. Because every string is a slug or a band id, no character ever needs escaping, so the output is identical on every platform.

## 7. Verdicts from the silhouette

The verdict on screen is computed from exact values and from answers to sensitive questions. Sending it, or the state of a single criterion, to a cloud-capable task would reveal those answers (a passed residency criterion says what the person answered). So explanations, prepared questions and every other cloud-capable task are given a second result, computed by the same engine from the `Generalized` profile alone:

1. Start with no answers.
2. `incomeBand`: the profile's band, when it is not `null`.
3. `householdSize`: the profile's value when it is an integer and the pack has a question `householdSize` that is not `sensitive`. The capped form (`"6+"`) is not an answer.
4. `housing` and `county`: the profile's value when it is not `null` and the pack has a non-sensitive question with that id.
5. Run the verdict algorithm of section 5. Everything else is unanswered, so criteria that need it are `unknown`.

The result keeps `programId`, `verdict` and each criterion's `id` and `state` only: no `estimatedAmount`, no `dependsOn`. It is `Generalized`.

A state of `pass` or `fail` in this result is always the state on screen too: the silhouette is a coarser view of the same answers, and the sample points of section 5 cover every threshold inside a band. Only `unknown` and `mixed` can differ. The overall verdict can differ, so it is never sent. Since v1.15 the general explanation and the prepared questions are given **nothing about the person at all** (`prompts/explain.v5.md`, `prompts/ask.v4.md`): real replies restated a criterion that was not met from the silhouette as the person's own result. No task is given silhouette verdicts today; the definition stays for tasks that may need it. The person's own result is explained by the rule engine's reasons shown as plain lines, and, where the device has a model, by `explain.personal`, which is `ONLY_ON_DEVICE`. A model is told which criteria are checked on the device, so that it does not tell a person they skipped a question they answered privately.

Cases: `fixtures/conformance/silhouette-verdict.json`.
