# Checks on model text

A model explains; it never decides. Prompts say so, and this check enforces it on the device before any model text about a program is shown, for every task and every language.

`output-checks.json` lists, per language, phrases that state a result:

| List | Meaning | Checked for |
|---|---|---|
| `definite` | A result stated as fact ("you qualify", "you are not eligible", "you're approved") | every task |
| `positive` | A hedged positive result ("you may qualify") | scope `general`; scope `personal` when the verdict on screen is `unlikely` |
| `negative` | A hedged negative result ("you are probably not eligible") | scope `general`; scope `personal` when the verdict on screen is `likely` |
| `criterion` | A claim about one rule ("your income is not under the limit", "you meet the…") | scope `general` only |
| `allowBefore` | Words that make a phrase a condition, not a claim ("if you qualify", "whether you may qualify") | |

Scope `general` is every task that knows nothing about the person: `explain.short`, `explain.long`, `ask.chip`, and the text of `program.currentStatus` and `discover.leads`. Any statement about the person from such a task is a guess, so every list applies. Scope `personal` is `explain.personal` and `ask.freeText`, which run on the device with the real result: there hedged wording and statements about single rules are what the prompt asks for, but a hedge that contradicts the verdict on screen is blocked.

## Matching

1. Normalize the text to NFC and lowercase it (locale-independent, as in `skeleton/SPEC.md` section 4).
2. Remove U+00AD, U+200B to U+200D, U+2060 and U+FEFF (soft hyphen, zero-width characters, word joiner, byte-order mark).
3. Replace U+2018 and U+2019 with `'`, and every run of whitespace with one space.
4. For each phrase of the lists that apply, find every occurrence as a substring.
5. An occurrence is allowed when the text before it ends with one of `allowBefore`. Any other occurrence blocks the text.
6. The language is the answer language of the request, not the language of the interface chrome. A language without an entry uses `en`.

## When a text is blocked

Ask once more. If the second reply is blocked too, show the shared copy `answers.blocked` and the reasons from the rule engine; never show the blocked text. A blocked reply is recorded like any other request.

The check is deliberately crude. It will sometimes block an acceptable sentence; that costs one retry. It is not how the app avoids contradictions: tasks that could contradict the result are given nothing about the person to restate.

Cases: `fixtures/conformance/output-check.json` (a case may carry a `verdict`). Reference: `modelTextIsBlocked()` in `reference/silhouette.mjs`.
