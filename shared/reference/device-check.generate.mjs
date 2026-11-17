// Builds fixtures/conformance/device-check.json (scoring and summary of the on-device check) and
// fixtures/conformance/judges-household.json (the judges' prepared household) from the reference
// implementation in device-check.mjs.
import { readJson, read, allowlist, introducers } from './cases.mjs';
import { rehydrate, skeletonize, verdicts } from './silhouette.mjs';
import { validatePaystubs } from './validate.mjs';
import * as d from './device-check.mjs';

const schema = readJson('../schemas/pointer.paystub.json');
const sample = skeletonize(read('../samples/paystub-en-01.txt'), allowlist('en'), introducers('en'));
const KEY = readJson('../samples/answers.json').samples['paystub-en-01.txt'].pointers;
const sampleGold = rehydrate(schema, KEY, sample.map);
const l04 = skeletonize(read('../fixtures/device-check/documents/en-l04-2.txt'), allowlist('en'), introducers('en'));
const l04Gold = readJson('../fixtures/device-check/documents/en-l04-2.gold.json');
const l04Key = readJson('../fixtures/device-check/answers.json').documents.find((x) => x.id === 'L04');
const { deductions: KEY_DEDUCTIONS, ytdGross: _y, ...NO_YTD } = KEY;

const readings = [
  { id: 'sample-right', document: 'sample', pointers: KEY },
  { id: 'sample-ytd-from-regular-line', document: 'sample', pointers: { ...KEY, ytdGross: 'N7' } },
  { id: 'sample-ytd-not-found', document: 'sample', pointers: { ...NO_YTD, deductions: KEY_DEDUCTIONS } },
  { id: 'sample-deductions-short-names-not-read', document: 'sample', pointers: { ...KEY, employerName: undefined, deductions: KEY_DEDUCTIONS.slice(0, 3) } },
  { id: 'l04-right', document: 'en-l04-2', pointers: { ...l04Key.core, ...l04Key.deductions } },
  { id: 'l04-hours-spurious-rate-wrong', document: 'en-l04-2', pointers: { ...l04Key.core, ...l04Key.deductions, hourlyRate: l04Key.core.grossPay } },
];
const docs = { sample: { map: sample.map, gold: sampleGold }, 'en-l04-2': { map: l04.map, gold: l04Gold } };

const c = (id, extra) => ({ id, task: 'document.pointer.extract', mode: 'PREFER_ON_DEVICE', latencyMs: 5000, outputCheck: null, ...extra });
const runs = [
  {
    id: 'version-3-made-up',
    version: 3,
    cases: [
      c('a', { ran: 'ON_DEVICE', first: { ran: 'ON_DEVICE', fields: { correct: 12, total: 12 } }, final: { ran: 'ON_DEVICE', fields: { correct: 12, total: 12 }, retried: false, deductionsNotRead: false, notRead: [], incomeInputsCorrect: true, incomeInputs: { right: d.INCOME_INPUTS, notFound: [], wrong: [] }, wrongFields: [] }, repetition: 1 }),
      c('a', { ran: 'ON_DEVICE', first: { ran: 'ON_DEVICE', fields: { correct: 10, total: 12 } }, final: { ran: 'ON_DEVICE', fields: { correct: 10, total: 12 }, retried: false, deductionsNotRead: true, notRead: ['deductions', 'employerName'], incomeInputsCorrect: false, incomeInputs: { right: ['grossPay', 'payFrequency', 'periodStart', 'periodEnd', 'payDate'], notFound: ['ytdGross'], wrong: [] }, wrongFields: [] }, repetition: 2 }),
      c('b', { ran: 'IN_CLOUD', first: { ran: 'ON_DEVICE', fields: { correct: 9, total: 12 } }, final: { ran: 'IN_CLOUD', fields: { correct: 12, total: 12 }, retried: true, deductionsNotRead: false, notRead: [], incomeInputsCorrect: true, incomeInputs: { right: d.INCOME_INPUTS, notFound: [], wrong: [] }, wrongFields: [] } }),
      c('c', { ran: 'ON_DEVICE', first: { ran: 'ON_DEVICE', fields: { correct: 11, total: 12 } }, final: { ran: 'ON_DEVICE', fields: { correct: 11, total: 12 }, retried: false, deductionsNotRead: false, notRead: [], incomeInputsCorrect: false, incomeInputs: { right: ['grossPay', 'payFrequency', 'periodStart', 'periodEnd', 'payDate'], notFound: [], wrong: ['ytdGross'] }, wrongFields: ['ytdGross'] } }),
      { id: 'explanation (en)', task: 'explain.short', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 2000, outputCheck: 'passed' },
      { id: 'photo of the sample (en)', task: 'document.photo.read', mode: 'ONLY_ON_DEVICE', ran: 'not-run', latencyMs: null, outputCheck: null, note: 'skipped: the on-device model does not accept images here' },
    ],
  },
  {
    id: 'version-2-made-up',
    version: 2,
    cases: [
      c('a', { ran: 'ON_DEVICE', fields: { correct: 8, total: 12 }, final: { ran: 'IN_CLOUD', fields: { correct: 12, total: 12 }, retried: true } }),
      c('b', { ran: 'ON_DEVICE', fields: { correct: 12, total: 12 }, final: { ran: 'ON_DEVICE', fields: { correct: 12, total: 12 }, retried: false } }),
    ],
  },
  {
    id: 'version-1-made-up',
    version: 1,
    cases: [c('a', { ran: 'ON_DEVICE', fields: { correct: 7, total: 12 } }), { id: 'q', task: 'ask.chip', mode: 'PREFER_ON_DEVICE', ran: 'IN_CLOUD', latencyMs: 900, outputCheck: 'passed' }],
  },
];

const names = [
  { date: '2026-11-16T17:44:09.000Z', browser: 'Chrome 157.0.7600.12', platform: 'macOS' },
  { date: '2026-11-17T10:12:00.000Z', browser: 'Silhouette 1.0', platform: 'iOS 26.5' },
  { date: '2026-11-18T08:05:00.000Z', browser: 'Silhouette 1.0', platform: 'Android 16' },
];

export function buildDeviceCheck() {
  return {
    spec: 'validation/DEVICE_CHECK.md v1',
    schema: 'schemas/pointer.paystub.json',
    runSchema: 'schemas/device-check-run.v3.json',
    documents: { sample: { map: sample.map, gold: sampleGold }, 'en-l04-2': { map: l04.map, gold: l04Gold } },
    readings: readings.map((r) => {
      const { map, gold } = docs[r.document];
      const pointers = Object.fromEntries(Object.entries(r.pointers).filter(([, v]) => v !== undefined));
      const statuses = d.fieldStatuses(schema, pointers, map, gold);
      return { id: r.id, document: r.document, pointers, expected: { statuses, fields: d.scoreFields(statuses, gold), incomeInputs: d.incomeInputs(statuses), wrongFields: d.wrongFields(statuses) } };
    }),
    runs: runs.map((r) => ({ ...r, expected: d.summarize(r.cases, r.version) })),
    fileNames: names.map((n) => ({ ...n, expected: d.runFileName(n) })),
    validRuns: ['fixtures/device-check/runs/web-device-check-2026-11-17T0038-chrome157-macos.json'],
  };
}

export function buildJudgesHousehold() {
  const household = readJson('../rulepacks/us-ca/judges-household.json');
  const pack = readJson('../rulepacks/us-ca/pack.json');
  const bands = readJson('../bands/us-ca.json');
  const before = d.engineAnswers(household.answers);
  const annual = validatePaystubs([sampleGold], pack.jurisdiction).annualization;
  const after = d.engineAnswers({ ...household.answers, income: { kind: 'exact', amount: annual.annualIncome } });
  return {
    spec: 'rulepacks/SPEC.md section 5; validation/SPEC.md section 7',
    household: 'rulepacks/us-ca/judges-household.json',
    pack: 'rulepacks/us-ca/pack.json',
    bands: 'bands/us-ca.json',
    before: { engineAnswers: before, expected: verdicts(pack, bands, before) },
    paystub: { values: sampleGold, annualIncome: annual.annualIncome },
    after: { engineAnswers: after, expected: verdicts(pack, bands, after) },
  };
}
