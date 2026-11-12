// Program facts from the rule pack and its copy: the "Program facts" an explanation is given.
import { asPublic, type Public } from '../../core/types';
import type { Program } from '../../core/rules';
import type { ProgramFacts } from '../../ai/tasks';
import { dynamicKey, lookup, programName, type Locale, type Translate } from '../i18n';

/** Rule-pack facts for one program in the UI language (static content, so Public). */
export function programFacts(t: Translate, locale: Locale, program: Program): Public<ProgramFacts> {
  const criteria: Record<string, string> = {};
  for (const c of program.criteria) criteria[c.id] = t(dynamicKey(`criterion.${program.id}.${c.id}`));
  const sentences = [`${t('answers.facts.checks')} ${Object.values(criteria).join('; ')}.`];
  if (program.period) sentences.push(t('answers.facts.period', { period: program.period }));
  for (const key of program.caveats ?? []) {
    const text = lookup(locale, `caveat.${key}`);
    if (text) sentences.push(`${t('answers.facts.note')} ${text}`);
  }
  return asPublic({
    programId: program.id,
    name: programName(locale, program),
    facts: sentences.join(' '),
    criteria,
    verdictWords: {
      likely: t('verdict.likely'),
      maybe: t('verdict.maybe'),
      depends: t('verdict.depends'),
      unlikely: t('verdict.unlikely'),
    },
    stateNotes: { fail: t('answers.criterion.notMet'), unknown: t('answers.criterion.notSent') },
  });
}

