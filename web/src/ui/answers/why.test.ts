// "Why this result" never contradicts the verdict (the rules are written down beside whyRows()).
import { describe, expect, it } from 'vitest';
import { Raw } from '../../core/types';
import { criterionReasons, verdicts, type Answers } from '../../core/rules';
import { translator } from '../i18n';
import { BANDS, PACK } from '../pack';
import { whyRows } from './personal';

const program = (id: string) => PACK.programs.find((p) => p.id === id)!;
function why(answers: Answers, programId: string, locale: 'en' | 'es' = 'en') {
  const reasons = criterionReasons(PACK, BANDS, Raw.of(answers), programId);
  const verdict = verdicts(PACK, BANDS, Raw.of(answers)).find((v) => v.programId === programId)!.verdict;
  return { verdict, reasons, rows: whyRows(translator(locale), locale, program(programId), reasons) };
}

describe('"Why this result"', () => {
  it('a state that comes from uncertainIf says what it depends on, not the exact income', () => {
    const { verdict, reasons, rows } = why({ householdSize: 3, numChildren: 0, annualIncome: 36000, housing: 'owner', hasOlderMember: 'yes' }, 'senior-food');
    expect(verdict).toBe('maybe');
    expect(reasons[0]).toMatchObject({ state: 'mixed', exception: ['hasOlderMember'] });
    expect(rows[0]!.limits).toEqual([{ limit: '$34,000', yours: '$36,000' }]);
    expect(rows[0]!.stateText).toBe('Over this limit, but still possible because of: Someone 60 or older.');
    expect(rows[0]!.stateText).not.toContain('exact income');
  });

  it('an `or` met by a benefit says so and shows no income limit it did not use', () => {
    const { verdict, reasons, rows } = why({ householdSize: 2, annualIncome: 80000, benefits: ['snap'] }, 'phone-discount');
    expect(verdict).toBe('likely');
    expect(reasons[0]!.metBy).toEqual({ variable: 'benefits', value: 'snap' });
    expect(rows[0]!.limits).toEqual([]);
    expect(rows[0]!.notes).toEqual(['Met through: Food benefits (SNAP).']);
    expect(why({ householdSize: 2, annualIncome: 80000, benefits: ['snap'] }, 'phone-discount', 'es').rows[0]!.notes).toEqual(['Se cumple por: Beneficios de alimentos (SNAP).']);
  });

  it('an `or` met by the income shows that limit; one not met shows the limit it failed', () => {
    expect(why({ householdSize: 2, annualIncome: 20000, benefits: [] }, 'phone-discount').rows[0]).toMatchObject({ state: 'pass', limits: [{ limit: '$33,000', yours: '$20,000' }], notes: [] });
    expect(why({ householdSize: 2, annualIncome: 80000, benefits: [] }, 'phone-discount').rows[0]).toMatchObject({ state: 'fail', limits: [{ limit: '$33,000', yours: '$80,000' }] });
  });

  it('a household above the cap is told the limit is the one for the cap or more', () => {
    const { rows } = why({ householdSize: 9, annualIncome: 50000, residentStatus: 'eligible' }, 'food-help');
    expect(rows[0]).toMatchObject({ state: 'pass', limits: [{ limit: '$55,000', yours: '$50,000' }], notes: ['This is the limit for a household of 6 or more.'] });
    expect(why({ householdSize: 6, annualIncome: 50000 }, 'food-help').rows[0]!.notes).toEqual([]);
  });

  it('an income range across a limit still says it depends on the exact income', () => {
    const { reasons, rows } = why({ householdSize: 3, incomeBand: 'C' }, 'food-help');
    expect(reasons[0]).toMatchObject({ state: 'mixed' });
    expect(reasons[0]!.exception).toBeUndefined();
    expect(rows[0]!.stateText).toBe('Depends on your exact income');
    expect(rows[0]!.limits).toEqual([{ limit: '$34,000', yours: '$30,000–$44,999' }]);
  });

  it('a plain comparison keeps its limit and state', () => {
    expect(why({ householdSize: 3, numChildren: 1, annualIncome: 30524, hasEarnedIncome: 'yes' }, 'work-credit').rows.map((r) => [r.id, r.state, r.limits.length])).toEqual([
      ['has-earnings', 'pass', 0],
      ['income-limit', 'pass', 1],
    ]);
  });
});
