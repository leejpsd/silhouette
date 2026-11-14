// A program's public information from the rule pack and its copy (shared/rulepacks/SPEC.md section
// 2.1): shown on the program screen, and given to a model as `{programFacts}`.
import { asPublic, type Public } from '../../core/types';
import type { Program } from '../../core/rules';
import type { ProgramFacts } from '../../ai/tasks';
import { dynamicKey, lookup, programName, type Locale, type Translate } from '../i18n';
import { PACK } from '../pack';

export const PROGRAM_COPY_KEYS = ['summary', 'apply', 'documents', 'renewal', 'office'] as const;
export type ProgramCopyKey = (typeof PROGRAM_COPY_KEYS)[number];

/** The pack's optional program copy in the UI language (English when the language lacks a key). */
export function programCopy(locale: Locale, program: Program): Partial<Record<ProgramCopyKey, string>> {
  const out: Partial<Record<ProgramCopyKey, string>> = {};
  for (const key of PROGRAM_COPY_KEYS) {
    const text = lookup(locale, `program.${program.id}.${key}`);
    if (text) out[key] = text;
  }
  return out;
}

/** The answers a program's criteria use: `annualIncome` first, then in pack question order. */
export function programUses(program: Program): string[] {
  const used = new Set(program.criteria.flatMap((c) => c.requires ?? []));
  const order = ['annualIncome', ...PACK.questions.map((q) => q.id)];
  return order.filter((id) => used.has(id));
}

/**
 * `{programFacts}`, one item per line, skipping what is absent: the program copy, then "This program
 * uses: …" with the labels of the answers its criteria read, then "This program checks: …" with the
 * criterion labels. Static content, so Public.
 */
export function programFacts(t: Translate, locale: Locale, program: Program): Public<ProgramFacts> {
  const copy = programCopy(locale, program);
  const lines = PROGRAM_COPY_KEYS.flatMap((key) => (copy[key] ? [copy[key] as string] : []));
  const uses = programUses(program).flatMap((id) => {
    const label = lookup(locale, `variable.${id}`);
    return label ? [label] : [];
  });
  if (uses.length > 0) lines.push(`${t('answers.facts.uses')} ${uses.join('; ')}.`);
  lines.push(`${t('answers.facts.checks')} ${program.criteria.map((c) => t(dynamicKey(`criterion.${program.id}.${c.id}`))).join('; ')}.`);
  return asPublic({ programId: program.id, name: programName(locale, program), facts: lines.join('\n') });
}
