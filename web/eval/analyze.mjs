// Error analysis for one evaluated variant: failure counts per field and layout, and for each
// wrong or spurious value the skeleton line its pointer landed on.
//   node eval/analyze.mjs v2 [--field grossPay] [--max 20]
import { readFileSync } from 'node:fs';
import { skeletonize } from '../../shared/reference/silhouette.mjs';

const [variant = 'v0'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const onlyField = flag('field', null);
const max = Number(flag('max', '25'));
const result = JSON.parse(readFileSync(new URL(`results/${variant}.json`, import.meta.url), 'utf8'));
const allow = (lang) =>
  new Set(['en', lang].flatMap((l) => JSON.parse(readFileSync(new URL(`../../shared/skeleton/allowlist/${l}.json`, import.meta.url), 'utf8')).words));

const introducers = (lang) =>
  new Set(['en', lang].flatMap((l) => JSON.parse(readFileSync(new URL(`../../shared/skeleton/allowlist/${l}.json`, import.meta.url), 'utf8')).introducers ?? []));

const table = {};
const examples = [];
for (const doc of result.documents) {
  if (!doc.ok) {
    examples.push(`${doc.id}: ERROR ${doc.kind} ${doc.detail ?? ''}`.slice(0, 200));
    continue;
  }
  for (const [field, outcome] of Object.entries(doc.score.outcomes)) {
    if (onlyField && field !== onlyField) continue;
    if (outcome === 'correct' || outcome === 'absent') continue;
    const key = `${field}`;
    table[key] ??= {};
    table[key][doc.layout] ??= { missing: 0, wrong: 0, spurious: 0 };
    table[key][doc.layout][outcome]++;
    if (outcome === 'missing') continue;
    const text = readFileSync(new URL(`dataset/${doc.id}.txt`, import.meta.url), 'utf8');
    const { skeleton } = skeletonize(text, allow(doc.language), introducers(doc.language));
    const ref = doc.pointers?.[field];
    const refs = (Array.isArray(ref) ? ref : [ref]).filter((r) => typeof r === 'string');
    const line = skeleton.split('\n').find((l) => refs.some((r) => l.includes(`⟦${r}⟧`))) ?? '';
    examples.push(`${doc.id} ${field}: gold ${JSON.stringify(doc.gold[field])} got ${JSON.stringify(doc.rehydrated?.[field])} via ${JSON.stringify(ref)}\n      ${line.trim()}`);
  }
}
console.log(`variant ${variant}: failures per field and layout (missing / wrong / spurious)`);
for (const [field, layouts] of Object.entries(table)) {
  console.log(`  ${field}: ${Object.entries(layouts).map(([l, c]) => `${l} ${c.missing}/${c.wrong}/${c.spurious}`).join(', ')}`);
}
console.log(`examples (${Math.min(max, examples.length)} of ${examples.length}):`);
for (const e of examples.slice(0, max)) console.log(`  ${e}`);
