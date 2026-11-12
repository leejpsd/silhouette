# Skeletonizer specification (v1.1)

The Skeletonizer turns `Raw` document text into a `Skeleton`: the labels and layout stay, every value goes.
It is deterministic and must produce byte-identical output on Web, Android and iOS.

## 1. Input normalization

1. Normalize to Unicode NFC.
2. Convert `\r\n` and `\r` to `\n`.
3. Delete every `⟦` (U+27E6) and `⟧` (U+27E7) from the input.
4. Nothing else changes. Whitespace and line breaks are preserved exactly.

## 2. Tokenization

Scan the text left to right with this ordered alternation (first match wins at each position). Flags: Unicode, global.

| Order | Kind | Pattern |
|---|---|---|
| 1 | `DATE` | `[0-9]{1,4}[/.\-][0-9]{1,2}[/.\-][0-9]{1,4}` |
| 2 | `NUM` | `[0-9]+(?:[.,][0-9]+)*` |
| 3 | `WORD` | `[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*` |
| 4 | `OTHER` | any single code point |

Combined reference regex (JavaScript, `gu` flags):

```
([0-9]{1,4}[/.\-][0-9]{1,2}[/.\-][0-9]{1,4})|([0-9]+(?:[.,][0-9]+)*)|([\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*)|([\s\S])
```

Only ASCII digits `0-9` count as digits.

`\p{L}` and `\p{M}` follow the platform's Unicode tables (Unicode 15.1 or later). Letters added in newer Unicode versions may be classified differently across platforms; this does not affect the scripts used in supported documents.

## 3. Replacement

Three counters, `D`, `N` and `W`, each start at 1 for every document.

- `DATE` → `⟦D{n}⟧`, always.
- `NUM` → `⟦N{n}⟧`, always.
- `WORD` → kept verbatim **only if allowlisted** (section 4); otherwise `⟦W{n}⟧`.
- `OTHER` → kept verbatim (punctuation, currency symbols, `%`, whitespace).

Repeated values are **not** deduplicated: each occurrence gets a new placeholder.

The Skeletonizer returns:

- `skeleton`: the output string
- `map`: placeholder id → original token text, e.g. `{"N1": "1,284.50", "D1": "10/01/2026", "W1": "ACME"}`. The map is `Raw` and never leaves the device.

## 4. Allowlist check

The allowlist for a document is the union of `allowlist/{locale}.json` for the app locale and `allowlist/en.json`.

A `WORD` token is allowlisted when either:

1. its lowercase form is in the allowlist, or
2. it contains `-` and **every** hyphen-separated part's lowercase form is in the allowlist (so `Year-to-Date` survives via `year`, `to`, `date`).

Lowercasing is locale-independent (`toLowerCase()` in JS, `lowercase(Locale.ROOT)` in Kotlin, `lowercased()` in Swift). Apostrophe forms are checked as a whole token only.

Allowlists contain generic payroll, tax and tenancy vocabulary. They must never contain personal names, company names or place names.

## 5. Pointer rehydration

The model receives the skeleton and returns references such as `"N3"` or `["W4","W5"]` (schema in `../schemas/`). The Rehydrator then:

1. Drops any reference that is not an own key of `map`. Pointer fields are read as own properties of the model output only.
2. For a field typed as number: accepts exactly one `N` reference. The token must match `^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?$`; then `,` is removed and the rest is read as a decimal. A token that does not match is dropped.
3. For a field typed as date: accepts one `D` reference (returned verbatim), or an array of three `N` references in year, month, day order (returned joined with `-`, without padding) for documents that spell dates with words, such as `2026년 10월 15일`. Rehydrated dates are unparsed text; parsing to ISO dates per jurisdiction belongs to the validation spec.
4. For a field typed as text: accepts an array of references; the values are joined with a single space.

5. For a field typed as enum: accepts the value only if it is one of the schema's listed values.

Enums exist because a word that survives skeletonization has no placeholder and cannot be pointed at. Fields whose values are generic vocabulary (pay frequency, deduction kind) are therefore chosen from a closed list. A model can never write a free-form value.

A dropped field is shown to the user as "not found" and can be typed in.

## 6. Known limits

- A personal name that is spelled like an allowlisted word (surname "Gross", first name "Bill") is not masked. The app shows the skeleton before sending, and allowlists stay narrow.
- Number formats that use `.` as a thousands separator (`1.284,50`) are not parsed in v1.
- Photos have no text layer and cannot be skeletonized. They are read on device only.
