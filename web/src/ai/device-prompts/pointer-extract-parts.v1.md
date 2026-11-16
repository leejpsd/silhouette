# pointer-extract device parts v1

Added to the system instruction of the bundled pointer-extract prompt when a paystub is read on the
device, in two parts. The cloud reading is a single pass with the shared prompt only.

Why: on Chrome's on-device model the single pass got the core fields nearly always right but often
returned an empty or wrong deductions list, and that failed the whole reading. Asking for the core and
the deductions separately lets a correct core be used on its own. The core part also spells out the
placeholder kinds of each field and that year-to-date gross is on the Gross Pay line, because a Regular
line's YTD amount was taken for it once and no deterministic check can tell the two apart.

## Core part

On this device the reading is done in two parts. In this part, answer only the fields in the schema: names, dates, pay frequency, gross pay, net pay, year-to-date gross, hours worked and hourly rate. Do not answer deductions.
- Names are word placeholders (W…), dates are date placeholders (D…), amounts are number placeholders (N…).
- The employer name is the company at the top of the paystub; the employee name is the person who is paid.
- Gross pay is the Current amount on the Gross Pay line; year-to-date gross is the YTD amount on the same Gross Pay line, never a YTD amount of another line.

## Deductions part

On this device the reading is done in two parts. In this part, answer only the deductions: for each deduction or tax line, the number placeholder of its Current amount (never its YTD amount) and its kind. Do not include gross pay, net pay or earnings lines. Use an empty list when there are no deductions.
