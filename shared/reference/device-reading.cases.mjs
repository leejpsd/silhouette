// Conformance cases of the on-device reading (validation/DEVICE_READING.md). generate.mjs runs them
// through reference/device-reading.mjs and writes ../fixtures/conformance/device-reading.json.
import { readJson, read, allowlist, introducers } from './cases.mjs';
import { skeletonize } from './silhouette.mjs';

const evaluation = readJson('./device-reading.docs.json').docs;
const real = readJson('./device-reading.real.json').answers;

/** Silhouettes the cases refer to: the bundled sample and the 38 English evaluation paystubs. */
export const documents = Object.fromEntries([
  ['sample', skeletonize(read('../samples/paystub-en-01.txt'), allowlist('en'), introducers('en'))],
  ...evaluation.map((d) => [d.id, skeletonize(d.text, allowlist('en'), introducers('en'))]),
]);

// The sample's correct answer (samples/answers.json), split into parts.
const KEY = readJson('../samples/answers.json').samples['paystub-en-01.txt'].pointers;
const { deductions: KEY_DEDUCTIONS, ...KEY_CORE } = KEY;
const { ytdGross: _ytd, ...NO_YTD } = KEY_CORE;
const json = (v) => JSON.stringify(v);
const CORE = json(KEY_CORE);
const DEDUCTIONS = json({ deductions: KEY_DEDUCTIONS });
const SHORT = json({ deductions: KEY_DEDUCTIONS.slice(0, 3) });

export const constraintCases = ['core', 'gross', 'deductions', 'deductions-again'].map((part) => ({ id: `sample-${part}`, document: 'sample', part }));

/** Checks on one answer: core problems, deductions problems, fields not read, and the missing-year-to-date trigger. */
export const checkCases = [
  { id: 'sample-key', document: 'sample', pointers: KEY },
  { id: 'net-equals-gross', document: 'sample', pointers: { ...KEY, netPay: KEY.grossPay } },
  { id: 'gross-date-placeholder', document: 'sample', pointers: { ...KEY, grossPay: 'D1' } },
  { id: 'gross-unknown-id', document: 'sample', pointers: { ...KEY, grossPay: 'N999' } },
  { id: 'gross-missing', document: 'sample', pointers: Object.fromEntries(Object.entries(KEY).filter(([k]) => k !== 'grossPay')) },
  { id: 'frequency-not-an-option', document: 'sample', pointers: { ...KEY, payFrequency: 'fortnightly' } },
  { id: 'name-number-placeholder', document: 'sample', pointers: { ...KEY_CORE, employerName: ['N1'] } },
  { id: 'date-number-placeholder', document: 'sample', pointers: { ...KEY_CORE, payDate: 'N3' } },
  { id: 'several-problems', document: 'sample', pointers: { ...KEY_CORE, employerName: ['N1'], payFrequency: 'fortnightly', ytdGross: KEY.netPay } },
  { id: 'net-above-gross', document: 'sample', pointers: { ...KEY_CORE, netPay: KEY.ytdGross } },
  { id: 'ytd-regular-line', document: 'sample', pointers: { ...KEY_CORE, ytdGross: 'N7' } },
  // N3 is the ZIP code of the address (90011): a number without cents in a paystub that prints cents.
  { id: 'gross-and-ytd-on-zip', document: 'sample', pointers: { ...KEY, grossPay: 'N3', ytdGross: 'N3' } },
  { id: 'net-on-zip', document: 'sample', pointers: { ...KEY_CORE, netPay: 'N3' } },
  { id: 'deduction-on-zip', document: 'sample', pointers: { ...KEY_CORE, deductions: [{ amount: 'N3', kind: 'other' }] } },
  { id: 'deductions-empty', document: 'sample', pointers: { ...KEY_CORE, deductions: [] } },
  { id: 'deductions-word-placeholder', document: 'sample', pointers: { ...KEY_CORE, deductions: [{ amount: 'W1', kind: 'other' }] } },
  { id: 'deductions-missing', document: 'sample', pointers: KEY_CORE },
  { id: 'names-shared', document: 'sample', pointers: { ...KEY_CORE, employeeName: ['W4', 'W5', 'W3'] } },
  { id: 'names-cut-short', document: 'sample', pointers: { ...KEY_CORE, employerName: ['W1'], employeeName: ['W4'] } },
  { id: 'hours-on-gross', document: 'sample', pointers: { ...KEY_CORE, hoursWorked: 'N12' } },
  { id: 'ytd-left-out', document: 'sample', pointers: NO_YTD },
  // Shown only when confirmed (DEVICE_READING.md section 6).
  { id: 'hours-rate-right', document: 'sample', pointers: KEY },
  { id: 'hours-rate-consecutive-placeholders', document: 'sample', pointers: { ...KEY, hoursWorked: 'N1', hourlyRate: 'N2' } },
  { id: 'rate-without-hours', document: 'sample', pointers: Object.fromEntries(Object.entries(KEY).filter(([k]) => k !== 'hoursWorked')) },
  { id: 'hours-rate-overtime-line', document: 'sample', pointers: { ...KEY, hoursWorked: 'N9', hourlyRate: 'N8' } },
  { id: 'net-confirmed-by-deductions', document: 'sample', pointers: { ...KEY, netPay: 'N22' } },
  { id: 'net-on-net-line-without-deductions', document: 'sample', pointers: KEY_CORE },
  { id: 'net-elsewhere-without-deductions', document: 'sample', pointers: { ...KEY_CORE, netPay: 'N10' } },
  { id: 'pay-date-on-period-start', document: 'sample', pointers: { ...KEY_CORE, payDate: 'D1' } },
  { id: 'pay-date-before-period-end', document: 'sample', pointers: { ...KEY_CORE, payDate: 'D1', periodStart: undefined } },
  // The real mistakes recorded on the device (core answers as given).
  ...[
    ['real-run3-sample-ytd-regular-line', 'sample', 'run3-sample'],
    ['real-run3-l01-ytd-regular-line', 'en-l01-1', 'run3-l01'],
    ['real-run3-l07-ytd-holiday-line', 'en-l07-3', 'run3-l07'],
    ['real-run3-l10-names-shared', 'en-l10-1', 'run3-l10'],
    ['real-run4-sample-ytd-left-out', 'sample', 'run4-sample'],
    ['real-run4-l01-ytd-left-out', 'en-l01-1', 'run4-l01'],
    ['real-run4-l07-hours-on-gross', 'en-l07-3', 'run4-l07'],
    ['real-run5-sample-employer-cut-short', 'sample', 'run5-sample-2'],
    ['real-run5-l07-names-cut-short', 'en-l07-3', 'run5-l07-2'],
    ['real-ios-0505-sample-hours-rate-neighbours', 'sample', 'ios-0505-sample'],
    ['real-ios-0511-sample-2-pay-date-on-start', 'sample', 'ios-0511-sample-2'],
    ['real-ios-0511-l01-1-consecutive-placeholders', 'en-l01-1', 'ios-0511-l01-1'],
  ].map(([id, document, key]) => ({ id, document, pointers: Object.fromEntries(Object.entries(JSON.parse(real[key].core)).filter(([, v]) => v !== null)) })),
];

/** Readings part by part, with the device's answer to each part given as text. */
export const readingCases = [
  { id: 'core-right-deductions-right', document: 'sample', answers: { core: CORE, deductions: DEDUCTIONS } },
  { id: 'deductions-empty-twice', document: 'sample', answers: { core: CORE, deductions: json({ deductions: [] }), deductionsAgain: json({ deductions: [] }) } },
  { id: 'deductions-short-then-right', document: 'sample', answers: { core: CORE, deductions: SHORT, deductionsAgain: DEDUCTIONS } },
  { id: 'deductions-short-twice', document: 'sample', answers: { core: CORE, deductions: SHORT, deductionsAgain: SHORT } },
  { id: 'deductions-unparseable', document: 'sample', answers: { core: CORE, deductions: '{"deductions": [N14' } },
  { id: 'core-not-an-option', document: 'sample', answers: { core: json({ ...KEY_CORE, payFrequency: 'fortnightly' }) } },
  { id: 'core-unparseable', document: 'sample', answers: { core: '{"grossPay": N12' } },
  { id: 'core-not-an-object', document: 'sample', answers: { core: '["N12"]' } },
  { id: 'ytd-regular-line-then-right', document: 'sample', answers: { core: json({ ...KEY_CORE, ytdGross: 'N7' }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }), deductions: DEDUCTIONS } },
  { id: 'ytd-regular-line-twice', document: 'sample', answers: { core: json({ ...KEY_CORE, ytdGross: 'N7' }), gross: json({ grossPay: 'N12', ytdGross: 'N7' }) } },
  { id: 'ytd-below-gross-twice', document: 'sample', answers: { core: json({ ...KEY_CORE, ytdGross: KEY.netPay }), gross: json({ grossPay: 'N12', ytdGross: KEY.netPay }) } },
  { id: 'gross-on-zip-then-right', document: 'sample', answers: { core: json({ ...KEY_CORE, grossPay: 'N3', ytdGross: 'N3' }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }), deductions: DEDUCTIONS } },
  { id: 'gross-on-zip-twice', document: 'sample', answers: { core: json({ ...KEY_CORE, grossPay: 'N3', ytdGross: 'N3' }), gross: json({ grossPay: 'N3', ytdGross: 'N3' }) } },
  { id: 'gross-date-placeholder-then-right', document: 'sample', answers: { core: json({ ...KEY_CORE, grossPay: 'D1' }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }), deductions: DEDUCTIONS } },
  { id: 'ytd-left-out-then-right', document: 'sample', answers: { core: json({ ...NO_YTD, ytdGross: null }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }), deductions: DEDUCTIONS } },
  { id: 'ytd-left-out-twice', document: 'sample', answers: { core: json({ ...NO_YTD, ytdGross: null }), gross: json({ grossPay: 'N12', ytdGross: null }), deductions: DEDUCTIONS } },
  { id: 'ytd-left-out-then-wrong', document: 'sample', answers: { core: json({ ...NO_YTD, ytdGross: null }), gross: json({ grossPay: 'N12', ytdGross: 'N7' }), deductions: DEDUCTIONS } },
  { id: 'extra-and-missing-keys', document: 'sample', answers: { core: json({ ...Object.fromEntries(Object.entries(KEY_CORE).filter(([k]) => k !== 'employeeName')), netPayPay: 'N1', required: ['grossPay'] }), deductions: DEDUCTIONS } },
  { id: 'names-shared', document: 'sample', answers: { core: json({ ...KEY_CORE, employeeName: ['W4', 'W5', 'W3'] }), deductions: DEDUCTIONS } },
  { id: 'names-cut-short', document: 'sample', answers: { core: json({ ...KEY_CORE, employerName: ['W1'], employeeName: ['W4'] }), deductions: DEDUCTIONS } },
  { id: 'hours-on-gross', document: 'sample', answers: { core: json({ ...KEY_CORE, hoursWorked: 'N12' }), deductions: DEDUCTIONS } },
  // Real readings; a part the device was not asked in that run is answered as the device answered it later.
  { id: 'real-run4-sample', document: 'sample', answers: { core: real['run4-sample'].core, gross: json({ grossPay: 'N12', ytdGross: 'N13' }), deductions: real['run4-sample'].deductions, deductionsAgain: real['run5-sample-2']['deductions-again'] } },
  { id: 'real-run4-l07', document: 'en-l07-3', answers: { core: real['run4-l07'].core, deductions: real['run4-l07'].deductions, deductionsAgain: real['run4-l07'].deductions } },
  { id: 'real-run5-sample-2', document: 'sample', answers: { core: real['run5-sample-2'].core, deductions: real['run5-sample-2'].deductions, deductionsAgain: real['run5-sample-2']['deductions-again'] } },
  { id: 'real-run5-l07-2', document: 'en-l07-3', answers: { core: real['run5-l07-2'].core, deductions: real['run5-l07-2'].deductions, deductionsAgain: real['run5-l07-2']['deductions-again'] } },
  { id: 'real-run3-l01', document: 'en-l01-1', answers: { core: real['run3-l01'].core, gross: real['run3-l01'].core } },
  // Real iPhone readings (Apple's on-device model): wrong secondary values that the confirmation rules leave out.
  ...['ios-0505-sample', 'ios-0505-l07', 'ios-0511-sample-2', 'ios-0511-l01-1', 'ios-0508-l01'].map((key) => {
    const a = real[key];
    const document = key.endsWith('l07') ? 'en-l07-3' : key.includes('l01') ? 'en-l01-1' : 'sample';
    return { id: `real-${key}`, document, answers: { core: a.core, ...(a.gross ? { gross: a.gross } : {}), deductions: a.deductions, deductionsAgain: a['deductions-again'] ?? a.deductions } };
  }),
  // Shown only when confirmed, part by part.
  { id: 'confirm-hours-rate-left-out', document: 'sample', answers: { core: json({ ...KEY_CORE, hoursWorked: 'N1', hourlyRate: 'N2' }), deductions: DEDUCTIONS } },
  { id: 'confirm-net-left-out-without-deductions', document: 'sample', answers: { core: json({ ...KEY_CORE, netPay: 'N10' }), deductions: SHORT, deductionsAgain: SHORT } },
  { id: 'confirm-net-kept-on-net-line', document: 'sample', answers: { core: CORE, deductions: SHORT, deductionsAgain: SHORT } },
  { id: 'confirm-pay-date-on-period-start', document: 'sample', answers: { core: json({ ...KEY_CORE, payDate: 'D1' }), deductions: DEDUCTIONS } },
  { id: 'confirm-after-gross-part', document: 'sample', answers: { core: json({ ...KEY_CORE, ytdGross: 'N7', hoursWorked: 'N7', hourlyRate: 'N4' }), gross: json({ grossPay: 'N12', ytdGross: 'N13' }), deductions: DEDUCTIONS } },
];

/**
 * Zero false alarms: every right reading of the 38 English evaluation paystubs. A port enumerates
 * every combination of the `alternatives` (each placeholder that holds the gold value) over `base`,
 * and each line's run of gold name placeholders, and must find no problem and nothing to leave out.
 */
export const goldCases = evaluation.map((d) => ({ document: d.id, base: d.base, alternatives: d.alternatives, names: d.names, deductions: d.deductions }));

/** Every right reading of a gold case (the combinations a port must enumerate). */
export function rightReadings(g) {
  const choices = (field) => (g.alternatives[field]?.length ? g.alternatives[field] : [undefined]);
  const out = [];
  for (const grossPay of choices('grossPay'))
    for (const ytdGross of choices('ytdGross'))
      for (const hoursWorked of choices('hoursWorked'))
        for (const hourlyRate of choices('hourlyRate')) {
          const r = { ...g.base, grossPay, ytdGross, hoursWorked, hourlyRate };
          out.push(Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)));
        }
  return out;
}
