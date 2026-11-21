// "Read both ways" (contract v1.44): the two answers compared value by value after rehydration.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from '../../core/types';
import { buildAllowlist, buildIntroducers, skeletonize, type AllowlistFile, type PointerSchema } from '../../core/skeleton';
import { buildReview } from '../../core/review';
import { answerOf, compareReadings } from './both';

const shared = (rel: string) => readFileSync(new URL(`../../../../shared/${rel}`, import.meta.url), 'utf8');
const schema = JSON.parse(shared('schemas/pointer.paystub.json')) as PointerSchema;
const en = JSON.parse(shared('skeleton/allowlist/en.json')) as AllowlistFile;
const doc = skeletonize(Raw.of(shared('samples/paystub-en-01.txt')), buildAllowlist([en]), buildIntroducers([en]));
const correct = (JSON.parse(shared('fixtures/conformance/rehydrate.json')) as { cases: { id: string; pointers: Record<string, unknown> }[] }).cases.find((c) => c.id === 'paystub-en-01-correct')!.pointers;
const review = (pointers: Record<string, unknown>) => buildReview(schema, pointers, doc.skeleton, doc.map);

describe('compareReadings', () => {
  it('counts every field either answered, all the same when the answers agree', () => {
    const c = compareReadings(review(correct), review(correct));
    expect(c.differs).toEqual([]);
    expect(c.same).toBe(c.total);
    expect(c.total).toBe(12);
  });

  it('leaves out what the device did not read (deductions read in a second part): 11 of 11', () => {
    const { deductions: _, ...core } = correct;
    const c = compareReadings(review(core), review(correct), ['deductions']);
    expect(c).toEqual({ total: 11, same: 11, differs: [], onlyCloud: [], onlyDevice: [] });
  });

  it('lists a field only one side answered apart, and says a field differs when both answered it with other values', () => {
    const { netPay: _, ...noNet } = correct;
    expect(compareReadings(review(noNet), review(correct))).toMatchObject({ differs: [], onlyCloud: ['netPay'], onlyDevice: [] });
    expect(compareReadings(review(correct), review(noNet))).toMatchObject({ differs: [], onlyCloud: [], onlyDevice: ['netPay'] });
    expect(compareReadings(review({ ...correct, grossPay: 'N13' }), review(correct)).differs).toEqual(['grossPay']);
  });
});

describe('answerOf', () => {
  it('gives the placeholder and the value put back here', () => {
    expect(answerOf(review(correct), 'grossPay')).toEqual({ ref: 'N12', value: '1,271.88' });
    expect(answerOf(review(correct), 'deductions')).toBeNull();
    expect(answerOf(review({}), 'grossPay')).toBeNull();
  });
});
