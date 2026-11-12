import { describe, expect, it } from 'vitest';

import sharedEn from '../../../shared/copy/en.json';
import local from './copy.local.json';
import { LOCALES, format, lookup, programName, translator } from './i18n';
import { BANDS, PACK, PACK_COPY } from './pack';
import { buildSteps } from './quickcheck';

describe('copy', () => {
  it('local keys never shadow shared or pack keys', () => {
    for (const locale of LOCALES) {
      for (const key of Object.keys(local[locale])) {
        expect(Object.hasOwn(sharedEn, key), `${locale}:${key} is in shared/copy`).toBe(false);
        expect(Object.hasOwn(PACK_COPY.en, key), `${locale}:${key} is in the pack copy`).toBe(false);
      }
    }
  });

  it('every local es/ko key also exists in en', () => {
    for (const locale of ['es', 'ko'] as const) {
      for (const key of Object.keys(local[locale])) expect(Object.hasOwn(local.en, key), `${locale}:${key}`).toBe(true);
    }
  });

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
    const phone = PACK.programs.find((p) => p.id === 'phone-discount')!;
    const work = PACK.programs.find((p) => p.id === 'work-credit')!;
    expect(programName('en', phone)).toBe(PACK_COPY.en['program.phone-discount.name']);
    expect(Object.hasOwn(PACK_COPY.en, 'program.work-credit.name')).toBe(false);
    expect(programName('ko', work)).toBe(work.name);
  });

  it('prefers the active locale and falls back to English per key', () => {
    expect(translator('ko')('verdict.likely')).not.toBe(sharedEn['verdict.likely']);
    expect(lookup('es', 'no.such.key')).toBeUndefined();
  });

  it('formats placeholders', () => {
    expect(format('Question {n} of {total}', { n: 2, total: 5 })).toBe('Question 2 of 5');
    expect(format('{missing} stays', {})).toBe('{missing} stays');
  });
});
