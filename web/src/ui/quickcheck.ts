// Quick Check model: pure logic, no DOM.
// One question per screen. Every question can be skipped; skipped answers are null and the
// verdict engine reports them as `depends` with `dependsOn`.

import { Raw } from '../core/types';
import { verdicts, type Answers, type ProgramVerdict, type RulePack, type Verdict } from '../core/rules';
import type { Bands, ExactProfile, IncomeBand } from '../core/generalize';

/**
 * How a yearly income was worked out from paystubs (validation/SPEC.md section 7) or W-2s (section 9),
 * kept with it so the results can say so: year-to-date gross over the months elapsed, gross per period ×
 * periods, or box 1 of the year's W-2s as they are (`forms`: how many were added together).
 */
export type IncomeBasis =
  | { readonly method: 'ytd'; readonly ytdCents: number; readonly referenceDate: string; readonly monthsNumerator: number; readonly monthsDenominator: number }
  | { readonly method: 'average'; readonly averageCents: number; readonly periodsPerYear: number }
  | { readonly method: 'w2'; readonly wagesCents: number; readonly taxYear: number | null; readonly forms: number };

/** `from`: an exact income worked out from a paystub reading, how the paystub was read, and the basis. */
export type IncomeAnswer =
  | { readonly kind: 'band'; readonly bandId: string }
  | {
      readonly kind: 'exact';
      readonly amount: number;
      readonly from?:
        | {
            readonly paystub: 'ON_DEVICE' | 'IN_CLOUD' | 'RECORDED' | 'RECORDED_CLOUD' | 'SAMPLE_KEY';
            readonly basis?: IncomeBasis | undefined;
            /** The rule variables the document answered (yearly income, money from work). */
            readonly filled?: readonly string[] | undefined;
            /** The results the document changed, as they were when it was used. */
            readonly changed?: readonly DocumentChange[] | undefined;
          }
        | undefined;
    };
/** A result a document changed: the verdict before and after it, and the estimate after it. */
export interface DocumentChange {
  readonly programId: string;
  readonly before: Verdict;
  readonly after: Verdict;
  readonly amount?: number | undefined;
}
export type AnswerValue = number | string | boolean | readonly string[] | IncomeAnswer;

export function isIncomeAnswer(value: unknown): value is IncomeAnswer {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'kind' in value;
}

/** Answer per step id. Absent = not asked yet; null = skipped. */
export type QuickCheckAnswers = Readonly<Record<string, AnswerValue | null>>;

export type Step =
  | { readonly id: 'income'; readonly kind: 'income'; readonly sensitive: false; readonly bands: readonly IncomeBand[] }
  | { readonly id: string; readonly kind: 'int'; readonly sensitive: boolean; readonly min: number; readonly max: number }
  | { readonly id: string; readonly kind: 'enum'; readonly sensitive: boolean; readonly values: readonly string[] }
  | { readonly id: string; readonly kind: 'multi'; readonly sensitive: boolean; readonly values: readonly string[] }
  | { readonly id: string; readonly kind: 'bool'; readonly sensitive: boolean };

export const INCOME_STEP = 'income';
export const MAX_EXACT_INCOME = 100_000_000;

/**
 * Steps in the pack's `questionOrder` (rulepacks/SPEC.md v1.2 section 2), or by default the
 * reserved "income" step first, then `questions[]` in pack order.
 */
export function buildSteps(pack: RulePack, bands: Bands): Step[] {
  const byId = new Map<string, Step>();
  for (const q of pack.questions) {
    const values = q.values ?? [];
    if (q.type === 'int') {
      if (!Number.isInteger(q.min) || !Number.isInteger(q.max)) throw new Error(`int question without min/max: ${q.id}`);
      byId.set(q.id, { id: q.id, kind: 'int', sensitive: q.sensitive, min: q.min as number, max: q.max as number });
    } else if (q.type === 'enum') byId.set(q.id, { id: q.id, kind: 'enum', sensitive: q.sensitive, values });
    else if (q.type === 'multi') byId.set(q.id, { id: q.id, kind: 'multi', sensitive: q.sensitive, values });
    else if (q.type === 'bool') byId.set(q.id, { id: q.id, kind: 'bool', sensitive: q.sensitive });
    else throw new Error(`Unsupported question type in pack: ${q.type}`);
  }
  byId.set(INCOME_STEP, { id: INCOME_STEP, kind: 'income', sensitive: false, bands: bands.annualIncome });
  const order = pack.questionOrder ?? [INCOME_STEP, ...pack.questions.map((q) => q.id)];
  const steps = order.map((id) => {
    const step = byId.get(id);
    if (!step) throw new Error(`questionOrder names an unknown step: ${id}`);
    return step;
  });
  if (new Set(order).size !== byId.size || steps.length !== byId.size) throw new Error('questionOrder must list every question once');
  return steps;
}

/** Checks one answer against its step. Returns an error key, or null when valid. */
export function validateAnswer(step: Step, value: AnswerValue): 'q.error.integer' | 'q.error.choose' | 'q.error.amount' | null {
  switch (step.kind) {
    case 'int':
      return typeof value === 'number' && Number.isInteger(value) && value >= step.min && value <= step.max ? null : 'q.error.integer';
    case 'enum':
      return typeof value === 'string' && step.values.includes(value) ? null : 'q.error.choose';
    case 'multi':
      // Zero selections is a valid answer ("none of these"), distinct from skipping (null).
      return Array.isArray(value) &&
        value.every((v) => typeof v === 'string' && step.values.includes(v)) &&
        new Set(value).size === value.length
        ? null
        : 'q.error.choose';
    case 'bool':
      return typeof value === 'boolean' ? null : 'q.error.choose';
    case 'income': {
      if (!isIncomeAnswer(value)) return 'q.error.choose';
      if (value.kind === 'band') return step.bands.some((b) => b.id === value.bandId) ? null : 'q.error.choose';
      return Number.isFinite(value.amount) && value.amount >= 0 && value.amount <= MAX_EXACT_INCOME ? null : 'q.error.amount';
    }
  }
}

/** Converts Quick Check answers to verdict-engine answers (rulepacks/SPEC.md section 4). */
export function toEngineAnswers(steps: readonly Step[], answers: QuickCheckAnswers): Answers {
  const out: Record<string, unknown> = {};
  for (const step of steps) {
    const value = answers[step.id];
    if (value === undefined || value === null || validateAnswer(step, value) !== null) continue;
    if (step.kind === 'income' && isIncomeAnswer(value)) {
      if (value.kind === 'band') out['incomeBand'] = value.bandId;
      else out['annualIncome'] = value.amount;
    } else {
      out[step.id] = value;
    }
  }
  return out as Answers;
}

/** The step id a verdict-engine variable comes from (`annualIncome` comes from `income`). */
export const stepForVariable = (variable: string): string => (variable === 'annualIncome' ? 'income' : variable);

export function computeVerdicts(pack: RulePack, bands: Bands, steps: readonly Step[], answers: QuickCheckAnswers): ProgramVerdict[] {
  return verdicts(pack, bands, Raw.of(toEngineAnswers(steps, answers)));
}

export const VERDICT_ORDER: readonly Verdict[] = ['likely', 'maybe', 'depends', 'unlikely'];

/** Programs grouped by verdict in display order; empty groups are omitted. */
export function groupByVerdict(results: readonly ProgramVerdict[]): { verdict: Verdict; programs: ProgramVerdict[] }[] {
  // Within a verdict, programs with an estimated amount first, the largest first; then those with only a published
  // maximum ("Up to"), the largest first; the rest in pack order.
  const amount = (r: ProgramVerdict) => (r.estimatedAmount !== undefined && r.estimatedAmount > 0 ? r.estimatedAmount : 0);
  const upTo = (r: ProgramVerdict) => (amount(r) === 0 && r.upToAmount !== undefined && r.upToAmount > 0 ? r.upToAmount : 0);
  const order = (a: ProgramVerdict, b: ProgramVerdict) => amount(b) - amount(a) || upTo(b) - upTo(a);
  return VERDICT_ORDER.map((verdict) => ({ verdict, programs: results.filter((r) => r.verdict === verdict).sort(order) })).filter(
    (g) => g.programs.length > 0,
  );
}

/** Index of the first step without an answer (answered or skipped), or steps.length when done. */
export function firstOpenStep(steps: readonly Step[], answers: QuickCheckAnswers): number {
  const i = steps.findIndex((s) => !Object.hasOwn(answers, s.id));
  return i === -1 ? steps.length : i;
}

/** Drops answers that do not belong to a step or no longer validate (for data loaded from storage). */
export function sanitizeAnswers(steps: readonly Step[], input: unknown): QuickCheckAnswers {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Record<string, AnswerValue | null> = {};
  for (const step of steps) {
    if (!Object.hasOwn(input, step.id)) continue;
    const value = (input as Record<string, unknown>)[step.id];
    if (value === null) out[step.id] = null;
    else if (validateAnswer(step, value as AnswerValue) === null) out[step.id] = value as AnswerValue;
  }
  return out;
}

/**
 * The exact profile for the Generalizer: income, household size and housing from Quick Check, and
 * the county the person chose. Answers to sensitive questions and every other answer are left out:
 * only the six silhouette fields can ever be generalized (rulepacks/SPEC.md section 6).
 */
export function exactProfile(
  jurisdiction: string,
  steps: readonly Step[],
  answers: QuickCheckAnswers,
  county: string | null,
): Raw<ExactProfile> {
  const engine = toEngineAnswers(steps, answers);
  const open = (id: string) => steps.some((s) => s.id === id && !s.sensitive);
  const out: Record<string, unknown> = { jurisdiction };
  if (typeof engine.annualIncome === 'number') out['annualIncome'] = engine.annualIncome;
  else if (typeof engine.incomeBand === 'string') out['incomeBand'] = engine.incomeBand;
  if (open('householdSize') && typeof engine['householdSize'] === 'number') out['householdSize'] = engine['householdSize'];
  if (open('housing') && typeof engine['housing'] === 'string') out['housing'] = engine['housing'];
  if (county !== null) out['county'] = county;
  return Raw.of(out as unknown as ExactProfile);
}

/**
 * Money variables of a rule pack: the reserved yearly income, and answers that are amounts of income
 * (such as investment income). Asked as an amount and shown as money.
 */
export const isMoneyVariable = (variable: string): boolean => variable === 'annualIncome' || /^(?!has).*income$/i.test(variable);
