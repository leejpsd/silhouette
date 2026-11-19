import { describe, expect, it } from 'vitest';
import { validatePaystubs } from '../core/validate';
import { Raw } from '../core/types';
import { EXAMPLE_INCOME } from './screens/Start';

describe('the start screen example', () => {
  it('shows the yearly income the app works out from the same sample paystub', () => {
    const result = validatePaystubs(
      Raw.of([{ grossPay: 1271.88, netPay: 1100.92, ytdGross: 23103.25, payFrequency: 'semimonthly', payDate: '10/20/2026', periodStart: '10/01/2026', periodEnd: '10/15/2026' }]),
      'us-ca',
    );
    expect(result.annualization?.annualIncome).toBe(EXAMPLE_INCOME);
  });
});
