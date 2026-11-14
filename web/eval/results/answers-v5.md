# Real answers: `explain.v5` and `ask.v4` carry nothing about the person

Run on 2026-11-14 through the app's own code path (`eval/runner.html` → `planExplain` / `planAskChip` → `explainProgram` / `askChip`, including the check on model text), with no device model. **12 model calls**, counted in `calls.json`; requests and replies are in `answers-v5.json`.

Since `explain.v5` / `ask.v4` the request is the program's name, its public information (`{programFacts}`, `shared/rulepacks/SPEC.md` section 2.1) and the question. Two people with different answers send byte-identical requests, so two programs stand in for two profiles:

- **Test Food Help**: for one synthetic person the screen says "Probably not", from a private "not a resident" answer.
- **Test Phone Discount**: met through a benefit for another person.

For each program and for English and Spanish: the short explanation, "What could change this result?" and "How do I apply?".

## Result

| Check | Result |
|---|---|
| Says anything about the person (income, household, a rule met or not, a result) | **None of 12.** Every mention of the result points to the screen: "Your result is shown on the screen above." / "El resultado se muestra en la pantalla de arriba." |
| Blocked by the check on model text | 0 of 12, no second attempts |
| Asks the person to share something, or says they skipped something | None |
| Within the program information | Yes. Offers, how to apply, the office, all from the pack copy; no invented amounts, deadlines or steps |
| Length | All within the limits (short ≤ 60, questions ≤ 80 words) |

## What reads badly

- **An unasked disclaimer in 12 of 12 replies.** For example "This text is not legal or tax advice." In Spanish it comes out mixed: "Este texto no es legal ni tax advice" (5 replies, one starting "Esta texto"), and "no es legal ni taxativo".
- **"The screen above" in 12 of 12**, often as the opening sentence. It is accurate but repetitive.
- **"What could change this result?" is answered from "This program uses: …" only in Spanish** (2 of 2). In English both replies say the information "does not state what could change this result".
- Spanish "en el app" (1 reply).
