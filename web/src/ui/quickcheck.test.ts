import { describe, expect, it } from 'vitest';

import type { RulePack } from '../core/rules';
import { BANDS, PACK, isDemoPack } from './pack';
import {
  buildSteps,
  computeVerdicts,
  firstOpenStep,
  groupByVerdict,
  sanitizeAnswers,
  toEngineAnswers,
  validateAnswer,
  type QuickCheckAnswers,
} from './quickcheck';

const steps = buildSteps(PACK, BANDS);
const stepOf = (id: string) => steps.find((s) => s.id === id)!;
const verdictOf = (answers: QuickCheckAnswers, id: string) =>
  computeVerdicts(PACK, BANDS, steps, answers).find((v) => v.programId === id);

describe('Quick Check model (zz-test pack v2)', () => {
  it('follows questionOrder, with the reserved income step', () => {
    expect(steps.map((s) => s.id)).toEqual(PACK.questionOrder);
    expect(stepOf('residentStatus').sensitive).toBe(true);
    expect(isDemoPack(PACK)).toBe(true);
  });

  it('defaults to income first, then pack order, when questionOrder is absent', () => {
    const { questionOrder: _omit, ...rest } = PACK;
    void _omit;
    const ids = buildSteps(rest as RulePack, BANDS).map((s) => s.id);
    expect(ids).toEqual(['income', ...PACK.questions.map((q) => q.id)]);
  });

  it('rejects a questionOrder that misses or repeats a step', () => {
    expect(() => buildSteps({ ...PACK, questionOrder: ['income'] }, BANDS)).toThrow();
    expect(() => buildSteps({ ...PACK, questionOrder: [...PACK.questionOrder!, 'income'] }, BANDS)).toThrow();
  });

  it('takes int ranges from the pack and validates answers per step', () => {
    const household = stepOf('householdSize');
    expect(household).toMatchObject({ kind: 'int', min: 1, max: 20 });
    expect(validateAnswer(household, 0)).toBe('q.error.integer');
    expect(validateAnswer(household, 21)).toBe('q.error.integer');
    expect(validateAnswer(household, 3)).toBeNull();
    const income = stepOf('income');
    expect(validateAnswer(income, { kind: 'band', bandId: 'Z' })).toBe('q.error.choose');
    expect(validateAnswer(income, { kind: 'exact', amount: -1 })).toBe('q.error.amount');
    expect(validateAnswer(income, { kind: 'exact', amount: 30524 })).toBeNull();
  });

  it('accepts zero selections for a multi question, but not unknown or repeated values', () => {
    const benefits = stepOf('benefits');
    expect(benefits.kind).toBe('multi');
    expect(validateAnswer(benefits, [])).toBeNull();
    expect(validateAnswer(benefits, ['snap', 'ssi'])).toBeNull();
    expect(validateAnswer(benefits, ['cash'])).toBe('q.error.choose');
    expect(validateAnswer(benefits, ['snap', 'snap'])).toBe('q.error.choose');
    expect(validateAnswer(benefits, 'snap')).toBe('q.error.choose');
  });

  it('maps income to incomeBand or annualIncome and drops skipped answers', () => {
    expect(toEngineAnswers(steps, { income: { kind: 'band', bandId: 'B' }, householdSize: 2, residentStatus: null, benefits: [] })).toEqual({
      incomeBand: 'B',
      householdSize: 2,
      benefits: [],
    });
    expect(toEngineAnswers(steps, { income: { kind: 'exact', amount: 30524 } })).toEqual({ annualIncome: 30524 });
  });

  const full: QuickCheckAnswers = {
    householdSize: 3,
    numChildren: 2,
    hasEarnedIncome: 'yes',
    income: { kind: 'exact', amount: 30524 },
    housing: 'renter',
    benefits: [],
    hasOlderMember: 'no',
    residentStatus: 'eligible',
  };

  it('gives all likely for a fully answered profile under every limit', () => {
    const results = computeVerdicts(PACK, BANDS, steps, full);
    expect(results.map((v) => [v.programId, v.verdict])).toEqual([
      ['work-credit', 'likely'],
      ['food-help', 'likely'],
      ['utility-discount', 'likely'],
      ['phone-discount', 'likely'],
      ['senior-food', 'likely'],
    ]);
  });

  it('a skipped sensitive question gives depends with dependsOn', () => {
    const v = verdictOf({ ...full, residentStatus: null }, 'food-help');
    expect(v?.verdict).toBe('depends');
    expect(v?.dependsOn).toEqual(['residentStatus']);
  });

  it('band-only income gives maybe where the engine says so', () => {
    expect(verdictOf({ ...full, income: { kind: 'band', bandId: 'C' }, numChildren: 1 }, 'work-credit')?.verdict).toBe('maybe');
  });

  it('a qualifying benefit passes phone-discount even when income is skipped (three-valued logic)', () => {
    expect(verdictOf({ householdSize: 2, benefits: ['snap'] }, 'phone-discount')?.verdict).toBe('likely');
    expect(verdictOf({ householdSize: 2, benefits: [] }, 'phone-discount')?.dependsOn).toEqual(['annualIncome']);
  });

  it('groups results in display order', () => {
    const groups = groupByVerdict(computeVerdicts(PACK, BANDS, steps, { ...full, residentStatus: null }));
    expect(groups.map((g) => g.verdict)).toEqual(['likely', 'depends']);
  });

  it('finds the first open step and sanitizes stored answers', () => {
    expect(firstOpenStep(steps, {})).toBe(0);
    expect(firstOpenStep(steps, { householdSize: 2, numChildren: null })).toBe(2);
    expect(firstOpenStep(steps, full)).toBe(steps.length);
    expect(
      sanitizeAnswers(steps, {
        householdSize: 0,
        numChildren: null,
        housing: 'castle',
        extra: 1,
        benefits: ['snap', 'cash'],
        income: { kind: 'band', bandId: 'A' },
      }),
    ).toEqual({ numChildren: null, income: { kind: 'band', bandId: 'A' } });
    expect(sanitizeAnswers(steps, { benefits: [] })).toEqual({ benefits: [] });
    expect(sanitizeAnswers(steps, 'garbage')).toEqual({});
  });
});
