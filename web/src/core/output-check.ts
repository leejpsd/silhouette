// Checks on model text (shared/prompts/OUTPUT_CHECKS.md, version 2): a model explains, it never
// decides. Ported from modelTextIsBlocked() in shared/reference/silhouette.mjs.

export interface OutputChecks {
  readonly version: number;
  readonly locales: Readonly<
    Record<
      string,
      {
        readonly allowBefore: readonly string[];
        readonly definite: readonly string[];
        readonly positive: readonly string[];
        readonly negative: readonly string[];
        readonly criterion: readonly string[];
      }
    >
  >;
}

/** `general`: tasks that know nothing about the person. `personal`: on-device tasks given the person's result. */
export type OutputScope = 'general' | 'personal';

/** The verdict on screen, for scope `personal`. */
export type ShownVerdict = 'likely' | 'maybe' | 'depends' | 'unlikely';

/** Soft hyphen, zero-width space / non-joiner / joiner, word joiner, byte-order mark. */
const INVISIBLE = /[­​-‍⁠﻿]/g;

/**
 * Whether a model's text states a result that only the rule engine may state. `locale` is the answer
 * language of the request. For scope `personal`, `verdict` is the verdict on screen: a hedge that
 * contradicts it is blocked.
 */
export function modelTextIsBlocked(text: string, locale: string, scope: OutputScope, checks: OutputChecks, verdict?: ShownVerdict): boolean {
  const rules = Object.hasOwn(checks.locales, locale) ? checks.locales[locale] : checks.locales['en'];
  if (!rules) return false;
  const haystack = text.normalize('NFC').toLowerCase().replace(INVISIBLE, '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
  const phrases = [...rules.definite];
  if (scope === 'general') phrases.push(...rules.positive, ...rules.negative, ...rules.criterion);
  else if (verdict === 'unlikely') phrases.push(...rules.positive);
  else if (verdict === 'likely') phrases.push(...rules.negative);
  for (const phrase of phrases) {
    for (let at = haystack.indexOf(phrase); at !== -1; at = haystack.indexOf(phrase, at + 1)) {
      const before = haystack.slice(0, at);
      if (!rules.allowBefore.some((lead) => before.endsWith(lead))) return true;
    }
  }
  return false;
}
