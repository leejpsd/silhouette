# Data types and the routing rule

Every value in Silhouette carries one of four types. The type decides where the value may travel.

| Type | Examples | May enter a cloud-capable call? |
|---|---|---|
| `Raw` | Document text or photo, exact amounts, names, addresses, answers to sensitive questions, free-text questions typed by the user | **No** |
| `Skeleton` | A document with every number, date and non-allowlisted word replaced by a placeholder (`skeleton/SPEC.md`) | Yes |
| `Generalized` | The profile silhouette produced by the Generalizer: income band, household size, child age bands, county, housing status | Yes |
| `Public` | Program names, rule text, jurisdiction, tax year, prepared question chips (static app content; may be combined with `Generalized` values at call time) | Yes |

## The rule

> `Raw` values only ever reach `ONLY_ON_DEVICE` model calls and deterministic code.
> `PREFER_ON_DEVICE`, `PREFER_IN_CLOUD` and `ONLY_IN_CLOUD` calls accept `Skeleton`, `Generalized` and `Public` only.

Because of this rule, a cloud fallback can never break the product's promise: whatever a `PREFER_*` call falls back with was already safe to send.

### Verdicts are `Raw` too

A verdict, or the state of one criterion, computed from exact values or from answers to sensitive questions is `Raw`: it can reveal the answer it was computed from. A cloud-capable task is given criterion states that the engine reaches from the `Generalized` profile alone, and no overall verdict (`rulepacks/SPEC.md` section 7). Explaining a person's own result is an `ONLY_ON_DEVICE` task.

## Enforcing it in code

Each platform defines wrapper types with the same names and makes the rule a compile-time property:

- The wrapper around cloud-capable Firebase AI Logic calls takes `CloudSafe` input (`Skeleton | Generalized | Public`). A `Raw` value does not type-check.
- The only functions that turn `Raw` into something cloud-safe are the **Skeletonizer** and the **Generalizer**. Both are deterministic and covered by conformance fixtures.
- `Raw` wrappers do not implement serialization, logging or `toString` that reveals the value (analytics and crash logs stay clean).

## Outbound channels

| Channel | Carries | Never carries |
|---|---|---|
| Firebase AI Logic (cloud) | `Skeleton`, `Generalized`, `Public` | `Raw` |
| Firestore | Saved program ids, locale, jurisdiction | Profile, amounts, documents |
| Analytics | Screen and step events without values | Amounts, bands, document content |
| Crashlytics | Stack traces | User values in keys or logs |
| Map display | County-level area | Precise location |
