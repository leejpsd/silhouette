# Real answers: general explanation (`explain.v3`) and prepared questions (`ask.v2`)

Run on 2026-11-13 through the app's own code path (`eval/runner.html` → `planExplain` / `planAskChip` → `explainProgram` / `askChip`, including the output check), with no device model, so every request went to the cloud. **36 model calls**, all counted in `calls.json`; raw requests and replies are in `answers-v3.json`. No grounding and no speech.

## Profiles (synthetic)

| Profile | Exact answers on the device | Silhouette sent | Program | Result from the silhouette | Result on screen |
|---|---|---|---|---|---|
| A | 4 people, children aged 4 and 9, renter, $14,000; residency answered "No" (a private answer that never leaves the device) | band A, 4, `0-5`/`6-17`, renter | Test Food Help | depends (residency not known) | **Probably not** |
| B | 2 people, owner, $22,000 | band B, 2, owner | Test Utility Discount | may qualify | may qualify |
| C | 1 person, other housing, $9,000 | band A, 1, other | Test Senior Food Path | may qualify | may qualify |

Each profile: short and long explanation plus the four prepared questions, in English and Spanish (6 × 2 × 3 = 36).

## Summary

| Check | Result |
|---|---|
| (a) States or hints at a result | **None of 36.** References to the result only point to the screen ("Check the screen above to see your result for this program.", "Revisa la parte de arriba de esta pantalla para ver lo que decidió la aplicación sobre tu caso.") |
| (b) Blocked by the output check | **0 of 36**, no second attempts. No missed statement either (every reply read by hand) |
| (c) Asks to share or send information, or says something was skipped | **None.** Four replies reassure instead: "you do not need to share or send that information" (A-en-long), "No tienes que compartir esa información." (A-es-long), "No necesitas compartir esos datos con nadie más." (B-es-long), "No tienes que compartir esa información con nadie." (C-es-short, where nothing was checked on the device) |
| (d) Length | All within limits: short 30–45 of 60 words, long 25–93 of 180, questions 15–62 of 80. Long answers are short because there is little to say (see facts) |
| (d) Reading level | English Flesch–Kincaid grade 3.9–7.7, median 6.1; one reply at 11.0 (C-en-apply, one 24-word sentence). Spanish Fernández-Huerta 64–84 (normal to fairly easy) |
| (e) Within the program facts | No invented amounts, limits, deadlines or dates. Six replies describe what the program does from its name only: "helps people lower their utility costs" (B-en-short), "helps pay for food" (C-en-short), "is here to help you get food" (A-en-long), "ofrece un descuento en los servicios públicos" (B-es-offer), "ofrece una ruta de alimentos para personas mayores" (C-es-offer), "ayuda con los pagos de los servicios" (B-es-long). One adds a step: "to get an application and learn the next steps" (C-en-apply) |
| (f) Spanish | See below |

## Every reply

| Case | Words | Grade / FH | Notes |
|---|---|---|---|
| A-en-short | 41/60 | 7.7 | Lists both criteria; says income was met from general facts and residency is checked on the device. Uses "We checked" |
| A-en-long | 87/180 | 3.9 | "This program does not give legal or tax advice." attributes the disclaimer to the benefit program |
| A-en-apply | 42/80 | 6.2 | Facts do not say how to apply → official website or office |
| A-en-documents | 36/80 | 6.1 | Same pattern |
| A-en-change | 58/80 | 6.5 | "To change this result, you would need to change the things the program looks at." No result stated |
| A-en-offer | 30/80 | 6.8 | Facts do not say what it offers |
| A-es-short | 42/60 | 80.6 | "la cual la aplicación revisa" (doubled pronoun) |
| A-es-long | 61/180 | 76.2 | "para ver si puedes recibir beneficios" (conditional, fine); "La aplicación del dispositivo revisa por ti" (awkward) |
| A-es-apply | 32/80 | 65.5 | Fine |
| A-es-documents | 58/80 | 70.5 | "Los hechos del programa también indican…" |
| A-es-change | 31/80 | 72.5 | Does not answer the question; points to the office |
| A-es-offer | 22/80 | 83.0 | "Los hechos de este programa no indican qué ofrece." |
| B-en-short | 45/60 | 5.3 | Invented purpose; "Check the screen above to see your result" |
| B-en-long | 40/180 | 5.1 | Same disclaimer misattribution |
| B-en-apply | 20/80 | 5.4 | Fine |
| B-en-documents | 26/80 | 5.4 | Fine |
| B-en-change | 15/80 | 6.8 | Answers nothing; points to the website |
| B-en-offer | 47/80 | 7.3 | Fine |
| B-es-short | 43/60 | 83.5 | "para ver si cumples con las reglas" (conditional, fine) |
| B-es-long | 93/180 | 79.8 | "La aplicación móvil" (it is a web app); good disclaimer: "no es consejo legal ni de impuestos" |
| B-es-apply | 24/80 | 68.3 | "Los hechos del programa no dicen cómo solicitar." |
| B-es-documents | 28/80 | 73.1 | Same wording |
| B-es-change | 62/80 | 77.4 | Best answer to "what could change": changes in income or housing |
| B-es-offer | 53/80 | 83.3 | Invented purpose ("un descuento en los servicios públicos") |
| C-en-short | 30/60 | 6.4 | Invented purpose |
| C-en-long | 25/180 | 4.9 | Two sentences |
| C-en-apply | 24/80 | 11.0 | One long sentence; adds "get an application" |
| C-en-documents | 26/80 | 5.4 | Fine |
| C-en-change | 16/80 | 6.9 | Answers nothing |
| C-en-offer | 30/80 | 6.0 | Fine |
| C-es-short | 36/60 | 71.7 | "No tienes que compartir esa información con nadie." with nothing checked on the device |
| C-es-long | 25/180 | 80.4 | Repeats the criterion only |
| C-es-apply | 25/80 | 73.9 | "Los hechos dados no dicen cómo solicitar." |
| C-es-documents | 27/80 | 74.8 | Fine ("Los datos del programa") |
| C-es-change | 54/80 | 78.2 | "La aplicación móvil" |
| C-es-offer | 25/80 | 64.3 | "ofrece una ruta de alimentos para personas mayores" (restates the name as if it were the benefit) |

## Spanish that reads badly

- "Program facts" is translated literally as **"los hechos del programa"** (5 replies). Natural: "la información del programa".
- **"La aplicación móvil"** (3 replies): the web app is not a mobile app.
- "la cual la aplicación revisa": doubled pronoun; "que la aplicación revisa".
- "La aplicación del dispositivo revisa por ti": awkward; "La aplicación revisa en tu dispositivo".
- "ofrece una ruta de alimentos para personas mayores": the program's demo name read as a description.

## The facts are too thin

The demo pack gives each program only its criteria labels (plus a period or note for some), so:

- 13 of the 18 replies to "How do I apply?", "What papers might I need?" and "What does this program offer?" say that the facts do not cover the question, and 24 of all 36 replies send the person to an official website or office, which the demo pack does not list;
- "What could change this result?" gets a real answer only once (B-es-change);
- the model fills the gap with a purpose guessed from the program's name.

For useful answers, a pack would need to carry per program, in each language: a one-sentence purpose and what the benefit is (form, and an amount or range where the rules have one); how to apply (online, by phone, in person, who to contact); the usual documents; the benefit period and renewal; the official website and office name; and which answers matter for the result (the criteria variables, so "what could change" can be answered without stating a result).
