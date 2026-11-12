// Real cloud calls for explanations and prepared questions on synthetic profiles, through the app's
// own code (planExplain / planAskChip → explainProgram / askChip). No grounding, no speech.
//   node eval/answers.mjs [--gap 4000] [--only p1-food-short,p2-work-short]
// Checks every answer for: provenance, length, "may qualify" wording, numbers that were not in the
// input, the answer language, and leaks (the exact income never appears in a request).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const RESULTS = new URL('results/', import.meta.url);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const gapMs = Number(arg('gap', '4000'));

const P1 = { jurisdiction: 'zz-test', annualIncome: 21000, householdSize: 3, housing: 'renter' };
const P2 = { jurisdiction: 'zz-test', incomeBand: 'D', householdSize: 1, housing: 'owner' };
const P3 = { jurisdiction: 'zz-test', annualIncome: 8000, householdSize: 7, housing: 'other' };
const CASES = [
  { id: 'p1-utility-short', profile: P1, programId: 'utility-discount', locale: 'en', kind: 'short' },
  { id: 'p1-utility-long', profile: P1, programId: 'utility-discount', locale: 'en', kind: 'long' },
  { id: 'p1-food-short', profile: P1, programId: 'food-help', locale: 'en', kind: 'short' },
  { id: 'p1-utility-apply', profile: P1, programId: 'utility-discount', locale: 'en', kind: 'chip', question: 'How do I apply?' },
  { id: 'p1-utility-documents', profile: P1, programId: 'utility-discount', locale: 'en', kind: 'chip', question: 'What papers might I need?' },
  { id: 'p2-work-short', profile: P2, programId: 'work-credit', locale: 'en', kind: 'short' },
  { id: 'p2-phone-long', profile: P2, programId: 'phone-discount', locale: 'en', kind: 'long' },
  { id: 'p3-senior-short', profile: P3, programId: 'senior-food', locale: 'en', kind: 'short' },
  { id: 'p3-senior-change', profile: P3, programId: 'senior-food', locale: 'en', kind: 'chip', question: 'What could change this result?' },
  { id: 'p1-utility-short-es', profile: P1, programId: 'utility-discount', locale: 'es', kind: 'short' },
  { id: 'p1-utility-short-ko', profile: P1, programId: 'utility-discount', locale: 'ko', kind: 'short' },
  { id: 'p2-work-offer-es', profile: P2, programId: 'work-credit', locale: 'es', kind: 'chip', question: '¿Qué ofrece este programa?' },
];
const only = arg('only', null);
const SELECTED = only === null ? CASES : CASES.filter((c) => only.split(',').includes(c.id));
const MAX_WORDS = { short: 60, long: 180, chip: 80 };

const ledgerFile = new URL('calls.json', RESULTS);
const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : { total: 0, runs: [] };

const server = await createServer({
  root: ROOT,
  configFile: `${ROOT}/vite.config.ts`,
  server: { port: 5191, strictPort: true, hmr: false, watch: null },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(() => {
  delete window.LanguageModel;
});
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text().replace(/debug token: .*/i, 'debug token: [redacted]'));
});
const bodies = [];
page.on('request', (r) => {
  if (r.url().includes('firebasevertexai.googleapis.com')) bodies.push(r.postData() ?? '');
});
await page.goto('http://localhost:5191/eval/runner.html');
await page.waitForFunction(() => document.body.dataset.ready === 'true');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const words = (text) => text.split(/\s+/).filter(Boolean).length;
const rows = [];
let calls = 0;
try {
  for (const c of SELECTED) {
    if (calls > 0) await sleep(gapMs);
    const before = bodies.length;
    let out;
    for (let attempt = 0; attempt < 3; attempt++) {
      calls++;
      out = await page.evaluate((i) => window.evalAnswer(i), c);
      if (out.ok || out.kind !== 'quota') break;
      if (/per.?day|daily/i.test(out.detail ?? '') || attempt >= 1) throw new Error('quota looks daily, stopping');
      await sleep(20000);
    }
    const sent = bodies.slice(before).join('\n');
    const checks = {};
    if (out.ok) {
      const n = words(out.text);
      checks.words = `${n}/${MAX_WORDS[c.kind]}`;
      checks.withinLength = n <= Math.ceil(MAX_WORDS[c.kind] * 1.2);
      checks.saysQualifies = /\b(you|they) qualify\b|\bqualifies\b/i.test(out.text) && !/may qualify/i.test(out.text);
      const inputNumbers = new Set(out.prompt.match(/\d[\d,.]*/g) ?? []);
      checks.numbersNotInInput = (out.text.match(/\d[\d,.]*\d|\d/g) ?? []).filter((x) => !inputNumbers.has(x));
      if (c.locale === 'ko') checks.language = /[가-힣]/.test(out.text);
      if (c.locale === 'es') checks.language = /\b(usted|puede|programa|ingresos|hogar|para)\b/i.test(out.text);
      if (c.locale === 'en') checks.language = /\b(you|the|program)\b/i.test(out.text);
    }
    const exactIncome = typeof c.profile.annualIncome === 'number' ? String(c.profile.annualIncome) : null;
    checks.exactIncomeSent = exactIncome !== null && (sent.includes(exactIncome) || sent.includes(Number(exactIncome).toLocaleString('en')));
    rows.push({ ...c, ...out, checks });
    console.log(
      `${c.id.padEnd(22)} ${out.ok ? 'ok ' : 'ERR'} ${out.taskId} ${out.ok ? `${out.inferenceSource} ${out.reason} ${checks.words} ${out.latencyMs}ms` : `${out.kind} ${out.detail?.slice(0, 120)}`}`,
    );
  }
} finally {
  ledger.total += calls;
  ledger.runs.push({ date: new Date().toISOString(), task: 'explain/ask.chip', documents: SELECTED.length, calls });
  writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
  writeFileSync(new URL(only === null ? 'answers.json' : 'answers.only.json', RESULTS), JSON.stringify({ date: new Date().toISOString(), rows }, null, 2) + '\n');
  console.log(`calls this run: ${calls}, total so far: ${ledger.total}`);
  await browser.close();
  await server.close();
}
