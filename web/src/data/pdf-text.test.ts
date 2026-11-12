// Generates the sample PDFs from shared/samples and extracts them with pdf.js (Node build).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeTextPdf } from '../../scripts/text-pdf.mjs';
import { linesFromRuns, type TextRun } from './pdf-text';

const sample = (name: string) => readFileSync(new URL(`../../../shared/samples/${name}`, import.meta.url), 'utf8');

async function extract(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const runs: TextRun[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    runs.push({ str: item.str, x: item.transform[4] as number, y: item.transform[5] as number, width: item.width, height: item.height || 9 });
  }
  await task.destroy();
  return linesFromRuns(runs);
}

const normalizeLines = (t: string) => t.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');

describe('sample PDFs through pdf.js', () => {
  for (const name of ['paystub-en-01.txt', 'payslip-ko-01.txt', '../fixtures/canary/paystub-canary-01.txt']) {
    it(`${name}: extracted text equals the source text`, async () => {
      const text = sample(name);
      expect(await extract(makeTextPdf(text))).toBe(normalizeLines(text));
    });
  }
});

describe('linesFromRuns', () => {
  it('orders lines top to bottom and restores gaps as spaces', () => {
    const runs: TextRun[] = [
      { str: 'Net', x: 10, y: 100, width: 18, height: 9 },
      { str: '9.00', x: 46, y: 100, width: 24, height: 9 },
      { str: 'Gross', x: 10, y: 112, width: 30, height: 9 },
    ];
    expect(linesFromRuns(runs)).toBe('Gross\nNet   9.00');
  });
});
