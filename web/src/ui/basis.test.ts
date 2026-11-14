// The "how this was worked out" line must reproduce the result it shows.
import { describe, expect, it } from 'vitest';
import { Raw } from '../core/types';
import { validatePaystubs, type PaystubValues } from '../core/validate';
import { basisText } from './screens/DocumentReview';
import { formatMoney, translator } from './i18n';

const t = translator('en');
const num = (s: string) => Number(s.replace(/[$,]/g, ''));

function check(stubs: PaystubValues[]) {
  const annual = validatePaystubs(Raw.of(stubs), 'us-ca').annualization!;
  const line = basisText(annual, stubs, 'en', t);
  return { annual, line };
}

describe('annualization basis line', () => {
  it('YTD: ytd ÷ shown months × 12 rounds to the shown result', () => {
    for (const [ytd, end] of [[23103.25, '10/15/2026'], [12345.67, '07/19/2026'], [1000.01, '02/03/2026'], [99999.99, '12/30/2026'], [5432.1, '03/31/2026']] as const) {
      const { annual, line } = check([{ ytdGross: ytd, grossPay: 1, payFrequency: 'monthly', periodEnd: end }]);
      const m = /gross (\$[\d,.]+) through .* ÷ ([\d,.]+) months × 12 = (\$[\d,]+)/.exec(line)!;
      expect(Math.round((num(m[1]!) / num(m[2]!)) * 12), line).toBe(num(m[3]!));
      expect(num(m[3]!)).toBe(annual.annualIncome);
    }
  });

  it('several paystubs: (sum ÷ count) × periods rounds to the shown result', () => {
    const stubs: PaystubValues[] = [
      { grossPay: 1500.01, payFrequency: 'biweekly', periodStart: '09/07/2026', periodEnd: '09/20/2026' },
      { grossPay: 1620.02, payFrequency: 'biweekly', periodStart: '09/21/2026', periodEnd: '10/04/2026' },
      { grossPay: 1555.55, payFrequency: 'biweekly', periodStart: '10/05/2026', periodEnd: '10/18/2026' },
    ];
    const { annual, line } = check(stubs);
    const m = /\((\$[\d,.]+) ÷ (\d+) paystubs\) × (\d+) pay periods a year = (\$[\d,]+)/.exec(line)!;
    expect(Math.round((num(m[1]!) / Number(m[2])) * Number(m[3]))).toBe(num(m[4]!));
    expect(num(m[4]!)).toBe(annual.annualIncome);
  });

  it('amounts are money in the pack currency, formatted for the language', () => {
    const annual = validatePaystubs(Raw.of([{ grossPay: 1271.88, payFrequency: 'semimonthly' }]), 'us-ca').annualization!;
    // The pack's numberFormat (en-US) in every interface language, always grouped.
    expect(basisText(annual, [{ grossPay: 1271.88, payFrequency: 'semimonthly' }], 'es', translator('es'))).toContain('$1,271.88');
    expect(formatMoney('en', 3000)).toBe('$3,000');
    expect(formatMoney('en', 28000.5)).toBe('$28,000.50');
    expect(formatMoney('es', 30524)).toBe('$30,524');
    expect(formatMoney('es', 3000)).toBe('$3,000');
    expect(formatMoney('ko', 1998)).toBe('$1,998');
  });

  it('one paystub: gross × periods', () => {
    const { line } = check([{ grossPay: 1271.88, payFrequency: 'semimonthly' }]);
    expect(line).toBe('Average gross per pay period $1,271.88 × 24 pay periods a year = $30,525');
  });
});
