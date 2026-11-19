# Rule pack: United States, California (`us-ca`)

Status: **checked**. Seven programs: the federal Earned Income Tax Credit, the California Earned Income Tax Credit, the Young Child Tax Credit, CalFresh, California LifeLine, CARE and FERA.

Every number in `pack.json` was read from the agency's own publication on 2026-11-12. `SOURCES.md` records, for each number, the URL, the period it applies to and a verbatim quote. On 2026-11-19 every source was opened again and each number compared with it (`verifiedOn`, `sources[].checkedAt`): all match. `cases.json` holds 27 households worked out by hand; the reference engine reproduces all 189 expected results (`cd ../../reference && npm test`).

What this means and does not mean:

- The limits and amounts are the ones the agencies publish. Results still say "may qualify", never more: the agency decides, and every program links to its official source.
- CalEITC and the Young Child Tax Credit use tax year 2025 figures, because the 2026 figures are not final; the pack says so on those programs.
- `OPEN_QUESTIONS.md` lists what the pack does not model and why.

Sensitive questions in this pack (asked on the device, never sent, and skippable): filing status, taxpayer id type, investment income, whether someone at home is elderly or disabled, and whether someone at home is eligible for CalFresh.

This pack is not legal or tax advice, and it is not affiliated with any agency.
