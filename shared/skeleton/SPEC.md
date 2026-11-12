# Skeletonizer specification (v1.3)

The Skeletonizer turns `Raw` document text into a `Skeleton`: the labels and layout stay, every value goes.
It is deterministic and must produce byte-identical output on Web, Android and iOS.

## 1. Input normalization

1. Normalize to Unicode NFC.
2. Convert `\r\n` and `\r` to `\n`.
3. Delete every `⟦` (U+27E6) and `⟧` (U+27E7) from the input.
4. Nothing else changes. Whitespace and line breaks are preserved exactly.

## 2. Tokenization

The tokenizer is **deny by default**: a character survives only if it is explicitly listed as safe, or belongs to an allowlisted word. Nothing depends on the platform's Unicode property tables.

### Safe characters

Safe characters are kept verbatim and never belong to a word.

| Group | Code points |
|---|---|
| Whitespace | U+0009, U+000A, U+0020, U+00A0, U+2000–U+200A, U+202F, U+205F, U+3000 |
| ASCII punctuation and symbols | U+0021–U+002F, U+003A–U+003F, U+005B–U+005E, U+0060, U+007B–U+007E. **`@` (U+0040) and `_` (U+005F) are not safe**: they join the parts of e-mail addresses and user names into one word, so the whole thing is masked |
| Latin-1 symbols | ¢ U+00A2, £ U+00A3, ¥ U+00A5, § U+00A7, ° U+00B0, ± U+00B1, ¶ U+00B6, · U+00B7, × U+00D7, ÷ U+00F7 |
| General punctuation and currency | – U+2013, — U+2014, ‘ U+2018, ’ U+2019, “ U+201C, ” U+201D, • U+2022, … U+2026, ₩ U+20A9, € U+20AC, № U+2116 |
| CJK punctuation | U+3001, U+3002, U+3008–U+3011, U+3014, U+3015, U+30FB |
| Fullwidth punctuation | U+FF01, U+FF05, U+FF08, U+FF09, U+FF0B–U+FF0F, U+FF1A, U+FF1B, U+FF1D, U+FF1F, U+FF3B, U+FF3D, U+FF5E |

Write `SAFE` for this set and `X` for "any code point that is not in `SAFE` and is not an ASCII digit `0-9`". `X` therefore includes letters of every script, combining marks, digits of other scripts (Arabic-Indic, fullwidth, superscript …), symbols, emoji, control characters, zero-width characters, private-use and unassigned code points.

### Tokens

Scan the text left to right, by code point, with this ordered alternation (first match wins at each position).

| Order | Kind | Pattern |
|---|---|---|
| 1 | `DATE` | a month-name date (below), or `[0-9]{1,4}[/.\-][0-9]{1,2}[/.\-][0-9]{1,4}` |
| 2 | `NUM` | `[0-9]+(?:[.,][0-9]+)*` |
| 3 | `WORD` | `X+(?:['’\-]X+)*` |
| 4 | `OTHER` | any single code point (only safe characters reach this) |

The reference builds the regex from the safe list (`TOKEN_SOURCE` in `reference/silhouette.mjs`); ports must use the same character class, written as explicit ranges, and must match by code point, not by UTF-16 unit or grapheme cluster.

### Month-name dates

`MONTH` is one of these names, matched **ASCII case-insensitively**, longest alternative first:

`january jan enero · february feb febrero · march mar marzo · april apr abril · may mayo · june jun junio · july jul julio · august aug agosto · september sept sep septiembre setiembre · october oct octubre · november nov noviembre · december dec diciembre`

A month-name date is either form, with single ASCII spaces exactly as written:

| Form | Pattern | Examples |
|---|---|---|
| Month first | `MONTH\.? [0-9]{1,2}(?:st\|nd\|rd\|th)?,? [0-9]{4}(?![0-9])` | `October 17, 2026`, `Oct. 17 2026`, `Sept 3rd, 2026` |
| Day first | `[0-9]{1,2}(?:st\|nd\|rd\|th)? (?:de )?MONTH\.?,? (?:del? )?[0-9]{4}(?![0-9])` | `17 October 2026`, `17 de octubre de 2026` |

The whole match becomes one `⟦D⟧` placeholder. A month name without a day and a four-digit year (`May 2026`, `Mar 5`, `June Carter`) is not a date and is tokenized as words and numbers.

## 3. Replacement

Three counters, `D`, `N` and `W`, each start at 1 for every document.

- `DATE` → `⟦D{n}⟧`, always.
- `NUM` → `⟦N{n}⟧`, always.
- `WORD` → kept verbatim **only if allowlisted and every other word of its phrase is allowlisted too** (sections 4 and 4.1); otherwise `⟦W{n}⟧`.
- `OTHER` → kept verbatim (punctuation, currency symbols, `%`, whitespace).

Repeated values are **not** deduplicated: each occurrence gets a new placeholder.

The Skeletonizer returns:

- `skeleton`: the output string
- `map`: placeholder id → original token text, e.g. `{"N1": "1,284.50", "D1": "10/01/2026", "W1": "ACME"}`. The map is `Raw` and never leaves the device.

## 4. Allowlist check

The allowlist for a document is the union of `allowlist/{language}.json` for the **document's language** and `allowlist/en.json`. The document language is chosen by the user and is independent of the app's display language.

A `WORD` token is allowlisted when either:

1. its lowercase form is in the allowlist, or
2. it contains `-` and **every** hyphen-separated part's lowercase form is in the allowlist (so `Year-to-Date` survives via `year`, `to`, `date`).

Lowercasing is locale-independent (`toLowerCase()` in JS, `lowercase(Locale.ROOT)` in Kotlin, `lowercased()` in Swift). Apostrophe forms are checked as a whole token only.

Allowlist lookups compare strings **by code point** (after NFC normalization of the input). A platform's default string equality may treat canonically equivalent strings as equal; do not use it here.

Allowlist files hold lowercase NFC words made of letters only, and must not contain letters whose lowercase mapping differs across platforms (σ, ς, İ, ı, ß). `reference/lint.mjs` checks this.

Allowlists contain generic payroll, tax and tenancy vocabulary. They must never contain personal names, company names or place names.

## 4.1 Phrases are masked as a whole

Consecutive safe characters between two tokens form one separator. A **phrase** is a maximal run of `WORD` tokens whose separators are each exactly one of:

- a single space `" "`
- comma and space `", "`
- space, ampersand, space `" & "`

If **any** word of a phrase is not allowlisted, **every** word of that phrase is masked. An allowlisted word next to a masked word is usually part of the same name: `Jordan Gross`, `Federal Security Services`, `Smith & Gross`.

Anything else ends a phrase: two or more spaces, a tab, a line break, a colon, a slash, a number or a date. So `Employee: Jordan` keeps `Employee`, and a table row `Gross Pay    Jordan` keeps `Gross Pay`.

The cost is that a label written next to an unknown word with a single space is lost (`CA SDI` becomes two placeholders). The rule trades labels for privacy on purpose.

## 5. Pointer rehydration

The model receives the skeleton and returns references such as `"N3"` or `["W4","W5"]` (schema in `../schemas/`). The Rehydrator then:

1. Drops any reference that is not an own key of `map`. Pointer fields are read as own properties of the model output only.
2. For a field typed as number: accepts exactly one `N` reference. The **whole** token must match (anchor at the true end of the string; in ICU and Java `$` also matches before a final line break, so use `\z` or a full-match call):  `^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?$`; then `,` is removed and the rest is read as a decimal. A token that does not match is dropped.
3. For a field typed as date: accepts one `D` reference (returned verbatim), or an array of three `N` references in year, month, day order (returned joined with `-`, without padding) for documents that spell dates with words, such as `2026년 10월 15일`. Rehydrated dates are unparsed text; parsing to ISO dates per jurisdiction belongs to the validation spec.
4. For a field typed as text: accepts an array of references; the values are joined with a single space.

5. For a field typed as enum: accepts the value only if it is one of the schema's listed values.

Enums exist because a word that survives skeletonization has no placeholder and cannot be pointed at. Fields whose values are generic vocabulary (pay frequency, deduction kind) are therefore chosen from a closed list. A model can never write a free-form value.

A dropped field is shown to the user as "not found" and can be typed in.

## 6. Known limits

- A word that contains a zero-width or unusual space character is treated as one long word and masked, so a label written that way is lost (never leaked).
- A name made **only** of allowlisted words (a company called "Federal Security", a person called "Grant Bond" if both words were listed) is not masked. The phrase rule covers names with at least one unlisted word. The app shows the skeleton before anything is sent and lets the user hide any remaining word; allowlists stay narrow and exclude common given names.
- Number formats that use `.` as a thousands separator (`1.284,50`) are not parsed in v1.
- Photos have no text layer and cannot be skeletonized. They are read on device only.
