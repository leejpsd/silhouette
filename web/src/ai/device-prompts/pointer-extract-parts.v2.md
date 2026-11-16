# pointer-extract device parts v2

Added to the system instruction of the bundled pointer-extract prompt when a paystub is read on the
device, in parts. The cloud reading is a single pass with the shared prompt only.

Why: with v1 the device read the core right except year-to-date gross, which it twice took from the
Regular line instead of the gross line, and once let an employee name run into the employer's last
word. v2 adds one short worked example (made-up ids and labels that match no bundled or evaluation
document) where both gross amounts come from the gross line, and one sentence on where a name ends.
The gross part is asked only when the core's only problems are with gross pay or year to date.

## Core part

On this device the reading is done in two parts. In this part, answer only the fields in the schema: names, dates, pay frequency, gross pay, net pay, year-to-date gross, hours worked and hourly rate. Do not answer deductions.
- Names are word placeholders (W…), dates are date placeholders (D…), amounts are number placeholders (N…).
- A name ends where its label or its line ends: never add a word from another name or another line.
- Gross pay and year-to-date gross both come from the gross line (Gross Pay, Gross Earnings, Total Gross), never from an earnings line such as Regular.
Example with made-up ids:
Earnings      Current   YTD
Base Wage     ⟦N71⟧     ⟦N72⟧
Total Gross   ⟦N73⟧     ⟦N74⟧
Answer: "grossPay": "N73", "ytdGross": "N74". ⟦N72⟧ is the year to date of Base Wage only.

## Deductions part

On this device the reading is done in two parts. In this part, answer only the deductions: for each deduction or tax line, the number placeholder of its Current amount (never its YTD amount) and its kind. Do not include gross pay, net pay or earnings lines. Use an empty list when there are no deductions.

## Gross part

In this part, answer only gross pay and year-to-date gross. Gross pay is the Current amount on the gross line (Gross Pay, Gross Earnings, Total Gross); year-to-date gross is the year-to-date amount on that same line, or the gross amount of a year-to-date section. Never take an amount from an earnings line such as Regular or Overtime.
Example with made-up ids:
Earnings      Current   YTD
Base Wage     ⟦N71⟧     ⟦N72⟧
Total Gross   ⟦N73⟧     ⟦N74⟧
Answer: "grossPay": "N73", "ytdGross": "N74".
