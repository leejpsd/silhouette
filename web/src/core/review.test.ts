import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { Raw } from './types';
import { buildAllowlist, skeletonize, type AllowlistFile, type PointerSchema } from './skeleton';
import { buildReview, placeholderCounts } from './review';

const shared = (rel: string) => readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8');
const schema = JSON.parse(shared('schemas/pointer.paystub.json')) as PointerSchema;
const allow = buildAllowlist(['en'].map((l) => JSON.parse(shared(`skeleton/allowlist/${l}.json`)) as AllowlistFile));
const rehydrateFixture = JSON.parse(shared('fixtures/conformance/rehydrate.json')) as {
  cases: { id: string; pointers: unknown; expected: Record<string, unknown> }[];
};

describe('review model', () => {
  const doc = skeletonize(Raw.of(shared('samples/paystub-en-01.txt')), allow);
  const fixtureCase = rehydrateFixture.cases.find((c) => c.id === 'paystub-en-01-correct')!;
  const review = buildReview(schema, fixtureCase.pointers, doc.skeleton, doc.map);
  const field = (name: string) => review.find((f) => f.name === name)!;

  it('gives the same values as rehydrate() for every field', () => {
    for (const f of review) {
      const expected = fixtureCase.expected[f.name];
      if (f.kind === 'list') expect(f.items.map((i) => i.value)).toEqual(expected ?? []);
      else expect(f.value).toEqual(expected ?? null);
    }
  });

  it('shows the source line with the referenced token highlighted', () => {
    const gross = field('grossPay');
    expect(gross.refs).toEqual(['N12']);
    expect(gross.source).toHaveLength(1);
    const line = gross.source[0]!;
    expect(line.map((s) => s.text).join('')).toBe('Gross Pay                             1,271.88       23,103.25');
    expect(line.filter((s) => s.highlight).map((s) => s.text)).toEqual(['1,271.88']);
  });

  it('marks fields without a usable pointer as not found', () => {
    const bad = rehydrateFixture.cases.find((c) => c.id === 'paystub-en-01-bad-refs')!;
    const r = buildReview(schema, bad.pointers, doc.skeleton, doc.map);
    expect(r.find((f) => f.name === 'grossPay')).toMatchObject({ value: null, refs: [], source: [] });
    expect(r.find((f) => f.name === 'payFrequency')).toMatchObject({ value: null });
    expect(r.find((f) => f.name === 'deductions')!.items).toHaveLength(1);
  });

  it('counts placeholders for the preview (matches the skeleton fixture map)', () => {
    const skeletonFixture = JSON.parse(shared('fixtures/conformance/skeleton.json')) as {
      cases: { id: string; expected: { map: Record<string, string> } }[];
    };
    const ids = Object.keys(skeletonFixture.cases.find((c) => c.id === 'paystub-en-01')!.expected.map);
    const count = (k: string) => ids.filter((id) => id.startsWith(k)).length;
    expect(placeholderCounts(doc.skeleton)).toEqual({ D: count('D'), N: count('N'), W: count('W') });
  });
});
