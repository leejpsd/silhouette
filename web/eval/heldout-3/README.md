# Held-out paystub set 3

24 synthetic US paystubs with answer keys, in 12 layouts (`hq-01-1.txt` ... `hq-12-2.txt`, two per layout). This set is paystubs only: it has no Form W-2.

Each `.txt` holds the text a PDF text extractor would return for a text-based PDF: plain lines, with columns made of spaces. The documents run from about 1,550 to 3,500 characters. Next to each one, `<name>.gold.json` holds its answer key.

Every person, employer, address, phone number, account number, ID and amount is invented. Account numbers and SSNs are masked. No real company, payroll provider or person is named. Pay dates fall in September to November 2026. Most employees live in California; the others live in Illinois, Texas and New York.

The documents were written independently, without access to the system's prompts, word lists, rules, code or the documents it was tuned on. The layouts follow public descriptions of US paystubs and payroll printouts.

## Answer keys

### Paystubs

| Key | Meaning |
|---|---|
| `employerName`, `employeeName` | Exactly as printed: the employer name at the top, and the employee's full name (some layouts print `LAST, FIRST M`, one prints names in capitals) |
| `payFrequency` | `weekly`, `biweekly`, `semimonthly` or `monthly`, printed in some wording on every stub |
| `payDate`, `periodStart`, `periodEnd` | The date strings exactly as printed |
| `grossPay`, `netPay` | This period's gross and net pay |
| `ytdGross` | Year-to-date gross; absent when the stub prints no year-to-date figures |
| `hoursWorked`, `hourlyRate` | This period's regular hours and regular rate (not overtime, PTO, sick, holiday or shift differential); absent for salaried employees |
| `deductions` | One `{ "amount", "kind" }` per employee deduction withheld this period |

`kind` is one of `federal_tax`, `state_tax`, `social_security`, `medicare`, `retirement` (401(k), 403(b), Roth 401(k)), `health` (medical, dental, vision) or `other` (state disability or paid-leave premiums, local and city taxes, FSA, HSA, transit, garnishments, child support, union dues, other after-tax items). Employer contributions and employer-paid benefits are never listed.

Arithmetic holds to the cent: gross is the sum of this period's earnings lines, and net is gross minus the listed deductions. Where year to date is printed, the year-to-date earnings lines sum to `ytdGross`, and year to date fits the pay frequency and the pay date. Every gold value appears in the text as printed. Amounts may appear with or without thousands separators and with a `$` or `-` sign.

## Layouts

| Layout | Files | What makes it different |
|---|---|---|
| 1 | hq-01-* | Bi-weekly hourly warehouse and cold storage in California; employer block top-left, statement details on the right; MM/DD/YYYY; Rate / Hours / This Period / Year To Date; `*` pre-tax markers with a footnote; "Gross Earnings" and "Net Pay"; overtime, shift differential or premium, a safety award; employer 401(k) match and medical premium under "Employer Contributions"; direct-deposit advice ("NON-NEGOTIABLE") below a cut line |
| 2 | hq-02-* | Semi-monthly salaried in California; employer block centred; employee printed `LAST, FIRST M`; dates like "Oct 15, 2026" (one pay date equals the period end, the other is the Friday before it); payroll-code labels (Fed OASDI/EE, MED Pre-Tax); "Total Pay" and "Take Home"; up to 10 withholdings including a Roth 401(k) after-tax line; spot bonus or wellness stipend; employer-paid benefits, time off and messages |
| 3 | hq-03-* | No year to date. Weekly hourly restaurant workers in California; ISO dates (YYYY-MM-DD); a daily time card with meal breaks; credit-card tips and tip pool paid through payroll; "Gross Earnings" and "Amount Deposited"; a tip-detail block whose lines are not deductions |
| 4 | hq-04-* | Monthly salaried nonprofit staff in Illinois; dates like "30-Sep-26" and "1-Oct-26"; name printed `First M. Last`; a summary bar (Gross Pay / Pre-Tax / Taxes / Post-Tax / Net Pay, current and YTD) above separate Pre-Tax, Taxes and Post-Tax sections; 403(b); a retro salary adjustment; employer-paid benefits |
| 5 | hq-05-* | Bi-weekly hourly hospital staff in California; centred header, labels in capitals; `LAST, FIRST M`; MM/DD/YYYY; holiday worked or not worked, PTO, overtime and shift differential with YTD hours; taxes and deductions printed side by side; union dues; "TOTAL EARNINGS"; a detachable direct-deposit advice, split to savings in one |
| 6 | hq-06-* | Weekly construction stubs in California, all capitals, centred; dates like "2-Oct-26"; amounts without thousands separators; "TOTAL PAY" and "NET PAY"; an overtime rate to three decimals, show-up pay; union working dues and (in one) an earnings withholding order; employer fringe contributions to trust funds that are not deductions |
| 7 | hq-07-* | No year to date. Weekly hourly small-business stubs in Texas; dates like "Sep 18, 2026"; dotted leaders; hours by day; "Gross Wages" and "Take Home Pay"; only 3 or 4 deductions (no state tax); a paper check below a cut line with the amount in words |
| 8 | hq-08-* | Semi-monthly hourly in California paid in arrears; MM/DD/YY; `LAST, FIRST M`; earnings and deductions side by side joined by `|`; sick pay or vacation, overtime; dependent care FSA and Roth 401(k); "Gross"; net pay printed both in the header and at the bottom |
| 9 | hq-09-* | Monthly salaried in California; centred; MM/DD/YYYY; a boxed summary (Total Gross / Pre-Tax Ded. / Taxes / Net Pay); 10 deductions with `[pre-tax]` markers; HSA; an annual bonus or a vehicle allowance; company contributions, tax information and leave tables |
| 10 | hq-10-* | Bi-weekly salaried in New York City; dates like "October 9, 2026"; Pre-Tax Deductions, Taxes and Post-Tax Deductions sections each with its own "Total"; NY state tax, New York City tax, NY SDI and NY Paid Family Leave; commuter transit; taxable-wage lines; employer contributions |
| 11 | hq-11-* | No year to date. Semi-monthly hourly in California; MM-DD-YYYY; dotted header labels; a daily-hours grid; earnings as "hrs @ rate"; withholdings with minus signs; a child support order or an earnings withholding order; "Total Gross", "NET" and a split "AMOUNT DEPOSITED"; employer-paid premiums |
| 12 | hq-12-* | Monthly salary plus commission in California; centred; ISO dates; every label on its own line with its value indented below and year to date in parentheses; "Total Earnings" and "NET PAY"; plain-language headings; the commission calculation; employer-paid medical and match |
