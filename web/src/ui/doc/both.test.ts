// "Read both ways" (contract v1.44): the two answers compared value by value after rehydration.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from '../../core/types';
import { buildAllowlist, buildIntroducers, skeletonize, type AllowlistFile, type PointerSchema } from '../../core/skeleton';
import { buildReview } from '../../core/review';
import { TaskError } from '../../ai/errors';
import { CloudTimeout } from '../../ai/tasks';
import { answerOf, bothNote, cloudFallbackOf, compareReadings, type BothReadings } from './both';

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

describe('cloudFallbackOf (review.both.fallback.*)', () => {
  it('names why the live cloud reading did not complete', () => {
    expect(cloudFallbackOf(new Error('Not sent: App Check could not confirm this app, so the request was stopped before it left'))).toBe('appCheck');
    expect(cloudFallbackOf(new TaskError('app-check', 'Firebase App Check token is invalid.', 401))).toBe('appCheck');
    expect(cloudFallbackOf(Object.assign(new Error('Resource exhausted'), { customErrorData: { status: 429 } }))).toBe('quota');
    expect(cloudFallbackOf(new TaskError('quota-daily', 'per day'))).toBe('quota');
    expect(cloudFallbackOf(new TypeError('Failed to fetch'))).toBe('network');
    expect(cloudFallbackOf(new CloudTimeout('no answer within 20000 ms'))).toBe('timeout');
    expect(cloudFallbackOf(Object.assign(new Error('Internal'), { customErrorData: { status: 500 } }))).toBe('other');
    expect(cloudFallbackOf(new TaskError('bad-output', 'not JSON'))).toBe('other');
  });
});

describe('bothNote', () => {
  const half = { review: [], notRead: [] };
  const both = (deviceLive: boolean, cloudLive: boolean): BothReadings => ({
    device: { ...half, live: deviceLive },
    cloud: { live: cloudLive, model: 'm', review: [] },
  });
  it('says which halves were read now', () => {
    expect(bothNote(both(true, true))).toBe('review.both.noteBothLive');
    expect(bothNote(both(false, true))).toBe('review.both.noteCloudLive');
    expect(bothNote(both(true, false))).toBe('review.both.noteLive');
    expect(bothNote(both(false, false))).toBe('review.both.note');
  });
});
