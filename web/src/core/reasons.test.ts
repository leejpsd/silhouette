import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from './types';
import { criterionReasons, verdicts, type RulePack } from './rules';
import type { Bands } from './generalize';
import { readTypedAmount } from './skeleton';

const shared = (rel: string) => JSON.parse(readFileSync(new URL(`../../../shared/${rel}`, import.meta.url), 'utf8')) as unknown;
const pack = shared('rulepacks/zz-test/pack.json') as RulePack;
const bands = shared('bands/zz-test.json') as Bands;

describe('why this result: the rule engine\'s reasons with limits', () => {
  const answers = { annualIncome: 33333, householdSize: 3, housing: 'renter', residentStatus: 'not-eligible', hasEarnedIncome: 'yes', numChildren: 0, benefits: [], hasOlderMember: 'no' };

  it('states are those on screen; a table lookup gives the limit for this household; yours is the exact value', () => {
    const reasons = criterionReasons(pack, bands, Raw.of(answers), 'food-help');
    const screen = verdicts(pack, bands, Raw.of(answers)).find((v) => v.programId === 'food-help')!;
    expect(reasons.map((r) => r.state)).toEqual(screen.criteria.map((c) => c.state));
    expect(reasons).toEqual([
      { id: 'income-limit', state: 'pass', comparisons: [{ variable: 'annualIncome', op: '<=', limit: 34000, yours: 33333, decisive: true }] },
      { id: 'residency', state: 'fail', comparisons: [] },
    ]);
  });

  it('a limit that depends on another answer is resolved from it; an unanswered one is not invented', () => {
    expect(criterionReasons(pack, bands, Raw.of(answers), 'work-credit')[1]).toMatchObject({ comparisons: [{ limit: 18000, yours: 33333 }] });
    const noSize = criterionReasons(pack, bands, Raw.of({ annualIncome: 10000 }), 'food-help')[0];
    expect(noSize?.comparisons).toEqual([{ variable: 'annualIncome', op: '<=', limit: null, yours: 10000, decisive: true }]);
  });

  it('with only a band, yours is the band; comparisons inside a top-level "or" are found', () => {
    const band = criterionReasons(pack, bands, Raw.of({ incomeBand: 'C', householdSize: 2 }), 'phone-discount')[0];
    expect(band?.comparisons).toEqual([{ variable: 'annualIncome', op: '<=', limit: 33000, yours: { id: 'C', min: 30000, max: 44999 }, decisive: true }]);
  });
});

describe('typed amounts, section 5.1 rule 4', () => {
  it('refuses more than two digits after the dot, with its own reason', () => {
    expect(readTypedAmount('60.000')).toEqual({ ok: false, reason: 'decimals' });
    expect(readTypedAmount('1.271')).toEqual({ ok: false, reason: 'decimals' });
    expect(readTypedAmount('28.000,50')).toEqual({ ok: false, reason: 'format' });
    expect(readTypedAmount('60,000.50')).toEqual({ ok: true, value: 60000.5 });
  });
});
