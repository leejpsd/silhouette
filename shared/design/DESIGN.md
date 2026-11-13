# Silhouette design: "Duplicator"

The look comes from office duplicators and carbon forms: your paperwork stays an original, and only a marked-up copy can leave. `tokens.json` holds every value; this page says what the values are for.

## Principles

1. **One colour means "leaves this device".** Pink (`leave`) is used only for what can leave or has left: the bars over hidden values, the Send button, the count of requests, the "What could leave" label. Nothing else is pink, so a person learns the meaning once. Pink is a fill, never text; text on it is `onLeave`.
2. **Ground and ink, then the block.** A screen is one ground colour with one ink colour. The lower part of the screen is the inverted block (`block` / `onBlock`, 32 px top radius): it carries the one main action of the screen and the "Leaving your device" count, on every screen.
3. **Paper is the person's data.** Document values and what would be sent are shown on paper cards (`paper`, 4 px radius, slightly rotated, soft shadow), in the mono face. Paper is never used for app chrome.
4. **Results are told apart by shape, not colour.** A solid marker means may qualify, dotted means possible, dashed means it depends on an answer, hollow means probably not. Dotted also means "not yet" elsewhere (progress, loading). There are no red or green verdict colours, and no red anywhere: deleting is an outline button behind a confirmation.
5. **Big type does the talking.** Headlines, amounts and counts are set very large and tight in the display face; interface text stays small and plain. Headlines step down in size before they ever clip (`typography.sizeSteps`).
6. **Motion explains.** Bars wipe in over values, the count is stamped when something leaves, amounts pop once. Every animation has a reduced-motion form that shows the end state.

## Type

| Role | Face | Licence |
|---|---|---|
| Display: headlines, amounts, counts, main actions | Darker Grotesque 800 / 900 | SIL OFL 1.1 |
| Interface text | Hanken Grotesk 400 / 600 / 700 | SIL OFL 1.1 |
| Document values, placeholder ids, times, limits | DM Mono 400 / 500 | SIL OFL 1.1 |

Apps bundle the fonts; nothing is fetched at run time.

## Accessibility

- Every text pair in `tokens.json` meets WCAG AA (4.5:1); muted text uses solid colours chosen for that.
- A pink fill next to butter, paper or the dark theme's block has a 1.5 px `onLeave` inner border, because pink against those is below 3:1.
- Touch targets are at least 44 px (48 dp on Android).
- Display type scales with the system text size up to 1.3×; interface text scales fully. When the block would cover more than 40 % of the screen it scrolls with the content.
- Focus rings use `focus`, `blockFocus` or `leaveFocus` depending on the surface under them.

## Wide screens

From 960 px the app uses two columns (`layout.wide`): the screen's content on the left, at most 640 px wide, and the block on the right as a fixed panel with rounded corners. The block never becomes a bar across the whole window, and headlines keep their phone line lengths. Sheets (the outgoing record, language, demo rules, delete confirmation) open inside the block's column.

## Reading the tokens

`tokens.json` contains numbers, arrays and notes in plain words. A parser takes the keys it needs and skips the rest. Lengths are the same number in CSS px, Android dp and iOS pt; on Android, tap targets use `size.minTapTargetAndroid`.

## What is shown as "what is sent"

Where the app builds the request body itself (Web), the text shown is the bytes that are sent. Where an SDK serializes the body (Android, iOS), the app shows its own rendering of the same request object and says so; it is never called byte-exact.

## Counting what left and what stayed

The record counts requests that left the device (`leaving.sentCount`) and answers that were written on the device and so never left (`leaving.keptCount`). An answer written on the device is recorded like a request, with status `outbound.status.answeredShort`.
