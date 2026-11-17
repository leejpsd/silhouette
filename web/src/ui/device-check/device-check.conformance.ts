// Runners for shared/fixtures/conformance/device-check.json and judges-household.json
// (shared/validation/DEVICE_CHECK.md), used by src/core/conformance.test.ts. They run the web's own
// scoring, summary, file names, run-file schema check and judges' household. Test code only.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { Raw } from '../../core/types';
import type { PlaceholderMap } from '../../core/skeleton';
import { buildReview } from '../../core/review';
import { verdicts, type Answers, type RulePack } from '../../core/rules';
import type { Bands } from '../../core/generalize';
import { validatePaystubs, type PaystubValues } from '../../core/validate';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import { buildSteps, toEngineAnswers } from '../quickcheck';
import { preparedHousehold } from '../judges/household';
import { fieldStatuses, incomeInputs, isRunFile, runFileName, scoreFields, summarize, wrongFields, type CaseResult } from './run';
import { runFileProblems } from './run-schema';

const shared = (rel: string) => JSON.parse(readFileSync(new URL(`../../../../shared/${rel}`, import.meta.url), 'utf8')) as unknown;

interface DeviceCheckFixture {
  documents: Record<string, { map: PlaceholderMap; gold: Record<string, unknown> }>;
  readings: { id: string; document: string; pointers: Record<string, unknown>; expected: { statuses: unknown; fields: unknown; incomeInputs: unknown; wrongFields: unknown } }[];
  runs: { id: string; version: number; cases: CaseResult[]; expected: unknown }[];
  fileNames: { date: string; browser: string; platform: string; expected: string }[];
  validRuns: string[];
}

export function runDeviceCheckFixture(raw: unknown): void {
  const fixture = raw as DeviceCheckFixture;
  it('has every section', () => {
    expect(fixture.readings.length).toBeGreaterThan(0);
    expect(fixture.runs.length).toBeGreaterThan(0);
    expect(fixture.fileNames.length).toBeGreaterThan(0);
  });
  for (const r of fixture.readings) {
    it(`reading ${r.id}`, () => {
      const doc = fixture.documents[r.document] as { map: PlaceholderMap; gold: Record<string, unknown> };
      const review = buildReview(POINTER_SCHEMAS.paystub, r.pointers, '' as never, Raw.of(doc.map));
      const statuses = fieldStatuses(review, doc.gold);
      expect(statuses).toEqual(r.expected.statuses);
      expect(scoreFields(review, doc.gold)).toEqual(r.expected.fields);
      expect(incomeInputs(statuses)).toEqual(r.expected.incomeInputs);
      expect(wrongFields(statuses)).toEqual(r.expected.wrongFields);
    });
  }
  for (const run of fixture.runs) it(`summary ${run.id}`, () => expect(summarize(run.cases, run.version)).toEqual(run.expected));
  for (const n of fixture.fileNames) it(`file name ${n.expected}`, () => expect(runFileName(n)).toBe(n.expected));
  for (const path of fixture.validRuns) {
    it(`run file ${path} validates and opens`, () => {
      const file = shared(path);
      expect(runFileProblems(file)).toEqual([]);
      expect(isRunFile(file)).toBe(true);
    });
  }
}

interface HouseholdFixture {
  household: string;
  pack: string;
  bands: string;
  before: { engineAnswers: Answers; expected: unknown };
  paystub: { values: PaystubValues; annualIncome: number };
  after: { engineAnswers: Answers; expected: unknown };
}

export function runJudgesHouseholdFixture(raw: unknown): void {
  const fixture = raw as HouseholdFixture;
  const pack = shared(fixture.pack) as RulePack;
  const bands = shared(fixture.bands) as Bands;
  const steps = buildSteps(pack, bands);
  it('the web fills the Quick Check with exactly the shared household', () => {
    expect(toEngineAnswers(steps, preparedHousehold(steps))).toEqual(fixture.before.engineAnswers);
  });
  it('results before the sample paystub', () => expect(verdicts(pack, bands, Raw.of(fixture.before.engineAnswers))).toEqual(fixture.before.expected));
  it('the sample paystub’s yearly income', () => expect(validatePaystubs(Raw.of([fixture.paystub.values]), pack.jurisdiction).annualization?.annualIncome).toBe(fixture.paystub.annualIncome));
  it('results after the sample paystub', () => {
    const household = preparedHousehold(steps);
    const after = toEngineAnswers(steps, { ...household, income: { kind: 'exact', amount: fixture.paystub.annualIncome } });
    expect(after).toEqual(fixture.after.engineAnswers);
    expect(verdicts(pack, bands, Raw.of(after))).toEqual(fixture.after.expected);
  });
}
