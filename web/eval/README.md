# Extraction evaluation

This measures how well `document.pointer.extract` points at the right placeholders. It sends real requests to the Firebase AI Logic cloud model and scores the answers against documents whose true values are known.

## Dataset (`dataset/`)

All documents are synthetic, and every person, employer, landlord, address and number is invented. `generate.mjs` builds them deterministically from a fixed seed: running it twice gives byte-identical files.

| Set | Documents | Layouts | Variation |
|---|---|---|---|
| English paystubs | 30 | 10 (`L01`–`L10`) | Column orders (Current/YTD and YTD/Current) and labels ("Gross Pay", "Gross Earnings", "Total Gross", "Net Pay", "Take Home Pay"). With and without YTD; hourly and salaried; several earnings lines; deductions in one or two columns. Address blocks, check numbers, direct deposit lines, EIN. Four date formats; weekly, biweekly, semimonthly and monthly |
| Korean payslips | 6 | 3 (`K1`–`K3`) | Spelled-out, dotted and ISO pay dates. Separate and side-by-side earnings and deduction lists. Amounts with and without 원 |
| Leases | 4 | 2 (`E1`, `E2`) | Labelled fields, and numbered clauses written as sentences |

Each document has a `.gold.json` with its true field values, in the form the Rehydrator produces. The generator checks that:

- every paystub adds up in cents: gross = Σ earnings, and net = gross − Σ deductions;
- no word of a name is on the skeleton allowlist, so every gold value is reachable by pointers;
- every gold value appears in the document.

## Running

```bash
npm run eval:generate
npm run eval -- --variants v0,v2 --set all     # --set en | ko | lease | all, --limit N, --resume
node eval/analyze.mjs v2                        # failures per field and layout, with skeleton context
```

The runner:

1. starts the Vite dev server, which needs the App Check debug token in `.env.local`;
2. opens `runner.html` in headless Chromium;
3. for each document, runs the app's own pipeline: skeletonize (document language ∪ English) → `extractPointers` forced to the cloud → rehydrate.

Requests are sequential, at least 4 seconds apart, with exponential backoff on HTTP 429. `results/calls.json` counts every call made.

## Metrics

For each field and document, the outcome is one of:

| Outcome | Gold value | Prediction |
|---|---|---|
| **correct** | present | equal to gold |
| **missing** | present | omitted, `null`, or dropped by the Rehydrator |
| **wrong** | present | different from gold: a real placeholder, but the wrong one |
| **spurious** | absent | present |

Pointers cannot invent values. So every error is either a missing value or a pointer to a real but wrong placeholder.

- **Recall** = correct ÷ documents where the field has a gold value.
- **Wrong-pointer rate** = (wrong + spurious) ÷ documents.
- **All fields correct**: every field is correct or correctly absent, and the deduction amounts match exactly as a multiset.

Per variant, `results/{variant}.json` holds every document's pointers, values, outcomes, latency and token usage. `results/summary.md` compares the variants.

Variants are defined in `variant-list.mjs`; the prompt, schema and example files they use are in `variants/`.
