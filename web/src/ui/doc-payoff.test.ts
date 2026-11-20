// What the paystub changed, as amounts (contract v1.44): counted from the engine's verdicts both ways, on the
// judges' household fixture (shared/fixtures/conformance/judges-household.json) and the California pack.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ProgramVerdict, RulePack } from '../core/rules';
import { payoff } from './doc-payoff';
import { answersBefore, answersWithoutDocument, type QuickCheckAnswers } from './quickcheck';

const shared = (rel: string) => JSON.parse(readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8')) as unknown;
const fixture = shared('fixtures/conformance/judges-household.json') as { before: { expected: ProgramVerdict[] }; after: { expected: ProgramVerdict[] } };
const pack = shared('rulepacks/us-ca/pack.json') as RulePack;

describe('payoff', () => {
  it('without and with the sample paystub: may qualify 3 → 5, with an amount 0 → 3, about 4,369 a year plus up to 2,016', () => {
    expect(payoff(fixture.before.expected, pack)).toEqual({ may: 3, withAmount: 0, total: 0, upTo: 0 });
    expect(payoff(fixture.after.expected, pack)).toEqual({ may: 5, withAmount: 3, total: 3573 + 796, upTo: 2016 });
  });

  it('leaves a program whose amount is not yearly out of the sums, and counts only programs that may qualify', () => {
    const monthly = { ...pack, programs: [{ ...pack.programs[0]!, period: 'Per month' }, ...pack.programs.slice(1)] };
    expect(payoff(fixture.after.expected, monthly).total).toBe(796);
    const possible = fixture.after.expected.map((v) => ({ ...v, verdict: 'maybe' as const }));
    expect(payoff(possible, pack)).toEqual({ may: 0, withAmount: 0, total: 0, upTo: 0 });
  });
});

describe('the answers a document replaced', () => {
  const answers: QuickCheckAnswers = { income: { kind: 'band', bandId: 'C' }, householdSize: 3 };

  it('are kept as they were, and put back to work out the results without it', () => {
    const before = answersBefore(answers, ['annualIncome', 'hasEarnedIncome']);
    expect(before).toEqual({ income: { kind: 'band', bandId: 'C' } });
    const now: QuickCheckAnswers = { ...answers, income: { kind: 'exact', amount: 29233 }, hasEarnedIncome: 'yes' };
    expect(answersWithoutDocument(now, ['annualIncome', 'hasEarnedIncome'], before)).toEqual(answers);
  });

  it('keep an earlier document income without its own details', () => {
    const earlier: QuickCheckAnswers = { income: { kind: 'exact', amount: 100, from: { paystub: 'IN_CLOUD', filled: ['annualIncome'] } } };
    expect(answersBefore(earlier, ['annualIncome'])).toEqual({ income: { kind: 'exact', amount: 100 } });
  });
});
