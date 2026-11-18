# Silhouette design (tokens version 7, "Brand & UI")

The rules another engineer needs to build any screen of Silhouette on any platform. Values are in `design/tokens.json` (version 7); this document says where each one goes. Lengths are density-independent (CSS px = Android dp = iOS pt).

## 1. Colour

| Name | Hex | Use |
|---|---|---|
| ink | `#0E0E0E` | text, the dock, the rail, selected items, the "On this device" badge |
| night | `#18191C` | an inset box on ink (the request inside the sheet) |
| redact | `#FF5B1F` | **only** what can leave or has left: token chips, the Send action, the sent counter, "Sent" in the record, the What-could-leave label |
| redact-tint | `#FFE4DA` | the Cloud badge and a cloud card |
| ink-2 `#3B3F46`, note `#5C6068`, icon `#8A8E96`, faint `#A3A7AE`, on-ink `#B5B9C0`, underline `#C5C9D0`, line `#D5D8DD`, track `#E2E4E8` | | the grey ramp: secondary text (note), icons, disabled, text on ink, link underlines, hairlines, tracks and the No-model badge |
| ground | `#EEEFF1` | the screen; also the row divider on white |
| raised | `#F2F3F5` | table heads, selected rows, icon tiles |
| sheet | `#FFFFFF` | cards, lists, inputs, documents |

On ink, use white at 85 % (ring), 22 % (border), 8 % (divider) and 4 % (fill). Text on redact is ink (`onRedact`): white on redact is 3.1:1 and fails WCAG AA. Every text pair in light and dark reaches 4.5:1; focus rings and control outlines reach 3:1.

**Dark scheme** (by the Android conventions board, the same on every platform): no dynamic colour; ground is ink, cards `#16181B`; text white, secondary `#C3C6CD`; the dock, the rail, sheets and modals flip to light (`#F1F2F5` with ink text) so they stay the highest-contrast thing on screen, and the inset on them (night in light) becomes `#E2E4E8`; the transparent whites on ink become the same percentages of ink; redact is unchanged and still means "it left".

Redact text is never set on a light surface (orange on `#EEEFF1` is 2.8:1): where a count of what left is written large ("2 SENT,"), it is ink on a redact block.

## 2. Type

- **Display**: Big Shoulders Display 900, always capitals, balanced wrap, line height 0.88. Mobile 46–58 by screen; PC clamp up to 104 (Start) and 64 (question, results). The wordmark SILHOUETTE is display 24, letter spacing 0.01 em. Steps down 4 px until no word overflows; floor 60 %.
- **Text**: Inter Tight on the web, the system font on iOS, Google Sans Flex on Android. Lead 17 / 1.45; body 15–16 / 1.5; row title 15 / 700; meta 12–13.
- **Mono**: IBM Plex Mono for documents (13), token chips (12 / 600), times and requests. Every number uses tabular figures.
- All typefaces are bundled (SIL OFL 1.1); nothing is loaded from another host.

## 3. Components

- **Where it ran** (every model response carries one, followed by its routing reason in note 12–13):
  - "On this device": ink pill, white text, a white dot; on ink, an outlined pill.
  - "Cloud": redact-tint pill, 1.25 px dashed ink border, a redact dot. On ink, a white dashed border at 50 % instead of the tint.
  - "No model": track-grey pill, no dot (rules, maths, checks).
  Pill height 26, padding 0 10, text 12 / 700.
- **Result markers**: a 20 px circle, 1.5 px stroke; the fill level carries the meaning: filled = may qualify, half = possible, dashed ring = depends on an answer, thin ring = probably not (the whole row dims to note grey). Never colour alone: the verdict word is always next to it.
- **Token chips** (placeholders): IBM Plex Mono 12 / 600, letter spacing 0.02 em, redact fill, ink text, radius 6, padding 2 × 7. A confirmed value is mono 14 with an 18 px ink check disc.
- **The leave glyph** (a box with an arrow out) is reserved for actions that send. A sending action turns the primary button redact and swaps the arrow chip for the leave glyph.
- **The counter**: a 32 px circle with the count in display 18. Empty ring (1.5 px, on-ink 85 %) at 0; solid redact disc with an ink digit once anything was sent.
- **Privacy dock** (narrow screens, every screen): ink, radius 28 at the top, padding 16 16 18. Primary button, an optional text link, then the counter row under an 8 % divider: counter, "Leaving your device" (13 / 700) with the summary line (12, on-ink), and Details (44 tall pill, white 22 % border, 4 % fill).
- **Rail** (wide screens): ink, 248 wide, full height: the wordmark and the language button, the For-judges and Draft-rules links, the three steps (Quick Check, Results, Add a paystub) with their state (current: a 8 % white fill with a dot; done: a check and "Done" or a count), and the counter row with Details at the bottom.
- **Buttons**: primary 56 tall, radius 16, label 17 / 700, with a 36 px arrow chip at the right. On ground the primary is ink with a white chip; on ink it is white with an ink chip. Compact 44, radius 12. Choice chips 44, pill, white with an 8 % ink border. Text links carry a 1 px underline (underline grey; on ink white 35 %) offset 2 px, never default blue. No shadows, no bevels.
- **Lists**: a white card, radius 20–24, 1 px ink-8 % border; rows separated by ground; a row is 56+ tall with the marker or an icon tile (raised, radius 12) on the left and a 16 px chevron in icon grey on the right (ink when selected). A table head row is raised, 12 / 600 note.
- **Segmented control**: a track-grey pill with two segments; the selected segment is white with an 8 % border; nested radius = outer − padding (14 = 10 + 4).
- **Choice tiles** (yes / no): two tiles, radius 20, 120 tall, the word in display 40; selected is ink with a white check; unselected white with a ring.
- **Sheets and modals**: mobile, a bottom sheet with radius 28 at the top and a 36 × 4 grab handle over a scrim of ink 42 %; PC, a centred modal, max 520, radius 28, scrim 48 %. Both are ink with white text; the title is display caps with a 44 px round close button.
- **Leaving label** (the record): a 2 px ink frame, 1 px ink rules between rows; each row: time in mono, what it carried, and its status pill ("Sent 200" redact, "On device" outlined). The headline above it is display caps: "2 SENT, 1 KEPT." On ink the frame and rules turn white.
- **Icons**: a 16 px grid, 1.5–1.6 round strokes, drawn in house.

## 4. Edges, depth, space

No shadows. Depth comes from a 1 px ink border at 8 % and the step from ground to sheet. Radii: 6 token, 12 tile and input, 16 button, 20 / 24 card, 28 dock, sheet and modal. Space 4, 8, 12, 16, 20, 24, 32; mobile gutter 20; targets 44 at least. Nothing is rotated, there is no grain, and redact is never a background for anything that has not left.

## 5. Layout

- Narrow (below 808): one content column with a 20 px gutter; the dock at the bottom of every screen.
- Wide (from 808): the rail on the left (248); the content area beside it, one column up to 760, two columns up to 1100; padding clamp 20–72. Modal instead of bottom sheet. Side by side where the boards show it: the silhouette (on this device / what could leave), the results list next to the selected program, the record next to "exactly what was sent".

## 6. Platforms

- **Web**: Inter Tight body; dock on narrow, rail on wide; keyboard hints on wide screens (Y / N answers a yes/no question, Enter continues, Esc keeps a request on the device and closes a modal, S skips), shown as small mono keycaps.
- **iOS**: system font body; sentence-case screen titles in the navigation bar, display caps only in hero blocks; Liquid Glass tab bar (Check, Results, Paystub) and buttons; the privacy pill above the tab bar; swipe back; Larger Text stacks rows; Reduce Transparency honoured.
- **Android**: Google Sans Flex body; Material 3 Expressive navigation bar with three destinations; the ink dock above it, edge-to-edge; predictive back; wavy progress and segmented buttons; the dock shrinks to its count on scroll and never disappears; font scale 200 % grows the dock instead of cutting words; dark theme as in section 1.

## 7. What the boards do not draw, and how it is derived

Everything below uses only the components above:
- **Question types**: counter (a white card with − and + 44 px buttons and the value in display), options and multi-choice (list rows with a radio or check), income band or exact amount (a segmented control above the band list or a mono amount input), money amount (mono input with the currency).
- **Results**: every verdict group, including "probably not" (dimmed rows); the group heading is a 13 / 600 note label.
- **Program page**: the pack's sections (what it offers, how to apply, papers, renewal, office, sources with the read date) as list rows in white cards; external links carry the arrow-out icon.
- **Reading**: the stages and the read-ahead line as a note line with a small ink spinner; values not read show "Not read on this device" in note; the unreliable reading, App Check failure and offline use an ink-outlined notice card with Try again.
- **The record**: statuses Sent (redact pill), On device (outlined pill), Not sent and Not completed (track-grey pill with the reason under the row); the split line under the count; record deleted (the counter at 0 with the deletion date); the delete confirmation as a sheet / modal.
- **Draft rules**: the notice line under the wordmark ("Draft rules · More"); its sheet carries the pack's notice and sources.
- **Language**: a sheet / modal with three rows.
- **The on-device check**: a page behind "Run device check": the three headline numbers in display, the table as a list card, recordings as rows.
- **Where each task runs**: a screen of its own, built from `routing.json`: four cards (on this device only: ink; device first, cloud if needed: white; in the cloud: redact-tint with a dashed border and "Can be switched off" where a task uses a tool; no model: track grey), each with its task names joined by " · " and one note. Reached from the judges' page and the draft-rules sheet.
- **The step before sending**: a bottom sheet over the 42 % scrim on phones (grab handle, display title, the "What could leave" inset with a dashed redact rule under its head, "Nothing about you", the exact request on demand, Keep and Send, the byte-for-byte line); on wide screens the modal "Before this leaves" adds "Stays on this device" with one masked bar per kind of thing that stays (no values) when the request carries nothing of the person's.
- **Review**: compact rows (label, value in mono, an empty ring to confirm, an ink check disc once confirmed); opening a row shows where the value was found and Change; "More values (n)" is the list's last row.
- **The record**: compact rows (time, title, status pill); where it went and the exact request open under "Show exactly what was sent"; on wide screens the exact request of the selected row stands in an ink card with Copy and, for a document reading, the placeholder ids the model answered.
- **Spanish and 200 % text**: display type steps down; rows wrap; the dock grows rather than cutting words.
- **Tablets (600–807)**: the narrow layout in one centred column (640) with the dock floating above the bottom edge, radius 28 on all corners.
- **Wide, by screen** (web): Start puts the headline and the way in on the left and the silhouette table on the right; a program page stands beside the results list (the current row raised, its chevron ink); the step before sending is a modal (Esc keeps the request on the device); the document preview shows both views side by side, the chosen one is the one you work in; the record fills the content area with "Exactly what was sent" for the open request on the right; the screen's actions stand in the content, not in the rail; keyboard hints show only with a fine pointer.
