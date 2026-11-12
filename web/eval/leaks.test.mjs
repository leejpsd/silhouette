// The leak check finds gold values in raw text (so it can fail), and finds none in the skeletons.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { skeletonize } from '../../shared/reference/silhouette.mjs';
import { appears, goldStrings } from './leaks.mjs';

const manifest = JSON.parse(readFileSync(new URL('dataset/manifest.json', import.meta.url), 'utf8'));
const shared = (rel) => readFileSync(new URL(`../../shared/${rel}`, import.meta.url), 'utf8');
const allow = (lang) => new Set(['en', lang].flatMap((l) => JSON.parse(shared(`skeleton/allowlist/${l}.json`)).words));
const introducers = (lang) => new Set(['en', lang].flatMap((l) => JSON.parse(shared(`skeleton/allowlist/${l}.json`)).introducers ?? []));
const docs = manifest.map((doc) => ({
  ...doc,
  text: readFileSync(new URL(`dataset/${doc.id}.txt`, import.meta.url), 'utf8'),
  gold: JSON.parse(readFileSync(new URL(`dataset/${doc.id}.gold.json`, import.meta.url), 'utf8')),
}));

describe('dataset leak check', () => {
  it('detects every gold value when the raw document is sent', () => {
    for (const d of docs) {
      const values = goldStrings(d.gold, d.text, d.language);
      expect(values.length, d.id).toBeGreaterThan(5);
      for (const v of values) expect(appears(d.text, v), `${d.id}: ${v}`).toBe(true);
    }
  });

  it('finds no gold name, date or amount in any skeleton of the 48 documents', () => {
    const found = [];
    for (const d of docs) {
      const { skeleton } = skeletonize(d.text, allow(d.language), introducers(d.language));
      for (const v of goldStrings(d.gold, d.text, d.language)) if (appears(skeleton, v)) found.push(`${d.id}: ${v}`);
    }
    expect(found).toEqual([]);
  });

  it('matches short values only as whole words or numbers', () => {
    expect(appears('Federal Income Tax', 'Inc')).toBe(false);
    expect(appears('NORTHWIND INC', 'INC')).toBe(true);
    expect(appears('11,000.00', '1,000.00')).toBe(true); // long values: any occurrence
    expect(appears('pay 900 now', '900')).toBe(true);
    expect(appears('pay 1900 now', '900')).toBe(false);
  });
});
