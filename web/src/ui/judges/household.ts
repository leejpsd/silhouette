// The prepared synthetic household of the judges' path and the device check. Its answers are keyed by
// the pack's own question ids; any answer the bundled rule pack does not ask, or would not accept, is
// left out (that question is then simply unanswered), so the household stays consistent with the pack.
import { validateAnswer, type AnswerValue, type QuickCheckAnswers, type Step } from '../quickcheck';
import judgesHousehold from '../../../../shared/rulepacks/us-ca/judges-household.json';

/**
 * The judges' prepared household (shared/rulepacks/us-ca/judges-household.json): an invented renter
 * household of three, a working single parent (head of household) with one child under 6, a yearly
 * income given as a range, and the CalFresh question left unanswered, so the results show every kind of
 * answer. Its expected results, before and after the sample paystub ($29,233 a year), are
 * shared/fixtures/conformance/judges-household.json.
 */
const SHARED_HOUSEHOLD = judgesHousehold.answers as unknown as Readonly<Record<string, AnswerValue>>;

/**
 * Answers for the questions only the invented zz-test pack asks (the unit tests and the end-to-end demo
 * build use it, never a shipped build). The California pack does not ask them, so they are skipped there.
 */
const TEST_PACK_ONLY: Readonly<Record<string, AnswerValue>> = { numChildren: 1, hasOlderMember: 'no', residentStatus: 'eligible' };

const PREPARED: Readonly<Record<string, AnswerValue>> = { ...TEST_PACK_ONLY, ...SHARED_HOUSEHOLD };

export function preparedHousehold(steps: readonly Step[]): QuickCheckAnswers {
  const out: Record<string, AnswerValue> = {};
  for (const step of steps) {
    const value = PREPARED[step.id];
    if (value !== undefined && validateAnswer(step, value) === null) out[step.id] = value;
  }
  return out;
}

/**
 * Whether the answers are the prepared household's (filled by the judges' path or "Try with a sample
 * paystub"), not the person's own. The yearly income and money from work are left out of the comparison:
 * a document read on the way may have answered them.
 */
export function isSampleHousehold(steps: readonly Step[], answers: QuickCheckAnswers): boolean {
  const prepared = Object.entries(preparedHousehold(steps)).filter(([id]) => id !== 'income' && id !== 'hasEarnedIncome');
  return prepared.length > 0 && prepared.every(([id, value]) => JSON.stringify(answers[id]) === JSON.stringify(value));
}
