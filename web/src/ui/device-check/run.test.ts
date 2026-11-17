import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { buildReview } from '../../core/review';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { BANDS, PACK } from '../pack';
import { buildSteps, computeVerdicts } from '../quickcheck';
import { preparedHousehold } from '../judges/household';
import { runFileProblems } from './run-schema';
import { webRunDevice } from './run';
import { CASES, RUN_FILE_KIND, browserVersion, casesFor, incomeInputs, incomeInputsCorrect, isRunFile, wrongFields, runFileName, scoreFields, summarize, type CaseResult } from './run';
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
      incomeInputsCorrect: null,
      extractionCases: 0,
      income: null,
      wrongReachedPerson: null,
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
      incomeInputsCorrect: null,
      extractionCases: 0,
      income: null,
      wrongReachedPerson: null,
    });
  });

  it('counts the extraction cases whose yearly-income inputs are all right', () => {
    const ok = { ran: 'ON_DEVICE' as const, fields: { correct: 12, total: 12 }, retried: false };
    const cases: CaseResult[] = [
      { id: 'a', task: 'document.pointer.extract', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 1, outputCheck: null, final: { ...ok, incomeInputsCorrect: true } },
      { id: 'b', task: 'document.pointer.extract', mode: 'PREFER_ON_DEVICE', ran: 'ON_DEVICE', latencyMs: 1, outputCheck: null, final: { ...ok, incomeInputsCorrect: false } },
    ];
    expect(summarize(cases)).toMatchObject({ incomeInputsCorrect: 1, extractionCases: 2 });
    expect(incomeInputsCorrect({ grossPay: 'correct', ytdGross: 'correct', payFrequency: 'correct', periodStart: 'correct', periodEnd: 'correct', payDate: 'absent', employeeName: 'wrong' })).toBe(true);
    expect(incomeInputsCorrect({ grossPay: 'correct', ytdGross: 'wrong', payFrequency: 'correct', periodStart: 'correct', periodEnd: 'correct', payDate: 'correct' })).toBe(false);
  });

  it('splits the yearly-income inputs into right, not found and wrong, and counts wrong values that reached the person', () => {
    const statuses = { grossPay: 'correct', ytdGross: 'missing', payFrequency: 'correct', periodStart: 'correct', periodEnd: 'absent', payDate: 'correct', hoursWorked: 'wrong', employerName: 'spurious' } as const;
    expect(incomeInputs(statuses)).toEqual({ right: ['grossPay', 'payFrequency', 'periodStart', 'periodEnd', 'payDate'], notFound: ['ytdGross'], wrong: [] });
    expect(wrongFields(statuses)).toEqual(['hoursWorked', 'employerName']);
    // A name left out as not read is "missing" (not found), never wrong.
    expect(wrongFields({ employerName: 'missing', employeeName: 'missing', grossPay: 'correct' })).toEqual([]);
    const final = (inputs: { right: string[]; notFound: string[]; wrong: string[] }, wrong: string[]) => ({ ran: 'ON_DEVICE' as const, fields: { correct: 1, total: 1 }, retried: false, incomeInputs: inputs, wrongFields: wrong });
    const x = { task: 'document.pointer.extract', mode: 'PREFER_ON_DEVICE' as const, ran: 'ON_DEVICE' as const, latencyMs: 1, outputCheck: null };
    const cases: CaseResult[] = [
      { ...x, id: 'a', repetition: 1, final: final({ right: ['grossPay'], notFound: [], wrong: [] }, []) },
      { ...x, id: 'a', repetition: 2, final: final({ right: [], notFound: ['ytdGross'], wrong: [] }, []) },
      { ...x, id: 'a', repetition: 3, final: final({ right: [], notFound: [], wrong: ['ytdGross'] }, ['ytdGross', 'hoursWorked']) },
      { ...x, id: 'b', final: final({ right: ['grossPay'], notFound: [], wrong: [] }, ['hoursWorked']) },
    ];
    expect(summarize(cases)).toMatchObject({ extractionCases: 4, income: { allRight: 2, notFound: 1, wrong: 1 }, wrongReachedPerson: 2 });
  });

  it('repeats only the extraction cases when asked; the default is a single run', () => {
    expect(casesFor(1)).toBe(CASES);
    expect(casesFor(3)).toHaveLength(CASES.length + 2 * 5);
  });

  it('names the downloaded file by date and time, browser major version and platform', () => {
    expect(runFileName({ date: '2026-11-16T17:44:09.000Z', browser: 'Chrome 157.0.7600.12', platform: 'macOS' })).toBe('device-check-2026-11-16T1744-chrome157-macos.json');
  });

  const recording = (name: string) => JSON.parse(readFileSync(new URL(`../../../eval/results/on-device/${name}`, import.meta.url), 'utf8')) as { version: number; cases: CaseResult[] };

  it('recognises a run file; every earlier recording still opens', () => {
    const header = { kind: RUN_FILE_KIND, date: '2026-11-17T10:00:00Z', browser: 'Chrome 157.0.0.0', platform: 'macOS', userAgent: 'x', availability: {}, jurisdiction: 'us-ca', cases: [] };
    expect(isRunFile({ ...header, version: 3 })).toBe(true);
    expect(isRunFile({ ...header, version: 2 })).toBe(true);
    // A file without the fields the schema requires is not a run file.
    expect(isRunFile({ kind: RUN_FILE_KIND, version: 3, date: '2026-11-17T10:00:00Z', cases: [] })).toBe(false);
    expect(isRunFile({ kind: 'other', date: 'x', cases: [] })).toBe(false);
    // Version 1: the first recorded run; no retry existed, so the device's answers were the final ones.
    const first = recording('device-check-2026-11-16-chrome157-macos.json');
    expect(isRunFile(first)).toBe(true);
    expect(summarize(first.cases, first.version)).toMatchObject({ onDevice: 14, firstOnDevice: 14, total: 14, fieldsCorrect: 37, fieldsTotal: 60, finalCorrect: null });
  });

  it('the version 3 recording: 13 answered on this device, 1 in the cloud after a failed core', () => {
    const third = recording('history/device-check-2026-11-16T1807-chrome157-macos.json');
    expect(isRunFile(third)).toBe(true);
    expect(summarize(third.cases, third.version)).toMatchObject({ onDevice: 13, inCloudAfterDevice: 1, notRun: 0, total: 14, finalCorrect: 56, fieldsTotal: 60, deductionsNotRead: 1, incomeInputsCorrect: null });
  });

  it('the version 2 recording: 9 answered on this device, 5 in the cloud after a failed on-device attempt', () => {
    const second = recording('history/device-check-2026-11-16T1744-chrome157-macos.json');
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

describe('the run files and the shared contract (v1.18)', () => {
  const dir = new URL('../../../eval/results/on-device/', import.meta.url);
  const files = [...readdirSync(dir).filter((f) => f.endsWith('.json')), ...readdirSync(new URL('history/', dir)).map((f) => `history/${f}`)];

  it('every bundled and history run file validates against shared/schemas/device-check-run.v3.json', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) expect(runFileProblems(JSON.parse(readFileSync(new URL(f, dir), 'utf8'))), f).toEqual([]);
  });

  it('the latest recorded run has exactly the cases of shared/fixtures/device-check/cases.json, in order', () => {
    const cases = (JSON.parse(readFileSync(new URL('../../../../shared/fixtures/device-check/cases.json', import.meta.url), 'utf8')) as { cases: { id: string; task: string; mode: string }[] }).cases;
    const latest = JSON.parse(readFileSync(new URL('device-check-2026-11-17T0038-chrome157-macos.json', dir), 'utf8')) as { cases: { id: string; task: string; mode: string }[] };
    const seen = new Map<string, { id: string; task: string; mode: string }>();
    for (const c of latest.cases) if (!seen.has(c.id)) seen.set(c.id, { id: c.id, task: c.task, mode: c.mode });
    expect([...seen.values()]).toEqual(cases.map(({ id, task, mode }) => ({ id, task, mode })));
    expect(CASES).toHaveLength(cases.length);
  });

  it('a run made in this browser carries the web device block, and validates', () => {
    const device = webRunDevice('macOS');
    expect(device).toMatchObject({ platform: 'web', os: 'macOS' });
    expect(device.sdk).toMatch(/^Firebase JS SDK \d+\.\d+\.\d+/);
    const file = { kind: RUN_FILE_KIND, version: 3, date: '2026-11-17T10:00:00.000Z', browser: 'Chrome 157.0.0.0', platform: 'macOS', userAgent: 'x', availability: {}, jurisdiction: 'us-ca', repetitions: 1, device, cases: [] };
    expect(runFileProblems(JSON.parse(JSON.stringify(file)))).toEqual([]);
    expect(isRunFile({ ...file, device: { ...device, extra: 1 } })).toBe(false);
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
