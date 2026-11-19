// The W-2 answers stored in a held-out result file, checked again with the reference rules of the current
// contract (shared/reference/device-reading.mjs w2LeftOut): what the app would now show for the same answers.
// No model is called. Used for figures reported "after seeing the set", never as held-out figures.
//   node eval/heldout-recheck.mjs results/heldout/heldout-2-cloud-h37.json
import { readFileSync } from 'node:fs';
import { skeletonize, rehydrate } from '../../shared/reference/silhouette.mjs';
import { allowlist, introducers } from '../../shared/reference/cases.mjs';
import { w2LeftOut } from '../../shared/reference/device-reading.mjs';

const schema = JSON.parse(readFileSync(new URL('../../shared/schemas/pointer.w2.json', import.meta.url), 'utf8'));
const file = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const set = file.dataset ?? 'heldout';
let right = 0, wrong = 0, left = 0, n = 0;
for (const d of file.documents.filter((x) => x.docType === 'w2' && x.ok)) {
  const text = readFileSync(new URL(`${set}/${d.id}.txt`, import.meta.url), 'utf8');
  const gold = JSON.parse(readFileSync(new URL(`${set}/${d.id}.gold.json`, import.meta.url), 'utf8'));
  const { map } = skeletonize(text, allowlist('en'), introducers('en'));
  const out = w2LeftOut(schema, d.pointers, map);
  const kept = Object.fromEntries(Object.entries(d.pointers).filter(([k]) => !out.fields.some((f) => f.field === k)));
  const wages = rehydrate(schema, kept, map).wages;
  n++;
  if (typeof wages !== 'number') left++;
  else if (Math.abs(wages - gold.wages) < 0.005) right++;
  else wrong++;
  console.log(d.id.padEnd(8), JSON.stringify(out.problems), 'box 1:', wages ?? 'left out', wages !== undefined && Math.abs(wages - gold.wages) >= 0.005 ? '(WRONG)' : '');
}
console.log(`box 1 of ${n} W-2s: right ${right}, left out ${left}, wrong ${wrong}`);
