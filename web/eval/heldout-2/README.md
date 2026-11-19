# Held-out Form W-2 set 2

12 synthetic US Form W-2 documents (tax year 2025) in 6 layouts, 2 documents per layout, each with an answer key.

- Every employer, employee, address, EIN, control number, state ID, payroll provider and amount is invented. Social security numbers are masked (`XXX-XX-1234`). No real person or company is represented.
- The documents were written independently of the system they test, without access to its prompts, word lists, rules, code, or the documents it was tuned or tested on.
- Each `.txt` file is the text a PDF text extractor would return for a text-based PDF of the form: plain lines, columns made of spaces.
- The forms are internally consistent: box 3 never exceeds the 2025 social security wage base (176,100.00), box 4 is 6.2% of box 3, box 6 is 1.45% of box 5 plus 0.9% Additional Medicare Tax above 200,000.00, and box 1 / box 5 / box 16 follow from gross pay, pre-tax deductions and the state's rules. Six of the twelve have box 3 capped at the wage base.

## Answer keys

Each `<name>.txt` has a sibling `<name>.gold.json` with exactly these keys:

| Key | Meaning |
|---|---|
| `employerName` | Employer name exactly as printed (box c) |
| `employeeName` | Employee name exactly as printed in box e |
| `taxYear` | Tax year, as a number |
| `wages` | Box 1, wages, tips, other compensation |
| `federalIncomeTaxWithheld` | Box 2 |
| `socialSecurityWages` | Box 3 |
| `medicareWages` | Box 5 |
| `stateWages` | Box 16; when two state lines are printed, the first line's box 16 |

Amounts are numbers, not strings. Every value in an answer key appears in its document as printed (with or without thousands separators, as the document prints it).

## Layouts

| Files | Layout | What makes it different |
|---|---|---|
| `hv-01-1`, `hv-01-2` | Official boxed form | Box labels in rows with values on the line below; box 12 codes with the vertical "Code" letters; box 13 checkboxes; box 14 "Other" lines. In `hv-01-2` (Copy C) the label grid is empty and the filled-in values follow as a separate block in field order. Amounts printed without thousands separators. |
| `hv-02-1`, `hv-02-2` | Four copies on one page | Copy B, Copy C and two Copy 2 printed two by two, so every value appears four times and left and right copies share each line. `hv-02-1` puts values under labels; `hv-02-2` puts them beside the labels. Includes local wages (Ohio) and New Jersey box 14 items. |
| `hv-03-1`, `hv-03-2` | Employer statement with reconciliation | A year-end statement explaining how boxes 1, 3, 5 and 16 were figured from gross pay (401(k), Section 125, HSA, dependent care FSA, group-term life, wage base), next to a compact W-2. State rules make box 16 differ from box 1 (Pennsylvania, California). |
| `hv-04-1`, `hv-04-2` | Payroll-provider summary | Employee and employer address blocks first, then the boxes as two side-by-side "Box \| Description \| Amount" tables, followed by a year-to-date earnings summary that is not part of the W-2. |
| `hv-05-1`, `hv-05-2` | Reissued statement, two states | Marked "REISSUED STATEMENT" with reissue and original dates; boxes 15 to 17 carry two state lines for an employee who moved during the year. |
| `hv-06-1`, `hv-06-2` | Hard to read by machine | `hv-06-1`: the whole form on three very long lines with each value printed before its label. `hv-06-2`: labels wrapped over two lines with the value right-aligned between the halves, close to the next column's label. |
