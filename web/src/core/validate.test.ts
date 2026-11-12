import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { Raw } from './types';
import {
  ValidationInputError,
  dayNumber,
  frequencyForLength,
  parseDate,
  toCents,
  validatePaystubs,
  type PaystubValues,
} from './validate';

const rehydrateFixture = JSON.parse(
  readFileSync(new URL('../../../shared/fixtures/conformance/rehydrate.json', import.meta.url), 'utf8'),
) as { cases: { id: string; expected: PaystubValues }[] };
const fixture = (id: string): PaystubValues => rehydrateFixture.cases.find((c) => c.id === id)!.expected;
const statuses = (checks: readonly { id: string; status: string }[]) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

describe('money', () => {
  it('converts to integer cents, half away from zero, and rejects bad values', () => {
    expect(toCents(1271.88)).toBe(127188);
    expect(toCents(0.005)).toBe(1);
    expect(toCents(2485000)).toBe(248500000);
    expect(() => toCents(-1)).toThrow(ValidationInputError);
    expect(() => toCents(Number.NaN)).toThrow(ValidationInputError);
  });
});

describe('dates', () => {
  it('uses the jurisdiction order unless the first component has four digits', () => {
    expect(parseDate('10/20/2026', 'us-ca')).toEqual({ year: 2026, month: 10, day: 20 });
    expect(parseDate('10/20/2026', 'zz-test')).toEqual({ year: 2026, month: 10, day: 20 });
    expect(parseDate('2026-10-25', 'us-ca')).toEqual({ year: 2026, month: 10, day: 25 });
    expect(parseDate('2026.10.25', 'kr')).toEqual({ year: 2026, month: 10, day: 25 });
    expect(parseDate('26.10.25', 'kr')).toEqual({ year: 2026, month: 10, day: 25 });
    expect(parseDate('10/20/26', 'us-ca')).toEqual({ year: 2026, month: 10, day: 20 });
  });
  it('rejects impossible or ambiguous dates', () => {
    expect(parseDate('15/10/2026', 'us-ca')).toBeNull(); // month 15
    expect(parseDate('02/29/2026', 'us-ca')).toBeNull(); // not a leap year
    expect(parseDate('02/29/2028', 'us-ca')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseDate('10/20/2026', 'xx-unknown')).toBeNull();
    expect(parseDate('10/20/202', 'us-ca')).toBeNull();
    expect(parseDate('2026-1-5', 'kr')).toEqual({ year: 2026, month: 1, day: 5 });
    expect(parseDate('1899-12-31', 'kr')).toBeNull();
    expect(parseDate('Oct 20 2026', 'us-ca')).toEqual({ year: 2026, month: 10, day: 20 }); // month-name date
    expect(parseDate('17 de octubre de 2026', 'kr')).toEqual({ year: 2026, month: 10, day: 17 });
    expect(parseDate('February 30, 2026', 'us-ca')).toBeNull();
    expect(parseDate('Oct 20', 'us-ca')).toBeNull();
  });
  it('counts days without time zones', () => {
    expect(dayNumber({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(dayNumber({ year: 2026, month: 10, day: 15 }) - dayNumber({ year: 2026, month: 10, day: 1 })).toBe(14);
    expect(dayNumber({ year: 2025, month: 3, day: 1 }) - dayNumber({ year: 2025, month: 2, day: 28 })).toBe(1);
  });
});

describe('frequency from period length', () => {
  it('maps lengths to frequencies', () => {
    expect([7, 14, 13, 15, 16, 28, 31, 10].map(frequencyForLength)).toEqual([
      'weekly', 'biweekly', 'semimonthly', 'semimonthly', 'semimonthly', 'monthly', 'monthly', null,
    ]);
  });
});

describe('sample paystub (shared/samples/paystub-en-01, as rehydrated by the fixture)', () => {
  const en = fixture('paystub-en-01-correct');
  const result = validatePaystubs(Raw.of([en]), 'zz-test');

  it('runs every check', () => {
    expect(statuses(result.checks[0]!)).toEqual({
      'net-sum': 'ok',
      'rate-hours': 'warn', // overtime: 18.50 × 62 = 1,147.00 ≠ 1,271.88
      'period-length': 'ok',
      'pay-date': 'ok',
      'ytd-gross': 'ok',
      'ytd-periods': 'ok',
      'dates-parsed': 'ok',
    });
  });

  it('annualizes with YTD: 23,103.25 × 12 × 31 / (9 × 31 + 15) = 29,232.68 → 29,233', () => {
    expect(result.annualization).toEqual({
      annualIncome: 29233,
      method: 'ytd',
      basis: {
        ytdCents: 2310325,
        referenceDate: '2026-10-15',
        elapsedMonths: { numerator: 294, denominator: 31 },
        stubsUsed: [0],
      },
    });
  });

  it('falls back to the average method without YTD: 1,271.88 × 24 = 30,525.12 → 30,525', () => {
    const r = validatePaystubs(Raw.of([{ ...en, ytdGross: undefined }]), 'zz-test');
    expect(r.annualization).toMatchObject({ annualIncome: 30525, method: 'average', basis: { periodsPerYear: 24, averageGrossCents: 127188 } });
  });

  it('flags a net pay that does not add up', () => {
    const r = validatePaystubs(Raw.of([{ ...en, netPay: 1200 }]), 'zz-test');
    expect(statuses(r.checks[0]!)['net-sum']).toBe('warn');
  });
});

describe('Korean payslip (no YTD, no frequency on the document)', () => {
  const ko = fixture('payslip-ko-01-correct');

  it('cannot annualize until a frequency is known', () => {
    const r = validatePaystubs(Raw.of([ko]), 'kr');
    expect(r.failure).toBe('no-frequency');
    expect(statuses(r.checks[0]!)['net-sum']).toBe('ok'); // 2,485,000 − 250,560 = 2,234,440
  });

  it('annualizes monthly once the user chooses the frequency: 2,485,000 × 12', () => {
    const r = validatePaystubs(Raw.of([{ ...ko, payFrequency: 'monthly' as const }]), 'kr');
    expect(r.annualization).toMatchObject({ annualIncome: 29820000, method: 'average' });
  });
});

describe('several paystubs', () => {
  const stub = (end: string, gross: number, ytd?: number): PaystubValues => ({
    periodStart: end.replace(/\/(\d+)\//, '/01/'),
    periodEnd: end,
    payFrequency: 'monthly',
    grossPay: gross,
    ytdGross: ytd,
  });

  it('uses the latest stub for YTD and ignores input order', () => {
    const a = stub('09/30/2026', 3000, 27000);
    const b = stub('10/31/2026', 3200, 30200);
    const r1 = validatePaystubs(Raw.of([a, b]), 'us-ca');
    const r2 = validatePaystubs(Raw.of([b, a]), 'us-ca');
    expect(r1.annualization?.annualIncome).toBe(36240); // 30,200 × 12 / 10
    expect(r2.annualization?.annualIncome).toBe(36240);
    expect(r1.annualization?.basis.stubsUsed).toEqual([1]);
  });

  it('averages gross over stubs of the same frequency and drops duplicates', () => {
    const r = validatePaystubs(Raw.of([stub('09/30/2026', 3000), stub('10/31/2026', 3300), stub('10/31/2026', 3300)]), 'us-ca');
    expect(r.duplicates).toEqual([2]);
    expect(r.annualization).toMatchObject({ annualIncome: 37800, method: 'average', basis: { averageGrossCents: 315000, stubsUsed: [0, 1] } });
  });

  it('does not use YTD in the first month of the year', () => {
    const r = validatePaystubs(Raw.of([{ ...stub('01/15/2026', 2000, 2000), periodStart: '01/01/2026', payFrequency: 'semimonthly' as const }]), 'us-ca');
    expect(r.annualization?.method).toBe('average');
    expect(r.annualization?.annualIncome).toBe(48000);
  });

  it('reports no-gross when nothing has a gross amount', () => {
    expect(validatePaystubs(Raw.of([{ netPay: 100 }]), 'us-ca').failure).toBe('no-gross');
  });

  it('rejects negative money and unknown frequencies', () => {
    expect(() => validatePaystubs(Raw.of([{ grossPay: -5 }]), 'us-ca')).toThrow(ValidationInputError);
    expect(() => validatePaystubs(Raw.of([{ payFrequency: 'daily' as never }]), 'us-ca')).toThrow(ValidationInputError);
  });
});
