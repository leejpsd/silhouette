import { describe, expect, it } from 'vitest';

import sharedEn from '../../../shared/copy/en.json';
import sharedEs from '../../../shared/copy/es.json';
import sharedKo from '../../../shared/copy/ko.json';
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

  it('every app key exists in es and ko too', () => {
    for (const key of Object.keys(sharedEn)) {
      expect(key in sharedEs, `es:${key}`).toBe(true);
      expect(key in sharedKo, `ko:${key}`).toBe(true);
    }
  });

  it('formats placeholders', () => {
    expect(format('Question {n} of {total}', { n: 2, total: 5 })).toBe('Question 2 of 5');
    expect(format('{missing} stays', {})).toBe('{missing} stays');
  });
});

describe('pack periods in the UI language', () => {
  it('reads "Tax year 2025" and date ranges', async () => {
    const { packPeriod, translator } = await import('./i18n');
    expect(packPeriod('en', 'Tax year 2025', translator('en'))).toBe('tax year 2025');
    expect(packPeriod('es', 'Tax year 2025', translator('es'))).toBe('el año fiscal 2025');
    expect(packPeriod('es', 'October 1, 2026 - September 30, 2027', translator('es'))).toBe('1 de octubre de 2026 – 30 de septiembre de 2027');
    expect(packPeriod('en', 'June 1, 2026 - May 31, 2027', translator('en'))).toBe('June 1, 2026 – May 31, 2027');
    expect(packPeriod('en', 'something else', translator('en'))).toBe('something else');
  });
});
