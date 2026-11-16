import { describe, expect, it } from 'vitest';
import { Raw } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { buildReview } from '../../core/review';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { BANDS, PACK } from '../pack';
import { buildSteps, computeVerdicts } from '../quickcheck';
import { preparedHousehold } from '../judges/household';
import { RUN_FILE_KIND, browserVersion, isRunFile, scoreFields, summarize, type CaseResult } from './run';
import answers from '../../../../shared/samples/answers.json';
import sampleText from '../../../../shared/samples/paystub-en-01.txt?raw';

describe('the on-device check', () => {
  it('reads the browser from the user agent', () => {
    expect(browserVersion('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.59 Safari/537.36')).toBe('Chrome 142.0.7444.59');
    expect(browserVersion('Mozilla/5.0 … Chrome/142.0 Safari/537.36 Edg/142.0.1')).toBe('Edge 142.0.1');
  });

  it('scores extraction against the gold answers; the answer key of the sample scores every field', () => {
    const { skeleton, map } = skeletonize(Raw.of(sampleText), allowlistFor('en'), introducersFor('en'));
    const review = buildReview(POINTER_SCHEMAS.paystub, answers.samples['paystub-en-01.txt'].pointers, skeleton, map);
    const gold = Object.fromEntries(review.map((f) => [f.name, f.kind === 'list' ? f.items.map((i) => i.value) : f.value]).filter(([, v]) => v !== null));
    const score = scoreFields(review, gold);
    expect(score.correct).toBe(score.total);
    expect(score.total).toBeGreaterThan(8);
    const wrong = scoreFields(review, { ...gold, grossPay: 1 });
    expect(wrong.correct).toBe(score.total - 1);
  });

  it('counts cloud runs as cloud runs, never as on-device ones', () => {
    const cases: CaseResult[] = [
      { id: 'a', task: 'x', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 1, outputCheck: null, fields: { correct: 9, total: 11 } },
      { id: 'b', task: 'x', mode: 'PREFER_ON_DEVICE', ran: 'IN_CLOUD', latencyMs: 1, outputCheck: 'passed' },
      { id: 'c', task: 'x', mode: 'ONLY_ON_DEVICE', ran: 'not-run', latencyMs: null, outputCheck: null, error: 'on-device-unavailable' },
    ];
    expect(summarize(cases)).toEqual({ onDevice: 1, inCloud: 1, notRun: 1, total: 3, fieldsCorrect: 9, fieldsTotal: 11 });
  });

  it('recognises a run file', () => {
    expect(isRunFile({ kind: RUN_FILE_KIND, date: '2026-11-17T10:00:00Z', cases: [] })).toBe(true);
    expect(isRunFile({ kind: 'other', date: 'x', cases: [] })).toBe(false);
  });
});

describe('the prepared household of the judges\' path', () => {
  it('answers only questions the pack asks, with values it accepts, and gets results from the rules', () => {
    const steps = buildSteps(PACK, BANDS);
    const household = preparedHousehold(steps);
    for (const id of Object.keys(household)) expect(steps.some((s) => s.id === id)).toBe(true);
    expect(household['income']).toEqual({ kind: 'exact', amount: 30524 });
    const results = computeVerdicts(PACK, BANDS, steps, household);
    expect(results.length).toBe(PACK.programs.length);
    expect(results.some((r) => r.verdict === 'likely' || r.verdict === 'maybe')).toBe(true);
  });
});
