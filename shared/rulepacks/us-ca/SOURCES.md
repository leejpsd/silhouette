# us-ca rule pack: source audit

Prepared 2026-11-12 by reading the official publications. **Checked 2026-11-19:** every source below was opened again in a browser (PDFs converted to text) and each row's value and quote were compared with it. All 84 constants in `pack.json` and every rate, age and rule quoted here match their source. One rule was corrected: married filing separately with a qualifying child is now "Possible" for the three tax credits (section 8c). The 2025 figure in the FTB board slide ("$3,576") is a typo of the FTB table's $3,756, which the 2025 FTB 3514 booklet's table also gives. The proposed PRWORA rule (S6) was still a proposed rule in the Federal Register on 2026-11-19.

Each row is meant to be checked on its own: open the URL, find the quote, and compare the number.

**How the rows were collected.** Every number was read from the agency's own file. Pages were downloaded with `curl`. PDFs were converted with `pdftotext`, and HTML was stripped to text. The quotes are copied from that extracted text. Each key table was then read a second time by a separate path:

- Rev. Proc. 2025-32 and the CalFresh chart were downloaded again through a second tool. The bytes were identical (same SHA-1). The tables were then re-extracted in `pdftotext -raw` mode and the numbers matched.
- The CPUC CARE/FERA page and the LifeLine page were fetched again with a narrowly targeted prompt. The figures matched.
- The EITC and CalFresh tables were also checked for internal consistency. Each check is noted next to its table.

Every row below was fetched on **2026-11-12**.

Table cells in a quote are separated by ` | ` or by spaces, as they appear in the extracted text.

**Revision 2 (2026-11-12, rule-pack contract v1.2).** The pack was converted to v1.2. Reviewer-only fields (`draftNote`, `draftPeriod`, `draftAmountNote`, `fetchedOn`, the `constants.*.period` strings) were **removed from the JSON**. Their content is now in section 8 of this file. Every source in the pack was fetched on 2026-11-12. No new numbers were added in revision 2. Two things are new: the LifeLine-only program list (section 5, quoted from S18) and the exact FTB 3514 YCTC arithmetic (section 3, quoted from S12).

---

## 1. Federal Earned Income Tax Credit (EITC). Target period: tax year 2026

### 1a. Audit table

Primary source **S1**: Rev. Proc. 2025-32, section 4.06. URL: https://www.irs.gov/pub/irs-drop/rp-25-32.pdf (title in file: "Part III Administrative, Procedural, and Miscellaneous", "Rev. Proc. 2025-32"). Intro sentence: "For taxable years beginning in 2026, the following amounts are used to determine the earned income credit under § 32(b)." The table header reads `Item One Two Three or More None` (number of qualifying children).

| # | Number(s) | Meaning | Period | Source | Verbatim quote |
|---|---|---|---|---|---|
| F1 | $13,020 / $18,290 / $18,290 / $8,680 | Earned income amount (1 / 2 / 3+ / 0 children). Earned income at or above this gets the maximum credit | TY2026 | S1 | `Earned Income Amount $13,020 $18,290 $18,290 $8,680` |
| F2 | $4,427 / $7,316 / $8,231 / $664 | Maximum credit (1 / 2 / 3+ / 0) | TY2026 | S1 | `Maximum Amount of Credit $4,427 $7,316 $8,231 $664` |
| F3 | $31,160 / $31,160 / $31,160 / $18,140 | Threshold phaseout amount, married filing jointly | TY2026 | S1 | `Threshold Phaseout Amount (Married Filing Jointly) $31,160 $31,160 $31,160 $18,140` |
| F4 | $58,863 / $65,899 / $70,244 / $26,820 | Completed phaseout amount, MFJ. No credit at or above this AGI (or earned income, if greater) | TY2026 | S1 | `Completed Phaseout Amount (Married Filing Jointly) $58,863 $65,899 $70,244 $26,820` |
| F5 | $23,890 / $23,890 / $23,890 / $10,860 | Threshold phaseout amount, all other filing statuses | TY2026 | S1 | `Threshold Phaseout Amount (All other filing statuses) $23,890 $23,890 $23,890 $10,860` |
| F6 | $51,593 / $58,629 / $62,974 / $19,540 | Completed phaseout amount, all other filing statuses | TY2026 | S1 | `Completed Phaseout Amount (All other filing statuses) $51,593 $58,629 $62,974 $19,540` |
| F7 | $12,200 | Investment income limit (credit not allowed if investment income exceeds this) | TY2026 | S1 | "For taxable years beginning in 2026, the earned income tax credit is not allowed under § 32(i) if the aggregate amount of certain investment income exceeds $12,200." |
| F8 | 34 / 40 / 45 / 7.65 (%) | Credit percentage (1 / 2 / 3+ / 0 children) | Statutory (current law) | S4 | Table rows: `1 qualifying child \| 34 \| 15.98`, `2 qualifying children \| 40 \| 21.06`, `3 or more qualifying children \| 45 \| 21.06`, `No qualifying children \| 7.65 \| 7.65` |
| F9 | 15.98 / 21.06 / 21.06 / 7.65 (%) | Phaseout percentage | Statutory | S4 | Same rows as F8 (third column) |
| F10 | 25, 65 | Childless filers: at least 25 and under 65 at end of year. If MFJ, at least one spouse | TY2026 (IRS page, updated 10-Nov-2026) | S3 | "You must be at least age 25 but under age 65 at the end of the year. If married and filing a joint return, at least one spouse must meet the age rule." |
| F10b | 25, 65 | The same age rule in the statute | Statutory | S4 | "has attained age 25 but not attained age 65 before the close of the taxable year" |
| F11 | (rule) | Valid SSN for filer, spouse, and child, issued by the return due date | TY2026 | S3 | "To qualify for the EITC, you, your spouse if filing jointly, and the child claimed must have a valid Social Security number (SSN) issued on or before the due date of the tax return (including extensions)." |
| F12 | (rule) | An SSN that does not authorize work is not valid for the EITC | TY2026 | S3 | "It was issued solely to apply for or receive a federally funded benefit (such as Medicaid) and does not authorize you to work." |
| F13 | (rule) | Basic rules list | TY2026 | S3 | "Have earned income / Have investment income below the limit / Have a valid Social Security number by the due date of your return (including extensions) / Be a U.S. citizen or a resident alien all year / Not file Form 2555, Foreign Earned Income" |
| F14 | (rule) | New for TY2026: Schedule 3-A | TY2026 | S3 | "Beginning with tax year 2026, you may have to complete Schedule 3-A, Federal Public Benefit, if you are claiming the Earned Income Tax Credit." |

Cross-checks:

- **S2**, Notice 797 (Rev. December 2026), https://www.irs.gov/pub/irs-prior/n797--2026.pdf: "For 2026, the EIC can be as much as $4,427 if you have one qualifying child who has a valid SSN; $7,316 if you have two qualifying children who have valid SSNs; $8,231 if you have three or more qualifying children who have valid SSNs; and $664 if you have no qualifying children who have a valid SSN." This **agrees with F2**. The same notice also gives "$70,244" as the VITA income cutoff. That matches F4 (3+ children, MFJ).
- **Internal consistency (arithmetic check, not a source):**
  - Each max credit equals credit % × earned income amount: 0.34×13,020 = 4,426.8; 0.40×18,290 = 7,316; 0.45×18,290 = 8,230.5; 0.0765×8,680 = 664.0.
  - Each completed phaseout equals threshold + max credit ÷ phaseout %, to within $1. For example, 23,890 + 7,316/0.2106 = 58,628.6, and the table shows 58,629.
- **Prior-year (not used), for context:** the IRS EITC tables page (https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/earned-income-and-earned-income-tax-credit-eitc-tables, "Page Last Reviewed or Updated: 08-May-2026") still shows **tax year 2025** as its latest year: "Investment income limit: $11,950 or less" and "No qualifying children: $649". There is **no 2026 table on that page yet**. Rev. Proc. 2025-32 is the only 2026 source for the income limits.

Sources:

- **S1**: Rev. Proc. 2025-32, URL above.
- **S2**: Notice 797 (Rev. 12-2026), URL above. "Rev. December 2026" is the revision date printed on the IRS's own PDF, which was already posted at that URL when it was checked, so the date is the IRS's own, not a typo.
- **S3**: "Who qualifies for the Earned Income Tax Credit (EITC)", https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/who-qualifies-for-the-earned-income-tax-credit-eitc ("Page Last Reviewed or Updated: 10-Nov-2026").
- **S4**: 26 U.S.C. §32, U.S. Code 2024 edition on govinfo, https://www.govinfo.gov/content/pkg/USCODE-2024-title26/html/USCODE-2024-title26-subtitleA-chap1-subchapA-partIV-subpartC-sec32.htm. uscode.house.gov returned 404 to automated fetches. The percentages in Rev. Proc. 2025-32 are consistent with S4 (see the arithmetic above). The reviewer should still confirm on uscode.house.gov that H.R. 1 (P.L. 119-21) did not change §32(b)(1).
- **S5**: Draft 2026 Schedule 3-A, https://www.irs.gov/pub/irs-dft/f1040s3a--dft.pdf ("Caution: DRAFT—NOT FOR FILING", "Created 6/24/26"). Line 8: "Are you or your spouse a U.S. citizen, U.S. national, or qualified alien? See instructions."
- **S6**: NPRM REG-119882-25, https://public-inspection.federalregister.gov/2026-16985.pdf (published in the Federal Register 2026-08-20 as https://www.federalregister.gov/d/2026-16985). Quote: "aliens who are not "qualified aliens" under PRWORA would be ineligible to receive the refunded portion of these refundable credits". Applicability: "These proposed regulations are proposed to apply for taxable years ending on or after the date these regulations are published as final regulations in the Federal Register." A Federal Register search result listed a hearing-cancellation notice (federalregister.gov document 2026-20790, dated 2026-10-09). It was seen only as a search result and was not fetched. The search found **no final rule** as of 2026-11-12. See OPEN_QUESTIONS Q2.
- **S7** (docs list): "How to work with a tax professional to claim the EITC", https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit/how-to-work-with-a-tax-professional-to-claim-the-earned-income-tax-credit-eitc. Quote: "Social Security documents: Social Security cards, a Social Security number verification letter, or other U.S. government document that verifies everyone you include on your tax return".

**Count:** 35 numbers recorded (24 table values, 1 investment limit, 8 percentages, 2 ages). **0 are null** for TY2026.

### 1b. Plain-language rules (TY2026)

- You need earned income: wages, tips, or self-employment.
- Your income must be below the completed-phaseout amount for your filing status and number of qualifying children. Income here means AGI, or earned income if that is higher. The limits run from $19,540 (single, no children) to $70,244 (married filing jointly, 3 or more children).
- Investment income must be $12,200 or less.
- You, your spouse (if filing jointly), and each child you claim need an SSN that is valid for work, issued by the return due date.
- You must be a U.S. citizen or resident alien all year.
- With no qualifying child, you must be 25–64 at the end of the year (on a joint return, one spouse is enough), must have lived in the U.S. more than half the year, and cannot be someone else's qualifying child or dependent.
- Married filing separately is allowed only under the separated-spouse rule.
- **New for TY2026 (uncertain):** the refunded part of the credit may require a citizen, national, or qualified alien on the return (Schedule 3-A). See OPEN_QUESTIONS Q2.

### 1c. How the draft models it

There are six criteria:

- `has-earned-income`: a question.
- `income-limit`: `annualIncome < completedPhaseout[status][children]`.
- `investment-income`
- `valid-ssn`
- `filing-status`: not MFS.
- `age-if-no-child`

The `amount` uses the statutory formula from 26 U.S.C. 32(a):

`max(0, min(credit% × income, maxCredit) − phaseout% × max(0, income − threshold))`

It treats `annualIncome` as both earned income and AGI. The table values are selected with `cat` keys: `min(numQualifyingChildren, 3)` for the child count, and `"joint"`/`"other"` from `filingStatus`.

The card shows two caveats. `eitc-estimate` says the amount assumes all income is from work and the IRS table may differ by a few dollars. `eitc-refund-rule-proposed` covers the proposed PRWORA rule (S5, S6), which is not modelled. Both are the project owner's decisions.

The engine was run on example cases with these results (see `cases.json` for more):

| Case | Expected | Engine |
|---|---|---|
| Single, no children, $15,000 | 664 − 0.0765×4,140 = 347.3 | $347 |
| Head of household, 3 children, $60,000 | 8,231 − 0.2106×36,110 = 626.2 | $626 |
| 2 children, $18,290 | maximum credit | $7,316 |

### 1d. NOT modelled in v1, and why

- **Qualifying-child tests** (relationship, age under 19 / under 24 student / disabled, residency more than half the year, joint-return test, tie-breaker rules). These need several per-child facts. The app asks only for a count, and the question text describes the tests.
- **Children without an SSN valid for work.** These children do not count for the federal credit, but they do count for CalEITC (ITIN allowed). A single count question cannot hold both counts. The question asks for children with an SSN, so CA results may undercount.
- **Separated-spouse exception for MFS.** MFS always fails, so this can produce a false negative. It needs extra living-arrangement questions.
- **U.S. citizen or resident alien all year, and the nonresident-alien election.** Resident-alien status is a tax-residency test (green card or substantial presence). Asking it reliably needs more than one question.
- **Not a qualifying child or dependent of another person; lived in the U.S. more than half the year (childless filers).** This is low priority for adults filing their own return.
- **AGI different from earned income** (for example unemployment, Social Security, or investment income raising AGI). `annualIncome` is a single number.
- **Schedule 3-A / PRWORA refunded portion.** The rule is proposed, not final. The owner decided that it is not modelled and that the federal EITC card carries the caveat `eitc-refund-rule-proposed`, with no extra question.
- **Military combat pay election, clergy, disability special rules, Form 2555.** These are rare.

---

## 2. California Earned Income Tax Credit (CalEITC). Latest final period: tax year 2025

TY2026 figures exist only in an FTB **draft** form and booklet. The FTB draft forms page lists "2026, California Earned Income Tax Credit | 3514-draft | 09/23/2026" and "2026, California Earned Income Tax Credit Booklet | 3514-booklet-draft | 10/20/2026". Automated fetches of `https://www.ftb.ca.gov/forms/archive/draft/2026-3514.pdf` returned an HTML page or HTTP 403, so **the TY2026 values are null** in this draft. The reviewer should open the draft PDF from https://www.ftb.ca.gov/forms/draft-tax-forms.html in a browser.

### 2a. Audit table

| # | Number | Meaning | Period | Source | Verbatim quote |
|---|---|---|---|---|---|
| C1 | $32,900 | Max earned income (and AGI) | TY2025 | S8 | "Have earned income of at least $1 and not more than $32,900" |
| C1b | $32,901 | Same limit stated as "less than" | TY2025 | S9 | "Both your earned income and federal adjusted gross income (AGI) must be less than $32,901 to qualify for the California credit." |
| C2 | $4,814 | Investment income limit (disqualified if more than this) | TY2025 | S9 | "Is the amount on line 12 more than $4,814?" (Step 2, Worksheet 1 – Investment Income) |
| C3 | 18 | Minimum age if no qualifying child | TY2025 | S8 | "You're at least 18 years old or have a qualifying child" |
| C3b | 18 | Same rule (spouse counts on a joint return) | TY2025 | S9 | "Were you (or your spouse/RDP if filing a joint return) at least age 18 at the end of 2025?" |
| C4 | $302 / $2,016 / $3,339 / $3,756 | Max CalEITC (0 / 1 / 2 / 3+ children) | TY2025 | S8 | Rows: `None \| $32,900 \| $302 \| $0 \| $1,189 \| $649`; `1 \| $32,900 \| $2,016 \| $1,189 \| $1,189 \| $4,328`; `2 \| $32,900 \| $3,339 \| ...`; `3 or more \| $32,900 \| $3,756 \| $1,189 \| $1,189 \| $8,046` (columns: children, max income, CalEITC, YCTC, FYTC, federal EITC) |
| C5 | (rule) | SSN or ITIN for everyone | TY2025 | S8 | "Have a valid Social Security Number or Individual Taxpayer Identification Number (ITIN) for you, your spouse/RDP, and any qualifying children" |
| C6 | (rule) | Any SSN works, not only work-authorized ones | TY2025 | S9 | "Any valid SSN can be used, not only those that are valid for work." |
| C7 | (rule) | CA residency | TY2025 | S8 | "Live in California for more than half the filing year" |
| C8 | (rule) | MFS only under the separated-spouse rule | TY2025 | S8 | "Married/registered domestic partner (RDP) filing separately filers must meet all of the following requirements: Had a qualifying child who lived with you for more than half of the tax year, and: ..." |

**Conflict to flag.** An FTB board presentation (S10, June 22, 2026), https://www.ftb.ca.gov/about-ftb/meetings/board-meetings/2026/june/3-Community-Tax-Preference-Items.pdf, Slide 2 says "Maximum credit is $3,576". S8 and the S9 credit table say **$3,756**. The S9 table row "9,801 9,850 212 1,205 3,339 3,756" agrees with S8. The slide is probably a transposition, and it is not used. The draft uses $3,756 (constants only; CalEITC has no `amount`).

**Earned income definition (S8):** "Earned income is wages, salaries, tips, and other employee compensation that is subject to California withholding, or net income from self-employment."

Sources:

- **S8**: FTB "Eligibility and credit information | CalEITC", https://www.ftb.ca.gov/file/personal/credits/caleitc/eligibility-and-credit-information.html. Its only current table is "Tax year 2025 maximum income and credit amounts". A second fetch through WebFetch returned 403, so it is single-read; the reviewer should check the table.
- **S9**: FTB "2025 California Earned Income Tax Credit Booklet", https://www.ftb.ca.gov/forms/2025/2025-3514-booklet.html
- **S10**: FTB board slides (conflict only; not used).

**Count:** 8 numbers recorded (C1, C1b, C2, C3, and the four C4 values). **All are TY2025.** For TY2026, **8 of 8 are null / unconfirmed**.

### 2b. Plain-language rules (TY2025)

- You need at least $1 of earned income (wages subject to CA withholding, or net self-employment income).
- Earned income must be no more than $32,900, and federal AGI must be below $32,901.
- Investment income must be $4,814 or less.
- You, your spouse/RDP, and the children need an SSN (any kind) or an ITIN.
- You must be 18 or older, or have a qualifying child.
- You must have lived in CA more than half the year.
- You cannot be someone else's qualifying child, or a dependent unless you have a qualifying child.
- MFS is allowed only under the separated-spouse rule.

### 2c. NOT modelled

- **Amount (still omitted under v1.2, per the owner's decision 5).** v1.2 adds `floor`, so the table could now be indexed (`floor((income − 1) / 50)`). But the only citable source for exact values is the table itself. It was extracted from S9: **658 rows** ($1–$32,900 in $50 steps) × 4 child columns = **2,632 values**.
  - Embedding them would need a person to verify 2,632 numbers.
  - Every one of them would also become a band sample point for every criterion, because SPEC section 5 samples all numeric literals in `constants`.
  - The underlying formula is not citable either. The phase-in rates look like the federal rates × 85%: row 1 gives 2 / 7 / 9 / 10 ≈ midpoint $25.50 × 0.065 / 0.289 / 0.34 / 0.3825. But the indexed 2025 parameters are not published in the booklet or on the FTB pages read, and the phase-out shape is not stated anywhere that could be read automatically.
  - So no `amount`. The card has the `ca-credit-2025-figures` caveat.
- **CA residency more than half the year.** It is assumed from the jurisdiction choice.
- **Earned income must be wages subject to CA withholding.** `annualIncome` may include out-of-state or non-wage income.
- **Dependent-of-another rule, MFS separated-spouse exception, qualifying-child tests.** These are the same reasons as for the federal EITC.

---

## 3. California Young Child Tax Credit (YCTC). Latest final period: TY2025 (TY2026 is null for the same reason as CalEITC)

| # | Number | Meaning | Period | Source | Verbatim quote |
|---|---|---|---|---|---|
| Y1 | $1,189 | Max credit per return | TY2025 | S11 | "The Young Child Tax Credit (YCTC) provides up to $1,189 per eligible tax return for tax year 2025." |
| Y1b | $1,189 | Same, on the form | TY2025 | S12 | "If the amount on line 23 is $27,425 or less, skip line 25 through line 27 and enter $1,189 on line 28." |
| Y2 | $27,425 | Phaseout threshold (earned income) | TY2025 | S9 | "the credit amount phases out as earned income exceeds the threshold amount of $27,425, and completely phases out at $32,901." |
| Y3 | $32,901 | Complete phaseout | TY2025 | S9 | (same sentence) |
| Y3b | $32,900 | AGI cap | TY2025 | S9 | "If your federal AGI exceeds $32,900, check the box on line 23b and stop here, you do not qualify for the credit." |
| Y4 | $21.71 per $100 | Reduction rate | TY2025 | S9 | "For every $100 over the threshold amount, your credit is reduced by $21.71." |
| Y4b | (method) | Form arithmetic | TY2025 | S12 | "26 Divide line 25 by 100. Enter the result as a decimal out to two decimal places, do not round." and "27 Reduction amount. Multiply line 26 by $21.71." |
| Y5 | 6 | Child younger than 6 at end of the tax year | TY2025 | S9 | "Your qualifying child is younger than six years old as of the last day of the taxable year." |
| Y6 | $35,640 | Zero-earnings path: wages and total net loss each not over this amount | TY2025 | S11 | "For tax year 2025, you may have a net loss of up to $35,640." |
| Y6b | $35,640 | Same, wages | TY2025 | S9 | "You do not have total wages, salaries, tips, and other employee compensation in excess of $35,640 in the taxable year (this amount will be indexed annually)." |

Sources:

- **S11**: FTB "Young Child Tax Credit", https://www.ftb.ca.gov/file/personal/credits/young-child-tax-credit.html
- **S12**: 2025 Form FTB 3514, https://www.ftb.ca.gov/forms/2025/2025-3514.pdf

**Count:** 6 distinct numbers (1,189; 27,425; 32,901/32,900; 21.71; 6; 35,640). **All are TY2025.** For TY2026, all 6 are null or unconfirmed.

**Rules.**

- To qualify, you must be allowed CalEITC, or would be allowed it except that your earned income is zero or less.
- You need at least one CalEITC qualifying child younger than 6 at year end.
- Federal AGI must be no more than $32,900.
- The credit is $1,189, reduced by $21.71 for each $100 of earned income over $27,425.
- Since TY2022, filers with zero or negative earned income can qualify if their wages are no more than $35,640 and their total net loss is no more than $35,640.

**Form wording for lines 27–28 (S12):**

- "27 Reduction amount. Multiply line 26 by $21.71. Enter the result as a decimal out to two decimal places, do not round"
- "28 Young Child Tax Credit. ... subtract line 27 from line 24. If your credit amount is between $0 and $1, enter $1. If your credit amount is over $1, round to the nearest whole dollar."

**Modelled.** There are five criteria: `child-under-6` (question), `income-limit` (≤ $32,900), `investment-income` (the CalEITC limit), `ssn-or-itin`, and `filing-status`.

Revision 2 reproduces FTB 3514 lines 23–28 **exactly** using `floor`. The arithmetic runs in whole cents, so floating-point error cannot move a value across a cent:

1. L23 = `floor(annualIncome)`.
2. L25 = L23 − 27,425.
3. L27 (in cents) = `floor(L25 × 2171 / 100)`, where 2171 = `floor(21.71 × 100 + 0.5)` is computed from the cited constant.
4. Credit in cents = 118,900 − L27.
5. The result is 0 if the credit is ≤ 0, $1 if it is under 100 cents, and otherwise `floor((cents + 50) / 100)`, which rounds to the nearest dollar with half going up.

This expression was compared with a BigInt transcription of the form for every whole-dollar income from $27,000 to $33,000 (6,001 values): **0 mismatches**. Examples:

| Income | Form result | Engine |
|---|---|---|
| $30,000 | 1,189 − 559.03 = 629.97 → $630 | $630 (revision 1's continuous formula gave $629) |
| $27,500 | 1,189 − 16.28 = 1,172.72 → $1,173 | $1,173 |
| $32,900 | $0.38 → $1 | $1 |

"Round to the nearest whole dollar" is assumed to round half up. The reviewer should confirm.

**NOT modelled.**

- **The zero-earnings path's wage and net-loss caps.** The app does not ask about net losses. The draft does not require earned income for YCTC, so a filer with zero earnings and large losses could be shown "likely" wrongly. This is rare.
- **Part-year resident proration.**
- **The Foster Youth Tax Credit (FYTC).** It is a related credit that is out of scope for v1. See OPEN_QUESTIONS.

---

## 4. CalFresh (SNAP in California). Period: FFY 2027, October 1, 2026 – September 30, 2027

Primary source **S13**: CDSS, "2026-2027 CalFresh Income & Eligibility Limits", https://cdss.ca.gov/portals/9/calfreshoutreach/220000_English_Income_Inserts_FFY2027.pdf. Header: "Effective October 1, 2026 - September 30, 2027". This file was read twice (identical SHA-1, and layout and raw text extraction agree).

| # | Household size | Gross monthly (verbatim) | Net monthly (verbatim) | Max allotment (verbatim) |
|---|---|---|---|---|
| CF1 | 1 | `1 $2,660 $1,330` | (same row) | `1 $306` |
| CF2 | 2 | `2 $3,608 $1,804` | | `2 $562` |
| CF3 | 3 | `3 $4,554 $2,277` | | `3 $808` |
| CF4 | 4 | `4 $5,500 $2,750` | | `4 $1,023` |
| CF5 | 5 | `5 $6,448 $3,224` | | `5 $1,217` |
| CF6 | 6 | `6 $7,394 $3,697` | | `6 $1,463` |
| CF7 | 7 | `7 $8,340 $4,170` | | `7 $1,616` |
| CF8 | 8 | `8 $9,288 $4,644` | | `8 $1,841` |
| CF9 | each additional | `+$948 +$474` | | "+$225 per additional member." ("Member 9-17.") and "(*HH Size 18+)" "(*$3,887 maximum)" |

**Internal check (arithmetic check):** every gross value is exactly 2 × the net value (200% vs 100% FPL). For example, 2 × 1,330 = 2,660 and 2 × 4,644 = 9,288.

Other figures and rules:

| # | Number / rule | Meaning | Period | Source | Verbatim quote |
|---|---|---|---|---|---|
| CF10 | 200% FPL | Gross limit under Modified Categorical Eligibility (MCE); all resources exempt | Effective since 2014-07-01 (fact sheet undated) | S14 | "Effective July 1, 2014, all households with gross income at or below 200 percent of the Federal Poverty Level (FPL) must be conferred MCE status if they are issued or have online access to the Temporary Assistance to Needy Families (TANF)-funded "Family Planning – PUB 275" brochure and meet all other conditions of eligibility for CalFresh." |
| CF11 | (rule) | MCE exempts resources | same | S14 | "Receipt of the PUB 275 exempts all resources in the determination of eligibility for households who meet all other CalFresh eligibility requirements." |
| CF12 | 130% FPL | Gross limit for households that cannot get MCE (IPV disqualification, work-requirement noncompliance) | same | S14 | "...are subject to all CalFresh eligibility requirements (including the gross income limit of 130 percent of FPL)" |
| CF13 | (rule) | Households of 1–2 with MCE get the minimum benefit | same | S14 | "A household of one or two that has been conferred MCE status will be entitled to the minimum CalFresh benefit." |
| CF14 | 60, $3,500 | Elderly (60+) or disabled households: may exceed the gross limit but must meet the net limit and resources under $3,500 | Deck "Updated June 2026" | S16 | "Can be over the gross income limit but must meet the net income limit and have less than $3,500 in resources." |
| CF15 | (rule) | Immigration eligibility from 2026-04-01 | From 2026-04-01 | S15 | "Starting April 1, 2026, you are eligible for CalFresh if you are a person who is: A Citizen of the United States (U.S.); A U.S. National ...; A Cuban and Haitian Entrant (CHE); A Citizen of Micronesia, the Marshall Islands, or Palau; or, A Lawful Permanent Resident (LPR) who has met the 5-year waiting period or an exemption from the 5-year waiting period" |
| CF16 | (rule) | Groups that lost eligibility | From 2026-04-01 | S15 | "Starting April 1, 2026, you will no longer be eligible for CalFresh and your CalFresh benefits will be terminated if you are a person who is: An Asylee; A Refugee; A Parolee (unless you are CHE); ..." |
| CF17 | (rule) | Ineligible members' resources still count | H.R. 1 | S17 | "All non-eligible, noncitizen financial resources in any CalFresh household must continue to be included in eligibility and benefit determinations, despite not being eligible for benefits." |
| CF18 | 18–64; under 14; 80 hrs; 3 of 36 months | ABAWD time limit | Deck June 2026 | S16 | "Age 18 to 64", "Not residing in the same CalFresh household as a household member under age of 14", "ABAWDs can only receive CalFresh for 3 months in a 36-month period unless they meet work or exemption rules", "at least 80 hours per month" |
| CF19 | 18–49; half time | Student rule | Deck June 2026 | S16 | "A student is someone between the ages of 18-49 AND enrolled at least half time in an institution or higher education." |
| CF20 | (rule) | Who must apply together | Deck June 2026 | S16 | "Children under 22 years old and living with their parents"; "Married couples living together" |

Sources:

- **S13**: CDSS chart, URL above.
- **S14**: CDSS "CalFresh Modified Categorical Eligibility (MCE) Fact Sheet", https://www.cdss.ca.gov/calfreshoutreach/res/pdf/CalFresh_Modified_Categorical_Eligibility_Fact_Sheet.pdf. The fact sheet is **old**: it refers to the "2015 CalFresh Income Insert". The 200% rule is consistent with S13 (gross = 2 × net), but the reviewer should confirm that MCE at 200% is still in effect for FFY 2027.
- **S15**: CDSS "CalFresh Noncitizen Eligibility Frequently Asked Questions", https://cdss.ca.gov/Portals/9/CalFreshResourceCenter/CalFresh%20Noncitizen%20Eligibility%20FAQ_Color.pdf
- **S16**: CDSS "CalFresh Eligibility: Basics, Updated June 2026", https://cdss.ca.gov/Portals/9/CalFreshOutreach/CalFreshEligibilityBasics_InteractiveSlideDeck.pdf
- **S17**: CDSS ACL 25-50 (July 14, 2025), https://cdss.ca.gov/Portals/9/Additional-Resources/Letters-and-Notices/ACLs/2025/25-50.pdf

**Not reachable by automated fetch:**

- The CDSS page https://www.cdss.ca.gov/inforesources/cdss-programs/calfresh/eligibility-and-issuance-requirements redirects to a login page.
- USDA FNS https://www.fns.usda.gov/snap/income-eligibility-standards returned HTTP 403. A search-engine snippet of that page showed a FY 2027 net limit of $1,330 for one person (consistent with CF1) and asset limits of "$4,750" and "$3,000". Those asset figures are **unverified** and not used. The reviewer should open the FNS page to cross-check CF1–CF9.

**Count:** 28 table numbers recorded (8 gross + 1 increment, 8 net + 1 increment, 8 allotments + increment + 18+ cap) plus 4 rule numbers used (200%, 130%, 60, $3,500). **0 are null** for FFY 2027.

### 4b. Plain-language rules

- A CalFresh household is the people who buy and cook food together. Spouses, and children under 22 living with their parents, must apply together.
- Most households qualify through MCE: gross income at or below 200% FPL, with no resource test. Even so, the benefit is computed from net income after deductions, and it can be small. Households of 1–2 with MCE get at least the minimum benefit.
- Households with someone 60 or older or disabled can be over the gross limit if they meet the net limit (100% FPL) and have resources under $3,500.
- From April 1, 2026, only citizens, U.S. nationals, Cuban/Haitian entrants, COFA citizens, and LPRs who meet the 5-year wait (or an exemption) are eligible. Refugees, asylees, most parolees, and others lost eligibility. Some can get the state-funded CFAP instead. In mixed-status households, eligible members (for example citizen children) can still get benefits. The income and resources of ineligible members still count.
- Work rules apply. ABAWDs aged 18–64 without a household member under 14 face a 3-month limit unless they work 80 hours a month. Students aged 18–49 attending at least half time need an exemption.

### 4c. How the draft models it

There are two criteria:

- `gross-income-limit`: `annualIncome ≤ 12 × (grossMonthly[min(size, 8)] + 948 × max(0, size − 8))`.
  - It has `uncertainIf: hasElderlyOrDisabledMember == "yes"`. A household with a member who is 60+ or disabled that fails the 200% gross test gets **maybe**, not unlikely, because it can still qualify through the net test (CF14).
  - If that question is skipped and the gross test fails, the result is **depends**.
  - The question `hasElderlyOrDisabledMember` is new in revision 2. It is marked sensitive because disability is health information.
- `eligible-member`: a sensitive yes/no question about whether at least one household member has an eligible status.

The `calfresh-mixed-status` caveat says the benefit size depends on who in the household is eligible, per the owner's decision 3. Allotments are not modelled. The `calfresh-work-student-rules` caveat covers CF18 and CF19, which are not modelled.

### 4d. NOT modelled, and why

- **Net income test and benefit amount.** These depend on deductions (20% earned income, standard, shelter/SUA, dependent care, medical, child support). There are too many inputs for a quick check. CDSS says: "the net monthly income limit amount should not be used to prescreen."
- **Net test and resource limit for elderly/disabled households over 200% FPL.** These are now shown as "maybe" through `uncertainIf`. The net test itself and the $3,500 resource limit are still not computed.
- **ABAWD time limit and student rules.** They need age, work hours, and enrollment questions. These are high-impact for single adults, so they are a product decision for v2.
- **CFAP (state-funded).** It is a separate program and could be added later.
- **Annual vs monthly income.** CalFresh tests current monthly income. The draft compares annualized income to 12 × the monthly limit, which misjudges households whose income varies by season.
- **MCE exclusions** (IPV disqualification, work-rule sanction). These are rare.

---

## 5. California LifeLine. Period: June 1, 2026 – May 31, 2027

| # | Size | Annual limit | Source | Verbatim (S18, page) | Verbatim (S19, Administrative Letter 11) |
|---|---|---|---|---|---|
| L1 | 1 | $24,600 | S18, S19 | `1 \| $24,600` | `1 $24,600` |
| L2 | 2 | $33,300 | S18, S19 | `2 \| $33,300` | `2 $33,300` |
| L3 | 3 | $42,100 | S18, S19 | `3 \| $42,100` | `3 $42,100` |
| L4 | 4 | $50,800 | S18, S19 | `4 \| $50,800` | `4 $50,800` |
| L5 | each additional | $8,700 | S18, S19 | `Each Additional Member \| $8,700` | `Each Additional Member $8,700` |

The two sources **agree**. S18 says "Effective June 1, 2026 to May 31, 2027". S19 says "California LifeLine Income Limits Effective June 1, 2026, to May 31, 2027" and explains that the limits "will increase by 2.7% CPI-U rate". Note that the S19 PDF's embedded title metadata reads "ULTS Household Income Limits 2024 (Admin Letter 4)", but its content is Administrative Letter 11 (April 15, 2026). This is cosmetic.

**Income definition (S18):** "A household's total annual gross income consists of money received BEFORE TAXES by everyone in your household (adults and children), from whatever source derived, whether taxable or non-taxable, ..."

**Program-based qualification (S18):** "You can qualify for California LifeLine if you or another person in your household is enrolled in any one of these qualifying public assistance programs". The listed programs are: Medicaid/Medi-Cal, LIHEAP, SSI, Federal Public Housing Assistance or Section 8, CalFresh/Food Stamps/SNAP, WIC, National School Lunch Program, TANF, CalWORKs, StanWORKs, Welfare-to-Work, GAIN, Tribal TANF, BIA General Assistance, Head Start Income Eligible (Tribal Only), Food Distribution Program on Indian Reservations, and Federal Veterans and Survivors Pension Benefit Program.

**Discount (not used):** "Specific Support Amount Effective January 1, 2024 - Up to $19.00". The effective date shown is 2024, so the amount may be stale.

Sources:

- **S18**: CPUC "California LifeLine Eligibility", https://www.cpuc.ca.gov/consumer-support/financial-assistance-savings-and-discounts/lifeline/california-lifeline-eligibility
- **S19**: CPUC Communications Division Administrative Letter 11, https://www.cpuc.ca.gov/-/media/cpuc-website/divisions/communications-division/documents/lifeline/notices-for-carriers/income-limits/2026-2027-california-lifeline-income-limits.pdf
- https://www.californialifeline.com/en/qualify returned HTTP 403 to an automated fetch.

**Count:** 5 numbers. **0 are null.**

**Modelled (revision 2).** One criterion: any LifeLine program in the `benefits` multi-select, OR income at or below the limit (sizes 1–4 from the table, then +$8,700 per extra person). Under v1.2 three-valued logic, a benefit recipient passes even when income is unknown.

How the S18 programs map to `benefits` options:

| S18 program | Option |
|---|---|
| Medicaid/Medi-Cal | `medi-cal` |
| LIHEAP | `liheap` |
| SSI | `ssi` |
| Federal Public Housing Assistance or Section 8 | `section8-public-housing` |
| CalFresh, Food Stamps or SNAP | `calfresh` |
| WIC | `wic` |
| National School Lunch Program (NSL) | `school-lunch` |
| TANF, CalWORKs, StanWORKs, Welfare-to-Work, GAIN, Tribal TANF | `calworks-tanf` (one option, labelled with all of them) |
| BIA General Assistance | `bia-general-assistance` |
| Head Start Income Eligible (Tribal Only) | `head-start-tribal` |
| Food Distribution Program on Indian Reservations | `fdpir` |
| Federal Veterans and Survivors Pension Benefit Program | `veterans-pension` |

**NOT modelled.**

- **The "school-lunch" option label.** It says "Free school lunch" because CARE's list says "NSLP – Free Lunch". LifeLine's list says only "National School Lunch Program (NSL)". Whether reduced-price lunch counts for LifeLine is open.
- **One discount per household; existing federal Lifeline.**
- **Home broadband pilot** (D.25-08-050).

---

## 6. CARE and FERA. Period: June 1, 2026 – May 31, 2027

Primary source **S20**: CPUC "CARE/FERA Program", https://www.cpuc.ca.gov/industries-and-topics/electrical-energy/electric-costs/care-fera-program. Both tables are labelled "Income limits effective June 1, 2026 – May 31, 2027." The page was fetched twice by different methods, and the figures matched.

| # | Size | CARE upper limit (verbatim) | FERA: CARE+1 (verbatim) | FERA upper limit, 250% FPL (verbatim) |
|---|---|---|---|---|
| E1 | 1-2 | `1-2 \| $43,280` | `$43,281` | `$54,100` |
| E2 | 3 | `3 \| $54,640` | `$54,641` | `$68,300` |
| E3 | 4 | `4 \| $66,000` | `$66,001` | `$82,500` |
| E4 | 5 | `5 \| $77,360` | `$77,361` | `$96,700` |
| E5 | 6 | `6 \| $88,720` | `$88,721` | `$110,900` |
| E6 | 7 | `7 \| $100,080` | `$100,081` | `$125,100` |
| E7 | 8 | `8 \| $111,440` | `$111,441` | `$139,300` |
| E8 | each additional | `Each Additional Person \| $11, 360` (the stray space is on the page) | `$11,360` | `$14,200` |

Other rules from S20:

- CARE discount: "30–35% discount on their electric bill" and "20% discount on their natural gas bill".
- FERA: "Families whose income slightly exceeds CARE limits may qualify for FERA, which applies an 18% discount on electricity bills." FERA is available from SCE, SDG&E, and PG&E only ("FERA is available to customers of: • Southern California Edison (SCE) • San Diego Gas and Electric Company (SDG&E) • Pacific Gas and Electric Company (PG&E)").
- Program-based CARE: "Customers may also qualify for CARE if enrolled in any of the following programs:" Medicaid/Medi-Cal; WIC; Healthy Families A & B; NSLP – Free Lunch; Food Stamps/SNAP; LIHEAP; Head Start Income Eligible (Tribal Only); SSI; BIA General Assistance; TANF or Tribal TANF.
- Utilities on the page: PG&E, Edison, SDG&E, SoCalGas, Alpine Nat'l Gas, Bear Valley Elect, PacifiCorp, Liberty Utilities, Southwest Gas, West Coast Gas.

**FERA household size (S21).** PG&E newsroom: "The Family Electric Rate Assistance (FERA) program is expanding to include one- and two-person households. Under previous eligibility guidelines, only households with three or more people were eligible." and "The California state legislature passed Senate Bill 1130 in 2024 revising the eligibility guidelines, which eliminated the three or more persons' requirement to qualify for FERA." The article's example "$52,875" is the **prior program year's** 1–2 person FERA limit. It is not a conflict, because the article is dated before June 2026.

**PG&E non-income rules (utility page, S22).** https://www.pge.com/en/account/billing-and-assistance/financial-assistance/care-eligibility.html. These were read only through a summarizing fetch, so they are **paraphrased and not quoted**:

- The bill must be in your name (sub-metered tenants are covered under the landlord's bill).
- You must live at the address.
- No one other than your spouse may claim you as a dependent.
- You cannot share a meter with another home.
- Usage must be no more than 6 × Tier 1.
- Recertification is every 2 years (4 years on a fixed income).

The reviewer should read these directly.

**Count:** 23 numbers (8 CARE, 8 FERA upper, 7 CARE+1, all identical to CARE + $1). **0 are null.**

**Modelled.**

- CARE: `participating-utility` (CPUC-regulated utility) and (any CARE program in `benefits` OR income at or below the limit). The CARE programs are `medi-cal` (also covers "Healthy Families A & B", now part of Medi-Cal), `wic`, `school-lunch`, `calfresh`, `liheap`, `head-start-tribal`, `ssi`, `bia-general-assistance`, and `calworks-tanf` (S20 lists "TANF or Tribal TANF"). The LifeLine-only options (`section8-public-housing`, `veterans-pension`, `fdpir`) do **not** count for CARE.
- FERA: `participating-utility` (PG&E/SCE/SDG&E) and CARE limit < income ≤ FERA limit.

**NOT modelled.**

- **Account-holder, dependent, shared-meter, and usage rules.** These are utility-level and low-yield for a quick check.
- **Municipal utilities** (LADWP, SMUD, IID, and others). They run their own programs, which are not CARE. They answer `municipal-or-other` and get "unlikely" for CARE/FERA. Discover could surface their programs.
- **Healthy Families A & B.** This is CARE-only. It is legacy, now part of Medi-Cal, so it is covered by the Medi-Cal item.

---

## 7. Generalization bands (bands/us-ca.json): rationale

**Income bands: 8 bands, all round numbers.** The bands are A $0–14,999, B $15,000–24,999, C $25,000–32,999, D $33,000–44,999, E $45,000–59,999, F $60,000–74,999, G $75,000–99,999, and H $100,000+.

- They are easy to choose in a quick check ("about how much did your household make last year?").
- They are not tied to any single program, so a yearly threshold change does not force a band change and does not leak a threshold-aligned bucket.
- Within the most common household sizes, each band mostly separates the decision points:
  - A–B: almost every program is "likely" or "maybe" at small sizes.
  - B contains LifeLine size 1 ($24,600).
  - C sits just under the CA credits' $32,900 cap. A $33,000 lower edge for D means C users pass the CA credits' income test and D users fail it, for TY2025 values. The cap is indexed yearly. If the TY2026 cap rises above $33,000, move this edge (see OPEN_QUESTIONS).
  - D contains CARE 1–2 ($43,280), CalFresh 2 ($43,296), and LifeLine 3 ($42,100).
  - E contains the EITC 1–2 child limits ($51,593 / $58,629), CARE/CalFresh 3, and LifeLine 4.
  - F contains EITC 3+ children and MFJ limits up to $70,244, and CARE 4 ($66,000).
  - G covers CARE/FERA sizes 5–7.
  - H is open-ended.
- The bands are wider at the top for privacy (fewer people there).

**`householdSizeCap: 6`** is a privacy choice: sizes 7 and above are shown as "6+". The logic reads the raw `householdSize` answer as a `cat` key `min(householdSize, lastRow)`, plus the per-person increment × `max(0, householdSize − lastRow)`. It never uses `householdSizeCapped`, so the cap does not change any verdict.

**`childAgeBands`.** These only shape the profile; no criterion reads them.

| Band | Matches |
|---|---|
| `0-5` | YCTC (under 6) |
| `6-13` | CalFresh ABAWD exemption (household member under 14) and the student exemption (child under 12 falls inside) |
| `14-18` | Federal EITC child under 19 |
| `19-23` | EITC full-time student under 24; CalFresh "children under 22 living with parents" falls inside |

Ages 24 and over are ignored, as the SPEC requires.

**Engine check.** `generalize` was run with income $41,250.70, household 7, and children aged 3, 15, 22, 30. It returned band D, size "6+", and child bands ["0-5","14-18","19-23"]. The age-30 child was dropped as expected.

---

## 8. Pack structure notes (moved out of the JSON in revision 2)

### 8a. Program periods and caveats (`programs[].period`, `programs[].caveats[]`)

| Program | `period` | Caveat keys | Basis |
|---|---|---|---|
| federal-eitc | Tax year 2026 | `eitc-refund-rule-proposed`, `eitc-estimate` | S1; S5/S6 (proposed rule); amount method (section 1c) |
| caleitc | Tax year 2025 | `ca-credit-2025-figures` | S8/S9 are TY2025; the TY2026 drafts could not be fetched (owner decision 1) |
| yctc | Tax year 2025 | `ca-credit-2025-figures` | same |
| calfresh | October 1, 2026 - September 30, 2027 | `calfresh-mixed-status`, `calfresh-work-student-rules` | S13; S15/S17 (mixed status, owner decision 3); S16 (work and student rules) |
| ca-lifeline | June 1, 2026 - May 31, 2027 | `lifeline-one-per-household` | S18: "Only one California LifeLine discounted phone is allowed per household" |
| care | June 1, 2026 - May 31, 2027 | `energy-account-rules` | S20; utility rules paraphrased from PG&E (S22) |
| fera | June 1, 2026 - May 31, 2027 | `energy-account-rules` | S20, S21 |

The caveat text is in `copy/{en,es,ko}.json` under `caveat.{key}`.

### 8b. Question definitions (formerly `draftNote` on questions)

| Question | Type | Sensitive | Definition used by the rules |
|---|---|---|---|
| `householdSize` | int 1–20 | no | People living together who share food or bills. Each program defines a household a little differently (tax family; CalFresh "buy and cook together"; CARE and LifeLine "people at the address"). A single answer is an approximation |
| `numQualifyingChildren` | int 0–20 | no | Children who meet the tax qualifying-child tests (lived with you more than half the year; under 19, under 24 if a full-time student, any age if permanently and totally disabled) **and have an SSN** (the federal rule). Only 0/1/2/3+ matters. CA (ITIN children) may be undercounted |
| `hasChildUnder6` | enum yes/no | no | A qualifying child younger than 6 on the last day of the tax year (YCTC, Y5). The app may derive it from the child ages |
| `hasEarnedIncome` | enum yes/no | no | Wages, salary, tips, or net self-employment income. Asked instead of testing income > 0 (SPEC section 1) |
| `ageGroup` | enum | no | Age at the end of the tax year. On a joint return, choose 25–64 if either spouse is 25–64, otherwise 18–24 if either is 18 or older |
| `housing` | enum | no | Profile only. No criterion reads it |
| `benefits` | multi | no | Programs anyone in the household is enrolled in. The union of the S18 (LifeLine) and S20 (CARE) lists. Mapping in sections 5 and 6 |
| `energyProvider` | enum | no | The utility on the gas or electric bill. `other-cpuc-regulated` = the smaller CPUC-regulated utilities listed on S20 |
| `hasElderlyOrDisabledMember` | enum yes/no | **yes** | Anyone in the household is 60+ or disabled (CF14). Read only by CalFresh `uncertainIf` |
| `filingStatus` | enum | **yes** | Expected filing status |
| `taxIdType` | enum | **yes** | For the filer and spouse, the more limited of their IDs. An SSN without the "not valid for employment" legend (or one valid with DHS authorization) counts as `ssn-valid-for-work` (F11, F12, C5, C6) |
| `investmentIncome` | int 0–10,000,000 | **yes** | Annual investment income (F7, C2) |
| `calfreshEligibleMember` | enum yes/no | **yes** | At least one household member is a U.S. citizen, U.S. national, Cuban/Haitian entrant, COFA citizen, or an LPR who has met the 5-year wait or an exemption (CF15) |

`questionOrder` is: householdSize, numQualifyingChildren, hasChildUnder6, income, hasEarnedIncome, ageGroup, housing, benefits, energyProvider, hasElderlyOrDisabledMember, filingStatus, taxIdType, investmentIncome, calfreshEligibleMember. The sensitive questions come last.

### 8c. Criterion notes (formerly `draftNote` on criteria)

- **federal-eitc / income-limit.** "Completed phaseout amount" means the AGI (or, if greater, earned income) at or above which no credit is allowed (S1). Hence the strict `<`. `annualIncome` stands in for both values.
- **federal-eitc / filing-status, caleitc / filing-status, yctc / filing-status.** Married filing separately fails without a qualifying child (a child under 6 for YCTC). With one, the criterion is `mixed` through `uncertainIf`, so the program is "Possible": the separated-spouse exception (F13, C8) depends on living apart for the last 6 months of the year or a legal separation, which the app does not ask. The why line uses `exception.{programId}.filing-status`.
- **caleitc / income-limit.** Earned income not more than $32,900 (C1) and AGI less than $32,901 (C1b). Both are expressed as `annualIncome ≤ 32,900`.
- **yctc / income-limit.** YCTC has had no earned-income requirement since TY2022. A filer with zero or negative earnings must have wages and total net loss each no more than $35,640 (Y6), which is not modelled.
- **yctc / investment-income.** YCTC requires that the filer be allowed CalEITC (or would be allowed it except for zero earnings), and CalEITC includes the investment income test (C2).
- **ca-lifeline / income-or-program, care / income-or-program.** Income-based OR program-based (S18, S20). Under three-valued logic the program branch passes even when income is unknown (case `benefit-without-income`).
- **fera / income-window.** Income above the CARE limit (the table's "CARE+1" column) and at or below the 250% FPL limit.

### 8d. Amount notes (formerly `draftAmountNote`)

| Program | Amount | Why |
|---|---|---|
| federal-eitc | Statutory formula (section 1c) | The IRS EIC Table for 2026 (in the Form 1040 instructions) is not yet published, and no official statement was found of how the table is built (for example, the midpoint of each $50 step). The formula can differ from the table by a few dollars. Near the end of the phaseout, and at zero income, it yields $0 with a "likely" verdict (cases `mfj-3-children-just-under-completed-phaseout` and `negative-income-treated-as-zero`). See OPEN_QUESTIONS |
| caleitc | none | Section 2c |
| yctc | Exact form arithmetic (section 3) | 0 mismatches over 6,001 incomes |
| calfresh | none | The benefit depends on net income after deductions and on who in the household is eligible (owner decision 3). `constants.calfresh.maxAllotment` is stored for possible "up to" copy only |
| ca-lifeline, care, fera | none | The discount depends on the provider or the bill |

### 8e. Verification run (revision 2)

| Check | Result |
|---|---|
| `node lint.mjs ../rulepacks/us-ca/draft/pack.json ../rulepacks/us-ca/draft/bands/us-ca.json` | `pack ok` |
| `cases.json` | 27 cases × 7 programs = 189 checks (verdict, estimatedAmount, dependsOn). Hand calculations and `verdicts()` agree on all 189 |
| Copy | `en`, `es`, `ko` each have the same 119 keys, covering every question label, option, variable, program, criterion and caveat. `es` and `ko` are drafts for review |
