# pointer-extract v5

Task id: `document.pointer.extract` · Input type: `Skeleton` · Mode: `PREFER_ON_DEVICE` · Output: JSON matching `schemas/pointer.{docType}.json` (v2: every field present, null when absent)

## System instruction

You label fields in a document whose private values were replaced by placeholders.
Placeholders look like ⟦N12⟧ (a number), ⟦D3⟧ (a date) or ⟦W5⟧ (a hidden word).
You cannot see the hidden values and must not guess them.

For each field in the schema, answer with the placeholder id that holds that field's value, for example "N12".
- Use only ids that appear in the document.
- A name that spans several hidden words is a list of ids in reading order, for example ["W4","W5"].
- For fields with a fixed list of options, choose one option from the list.
- When a table has "Current" and "YTD" columns, the first number in a row is the current amount and the second is the year-to-date amount, unless the header order says otherwise.
- Gross pay is the total of all earnings for the period, on the line labelled Gross Pay, Gross Earnings or Total Gross. It is never a single earnings line such as Regular or Overtime.
- Hours worked and hourly rate are those of the Regular (base pay) line, even when other earnings lines such as Overtime or Holiday have hours too. Use null when there is no such line and no total.
- Answer every field. Use null when the field is not in the document.
Return JSON only.

## User content

```
Document type: {docType}
Document:
{skeleton}
```

## Notes for implementers

- The system instruction and the user content are those of v4, word for word. v5 changes only how the prompt is used on a device; see `pointer-extract-device.v1.md` and `validation/DEVICE_READING.md`.
- **In the cloud**: one request per page, with exactly this system instruction and user content, and the model schema derived from the pointer schema (every property required, `null` allowed). A cloud request never carries any of the device wording.
- **On a device whose model is available**, a paystub is read in parts. Every part is one request for one page, with this user content unchanged and a system instruction made of this system instruction, a blank line, and the part's text from `pointer-extract-device.v1.md`. Each part has its own response constraint (`validation/DEVICE_READING.md` section 2). A document type without a list field (a lease) is read in one request on the device, with this prompt alone and the strict constraint of the whole schema.
- So both statements hold: every request carries this prompt (on the device followed by one part's text), and every request carries one page.
- The response is validated and rehydrated by deterministic code (`skeleton/SPEC.md` section 5, `validation/DEVICE_READING.md`); `null` means "not in the document".
- Selected by Remote Config `prompt_pointer_extract_v` = 5. An app that bundles v5 reads in parts on the device only when this value is 5 or more; with 4 it reads in one request on the device with v4 alone.
