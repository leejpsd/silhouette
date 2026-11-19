// Records one real cloud reading of the bundled English sample paystub, for routing.json `recordedSample`
// (cloud): the exact request body the app sent to Firebase AI Logic (the silhouette, the prompt and the
// response schema) and the response it got back. The request's URL query and headers (where keys and App
// Check tokens travel) are not kept.
//
//   node eval/record-cloud.mjs
//
// Writes eval/results/cloud-recording/sample-cloud-<date>.json.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { VARIANTS } from './variant-list.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SAMPLE = readFileSync(new URL('../../shared/samples/paystub-en-01.txt', import.meta.url), 'utf8');
const sdk = JSON.parse(readFileSync(new URL('../node_modules/firebase/package.json', import.meta.url), 'utf8')).version;

const server = await createServer({ root: ROOT, configFile: `${ROOT}/vite.config.ts`, server: { port: 5190, strictPort: true, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addInitScript(() => {
  delete window.LanguageModel;
});
const page = await context.newPage();
const exchanges = [];
page.on('response', async (res) => {
  const req = res.request();
  if (!req.url().includes('firebasevertexai.googleapis.com')) return;
  const url = new URL(req.url());
  exchanges.push({ path: url.pathname, status: res.status(), requestBody: req.postData() ?? '', responseBody: await res.text().catch(() => '') });
});
try {
  await page.goto('http://localhost:5190/eval/runner.html');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  const spec = { id: 'h37', ...VARIANTS.h37 };
  const out = await page.evaluate((i) => window.evalExtract(i), { text: SAMPLE, docType: 'paystub', language: 'en', spec });
  await page.waitForTimeout(500);
  if (!out.ok) throw new Error(`the cloud reading failed: ${out.kind}`);
  const ok = exchanges.filter((e) => e.status === 200);
  if (ok.length !== 1) throw new Error(`expected one answered request, got ${exchanges.length} (${ok.length} answered)`);
  const date = new Date().toISOString();
  const recording = {
    kind: 'silhouette-cloud-recording',
    version: 1,
    date,
    document: 'shared/samples/paystub-en-01.txt',
    task: 'document.pointer.extract',
    mode: 'ONLY_IN_CLOUD',
    prompt: 'shared/prompts/pointer-extract.v5.md',
    sdk: `firebase ${sdk}`,
    endpoint: ok[0].path,
    inferenceSource: out.inferenceSource,
    latencyMs: out.latencyMs,
    requestBody: ok[0].requestBody,
    responseBody: ok[0].responseBody,
    pointers: out.pointers,
  };
  mkdirSync(new URL('results/cloud-recording/', import.meta.url), { recursive: true });
  const file = new URL(`results/cloud-recording/sample-cloud-${date.slice(0, 10)}.json`, import.meta.url);
  writeFileSync(file, JSON.stringify(recording, null, 2) + '\n');
  console.log(`recorded: ${fileURLToPath(file)} (${out.inferenceSource}, ${out.latencyMs} ms)`);
} finally {
  await browser.close();
  await server.close();
}
