# Checks on model text

A model explains; it never decides. Prompts say so, and this check enforces it on the device before any model text about a program is shown.

`output-checks.json` lists, per language, phrases that state a result:

- `definite`: a result stated as fact ("you qualify", "you are not eligible"). Checked for every task.
- `overall`: a hedged result ("you may qualify"). Checked in addition when the task only knows the silhouette (scope `general`: `explain.short`, `explain.long`, `ask.chip`, and the text of `program.currentStatus` and `discover.leads`), because the model does not know the person's result and its guess can contradict the rules. For scope `personal` (`explain.personal`, `ask.freeText`) hedged wording is what the prompt asks for.
- `allowBefore`: words that make the phrase a condition, not a claim ("if you qualify", "whether you may qualify").

## Matching

1. Normalize the text to NFC, lowercase it (locale-independent, as in `skeleton/SPEC.md` section 4), replace U+2018 and U+2019 with `'`, and replace every run of whitespace with one space.
2. For each phrase of the lists that apply, find every occurrence as a substring.
3. An occurrence is allowed when the text before it ends with one of `allowBefore`. Any other occurrence blocks the text.
4. A language without an entry uses `en`.

## When a text is blocked

Ask once more. If the second reply is blocked too, show the shared copy `answers.blocked` and the reasons from the rule engine; never show the blocked text. A blocked reply is recorded like any other request.

The check is deliberately crude. It will sometimes block an acceptable sentence; that costs one retry. It is not a substitute for the prompt, and it is not how the app avoids contradictions: tasks that could contradict the result are not given a result to restate.

Cases: `fixtures/conformance/output-check.json`. Reference: `modelTextIsBlocked()` in `reference/silhouette.mjs`.
