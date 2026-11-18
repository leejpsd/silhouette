# /shared — cross-platform contracts

Everything in this folder is the contract that the Web, Android and iOS apps must implement identically.
Platform apps treat this folder as **read-only**. A change here is a contract change: it comes with updated fixtures and an entry in `CHANGELOG.md`.

| Path | What it defines |
|---|---|
| `DATA_TYPES.md` | The four data types (`Raw`, `Skeleton`, `Generalized`, `Public`) and the routing rule |
| `routing.json` | Which task uses which inference mode, and why |
| `skeleton/SPEC.md` | The Skeletonizer: how a document becomes a document silhouette |
| `skeleton/allowlist/*.json` | Words that survive skeletonization, per language |
| `schemas/` | JSON Schemas: pointer-extraction output (paystub, lease), generalized profile, and `MODEL_SCHEMA.md`: how a pointer schema becomes the schema sent to a model |
| `validation/SPEC.md` | Checks on confirmed paystub values and how they become an exact annual income |
| `validation/DEVICE_READING.md` | How a paystub silhouette is read in parts by the device's own model, the response constraint, and the checks that every on-device answer passes before a person sees it |
| `validation/DEVICE_CHECK.md` | The on-device check every platform runs: the fixed cases, scoring, the run-file format (`schemas/device-check-run.v3.json`) and what an app bundles |
| `RECORD.md` | The record of what leaves the device: when requests may happen, statuses and their wording, the count and the line under it |
| `rulepacks/SPEC.md` | Rule pack format and the verdict algorithm |
| `rulepacks/zz-test/` | Synthetic rule pack used only for conformance tests |
| `rulepacks/us-ca/` | California rule pack, **draft**: seven real programs read from official sources, with a source audit and hand-worked cases. Numbers are confirmed one by one by a person (see its README) |
| `rulepacks/kr/` | Reserved for a second jurisdiction; not started |
| `bands/` | Generalization bands per jurisdiction |
| `prompts/` | Versioned prompts |
| `copy/` | UI strings. `en.json` is complete; `es.json` and `ko.json` fall back to English for missing keys |
| `design/tokens.json`, `design/DESIGN.md` | The visual design every platform shares: colours with a dark scheme, type, spacing, radii, sizes and layout as tokens, and the rules for components and for each platform |
| `fixtures/conformance/` | Input → expected output cases every platform must pass (skeleton, rehydrate with typed amounts, generalize, evaluator, verdict, silhouette-verdict, validate, model-schema, output-check) |
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

- Confirmation by a person of every number in `us-ca` (the pack ships as a labelled draft until then).
