# Contract changelog

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
