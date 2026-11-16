// The prepared synthetic household of the judges' path and the device check. Its answers are keyed by
// the pack's own question ids; any answer the bundled rule pack does not ask, or would not accept, is
// left out (that question is then simply unanswered), so the household stays consistent with the pack.
import { validateAnswer, type AnswerValue, type QuickCheckAnswers, type Step } from '../quickcheck';

/**
 * An invented renter household of three: a working single parent (head of household) with one child
 * under 6, a yearly income given as a range, and one private question left unanswered, so the results
 * show every kind of answer. With the California pack: the federal EITC, LifeLine and CARE "may
 * qualify"; CalEITC and the Young Child Tax Credit are "possible" until the sample paystub gives an
 * exact yearly income ($29,233), which makes them "may qualify" with an amount; CalFresh depends on
 * the unanswered question; FERA is "probably not". Keys of other packs' questions are skipped.
 */
const PREPARED: Readonly<Record<string, AnswerValue>> = {
  income: { kind: 'band', bandId: 'C' },
  householdSize: 3,
  numQualifyingChildren: 1,
  numChildren: 1,
  hasChildUnder6: 'yes',
  hasEarnedIncome: 'yes',
  ageGroup: '25-64',
  housing: 'renter',
  benefits: [],
  energyProvider: 'pge',
  hasElderlyOrDisabledMember: 'no',
  hasOlderMember: 'no',
  filingStatus: 'head-of-household',
  taxIdType: 'ssn-valid-for-work',
  investmentIncome: 0,
  residentStatus: 'eligible',
};

export function preparedHousehold(steps: readonly Step[]): QuickCheckAnswers {
  const out: Record<string, AnswerValue> = {};
  for (const step of steps) {
    const value = PREPARED[step.id];
    if (value !== undefined && validateAnswer(step, value) === null) out[step.id] = value;
  }
  return out;
}
