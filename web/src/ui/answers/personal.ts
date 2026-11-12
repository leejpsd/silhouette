// The person's own result, from the rule engine: the "Why this result" lines on screen, and the
// input of the on-device explanation and typed questions. Holds exact values, so it is only shown on
// this device and only passed on as Raw to ONLY_ON_DEVICE tasks.

import { useMemo } from 'react';
import { criterionReasons, type Comparison, type CriterionReason, type CriterionState, type Program, type Verdict } from '../../core/rules';
import type { IncomeBand } from '../../core/generalize';
import { Raw } from '../../core/types';
import type { PersonalResult } from '../../ai/on-device';
import { useApp } from '../context';
import { dynamicKey, formatNumber, programName, type Locale, type Translate } from '../i18n';
import { BANDS, PACK } from '../pack';
import { toEngineAnswers } from '../quickcheck';
import { programFacts } from './facts';

export interface WhyRow {
  readonly id: string;
  readonly label: string;
  readonly state: CriterionState;
  /** `limit {limit}, yours {value}` for each comparison with a limit the rules state. */
  readonly limits: readonly { readonly limit: string; readonly yours: string }[];
}

const isBand = (value: Comparison['yours']): value is IncomeBand => typeof value === 'object' && value !== null;

/** A value as shown: a number, or an income band as its range. */
function shown(locale: Locale, value: Comparison['yours'], none: string): string {
  if (value === null) return none;
  if (isBand(value)) return value.max === null ? `${formatNumber(locale, value.min)}+` : `${formatNumber(locale, value.min)}–${formatNumber(locale, value.max)}`;
  return formatNumber(locale, value);
}

export function whyRows(t: Translate, locale: Locale, program: Program, reasons: readonly CriterionReason[]): WhyRow[] {
  return reasons.map((r) => ({
    id: r.id,
    label: t(dynamicKey(`criterion.${program.id}.${r.id}`)),
    state: r.state,
    limits: r.comparisons
      .filter((c) => c.limit !== null)
      .map((c) => ({ limit: formatNumber(locale, c.limit as number), yours: shown(locale, c.yours, t('send.unanswered')) })),
  }));
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
  const lines = whyRows(t, 'en', program, reasons).map((row) => {
    const limits = row.limits.map((l) => ` (limit ${l.limit}, yours ${l.yours})`).join('');
    return `- ${row.label}: ${PROMPT_STATE[row.state]}${limits}`;
  });
  return Raw.of({
    locale,
    programName: programName(locale, program),
    facts: programFacts(t, locale, program).facts,
    verdictLabel: t(dynamicKey(`verdict.${verdict}`)),
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
