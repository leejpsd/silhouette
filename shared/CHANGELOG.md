# Contract changelog

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
