// The prepared synthetic household of the judges' path and the device check. Its answers are keyed by
// the pack's own question ids; any answer the bundled rule pack does not ask, or would not accept, is
// left out (that question is then simply unanswered), so the household stays consistent with the pack.
import { validateAnswer, type AnswerValue, type QuickCheckAnswers, type Step } from '../quickcheck';

/** A renter household of three with one child, a job and a yearly income given exactly. Invented. */
const PREPARED: Readonly<Record<string, AnswerValue>> = {
  income: { kind: 'exact', amount: 30524 },
  householdSize: 3,
  numChildren: 1,
  hasEarnedIncome: 'yes',
  housing: 'renter',
  benefits: [],
  hasOlderMember: 'no',
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
