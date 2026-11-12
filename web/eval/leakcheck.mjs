// Offline leak check over the whole dataset (no model calls). Rebuilds each request body exactly
// as the app sends it for document.pointer.extract (shared prompt v2, the document's skeleton from
// the shared reference Skeletonizer, the derived model schema) and looks for every gold name, date
// and amount of that document in it.
//   node eval/leakcheck.mjs
import { readFileSync } from 'node:fs';
import { skeletonize } from '../../shared/reference/silhouette.mjs';
import { toModelSchema } from '../../shared/reference/model-schema.mjs';
import { appears, goldStrings } from './leaks.mjs';

const shared = (rel) => readFileSync(new URL(`../../shared/${rel}`, import.meta.url), 'utf8');
const prompt = shared('prompts/pointer-extract.v2.md');
const section = (title) => {
  const body = prompt.slice(prompt.indexOf(`## ${title}`) + title.length + 3);
  const end = body.search(/\n## /);
  return (end === -1 ? body : body.slice(0, end)).trim();
};
const system = section('System instruction');
const user = /```\n([\s\S]*?)\n```/.exec(section('User content'))[1];
const allow = (lang) => new Set(['en', lang].flatMap((l) => JSON.parse(shared(`skeleton/allowlist/${l}.json`)).words));
const introducers = (lang) => new Set(['en', lang].flatMap((l) => JSON.parse(shared(`skeleton/allowlist/${l}.json`)).introducers ?? []));
const manifest = JSON.parse(readFileSync(new URL('dataset/manifest.json', import.meta.url), 'utf8'));

let checked = 0;
const leaks = [];
for (const doc of manifest) {
  const text = readFileSync(new URL(`dataset/${doc.id}.txt`, import.meta.url), 'utf8');
  const gold = JSON.parse(readFileSync(new URL(`dataset/${doc.id}.gold.json`, import.meta.url), 'utf8'));
  const { skeleton } = skeletonize(text, allow(doc.language), introducers(doc.language));
  const schema = toModelSchema(JSON.parse(shared(`schemas/pointer.${doc.docType}.json`)), { requiredNullable: true, dialect: 'openapi' });
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: user.replace('{docType}', doc.docType).replace('{skeleton}', skeleton) }] }],
    systemInstruction: { role: 'system', parts: [{ text: system }] },
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 1024 },
  });
  const values = goldStrings(gold, text, doc.language);
  checked += values.length;
  for (const v of values) if (appears(body, v)) leaks.push(`${doc.id}: ${v}`);
}
console.log(`leak check: ${manifest.length} documents, ${checked} gold values, ${leaks.length} found in request bodies`);
for (const l of leaks) console.log(`  ${l}`);
process.exitCode = leaks.length ? 1 : 0;
