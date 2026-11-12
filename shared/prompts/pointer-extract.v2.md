# pointer-extract v2

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
- Answer every field. Use null when the field is not in the document.
Return JSON only.

## User content

```
Document type: {docType}
Document:
{skeleton}
```

## Notes for implementers

- Send one page per request. Keep the skeleton under the on-device input limit of the platform.
- Use structured output with the model schema derived from the pointer schema (every property required, `null` allowed). The response is validated and rehydrated by deterministic code (`skeleton/SPEC.md` section 5); `null` means "not in the document".
- The same prompt is used on device and in the cloud.
