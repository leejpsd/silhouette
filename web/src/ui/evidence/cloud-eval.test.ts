import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recompute, type CloudEvalFile } from './cloud-eval';

const file = JSON.parse(readFileSync(new URL('../../../eval/results/v15p4.json', import.meta.url), 'utf8')) as CloudEvalFile;
const words = Object.fromEntries(
  ['en', 'es', 'ko'].map((l) => [
    l,
    new Set((JSON.parse(readFileSync(new URL(`../../../../shared/skeleton/allowlist/${l}.json`, import.meta.url), 'utf8')) as { words: string[] }).words),
  ]),
);

describe('the cloud evaluation, recomputed from its own file', () => {
  it('gives the figures the tasks page shows: 30 of 30 read right, 0 of 39 bodies with a value', () => {
    const r = recompute(file, words);
    expect(r.paystubs).toBe(30);
    expect(r.allRight).toBe(30);
    expect(r.bodies).toBe(39);
    expect(r.bodiesWithValue).toBe(0);
    expect(r.valuesSearched).toBeGreaterThan(500);
  });

  it('would catch a value in a body', () => {
    const doc = file.documents[0]!;
    const leaky: CloudEvalFile = { date: file.date, documents: [{ ...doc, requestBodies: [{ text: `gross ${String(doc.gold['grossPay'])}` }] }] };
    expect(recompute(leaky, words).bodiesWithValue).toBe(1);
  });
});

describe('the same strings as the evaluation script', () => {
  it('matches goldStrings from web/eval/leaks.mjs for every document', async () => {
    // @ts-expect-error: a plain .mjs module without types
    const { goldStrings } = (await import('../../../eval/leaks.mjs')) as { goldStrings: (g: unknown, t: string, l: string) => string[] };
    const { valueStrings } = await import('./cloud-eval');
    for (const doc of file.documents) {
      const mine = valueStrings(doc.gold, doc.language, words);
      // goldStrings keeps only the strings found in the text it is given; give it all of them.
      const theirs = goldStrings(doc.gold, mine.join('\n'), doc.language);
      expect(new Set(mine)).toEqual(new Set(theirs));
    }
  });
});
