# Validation and annualization specification (v1, section 9 since contract v1.34)

Validation checks confirmed paystub values for internal consistency. Annualization turns them into the exact `annualIncome` that the verdict engine uses (`rulepacks/SPEC.md` section 4). Both are deterministic, so Web, Android and iOS must produce identical results.

- There is no clock, no "today" and no time zone.
- Money is held as integer cents.
- Every ratio is computed with exact integer arithmetic (arbitrary-precision integers where products can exceed 2^53).

Reference implementation: `reference/validate.mjs`. Fixture: `fixtures/conformance/validate.json`.

## 1. Input

- **Paystubs.** A list of confirmed paystubs. Each paystub has these optional fields:

  | Field | Type |
  |---|---|
  | `grossPay`, `netPay`, `ytdGross`, `hourlyRate` | non-negative numbers (money) |
  | `hoursWorked` | non-negative number |
  | `payFrequency` | one of `weekly`, `biweekly`, `semimonthly`, `monthly` |
  | `payDate`, `periodStart`, `periodEnd` | date text, unparsed |
  | `deductions` | list of `{ amount, kind? }` |

  The date text is exactly as rehydrated (`skeleton/SPEC.md` section 5) or as typed by the user.
- **Jurisdiction.** The jurisdiction of the active rule pack.

A money value or `hoursWorked` that is negative or not a finite number, or an unknown `payFrequency`, raises `ValidationInputError`. Messages never contain the value.

A field whose value is `null` is absent, exactly as if the key were missing; this holds for every field, including `deductions`. A deduction whose `amount` is `null` is an input error.

A platform may raise `ValidationInputError` for a money value of 10^15 or more. The fixtures stay below that.

## 2. Money

1. `cents(x) = round(x × 100)`, where `x × 100` is computed in IEEE-754 double precision and rounded half away from zero. Because inputs are non-negative, this is half up.
   - `1.005` becomes 100 cents, because `1.005 × 100 = 100.49999…` in double precision.
   - `100.125` becomes 10013 cents.
2. Hours are held in hundredths: `round(hoursWorked × 100)`.
3. `roundRatio(num, den)` for non-negative integers is `floor((2·num + den) / (2·den))`, which rounds to the nearest integer with halves going up.

## 3. Dates

Date text is trimmed. A **month-name date** (`skeleton/SPEC.md` section 2: month first or day first, month names in English or Spanish, ASCII case-insensitive) is read directly as day, month and four-digit year, whatever the jurisdiction; if its day does not exist in that month the date is not parsed. Otherwise the text must match `^([0-9]{1,4})[/.\-]([0-9]{1,2})[/.\-]([0-9]{1,4})$`, with components `a`, `b`, `c`.

1. **Order.**
   - If `a` has four digits, the order is year-month-day, in every jurisdiction. Rehydrated N-triples such as `2026-10-25` and `2026-1-5` always take this form.
   - Otherwise the jurisdiction's order applies:

     | Jurisdiction | Order |
     |---|---|
     | `us-ca` | month-day-year |
     | `zz-test` | month-day-year |
     | `kr` | year-month-day |

     A jurisdiction that is not in the table parses only year-first dates.
2. **Lengths.** The month and day components have one or two digits.
3. **Year.**
   - A four-digit year must be from 1900 to 2099.
   - A two-digit year `yy` means `2000 + yy`.
   - Any other length does not parse.
4. **Validity.** The month is 1–12. The day is from 1 to the number of days in that month, using the proleptic Gregorian calendar: a year is a leap year when divisible by 4, except when divisible by 100 but not by 400.

A date that breaks any rule is *not parsed*. Day differences use the civil day number: days since 1970-01-01.

## 4. Pay frequency

| Frequency | Periods per year P | Period length, inclusive days |
|---|---|---|
| `weekly` | 52 | 7 |
| `biweekly` | 26 | 14 |
| `semimonthly` | 24 | 13–16 |
| `monthly` | 12 | 28–31 |

When `payFrequency` is absent and both period dates parse, the frequency is inferred from the length `end − start + 1`:

| Length | Inferred frequency |
|---|---|
| 7 | `weekly` |
| 14 | `biweekly` |
| 13, 15 or 16 | `semimonthly` |
| 28–31 | `monthly` |
| any other | unknown |

## 5. Checks

Each paystub gets every check, in this order, with status `ok`, `warn` or `skipped`. A check is `skipped` when its inputs are missing. A `warn` never blocks the user.

| Id | Needs | `ok` when |
|---|---|---|
| `net-sum` | gross, net | `abs(gross − Σ deductions − net) × 100 ≤ gross`, in cents. No deductions means Σ = 0 |
| `rate-hours` | rate, hours, gross | `(rateCents × hoursHundredths − grossCents × 100) × 100 ≤ grossCents × 100`: rate × hours is not more than 1 % above gross. It may be less: overtime and other earnings add to the regular pay (since v1.25; before, any difference over 1 % was a warning, which flagged every paystub with overtime) |
| `period-length` | both period dates | see below |
| `pay-date` | pay date, period end | `abs(payDay − periodEndDay) ≤ 31` |
| `ytd-gross` | YTD, gross | `ytd ≥ gross` |
| `ytd-periods` | YTD, gross > 0, frequency (given or inferred), reference date | `n × gross ≤ 2 × ytd ≤ 3 × n × gross` |
| `dates-parsed` | at least one date given | every given date parses |

`period-length`:

- If the length is below 1, the status is `warn`.
- If the frequency is inferred, the status is `ok`.
- If there is no frequency at all, the status is `warn`.
- Otherwise the status is `ok` when the length is within the frequency's range.

`ytd-periods`:

- The reference date is the period end if it parses, else the pay date.
- `n = ceil(P × E / 12)`, where E is the number of elapsed months (section 7).

## 6. Several paystubs

1. **Duplicates.** Two paystubs are duplicates when they have the same parsed period start, period end and pay date (an unparsed date compares as "absent") and the same gross cents. The first is kept, and the indexes of the others are reported in `duplicates`.
2. **Reference paystub.** Each remaining paystub has a reference date: its period end, else its pay date. The reference paystub has the latest reference date; on a tie the later one in the input wins. A paystub with neither date is never the reference.

## 7. Annualization

The methods are tried in this order.

**a. Year-to-date.**

- Applies when the reference paystub has `ytd > 0` and at least one month has elapsed at its reference date `(y, m, d)`.
- With `D` = days in month `m`, the elapsed months are `E = ((m − 1)·D + d) / D`, an exact fraction. "At least one month" means `(m − 1)·D + d ≥ D`.
- `annualIncome = roundRatio(ytdCents × 12 × D, 100 × ((m − 1)·D + d))`.

**b. Average gross per period.**

- Applies otherwise, using only paystubs that have a gross.
- **Frequency F.** F is the frequency (given or inferred) of the latest-dated paystub that has a gross (ties: later input). If that paystub has none, F is the frequency of the first paystub that has both a gross and a frequency. If no paystub has one, the result is `no-frequency`.
- **Paystubs used.** The paystubs with a gross whose frequency is F or unknown.
- `annualIncome = roundRatio(Σ grossCents × P(F), 100 × count)`.
- `averageGrossCents = roundRatio(Σ grossCents, count)`.

If no remaining paystub has a gross, the result is `no-gross`. This includes an empty list.

**Result.**

| Field | Content |
|---|---|
| `checks` | per input paystub, in input order |
| `annualization` | `{ annualIncome, method, basis }` or `null` |
| `failure` | `no-gross`, `no-frequency` or `null` |
| `duplicates` | indexes of dropped paystubs |

`annualIncome` is in whole currency units. `method` is `ytd` or `average`. `basis` holds the numbers for the "how this was worked out" line:

- `ytd`: `ytdCents`, `referenceDate` (ISO), `elapsedMonths {numerator, denominator}`, `stubsUsed`;
- `average`: `averageGrossCents`, `periodsPerYear`, `frequency`, `stubsUsed`.

The app shows the basis, and the user confirms it before the value becomes `annualIncome`.

## 9. Form W-2

A Form W-2 (`schemas/pointer.w2.json`) states a year's wages: box 1, `wages`, is the earned income that employer paid in `taxYear`. Nothing is projected. Reference: `reference/validate.mjs` `validateW2s`; cases: `fixtures/conformance/validate.json` `w2Cases`.

**Input.** One object per form: `wages`, `federalIncomeTaxWithheld`, `socialSecurityWages`, `medicareWages`, `stateWages` as money (section 2: finite, non-negative, else `ValidationInputError`), `taxYear` an integer or null.

**Checks**, per form, in this order:

| Id | Status |
|---|---|
| `w2-medicare-wages` | `skipped` without wages or Medicare wages; `ok` when Medicare wages (box 5) ≥ wages (box 1), since box 5 adds back pre-tax deductions; else `warn` |
| `w2-year` | `skipped` without a year; `ok` for 2000 to 2100; else `warn` |

**Annualization.** The forms with wages above 0 count. Of those, the latest `taxYear` is the year; the forms of that year and the forms without a year are summed (one form per employer). `annualIncome = roundRatio(Σ wagesCents, 100)`, `method: "w2"`, `basis: { wagesCents, taxYear, formsUsed }`. No form with wages: `failure: "no-wages"`, `annualization: null`.

The app shows the basis with the tax year: a W-2 is a past year's income, and a credit for a later year counts that year's income.

## 8. Known limits

- No currency conversion.
- Year-to-date figures from different employers are not summed: the latest paystub is annualized, and the user can type a total.
- Bonuses and irregular pay are not separated from regular gross.
- Dates spelled with month names are not parsed.
- No jurisdiction uses day-month-year yet, although implementations support that order.
