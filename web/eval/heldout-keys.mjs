// Checks the answer keys of the held-out sets against their documents, without any model:
//   - every value in a key (and every deduction amount) appears in the document's text as printed,
//     an amount in any of its printed forms (1271.88, 1,271.88; a whole amount with or without .00);
//   - on every paystub, net pay is gross pay minus the listed deductions, to the cent.
// payFrequency is not checked as printed: the key holds a normalised word (weekly, biweekly, ...).
//   node eval/heldout-keys.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SETS = ['heldout', 'heldout-2', 'heldout-3'];

function printedForms(v) {
  if (typeof v !== 'number') return [String(v)];
  const fixed = v.toFixed(2);
  const [whole, cents] = fixed.split('.');
  const grouped = `${Number(whole).toLocaleString('en-US')}.${cents}`;
  const forms = [fixed, grouped];
  if (cents === '00') forms.push(whole, Number(whole).toLocaleString('en-US'));
  return forms;
}

let checks = 0;
const failures = [];
for (const set of SETS) {
  const dir = join(here, set);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.gold.json')).sort()) {
    const id = `${set}/${file.replace('.gold.json', '')}`;
    const text = readFileSync(join(dir, file.replace('.gold.json', '.txt')), 'utf8');
    const key = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const values = [];
    for (const [field, v] of Object.entries(key)) {
      if (field === 'payFrequency') continue;
      if (field === 'deductions') key.deductions.forEach((d, i) => values.push([`deductions[${i}]`, d.amount]));
      else if (typeof v === 'string' || typeof v === 'number') values.push([field, v]);
    }
    for (const [field, v] of values) {
      checks++;
      if (!printedForms(v).some((form) => text.includes(form))) failures.push(`${id} ${field} ${v}: not printed in the document`);
    }
    if (typeof key.grossPay === 'number' && typeof key.netPay === 'number' && Array.isArray(key.deductions)) {
      checks++;
      const withheld = key.deductions.reduce((sum, d) => sum + d.amount, 0);
      if (Math.abs(key.grossPay - withheld - key.netPay) > 0.005) {
        failures.push(`${id}: net ${key.netPay} is not gross ${key.grossPay} minus deductions ${withheld.toFixed(2)}`);
      }
    }
  }
}
console.log(`${checks} checks, ${failures.length} failing`);
for (const f of failures) console.log(`  ${f}`);
process.exit(failures.length ? 1 : 0);
