import { describe, expect, it } from 'vitest';

import sharedEn from '../../../shared/copy/en.json';
import sharedEs from '../../../shared/copy/es.json';
import sharedKo from '../../../shared/copy/ko.json';
import localEn from './copy.local.json';
import packEn from '../../../shared/rulepacks/zz-test/copy/en.json';
import { LOCALES, format, lookup, programName, translator } from './i18n';
import { BANDS, PACK, PACK_COPY } from './pack';
import { buildSteps } from './quickcheck';

describe('copy', () => {
  it('has a label for every question, option, variable, criterion, caveat and verdict in the pack', () => {
    const keys = [
      ...buildSteps(PACK, BANDS).map((s) => `question.${s.id}.label`),
      ...PACK.questions.flatMap((q) => (q.values ?? []).map((v) => `option.${q.id}.${v}`)),
      ...PACK.questions.map((q) => `variable.${q.id}`),
      'variable.annualIncome',
      ...PACK.programs.flatMap((p) => p.criteria.map((c) => `criterion.${p.id}.${c.id}`)),
      ...PACK.programs.flatMap((p) => (p.caveats ?? []).map((c) => `caveat.${c}`)),
      ...['likely', 'maybe', 'depends', 'unlikely'].map((v) => `verdict.${v}`),
      ...['pass', 'fail', 'mixed', 'unknown'].map((s) => `state.${s}`),
      `pack.${PACK.jurisdiction}.name`,
    ];
    for (const key of keys) for (const locale of LOCALES) expect(lookup(locale, key), `${locale}:${key}`).toBeDefined();
  });

  it('uses program.{id}.name from the pack copy and falls back to programs[].name', () => {
    for (const p of PACK.programs) expect(programName('en', p)).toBe(PACK_COPY.en[`program.${p.id}.name`]);
    expect(programName('ko', { id: 'not-in-copy', name: 'Fallback Name' })).toBe('Fallback Name');
  });

  it('prefers the active locale and falls back to English per key', () => {
    expect(translator('ko')('verdict.likely')).not.toBe(sharedEn['verdict.likely']);
    expect(lookup('es', 'no.such.key')).toBeUndefined();
  });

  it('local keys never shadow shared or pack keys', () => {
    const taken = new Set([...Object.keys(sharedEn), ...Object.keys(sharedEs), ...Object.keys(sharedKo), ...Object.keys(packEn)]);
    for (const key of Object.keys(localEn)) expect(taken.has(key), key).toBe(false);
  });

  it('formats placeholders', () => {
    expect(format('Question {n} of {total}', { n: 2, total: 5 })).toBe('Question 2 of 5');
    expect(format('{missing} stays', {})).toBe('{missing} stays');
  });
});
