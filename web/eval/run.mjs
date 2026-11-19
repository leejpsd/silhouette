// Extraction evaluation: runs document.pointer.extract against the real Firebase AI Logic cloud
// model for every document in eval/dataset/ and scores the result.
//
//   npm run eval -- --variants v0,v1 [--set en|ko|lease|all] [--limit N] [--gap 4000] [--budget 1500] [--resume]
//
// It starts the Vite dev server (which reads the App Check debug token from .env.local), opens
// eval/runner.html in headless Chromium and calls the app's own pipeline there. Requests are
// sequential with a minimum gap and exponential backoff on HTTP 429.

import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { aggregate, scoreDocument, targetMet, TARGET_FIELDS } from './score.mjs';
import { VARIANTS } from './variant-list.mjs';
import { appears, goldStrings } from './leaks.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// --dataset heldout reads eval/heldout/ (written independently of the prompts, word lists and tuning documents).
const DATASET = new URL(process.argv.includes('--dataset') && process.argv[process.argv.indexOf('--dataset') + 1] === 'heldout' ? 'heldout/' : 'dataset/', import.meta.url);
const RESULTS = new URL('results/', import.meta.url);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const variantIds = arg('variants', 'v0').split(',');
const set = arg('set', 'all');
const limit = Number(arg('limit', '0'));
const gapMs = Number(arg('gap', '4000'));
const budget = Number(arg('budget', '1500'));
const ledgerFile = new URL('calls.json', RESULTS);
const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : { total: 0, runs: [] };

const manifest = JSON.parse(readFileSync(new URL('manifest.json', DATASET), 'utf8')).filter((d) => {
  if (set === 'all') return true;
  if (set === 'en') return d.docType === 'paystub' && d.language === 'en';
  if (set === 'ko') return d.docType === 'paystub' && d.language === 'ko';
  if (set === 'en+lease') return d.language === 'en';
  return d.docType === set;
});
const docs = limit ? manifest.slice(0, limit) : manifest;
const schemaFields = {
  paystub: Object.keys(JSON.parse(readFileSync(new URL('../../shared/schemas/pointer.paystub.json', import.meta.url), 'utf8')).properties),
  lease: Object.keys(JSON.parse(readFileSync(new URL('../../shared/schemas/pointer.lease.json', import.meta.url), 'utf8')).properties),
  w2: Object.keys(JSON.parse(readFileSync(new URL('../../shared/schemas/pointer.w2.json', import.meta.url), 'utf8')).properties),
};

for (const id of variantIds) if (!VARIANTS[id]) throw new Error(`unknown variant ${id}; known: ${Object.keys(VARIANTS).join(', ')}`);
const planned = docs.length * variantIds.length;
if (ledger.total + planned > budget) throw new Error(`budget: ${ledger.total} calls used, ${planned} planned, budget ${budget}`);

// No file watching and no hot reload: editing files during a long run must not reload the page.
const server = await createServer({
  root: ROOT,
  configFile: `${ROOT}/vite.config.ts`,
  server: { port: 5190, strictPort: true, hmr: false, watch: null },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext();
// The evaluation is about the cloud path; make sure no on-device model download can start.
await context.addInitScript(() => {
  delete window.LanguageModel;
});
const page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.error('[page]', m.text().replace(/debug token: .*/i, 'debug token: [redacted]'));
});
async function openRunner() {
  await page.goto('http://localhost:5190/eval/runner.html');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
}
await openRunner();
const resume = process.argv.includes('--resume');

// Leak check: every request body that goes to AI Logic while a document is processed.
let currentBodies = [];
page.on('request', (r) => {
  if (r.url().includes('firebasevertexai.googleapis.com')) currentBodies.push(r.postData() ?? '');
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastStart = 0;
let calls = 0;

async function call(input) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastStart + gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    calls++;
    let out;
    try {
      out = await page.evaluate((i) => window.evalExtract(i), input);
    } catch (error) {
      // The page went away (navigation or crash): reopen it and retry this document once more.
      console.error(`  page error: ${String(error).split('\n')[0]}; reopening`);
      await openRunner();
      if (attempt >= 2) return { ok: false, kind: 'runner', detail: String(error).split('\n')[0], latencyMs: 0, attempts: attempt + 1 };
      continue;
    }
    // A daily quota does not recover with back-off: stop rather than keep calling.
    if (out.kind === 'quota' && (/per.?day|daily/i.test(out.detail ?? '') || attempt >= 3)) {
      throw new Error(`quota looks daily, stopping: ${(out.detail ?? '').slice(0, 200)}`);
    }
    const retryable = out.kind === 'quota' || (typeof out.status === 'number' && out.status >= 500) || /\b50[0-9]\b/.test(out.detail ?? '');
    if (out.ok || !retryable || attempt >= 5) return { ...out, attempts: attempt + 1 };
    const backoff = 15000 * 2 ** attempt;
    console.log(`  ${out.kind === 'quota' ? '429' : 'server error'}, backing off ${backoff / 1000}s`);
    await sleep(backoff);
  }
}

try {
  for (const variantId of variantIds) {
    const spec = { id: variantId, ...VARIANTS[variantId] };
    console.log(`variant ${variantId}: ${JSON.stringify(spec)}`);
    const scored = [];
    const partialFile = new URL(`${variantId}.partial.jsonl`, RESULTS);
    const done = new Map();
    if (resume && existsSync(partialFile)) {
      for (const line of readFileSync(partialFile, 'utf8').split('\n').filter(Boolean)) {
        const row = JSON.parse(line);
        if (JSON.stringify(row.spec) === JSON.stringify(spec) && row.ok) done.set(row.id, row);
      }
      console.log(`  resuming: ${done.size} documents already done`);
    } else writeFileSync(partialFile, '');
    for (const doc of docs) {
      if (done.has(doc.id)) {
        scored.push(done.get(doc.id));
        continue;
      }
      const text = readFileSync(new URL(`${doc.id}.txt`, DATASET), 'utf8');
      const gold = JSON.parse(readFileSync(new URL(`${doc.id}.gold.json`, DATASET), 'utf8'));
      currentBodies = [];
      const out = await call({ text, docType: doc.docType, language: doc.language, spec });
      const sent = currentBodies.join('\n');
      const leaks = goldStrings(gold, text, doc.language).filter((v) => appears(sent, v));
      const score = out.ok ? scoreDocument(schemaFields[doc.docType], gold, out.rehydrated, out.pointers) : null;
      const scoreRaw = out.ok && out.rehydratedRaw ? scoreDocument(schemaFields[doc.docType], gold, out.rehydratedRaw, out.pointers) : null;
      const scoreTidy = out.ok && out.rehydratedTidy ? scoreDocument(schemaFields[doc.docType], gold, out.rehydratedTidy, out.pointers) : null;
      const row = { ...doc, ...out, gold, score, scoreRaw, scoreTidy, spec, requests: currentBodies.length, requestBodies: currentBodies, leaks };
      scored.push(row);
      appendFileSync(partialFile, JSON.stringify(row) + '\n');
      const fails = score ? Object.entries(score.outcomes).filter(([, o]) => o !== 'correct' && o !== 'absent').map(([f, o]) => `${f}:${o}`) : [out.kind];
      if (score?.deductions && !score.deductions.exact) fails.push(`deductions:${score.deductions.matched}/${score.deductions.gold}+${score.deductions.extra}`);
      if (leaks.length) fails.push(`LEAK:${leaks.join('|')}`);
      console.log(`  ${doc.id.padEnd(16)} ${out.ok ? `${String(out.latencyMs).padStart(5)}ms` : 'ERROR  '} ${fails.join(' ') || 'all correct'}`);
    }
    const groups = {
      enPaystub: scored.filter((d) => !d.heldout && d.docType === 'paystub' && d.language === 'en' && d.layout !== 'L11'),
      enRules: scored.filter((d) => d.layout === 'L11'),
      koPaystub: scored.filter((d) => d.docType === 'paystub' && d.language === 'ko'),
      lease: scored.filter((d) => d.docType === 'lease'),
      heldoutPaystub: scored.filter((d) => d.heldout && d.docType === 'paystub'),
      heldoutW2: scored.filter((d) => d.heldout && d.docType === 'w2'),
    };
    const metrics = Object.fromEntries(Object.entries(groups).filter(([, g]) => g.length).map(([k, g]) => [k, aggregate(g)]));
    // The same answers scored without and with the on-device name clean-up (src/core/tidy.ts).
    const allCorrectOf = (rows, key) => rows.filter((d) => d[key]?.allCorrect).length / Math.max(1, rows.length);
    const cleanUp = Object.fromEntries(
      Object.entries(groups).filter(([, g]) => g.length).map(([k, g]) => [k, { without: allCorrectOf(g, 'scoreRaw'), with: allCorrectOf(g, 'scoreTidy') }]),
    );
    console.log(`  all fields correct without / with clean-up: ${Object.entries(cleanUp).map(([k, v]) => `${k} ${(v.without * 100).toFixed(1)}% / ${(v.with * 100).toFixed(1)}%`).join(', ')}`);
    const leakCheck = { documents: scored.length, requestBodies: scored.reduce((a, d) => a + (d.requests ?? 0), 0), leaks: scored.flatMap((d) => (d.leaks ?? []).map((v) => `${d.id}: ${v}`)) };
    console.log(`  leak check: ${leakCheck.requestBodies} request bodies, ${leakCheck.leaks.length} gold values found`);
    const result = { variant: variantId, spec, date: new Date().toISOString(), set, metrics, cleanUp, leakCheck, targetMet: metrics.enPaystub ? targetMet(metrics.enPaystub) : null, documents: scored };
    writeFileSync(new URL(`${variantId}.json`, RESULTS), JSON.stringify(result, null, 2) + '\n');
    const en = metrics.enPaystub;
    if (en && TARGET_FIELDS.every((f) => en.fields[f])) {
      console.log(`  en paystubs: all-fields-correct ${(en.allFieldsCorrect * 100).toFixed(1)}%, ` +
        TARGET_FIELDS.map((f) => `${f} R ${(en.fields[f].recall * 100).toFixed(1)}% W ${(en.fields[f].wrongRate * 100).toFixed(1)}%`).join(', '));
    }
  }
} finally {
  ledger.total += calls;
  ledger.runs.push({ date: new Date().toISOString(), variants: variantIds, set, documents: docs.length, calls });
  writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`calls this run: ${calls}, total so far: ${ledger.total}`);
  await browser.close();
  await server.close();
}

// Summary table across every variant result present.
const rows = readdirSync(RESULTS)
  .filter((f) => /^[a-z0-9-]+\.json$/.test(f) && f !== 'calls.json')
  .map((f) => JSON.parse(readFileSync(new URL(f, RESULTS), 'utf8')))
  // Variant results on eval/dataset/ only: the answers files and the held-out results have their own reports.
  .filter((r) => typeof r.variant === 'string' && r.metrics?.enPaystub)
  .sort((a, b) => a.variant.localeCompare(b.variant, 'en', { numeric: true }));
const pctOf = (x) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(1)}%`);
const lines = [
  '# Extraction evaluation results',
  '',
  'Generated by `npm run eval`. English paystubs (the 30 documents of layouts L01–L10), `document.pointer.extract` in the cloud.',
  'Leak check: no gold name, date or amount (as printed in the document) may appear in any request body sent for it.',
  'R = recall, W = wrong-pointer rate (wrong or spurious value per document). Target: R ≥ 95 % and W ≤ 2 % on',
  'grossPay, netPay, ytdGross and payFrequency, and all fields correct on ≥ 80 % of documents.',
  '',
  '| Variant | Model | Skeletons | All fields correct | grossPay R / W | netPay R / W | ytdGross R / W | payFrequency R / W | Deduction items R | Prompt / output / thought tokens | Median latency | Target |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows
    .filter((r) => r.metrics.enPaystub)
    .map((r) => {
      const m = r.metrics.enPaystub;
      const f = (k) => `${pctOf(m.fields[k]?.recall)} / ${pctOf(m.fields[k]?.wrongRate)}`;
      const skeletons = r.spec.skeletons ?? (r.leakCheck ? 'v1.3' : 'v1.2');
      return `| ${r.variant} | ${r.spec.model ?? 'gemini-3.5-flash-lite'}${r.spec.thinkingLevel ? ` (${r.spec.thinkingLevel})` : ''} | ${skeletons} | ${pctOf(m.allFieldsCorrect)} | ${f('grossPay')} | ${f('netPay')} | ${f('ytdGross')} | ${f('payFrequency')} | ${pctOf(m.deductions?.itemRecall)} | ${m.tokens.prompt} / ${m.tokens.output} / ${m.tokens.thoughts} | ${m.latencyMs?.median ?? '–'} ms | ${r.targetMet ? 'met' : 'not met'} |`;
    }),
  '',
  '## Other sets',
  '',
  'English layout L11 (added for contract v1.3): names containing label words, an e-mail address and phone number in the',
  'header, month-name dates, pay frequency written in words.',
  '',
  '| Variant | Set | Documents | All fields correct | Field recall (all fields) | Wrong values |',
  '|---|---|---|---|---|---|',
  ...rows.flatMap((r) =>
    ['enRules', 'koPaystub', 'lease']
      .filter((k) => r.metrics[k])
      .map((k) => {
        const m = r.metrics[k];
        const totals = Object.values(m.fields).reduce((a, x) => ({ c: a.c + x.correct, g: a.g + x.correct + x.missing + x.wrong, w: a.w + x.wrong + x.spurious }), { c: 0, g: 0, w: 0 });
        const name = k === 'lease' ? 'leases' : k === 'enRules' ? 'English, layout L11' : 'Korean payslips';
        return `| ${r.variant} | ${name} | ${m.documents} | ${pctOf(m.allFieldsCorrect)} | ${pctOf(totals.c / totals.g)} | ${totals.w} |`;
      }),
  ),
  '',
];
writeFileSync(new URL('summary.md', RESULTS), lines.join('\n'));
console.log('wrote eval/results/summary.md');
