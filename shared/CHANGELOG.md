# Contract changelog

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
