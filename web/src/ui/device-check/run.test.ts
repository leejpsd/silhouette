import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { buildReview } from '../../core/review';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { BANDS, PACK } from '../pack';
import { buildSteps, computeVerdicts } from '../quickcheck';
import { preparedHousehold } from '../judges/household';
import { RUN_FILE_KIND, browserVersion, isRunFile, runFileName, scoreFields, summarize, type CaseResult } from './run';
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

  it('version 2: where each case was finally answered; cloud retries counted as cloud, the first attempt kept apart', () => {
    const cases: CaseResult[] = [
      { id: 'a', task: 'x', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 1, outputCheck: null, fields: { correct: 4, total: 12 }, final: { ran: 'IN_CLOUD', fields: { correct: 12, total: 12 }, retried: true } },
      { id: 'b', task: 'x', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 1, outputCheck: null, fields: { correct: 12, total: 12 }, final: { ran: 'ON_DEVICE', fields: { correct: 12, total: 12 }, retried: false } },
    ];
    expect(summarize(cases, 2)).toMatchObject({ onDevice: 1, inCloudAfterDevice: 1, inCloud: 0, firstOnDevice: 2, fieldsCorrect: 16, fieldsTotal: 24, finalCorrect: 24, retriedInCloud: 1 });
  });

  it('version 3: `ran` is the final location, the first attempt is under `first`, deductions not read are counted', () => {
    const cases: CaseResult[] = [
      { id: 'a', task: 'x', mode: 'PREFER_ON_DEVICE', ran: 'IN_CLOUD', latencyMs: 1, outputCheck: null, first: { ran: 'ON_DEVICE', fields: { correct: 9, total: 12 } }, final: { ran: 'IN_CLOUD', fields: { correct: 12, total: 12 }, retried: true, deductionsNotRead: false } },
      { id: 'b', task: 'x', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 1, outputCheck: null, first: { ran: 'ON_DEVICE', fields: { correct: 11, total: 12 } }, final: { ran: 'ON_DEVICE', fields: { correct: 11, total: 12 }, retried: false, deductionsNotRead: true } },
      { id: 'c', task: 'y', mode: 'PREFER_IN_CLOUD', ran: 'IN_CLOUD', latencyMs: 1, outputCheck: 'passed' },
    ];
    expect(summarize(cases, 3)).toEqual({
      onDevice: 1,
      inCloudAfterDevice: 1,
      inCloud: 1,
      notRun: 0,
      total: 3,
      firstOnDevice: 2,
      fieldsCorrect: 20,
      fieldsTotal: 24,
      finalCorrect: 23,
      retriedInCloud: 1,
      deductionsNotRead: 1,
    });
  });

  it('counts cloud runs as cloud runs, never as on-device ones', () => {
    const cases: CaseResult[] = [
      { id: 'a', task: 'x', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 1, outputCheck: null, first: { ran: 'ON_DEVICE', fields: { correct: 9, total: 11 } } },
      { id: 'b', task: 'x', mode: 'PREFER_ON_DEVICE', ran: 'IN_CLOUD', latencyMs: 1, outputCheck: 'passed' },
      { id: 'c', task: 'x', mode: 'ONLY_ON_DEVICE', ran: 'not-run', latencyMs: null, outputCheck: null, error: 'on-device-unavailable' },
    ];
    expect(summarize(cases)).toEqual({
      onDevice: 1,
      inCloudAfterDevice: 0,
      inCloud: 1,
      notRun: 1,
      total: 3,
      firstOnDevice: 1,
      fieldsCorrect: 9,
      fieldsTotal: 11,
      finalCorrect: null,
      retriedInCloud: 0,
      deductionsNotRead: 0,
    });
  });

  it('names the downloaded file by date and time, browser major version and platform', () => {
    expect(runFileName({ date: '2026-11-16T17:44:09.000Z', browser: 'Chrome 157.0.7600.12', platform: 'macOS' })).toBe('device-check-2026-11-16T1744-chrome157-macos.json');
  });

  const recording = (name: string) => JSON.parse(readFileSync(new URL(`../../../eval/results/on-device/${name}`, import.meta.url), 'utf8')) as { version: number; cases: CaseResult[] };

  it('recognises a run file; every earlier recording still opens', () => {
    expect(isRunFile({ kind: RUN_FILE_KIND, version: 3, date: '2026-11-17T10:00:00Z', cases: [] })).toBe(true);
    expect(isRunFile({ kind: RUN_FILE_KIND, version: 2, date: '2026-11-17T10:00:00Z', cases: [] })).toBe(true);
    expect(isRunFile({ kind: 'other', date: 'x', cases: [] })).toBe(false);
    // Version 1: the first recorded run; no retry existed, so the device's answers were the final ones.
    const first = recording('device-check-2026-11-16-chrome157-macos.json');
    expect(isRunFile(first)).toBe(true);
    expect(summarize(first.cases, first.version)).toMatchObject({ onDevice: 14, firstOnDevice: 14, total: 14, fieldsCorrect: 37, fieldsTotal: 60, finalCorrect: null });
  });

  it('the version 2 recording: 9 answered on this device, 5 in the cloud after a failed on-device attempt', () => {
    const second = recording('device-check-2026-11-16T1744-chrome157-macos.json');
    expect(isRunFile(second)).toBe(true);
    expect(second.version).toBe(2);
    expect(summarize(second.cases, second.version)).toMatchObject({
      onDevice: 9,
      inCloudAfterDevice: 5,
      inCloud: 0,
      notRun: 0,
      total: 14,
      firstOnDevice: 14,
      fieldsCorrect: 48,
      fieldsTotal: 60,
      finalCorrect: 60,
      retriedInCloud: 5,
    });
  });
});

describe('the prepared household of the judges\' path', () => {
  it('answers only questions the pack asks, with values it accepts, and gets results from the rules', () => {
    const steps = buildSteps(PACK, BANDS);
    const household = preparedHousehold(steps);
    for (const id of Object.keys(household)) expect(steps.some((s) => s.id === id)).toBe(true);
    expect(household['income']).toEqual({ kind: 'band', bandId: 'C' });
    const results = computeVerdicts(PACK, BANDS, steps, household);
    expect(results.length).toBe(PACK.programs.length);
    expect(results.some((r) => r.verdict === 'likely' || r.verdict === 'maybe')).toBe(true);
  });
});
