# /shared — cross-platform contracts

Everything in this folder is the contract that the Web, Android and iOS apps must implement identically.
Platform apps treat this folder as **read-only**. A change here is a contract change: it comes with updated fixtures and an entry in `CHANGELOG.md`.

| Path | What it defines |
|---|---|
| `DATA_TYPES.md` | The four data types (`Raw`, `Skeleton`, `Generalized`, `Public`) and the routing rule |
| `routing.json` | Which task uses which inference mode, and why |
| `skeleton/SPEC.md` | The Skeletonizer: how a document becomes a document silhouette |
| `skeleton/allowlist/*.json` | Words that survive skeletonization, per language |
| `schemas/` | JSON Schemas: pointer-extraction output (paystub, lease), generalized profile |
| `rulepacks/SPEC.md` | Rule pack format and the verdict algorithm |
| `rulepacks/zz-test/` | Synthetic rule pack used only for conformance tests |
| `rulepacks/us-ca/`, `rulepacks/kr/` | Real rule packs (human-verified; see their README) |
| `bands/` | Generalization bands per jurisdiction |
| `prompts/` | Versioned prompts |
| `copy/` | UI strings. `en.json` is complete; `es.json` and `ko.json` fall back to English for missing keys |
| `design/tokens.json` | Colors, type scale, spacing (added with the Web reference build) |
| `fixtures/conformance/` | Input → expected output cases every platform must pass (skeleton, rehydrate, generalize, evaluator, verdict) |
| `fixtures/canary/` | Documents seeded with canary strings for leak tests |
| `samples/` | Synthetic documents for the in-app sample mode |
| `reference/` | Reference implementation (Node, no build step) that generates and checks the fixtures, plus the rule pack linter |
| `CHANGELOG.md` | Contract versions and what changed |

## Definition of done for a platform

1. Every case in `fixtures/conformance/` produces byte-identical skeletons, pointer rehydration results, generalized payloads and verdicts.
2. The canary test passes: no outbound payload contains any string listed in a canary fixture's `canaries`.
3. No code path passes a `Raw` value to a cloud-capable call (see `DATA_TYPES.md`).

## Regenerating fixtures

```bash
cd shared/reference     # no dependencies to install
npm test            # checks fixtures against the reference implementation
npm run generate    # rewrites fixtures from the cases in cases.mjs
```

## Not yet specified (next contract version)

- Validation and annualization: sum checks, period checks, YTD-based annualization, date parsing per jurisdiction.
- Real rule packs for `us-ca` and `kr` (awaiting human verification of every number).
- Design tokens.
