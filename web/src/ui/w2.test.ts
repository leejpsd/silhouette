// Form W-2 on the web (validation/SPEC.md section 9): the lines that show how the yearly income was
// worked out, the check of a model's answer, and the bundled sample's answer key.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from '../core/types';
import { skeletonize } from '../core/skeleton';
import { w2LeftOut, w2PointerProblems } from '../core/pointer-check';
import { leaveOutBoxes } from './doc/reading-checks';
import { validateW2s, type W2Values } from '../core/validate';
import { POINTER_SCHEMAS } from '../ai/tasks';
import { basisTextW2, incomeBasis } from './screens/DocumentReview';
import { incomeBasisLine } from './income-basis';
import { allowlistFor, introducersFor } from './doc/allowlists';
import { sampleAnswerKey } from './doc/offline-sample';
import { translator } from './i18n';

const t = translator('en');
const form = (wages: number, taxYear: number | null): W2Values => ({ wages, taxYear, medicareWages: wages });
const sampleText = readFileSync(new URL('../../../shared/samples/w2-en-01.txt', import.meta.url), 'utf8');
const answers = JSON.parse(readFileSync(new URL('../../../shared/samples/answers.json', import.meta.url), 'utf8')) as {
  samples: Record<string, { pointers: Record<string, unknown> }>;
};

describe('W-2 basis lines', () => {
  it('one form: box 1 as it is, with the tax year', () => {
    const annual = validateW2s(Raw.of([form(27640.18, 2025)])).annualization!;
    expect(basisTextW2(annual, 'en', t)).toBe('Wages on the 2025 W-2 (box 1) = $27,640');
    const basis = incomeBasis(annual)!;
    expect(basis).toEqual({ method: 'w2', wagesCents: 2764018, taxYear: 2025, forms: 1 });
    expect(incomeBasisLine(t, 'en', annual.annualIncome, basis)).toBe('$27,640 a year: the wages on your 2025 W-2 (box 1), as your employer reported them.');
  });

  it('two employers in one year: added together, and counted', () => {
    const annual = validateW2s(Raw.of([form(27640.18, 2025), form(4210.75, 2025)])).annualization!;
    expect(annual.annualIncome).toBe(31851);
    expect(basisTextW2(annual, 'en', t)).toBe('Wages on 2 W-2s for 2025 (box 1), added together = $31,851');
    expect(incomeBasisLine(t, 'en', annual.annualIncome, incomeBasis(annual)!)).toBe('$31,851 a year: the wages on your 2 W-2s for 2025 (box 1), added together.');
  });
});

describe('w2PointerProblems', () => {
  const { skeleton, map } = skeletonize(Raw.of(sampleText), allowlistFor('en'), introducersFor('en'));
  const key = answers.samples['w2-en-01.txt']!.pointers;

  it('accepts the sample answer key', () => {
    expect(w2PointerProblems(POINTER_SCHEMAS.w2, key, map)).toEqual([]);
  });

  it('refuses a year read from the title, a missing box 1, and a reference of the wrong kind', () => {
    expect(w2PointerProblems(POINTER_SCHEMAS.w2, { ...key, taxYear: 'N1' }, map)).toEqual(['taxYear:not-a-year']);
    const { wages, ...noWages } = key;
    void wages;
    expect(w2PointerProblems(POINTER_SCHEMAS.w2, noWages, map)).toEqual(['wages:missing']);
    expect(w2PointerProblems(POINTER_SCHEMAS.w2, { ...key, wages: 'W1' }, map)).toEqual(['wages:bad-reference', 'wages:missing']);
    // An amount with cents is not a year either (validation/SPEC.md section 9: an integer from 2000 to 2100).
    expect(w2PointerProblems(POINTER_SCHEMAS.w2, { ...key, taxYear: 'N14' }, map)).toEqual(['taxYear:not-a-year']);
  });

  it('refuses a money box answered from a number without cents, and leaves it out of the answer used', () => {
    // N7 is the street number of the address, N8 the ZIP code: the sample prints its amounts with cents.
    expect(w2PointerProblems(POINTER_SCHEMAS.w2, { ...key, wages: 'N7' }, map)).toEqual(['wages:not-money']);
    const left = w2LeftOut(POINTER_SCHEMAS.w2, { ...key, wages: 'N8', taxYear: 'N1' }, map);
    expect(left.fields).toEqual([{ field: 'wages', problem: 'not-money' }, { field: 'taxYear', problem: 'not-a-year' }]);
    const used = leaveOutBoxes('w2', { ...key, wages: 'N8' }, map);
    expect(used.pointers).not.toHaveProperty('wages');
    expect(used.leftOut).toEqual([{ field: 'wages', problem: 'not-money' }]);
    expect(leaveOutBoxes('w2', key, map)).toEqual({ pointers: key, leftOut: undefined });
  });

  it('boxes 1 and 2 swapped: tax withheld not below wages, so both are left out (contract v1.38)', () => {
    const swapped = { ...key, wages: 'N10', federalIncomeTaxWithheld: 'N9' };
    expect(w2PointerProblems(POINTER_SCHEMAS.w2, swapped, map)).toEqual(['wages:below-withheld']);
    const used = leaveOutBoxes('w2', swapped, map);
    expect(used.pointers).not.toHaveProperty('wages');
    expect(used.pointers).not.toHaveProperty('federalIncomeTaxWithheld');
    expect(used.leftOut).toEqual([{ field: 'wages', problem: 'not-consistent' }, { field: 'federalIncomeTaxWithheld', problem: 'not-consistent' }]);
  });

  it('the offline answer key covers the W-2 sample', () => {
    expect(skeleton).toContain('⟦N9⟧');
    expect(sampleAnswerKey(skeleton)).toEqual(key);
  });
});
