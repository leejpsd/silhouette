// Checks on model text (shared/prompts/OUTPUT_CHECKS.md): a model explains, it never decides.
// Ported from modelTextIsBlocked() in shared/reference/silhouette.mjs.

export interface OutputChecks {
  readonly version: number;
  readonly locales: Readonly<
    Record<string, { readonly allowBefore: readonly string[]; readonly definite: readonly string[]; readonly overall: readonly string[] }>
  >;
}

/** `general`: tasks that only know the silhouette. `personal`: on-device tasks given the person's result. */
export type OutputScope = 'general' | 'personal';

/** Whether a model's text states a result that only the rule engine may state. */
export function modelTextIsBlocked(text: string, locale: string, scope: OutputScope, checks: OutputChecks): boolean {
  const rules = Object.hasOwn(checks.locales, locale) ? checks.locales[locale] : checks.locales['en'];
  if (!rules) return false;
  const haystack = text.normalize('NFC').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
  const phrases = scope === 'general' ? [...rules.definite, ...rules.overall] : rules.definite;
  for (const phrase of phrases) {
    for (let at = haystack.indexOf(phrase); at !== -1; at = haystack.indexOf(phrase, at + 1)) {
      const before = haystack.slice(0, at);
      if (!rules.allowBefore.some((lead) => before.endsWith(lead))) return true;
    }
  }
  return false;
}
