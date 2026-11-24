# pointer-extract-device v1

Task id: `document.pointer.extract` · Input type: `Skeleton` · Mode: each part `ONLY_ON_DEVICE`, inside the `PREFER_ON_DEVICE` task, once the device model is available · Output: JSON matching the part's response constraint (`validation/DEVICE_READING.md` section 2)

Used with `pointer-extract.v5.md` (or a later version that names this file) when a paystub is read on a device. Each part below is one request. Its system instruction is the pointer-extract system instruction, a blank line, then the part's text exactly as written here. Its user content is the pointer-extract user content, unchanged. When to ask each part is in `validation/DEVICE_READING.md` section 3.

The worked example uses made-up ids (N71 to N74) and a made-up label ("Base Wage") that match no bundled or evaluation document. The response constraint allows only the ids of the document being read, so the model cannot copy them.

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

## Gross part

In this part, answer only gross pay and year-to-date gross. Gross pay is the Current amount on the gross line (Gross Pay, Gross Earnings, Total Gross); year-to-date gross is the year-to-date amount on that same line, or the gross amount of a year-to-date section. Never take an amount from an earnings line such as Regular or Overtime.
Example with made-up ids:
Earnings      Current   YTD
Base Wage     ⟦N71⟧     ⟦N72⟧
Total Gross   ⟦N73⟧     ⟦N74⟧
Answer: "grossPay": "N73", "ytdGross": "N74".

## Deductions part

On this device the reading is done in two parts. In this part, answer only the deductions: for each deduction or tax line, the number placeholder of its Current amount (never its YTD amount) and its kind. Do not include gross pay, net pay or earnings lines. Use an empty list when there are no deductions.

## Deductions part, asked again

The text of the deductions part, a line break, then:

Your previous list did not add up: net pay was not gross pay minus the deductions you listed. List every deduction or tax line between gross pay and net pay, including the last one.

## Notes for implementers

- The texts are value-free: they never contain a value from the document, and the sentence of the deductions asked again says only that the list did not add up.
- The device wording is never sent to the cloud. The cloud retry after a failed on-device attempt is one request with `pointer-extract.v5.md` alone.
- Where a platform's on-device model takes the system instruction separately (Chrome's Prompt API `initialPrompts`, a session instruction on Android or iOS), the part's system instruction goes there and the user content is the prompt.
- The parts' texts are exact. A platform may not shorten or translate them: the checks of `validation/DEVICE_READING.md` were measured with this wording.
- When a part does not fit the device model's window with its constraint written into the input, the line `Answer with JSON that matches this schema:` and the part's model schema are appended after the user content (`validation/DEVICE_READING.md` section 2, "A part that does not fit the device model's window"). They are outside the part texts above, which stay exact.
