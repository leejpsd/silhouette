// The California pack's own hand-worked households (shared/rulepacks/us-ca/cases.json) through the web
// engine: every verdict and every estimated amount must match.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from './types';
import { verdicts, type Answers, type RulePack } from './rules';
import type { Bands } from './generalize';

const shared = (rel: string) => JSON.parse(readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8')) as unknown;
const pack = shared('rulepacks/us-ca/pack.json') as RulePack;
const bands = shared('bands/us-ca.json') as Bands;
const file = shared('rulepacks/us-ca/cases.json') as {
  base?: Answers;
  cases: { id: string; answers: Answers; expected: Record<string, { verdict: string; estimatedAmount?: number }> }[];
};

describe('us-ca: the pack\'s hand-worked cases', () => {
  let checked = 0;
  for (const k of file.cases) {
    it(k.id, () => {
      const out = verdicts(pack, bands, Raw.of({ ...(file.base ?? {}), ...k.answers }));
      for (const [programId, want] of Object.entries(k.expected)) {
        const got = out.find((v) => v.programId === programId);
        expect(got?.verdict, `${programId}`).toBe(want.verdict);
        if (want.estimatedAmount !== undefined) expect(got?.estimatedAmount, `${programId} amount`).toBe(want.estimatedAmount);
        checked++;
      }
    });
  }
  it('covers 27 households and 189 results', () => {
    expect(file.cases).toHaveLength(27);
    expect(file.cases.reduce((n, k) => n + Object.keys(k.expected).length, 0)).toBe(189);
    void checked;
  });
});

describe('us-ca: the judges\' prepared household', () => {
  it('shows every kind of result, and the sample paystub\'s yearly income sharpens two of them', async () => {
    const { buildSteps, computeVerdicts } = await import('../ui/quickcheck');
    const { preparedHousehold } = await import('../ui/judges/household');
    const steps = buildSteps(pack, bands);
    const household = preparedHousehold(steps);
    const by = (results: { programId: string; verdict: string; estimatedAmount?: number }[]) => Object.fromEntries(results.map((r) => [r.programId, r.verdict]));
    const before = by(computeVerdicts(pack, bands, steps, household));
    expect(before).toEqual({ 'federal-eitc': 'likely', caleitc: 'maybe', yctc: 'maybe', calfresh: 'depends', 'ca-lifeline': 'likely', care: 'likely', fera: 'unlikely' });
    // The sample paystub's yearly income (as the review screen works it out).
    const after = computeVerdicts(pack, bands, steps, { ...household, income: { kind: 'exact', amount: 29233 } });
    expect(by(after)).toEqual({ ...before, caleitc: 'likely', yctc: 'likely' });
    expect(after.find((r) => r.programId === 'yctc')?.estimatedAmount).toBe(796);
    expect(after.find((r) => r.programId === 'federal-eitc')?.estimatedAmount).toBe(3573);
  });
});
