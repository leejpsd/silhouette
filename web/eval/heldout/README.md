# Held-out pay document set

30 synthetic US pay documents with answer keys:

- 24 paystubs in 12 layouts (`hp-01-1.txt` ... `hp-12-2.txt`, two per layout)
- 6 Form W-2s for tax year 2025 in 3 layouts (`hw-01-1.txt` ... `hw-03-2.txt`, two per layout)

Each `.txt` holds the text a PDF text extractor would return for a text-based PDF: plain lines, with columns made of spaces. Next to each one, `<name>.gold.json` holds its answer key.

Every person, employer, address, phone number, account number, ID and amount is invented. SSNs are masked. No real company, payroll provider or person is named. Pay dates fall in 2026.

The documents were written independently of the system they test, without access to its prompts, word lists, rules or the documents it was tuned on. The layouts follow public descriptions of US paystubs and of Form W-2.

## Answer keys

### Paystubs

| Key | Meaning |
|---|---|
| `employerName`, `employeeName` | Exactly as printed: the employer name at the top, and the employee's full name (some layouts print `LAST, FIRST M`) |
| `payFrequency` | `weekly`, `biweekly`, `semimonthly` or `monthly`, printed in some wording on every stub |
| `payDate`, `periodStart`, `periodEnd` | The date strings exactly as printed |
| `grossPay`, `netPay` | This period's gross and net pay |
| `ytdGross` | Year-to-date gross; absent when the stub prints no year-to-date figures |
| `hoursWorked`, `hourlyRate` | This period's regular hours and regular rate (not overtime, PTO or holiday); absent for salaried employees |
| `deductions` | One `{ "amount", "kind" }` per employee deduction withheld this period |

`kind` is one of `federal_tax`, `state_tax`, `social_security`, `medicare`, `retirement` (401(k), 403(b), SIMPLE IRA, Roth 401(k)), `health` (medical, dental, vision) or `other` (state disability or paid-leave premiums, local and city taxes, FSA, HSA, transit, garnishments, child support, union dues, other after-tax items). Employer contributions and employer-paid benefits are never listed.

Arithmetic holds to the cent: gross is the sum of this period's earnings lines, and net is gross minus the listed deductions. Where year to date is printed, the year-to-date earnings lines sum to `ytdGross`. Every gold value appears in the text as printed. Amounts may appear with or without thousands separators and with a `$` or `-` sign.

### Form W-2

`employerName`, `employeeName` (as printed), `taxYear`, `wages` (box 1), `federalIncomeTaxWithheld` (box 2), `socialSecurityWages` (box 3), `medicareWages` (box 5), `stateWages` (box 16).

## Layouts

| Layout | Files | What makes it different |
|---|---|---|
| 1 | hp-01-* | Bi-weekly hourly; header in two columns; columns rate / hours / this period / year to date; separate Statutory and Other deduction blocks with minus signs and `*` pre-tax markers; direct deposit split ending in "Net Check $0.00"; employer 401K match and leave balances under "Other Benefits and Information" |
| 2 | hp-02-* | Weekly hourly, small-business stub in Texas with no state tax; M/D/YY dates; Hours-Rate-Current-YTD columns; "Total Gross Pay"; a paper check underneath with the amount in words |
| 3 | hp-03-* | Semi-monthly salaried in New York; ISO dates (YYYY-MM-DD); YTD column printed before Current; NYC tax, NY SDI and Paid Family Leave; a Roth 401(k) after-tax line; "Employer-Paid Benefits" block |
| 4 | hp-04-* | No year to date. Restaurant worker in Washington paid every two weeks; dates like "Oct 16, 2026"; credit card tips and tip pool through payroll; "GROSS WAGES" and "NET AMOUNT"; employer and employee address blocks side by side |
| 5 | hp-05-* | Monthly salaried in Massachusetts; dates like "30-Sep-2026"; every label on its own line with its value below it; "Gross" and "Net Check"; HSA and 403(b); employer-paid HSA, match and medical |
| 6 | hp-06-* | No year to date. Semi-monthly hourly ("Paid twice monthly"); night shift differential, holiday, overtime, PTO; "Total Gross" and "Take-Home Pay"; union dues and a wage garnishment; split deposit |
| 7 | hp-07-* | Bi-weekly hourly; employee name printed `LAST, FIRST M`; earnings and deductions side by side in two columns joined by `|`; deduction labels wrapped onto a second line; all caps |
| 8 | hp-08-* | Monthly salaried in Pennsylvania; M/D/YYYY dates; one Current / Year-To-Date table with earnings, pre-tax, taxes and after-tax sections; a retention bonus; local EIT, PA SUI, Local Services Tax; employer contributions; taxable-wage summary line |
| 9 | hp-09-* | No year to date. Weekly hourly construction check stub in Ohio; amounts without thousands separators; "TOTAL PAY" and "CHECK AMOUNT"; city tax, child support, tool loan |
| 10 | hp-10-* | Semi-monthly salaried in California; company and employee blocks side by side; columns Current Hrs / Current Amt / YTD Hrs / YTD Amt; salary split into salary and PTO hours; HSA, dependent care FSA, health FSA, CA SDI, ESPP; employer contributions |
| 11 | hp-11-* | Bi-weekly hourly hospital staff in Oregon; MM-DD-YYYY dates; rates to four decimals; several differentials, on-call and sick pay; "(pre-tax)" / "(after-tax)" tags; Oregon transit tax and paid leave; employer-paid benefits; split deposit |
| 12 | hp-12-* | Monthly salaried small studio in Colorado; dates like "October 30, 2026"; plain-language headings ("What you earned", "What was taken out"); "Total Earnings" and "NET PAY DEPOSITED" with the amount on the next line; SIMPLE IRA label wrapped |
| W-2 1 | hw-01-* | Text extracted from the familiar boxed Form W-2 (Copy B): box numbers and labels in rows, values on the line below, amounts without separators; one case above the 2025 Social Security wage base, so box 3 is less than box 5 |
| W-2 2 | hw-02-* | Employer-printed "Wage and Tax Statement" summary that shows how box 1, boxes 3 and 5, and box 16 were derived from gross pay, then lists the box amounts; one Pennsylvania case where box 16 is higher than box 1 |
| W-2 3 | hw-03-* | Several copies on one page (Copy B, Copy C and two Copy 2), printed two side by side so that every value appears several times on the same lines |
