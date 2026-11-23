// Scores the held-out set (eval/heldout/) from result files, in two ways for names:
//   - as printed: the answer key's text exactly ("HARBORLINE FABRICATION INC.", "Lawn & Irrigation");
//   - word for word: punctuation that is not part of a word removed on both sides, because the app shows a
//     name as the words it put back ("HARBORLINE FABRICATION INC", "Lawn Irrigation"). The answer keys of
//     eval/dataset/ are written in that form; this set's keys are written as printed.
// Every other field is scored one way: amounts within half a cent, dates and frequencies exactly, deductions
// as a multiset of amounts (eval/score.mjs, shared/validation/DEVICE_CHECK.md section 2).
//   node eval/heldout-score.mjs results/h36.json [results/on-device/heldout-*.json]
import { readFileSync } from 'node:fs';

const PAYSTUB = ['employerName', 'employeeName', 'payFrequency', 'payDate', 'periodStart', 'periodEnd', 'grossPay', 'netPay', 'ytdGross', 'hoursWorked', 'hourlyRate', 'deductions'];
const W2 = ['employerName', 'employeeName', 'taxYear', 'wages', 'federalIncomeTaxWithheld', 'socialSecurityWages', 'medicareWages', 'stateWages'];
const INCOME_INPUTS = ['grossPay', 'ytdGross', 'payFrequency', 'periodStart', 'periodEnd', 'payDate'];
const NAMES = new Set(['employerName', 'employeeName']);

const words = (s) => String(s).replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
const empty = (v) => v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === '';
const amountOf = (d) => (typeof d === 'number' ? d : d?.amount);

function status(field, gold, got, wordForm) {
  if (empty(gold)) return empty(got) ? 'absent' : 'spurious';
  if (empty(got)) return 'missing';
  if (field === 'deductions') {
    const want = gold.map(amountOf);
    const have = got.map(amountOf);
    return want.length === have.length && want.every((w) => have.some((h) => typeof h === 'number' && Math.abs(h - w) < 0.005)) ? 'correct' : 'wrong';
  }
  if (typeof gold === 'number') return typeof got === 'number' && Math.abs(got - gold) < 0.005 ? 'correct' : 'wrong';
  if (NAMES.has(field) && wordForm) return words(got) === words(gold) ? 'correct' : 'wrong';
  return got === gold ? 'correct' : 'wrong';
}

const ok = (s) => s === 'correct' || s === 'absent';

function scoreSet(rows, label) {
  const out = [];
  for (const docType of ['paystub', 'w2']) {
    const docs = rows.filter((r) => r.docType === docType);
    if (docs.length === 0) continue;
    const fields = docType === 'paystub' ? PAYSTUB : W2;
    const per = docs.map((d) => {
      const s = (wordForm) => Object.fromEntries(fields.map((f) => [f, d.values ? status(f, d.gold[f], d.values[f], wordForm) : 'missing']));
      return { id: d.id, strict: s(false), words: s(true) };
    });
    const all = (key) => per.filter((p) => fields.every((f) => ok(p[key][f]))).length;
    const right = (f) => per.filter((p) => p.words[f] === 'correct').length;
    const has = (f) => docs.filter((d) => !empty(d.gold[f])).length;
    const wrongShown = per.filter((p) => fields.some((f) => p.words[f] === 'wrong' || p.words[f] === 'spurious')).length;
    out.push({ label, docType, documents: docs.length, allRightAsPrinted: all('strict'), allRightWordForWord: all('words'), wrongShown,
      ...(docType === 'paystub' ? { incomeInputsAllRight: per.filter((p) => INCOME_INPUTS.every((f) => ok(p.words[f]))).length, incomeInputWrong: per.filter((p) => INCOME_INPUTS.some((f) => p.words[f] === 'wrong' || p.words[f] === 'spurious')).length } : { wagesRight: right('wages'), taxYearRight: right('taxYear') }),
      fields: Object.fromEntries(fields.map((f) => [f, `${right(f)}/${has(f)}`])),
      misses: per.map((p) => `${p.id}: ${fields.filter((f) => !ok(p.words[f])).map((f) => `${f}:${p.words[f]}`).join(' ')}`).filter((l) => !l.endsWith(': ')) });
  }
  return out;
}

const goldOf = (set) =>
  Object.fromEntries(
    JSON.parse(readFileSync(new URL(`${set}/manifest.json`, import.meta.url), 'utf8')).map((m) => [m.id, JSON.parse(readFileSync(new URL(`${set}/${m.id}.gold.json`, import.meta.url), 'utf8'))]),
  );

const reports = [];
for (const path of process.argv.slice(2)) {
  const file = JSON.parse(readFileSync(path, 'utf8'));
  const gold = goldOf(['heldout-2', 'heldout-3'].find((set) => file.set === set || file.dataset === set) ?? 'heldout');
  if (file.kind === 'silhouette-heldout-device') {
    const rows = file.documents.map((d) => ({ id: d.id, docType: d.docType, gold: gold[d.id], values: d.final?.values ?? null }));
    const first = file.documents.map((d) => ({ id: d.id, docType: d.docType, gold: gold[d.id], values: d.device?.values ?? null }));
    const ran = (r) => file.documents.filter((d) => d.ran === r).length;
    reports.push({ file: path, answered: { onDevice: ran('ON_DEVICE'), inCloud: ran('IN_CLOUD'), retried: file.documents.filter((d) => d.retried).length, notRun: ran('not-run') }, final: scoreSet(rows, 'final (what the person is shown)'), deviceFirst: scoreSet(first, 'first answer of the device') });
  } else {
    // What the app shows: since v1.37, a W-2 answer without the boxes left out (rehydratedUsed).
    const rows = file.documents.map((d) => ({ id: d.id, docType: d.docType, gold: gold[d.id], values: d.ok ? (d.rehydratedUsed ?? d.rehydrated) : null }));
    reports.push({ file: path, cloud: scoreSet(rows, 'cloud answer'), leakCheck: { requestBodies: file.leakCheck.requestBodies, valuesFound: file.leakCheck.leaks.length } });
  }
}
console.log(JSON.stringify(reports, null, 2));
