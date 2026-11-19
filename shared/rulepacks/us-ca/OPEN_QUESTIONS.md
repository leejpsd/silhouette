# us-ca rule pack: open questions and decisions

First prepared 2026-11-12. Revision 2 (same day) follows the conversion to rule-pack contract v1.2 and the project owner's decisions.

## Closed by the owner's decisions (revision 2)

| # | Question | Decision | Where applied |
|---|---|---|---|
| Q1 | Which tax year to target | Federal EITC stays at TY2026. CalEITC and YCTC stay at TY2025, with `period: "Tax year 2025"` and the caveat `ca-credit-2025-figures` | pack `programs[].period/caveats`; copy `caveat.ca-credit-2025-figures` |
| Q2 | Proposed PRWORA rule on EITC refunds (Schedule 3-A) | Not modelled. Caveat on the federal EITC card only. No extra question | caveat `eitc-refund-rule-proposed` |
| Q3 (CalFresh part) | Mixed-status households | Keep the single sensitive question. Add a caveat that the benefit size depends on who is eligible. Do not model allotments | caveat `calfresh-mixed-status` |
| Q4 | CalFresh elderly/disabled above the gross limit | New question `hasElderlyOrDisabledMember` (sensitive) plus `uncertainIf`, giving `maybe`. If skipped: `depends` | criterion `calfresh/gross-income-limit` |
| Q8 | The benefit question merged two program lists | v1.2 `multi` question `benefits` holds the union. LifeLine-only programs are now included, and each program checks its own list | sections 5 and 6 of SOURCES.md |
| Q9 (CalEITC part) | CalEITC amount | Omitted. Exact reproduction would need the full 2,632-value FTB table as constants, and no compact formula is citable | SOURCES.md section 2c |
| Q13 | Reviewer-only fields in the JSON | Removed. Content moved to SOURCES.md section 8 | pack.json |
| SPEC gaps 1–5 | floor, safe integer `cat`, "cannot decide", `requires` gating, multi-select | Solved by v1.2 | |

## Still open

### O1. TY2026 California figures (needs a person with a browser)

FTB has posted draft 2026 forms on https://www.ftb.ca.gov/forms/draft-tax-forms.html: "3514-draft" (09/23/2026) and "3514-booklet-draft" (10/20/2026). Automated fetches got HTTP 403. When the final 2026 FTB 3514 is published (typically December–January), update these values:

- `caleitc.maxIncome`, `caleitc.investmentIncomeLimit`, `caleitc.maxCredit.*`
- `yctc.maxIncome`, `yctc.maxCredit`, `yctc.phaseoutThreshold`, `yctc.reductionPer100`

Then change both `period` values and drop the caveat. Also recheck that the $33,000 band edge (C/D) still sits just above the CA income cap.

### O2. Federal EITC amount near $0

The statutory formula gives `likely` with an estimate of $0 at two points: just under the completed phaseout (e.g. MFJ with 3 children at $70,243), and at zero or negative income when "earned income" was answered yes. The IRS EIC Table (2026 edition not yet published) would show a few dollars, or "no credit". Options:

- (a) Hide estimates below some floor, such as $1.
- (b) Show "a small amount".
- (c) Leave it as is.

This is a product decision. Separately, if the IRS publishes how the EIC Table is computed (for example, the midpoint of each $50 step), the formula could be made exact with `floor`. No official statement of the method was found.

### O3. Mixed-status: the gross-test household size (unverified)

The caveat covers the benefit size. It has **not** been verified whether the CalFresh gross income test uses the eligible members' household size with the ineligible members' income counted or prorated (MPP 63-503 / CDSS guidance). That could change the verdict, not just the amount. A person should check this with CDSS policy.

### O4. Children's ID types: federal vs California

`numQualifyingChildren` counts only children with an SSN (the federal rule). California also counts ITIN children. For CA, this affects only the "18+ or has a child" test. YCTC asks separately about a child under 6. Decision: add a second count, or accept the approximation.

### O5. CalFresh work and student rules

The ABAWD time limit (ages 18–64, no household member under 14, 80 hours a month) and the student rule (ages 18–49, at least half-time) are shown as a caveat only (`calfresh-work-student-rules`). Should v2 ask about them?

### O6. Annual vs monthly income (CalFresh)

CalFresh tests current monthly income, while the app uses an annualized figure. Seasonal or recently changed income may be misjudged. Options are a copy note, or a question such as "Has your income changed in the last 30 days?".

### O7. Utility determination and municipal programs

`energyProvider` is asked directly; county cannot identify the utility. Customers of municipal utilities (LADWP, SMUD, IID, and others) get "unlikely" for CARE and FERA. Some of them have SoCalGas for gas, and if they pick SoCalGas they are evaluated for CARE on gas. The single-choice question cannot express "two utilities". Options are to make `energyProvider` a `multi` question, or to let Discover point to municipal programs.

### O8. "School lunch": free vs reduced-price

CARE lists "NSLP – Free Lunch". LifeLine lists "National School Lunch Program (NSL)" with no qualifier. The option is labelled "Free school lunch". Confirm whether reduced-price lunch counts for LifeLine.

### O9. YCTC rounding

FTB 3514 line 28 says "round to the nearest whole dollar". The draft rounds half up, so 50 cents goes up. Confirm. It affects at most $1, on rare incomes.

### O10. Sources an automated fetch could not reach (status 2026-11-19)

| Source | Status on 2026-11-19 |
|---|---|
| FTB 2026 draft 3514 and booklet | Draft forms are listed but given out only by email, and FTB says not to rely on them. The 2025 figures stay until the final 2026 form (O1) |
| USDA FNS FY 2027 SNAP COLA page | Still HTTP 403 in a browser. The CDSS FFY 2027 chart is the state's own publication of the same limits, and its gross column is exactly twice its net column (200% and 100% FPL) |
| CDSS "Eligibility and Issuance Requirements" | Still behind a login. MCE at 200% FPL is what the FFY 2027 chart's gross column applies |
| uscode.house.gov §32 | Still 404. The rates in the 2024 edition (34/40/45/7.65 and 15.98/21.06/21.06/7.65) reproduce every 2026 maximum credit and completed phaseout amount in Rev. Proc. 2025-32 (for example 0.34 × $13,020 = $4,427; $31,160 + $4,427 / 0.1598 = $58,863), so they are the rates in force for tax year 2026 |
| californialifeline.com/en/qualify | Still HTTP 403. The CPUC page and the CPUC administrative letter, which this site follows, give the same limits |
| PG&E CARE eligibility page | Opened in a browser. Account-holder and household requirements stay a caveat (`energy-account-rules`) |
| FTB CalEITC eligibility page | Opened in a browser; the 2025 table matches the pack and the 2025 FTB 3514 booklet |
| Federal Register 2026-20790 and the PRWORA rule | Federal Register search on 2026-11-19: 2026-16985 (proposed rule) and 2026-20790 (hearing notice) only; no final rule. The caveat stays |

### O11. Source oddities (no action needed beyond awareness)

- **FTB board slides (2026-06-22)** give the CalEITC maximum as "$3,576". The FTB page and credit table give $3,756, which the draft uses.
- **CPUC CARE page** shows "$11, 360" with a stray space.
- **The LifeLine administrative letter PDF** carries a stale metadata title.
- **The CalFresh MCE fact sheet** is undated and cites a 2015 insert. Confirm that MCE at 200% FPL is still current for FFY 2027.
- **The LifeLine "$19.00" support amount** is dated 2024 and is not used.

### O12. Questions and privacy

- `investmentIncome` is an integer, sensitive and skippable. If it is skipped, every tax credit shows "depends". A coarse enum would reduce friction but would go stale as thresholds change.
- `ageGroup` and `housing` are not sensitive and are not in the profile, so they stay on device.
- `county` is not in the pack. It is an app-level profile question.

### O13. Out-of-scope related programs

Candidates for later packs: Foster Youth Tax Credit, federal CTC/ACTC, CFAP, Energy Savings Assistance (CPUC, 250% FPL), LIHEAP, municipal utility discounts, and the LifeLine broadband pilot.

## What v1.2 still cannot express

1. **Exact table lookups whose official values exist only as a table.** `floor` makes the CalEITC table indexable. The obstacle is now authoring and verification: 2,632 constants, and every numeric constant becomes a band sample point for every criterion (SPEC section 5). Either per-program constants scoping for sample points, or a table type excluded from sampling, would make large step tables practical.
2. **Per-person facts.** Each person's ID type, immigration status, and age are collapsed into household-level questions. A list-valued question with a quantifier ("any member …") is not available.
3. **Two answers to one choice.** For example, a separate electric and gas utility (O7). The workaround is a `multi` question.
4. **A caveat attached to one criterion or condition.** Caveats are per program and always shown. A caveat that appears only when it applies (for example, the PRWORA caveat only for filers who might be affected) is not expressible.
5. **Rounding other than floor.** "Nearest dollar, half up" needs `floor(x + 0.5)`. That works, but it is a convention the author must apply by hand. A form that says "round" with no direction leaves the direction to the author (O9).
