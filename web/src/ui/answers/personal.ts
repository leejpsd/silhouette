// The person's own result, from the rule engine: the "Why this result" lines on screen, and the
// input of the on-device explanation and typed questions. Holds exact values, so it is only shown on
// this device and only passed on as Raw to ONLY_ON_DEVICE tasks.

import { useMemo } from 'react';
import { criterionReasons, type Comparison, type CriterionReason, type CriterionState, type Program, type Verdict } from '../../core/rules';
import type { IncomeBand } from '../../core/generalize';
import { Raw } from '../../core/types';
import type { PersonalResult } from '../../ai/on-device';
import { useApp } from '../context';
import { dynamicKey, formatMoney, formatNumber, lookup, programName, type Locale, type Translate } from '../i18n';
import { BANDS, PACK } from '../pack';
import { toEngineAnswers } from '../quickcheck';
import { programFacts } from './facts';

export interface WhyRow {
  readonly id: string;
  readonly label: string;
  readonly state: CriterionState;
  /** What the state means here: the state word, or what the state depends on when it is not the income. */
  readonly stateText: string;
  /** `limit {limit}, yours {value}` for each comparison that produces the state (rules in why.ts notes). */
  readonly limits: readonly { readonly limit: string; readonly yours: string }[];
  /** How the criterion was met another way, and which household size a limit is for. */
  readonly notes: readonly string[];
}

const isBand = (value: Comparison['yours']): value is IncomeBand => typeof value === 'object' && value !== null;

export { isMoneyVariable } from '../quickcheck';
import { isMoneyVariable } from '../quickcheck';

/** A value as shown: a number, or an income band as its range; money in the pack's currency when `money`. */
export function shownValue(locale: Locale, value: Comparison['yours'], none: string, money = false): string {
  const n = (v: number) => (money ? formatMoney(locale, v) : formatNumber(locale, v));
  if (value === null) return none;
  if (isBand(value)) return value.max === null ? `${n(value.min)}+` : `${n(value.min)}–${n(value.max)}`;
  return n(value);
}

/** The label of an answer that met a criterion: the option chosen when there is one, else the question's subject. */
function answerLabel(locale: Locale, variable: string, value: string | null): string {
  return (value !== null ? lookup(locale, `option.${variable}.${value}`) : undefined) ?? lookup(locale, `variable.${variable}`) ?? variable;
}

/**
 * The reasons as lines that never contradict the verdict:
 * 1. "limit / yours" is shown only for a comparison that produces the criterion's state;
 * 2. a criterion met another way (an `or` branch such as receiving a benefit) says which way;
 * 3. a `mixed` state that comes from `uncertainIf` says what it depends on instead of the income;
 * 4. a limit looked up for the largest household size in the table says so.
 * On screen (`money`, the default) income limits and answers are money; the on-device prompt keeps
 * plain numbers.
 */
export function whyRows(t: Translate, locale: Locale, program: Program, reasons: readonly CriterionReason[], money = true): WhyRow[] {
  return reasons.map((r) => {
    const shown = r.comparisons.filter((c) => c.limit !== null && c.decisive);
    const notes: string[] = [];
    if (r.metBy) notes.push(t('why.metBy', { way: answerLabel(locale, r.metBy.variable, r.metBy.value) }));
    const cap = shown.find((c) => c.capped !== undefined)?.capped;
    if (cap !== undefined) notes.push(t('why.capNote', { cap }));
    const stateText =
      r.exception && r.exception.length > 0
        ? t('why.exception', { what: r.exception.map((v) => lookup(locale, `variable.${v}`) ?? v).join(', ') })
        : t(dynamicKey(`state.${r.state}`));
    return {
      id: r.id,
      label: t(dynamicKey(`criterion.${program.id}.${r.id}`)),
      state: r.state,
      stateText,
      limits: shown.map((c) => {
        const isMoney = money && isMoneyVariable(c.variable);
        return { limit: shownValue(locale, c.limit as number, '', isMoney), yours: shownValue(locale, c.yours, t('send.unanswered'), isMoney) };
      }),
      notes,
    };
  });
}

/** State words of shared/prompts/explain-personal.v1.md (the prompt is in English). */
const PROMPT_STATE: Readonly<Record<CriterionState, string>> = {
  pass: 'met',
  fail: 'not met',
  mixed: 'depends on your exact income',
  unknown: 'not answered',
};

/** The person's result for the on-device prompts. */
export function personalResult(t: Translate, locale: Locale, program: Program, verdict: Verdict, reasons: readonly CriterionReason[]): Raw<PersonalResult> {
  const lines = whyRows(t, 'en', program, reasons, false).map((row) => {
    const limits = row.limits.map((l) => ` (limit ${l.limit}, yours ${l.yours})`).join('');
    const notes = row.notes.map((n) => ` ${n}`).join('');
    const state = row.stateText === t(dynamicKey(`state.${row.state}`)) ? PROMPT_STATE[row.state] : row.stateText;
    return `- ${row.label}: ${state}${limits}${notes}`;
  });
  return Raw.of({
    locale,
    programName: programName(locale, program),
    facts: programFacts(t, locale, program).facts,
    verdictLabel: t(dynamicKey(`verdict.${verdict}`)),
    verdict,
    criteriaLines: lines.join('\n'),
  });
}

/** The rule engine's reasons for this program, from the current answers. */
export function useReasons(programId: string): CriterionReason[] {
  const { steps, answers } = useApp();
  return useMemo(() => {
    try {
      return criterionReasons(PACK, BANDS, Raw.of(toEngineAnswers(steps, answers)), programId);
    } catch {
      return [];
    }
  }, [steps, answers, programId]);
}
