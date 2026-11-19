// Conformance cases for validation and annualization. generate.mjs runs them through
// validate.mjs and writes validate.json. Every platform must reproduce every `expected`.

const stub = (extra = {}) => ({
  grossPay: 1271.88,
  netPay: 1100.92,
  ytdGross: 23103.25,
  hoursWorked: 62,
  hourlyRate: 18.5,
  payFrequency: 'semimonthly',
  payDate: '10/20/2026',
  periodStart: '10/01/2026',
  periodEnd: '10/15/2026',
  deductions: [{ amount: 58.4, kind: 'federal_tax' }, { amount: 78.86 }, { amount: 18.44 }, { amount: 15.26 }],
  ...extra,
});
const bare = (extra) => ({ ...extra });
const drop = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

export const cases = [
  // ---- net-sum ----
  { id: 'net-sum-exact', jurisdiction: 'us-ca', stubs: [stub()] },
  { id: 'net-sum-within-1pct', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1000, netPay: 909, deductions: [{ amount: 100 }] })] },
  { id: 'net-sum-exactly-1pct-ok', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1000, netPay: 890, deductions: [{ amount: 100 }] })] },
  { id: 'net-sum-over-1pct-warn', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1000, netPay: 889.99, deductions: [{ amount: 100 }] })] },
  { id: 'net-sum-no-deductions-warn', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1000, netPay: 800 })] },
  { id: 'net-sum-skipped-without-net', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1000 })] },
  // ---- rate-hours ----
  { id: 'rate-hours-ok', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 740, hourlyRate: 18.5, hoursWorked: 40 })] },
  { id: 'rate-hours-overtime-ok', jurisdiction: 'us-ca', stubs: [stub()] },
  { id: 'rate-hours-above-gross-warn', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 740, hourlyRate: 18.5, hoursWorked: 45 })] },
  { id: 'rate-hours-exactly-1pct-ok', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1000, hourlyRate: 25, hoursWorked: 40.4 })] },
  { id: 'rate-hours-skipped-salaried', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 3000, payFrequency: 'monthly' })] },
  // ---- period-length ----
  { id: 'period-weekly-ok', jurisdiction: 'us-ca', stubs: [bare({ payFrequency: 'weekly', periodStart: '03/02/2026', periodEnd: '03/08/2026' })] },
  { id: 'period-biweekly-ok', jurisdiction: 'us-ca', stubs: [bare({ payFrequency: 'biweekly', periodStart: '03/02/2026', periodEnd: '03/15/2026' })] },
  { id: 'period-semimonthly-13-days-ok', jurisdiction: 'us-ca', stubs: [bare({ payFrequency: 'semimonthly', periodStart: '02/16/2026', periodEnd: '02/28/2026' })] },
  { id: 'period-monthly-31-days-ok', jurisdiction: 'us-ca', stubs: [bare({ payFrequency: 'monthly', periodStart: '01/01/2026', periodEnd: '01/31/2026' })] },
  { id: 'period-length-mismatch-warn', jurisdiction: 'us-ca', stubs: [bare({ payFrequency: 'biweekly', periodStart: '03/02/2026', periodEnd: '03/08/2026' })] },
  { id: 'period-start-after-end-warn', jurisdiction: 'us-ca', stubs: [bare({ payFrequency: 'weekly', periodStart: '03/08/2026', periodEnd: '03/02/2026' })] },
  { id: 'period-frequency-inferred-ok', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 2000, periodStart: '03/02/2026', periodEnd: '03/15/2026' })] },
  { id: 'period-no-frequency-uninferable-warn', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 2000, periodStart: '03/02/2026', periodEnd: '03/11/2026' })] },
  // ---- pay-date ----
  { id: 'pay-date-after-end-ok', jurisdiction: 'us-ca', stubs: [bare({ payDate: '03/20/2026', periodEnd: '03/15/2026' })] },
  { id: 'pay-date-before-end-ok', jurisdiction: 'us-ca', stubs: [bare({ payDate: '03/05/2026', periodEnd: '03/15/2026' })] },
  { id: 'pay-date-32-days-warn', jurisdiction: 'us-ca', stubs: [bare({ payDate: '04/16/2026', periodEnd: '03/15/2026' })] },
  // ---- ytd ----
  { id: 'ytd-below-gross-warn', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 2000, ytdGross: 1500, payFrequency: 'monthly', periodEnd: '03/31/2026' })] },
  { id: 'ytd-periods-ok', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 2000, ytdGross: 6000, payFrequency: 'monthly', periodEnd: '03/31/2026' })] },
  { id: 'ytd-periods-too-high-warn', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 2000, ytdGross: 9500, payFrequency: 'monthly', periodEnd: '03/31/2026' })] },
  { id: 'ytd-periods-too-low-warn', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 2000, ytdGross: 2900, payFrequency: 'monthly', periodEnd: '03/31/2026' })] },
  // ---- dates ----
  { id: 'date-us-mdy', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, payFrequency: 'weekly', payDate: '10/20/2026' })] },
  { id: 'date-us-iso-year-first', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, payFrequency: 'weekly', payDate: '2026-10-20' })] },
  { id: 'date-us-two-digit-year', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, payFrequency: 'weekly', payDate: '10/20/26', periodEnd: '10/16/26' })] },
  { id: 'date-us-dmy-text-not-parsed', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, payFrequency: 'weekly', payDate: '20/10/2026' })] },
  { id: 'date-kr-dots', jurisdiction: 'kr', stubs: [bare({ grossPay: 2485000, payFrequency: 'monthly', payDate: '2026.10.25' })] },
  { id: 'date-kr-two-digit-year', jurisdiction: 'kr', stubs: [bare({ grossPay: 2485000, payFrequency: 'monthly', payDate: '26.10.25', periodEnd: '26.10.31', periodStart: '26.10.01' })] },
  { id: 'date-kr-unpadded-n-triple', jurisdiction: 'kr', stubs: [bare({ grossPay: 2485000, payFrequency: 'monthly', payDate: '2026-1-5' })] },
  { id: 'date-leap-day-2028', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, payFrequency: 'weekly', payDate: '02/29/2028' })] },
  { id: 'date-not-leap-2026', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, payFrequency: 'weekly', payDate: '02/29/2026' })] },
  { id: 'date-unknown-jurisdiction', jurisdiction: 'xx-none', stubs: [bare({ grossPay: 500, payFrequency: 'weekly', payDate: '10/20/2026', periodEnd: '2026-10-16' })] },
  { id: 'date-year-out-of-range', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, payFrequency: 'weekly', payDate: '10/20/2100' })] },
  // ---- annualization ----
  { id: 'annual-ytd-sample-paystub', jurisdiction: 'zz-test', stubs: [stub()] },
  { id: 'annual-ytd-end-of-january', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 2000, ytdGross: 2000, payFrequency: 'monthly', periodStart: '01/01/2026', periodEnd: '01/31/2026' })] },
  { id: 'annual-ytd-too-early-falls-back', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 2000, ytdGross: 2000, payFrequency: 'semimonthly', periodStart: '01/01/2026', periodEnd: '01/15/2026' })] },
  { id: 'annual-ytd-zero-falls-back', jurisdiction: 'us-ca', stubs: [stub({ ytdGross: 0 })] },
  { id: 'annual-average-without-ytd', jurisdiction: 'zz-test', stubs: [drop(stub(), 'ytdGross')] },
  { id: 'annual-average-korean-monthly', jurisdiction: 'kr', stubs: [bare({ grossPay: 2485000, netPay: 2234440, payFrequency: 'monthly', payDate: '2026-10-25', deductions: [{ amount: 250560 }] })] },
  { id: 'annual-average-inferred-frequency', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1500, periodStart: '03/02/2026', periodEnd: '03/15/2026' })] },
  { id: 'annual-average-no-dates', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1500, payFrequency: 'biweekly' })] },
  { id: 'annual-ytd-uses-pay-date-without-period-end', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 3000, ytdGross: 15000, payFrequency: 'monthly', payDate: '05/31/2026' })] },
  // ---- failures ----
  { id: 'fail-no-gross', jurisdiction: 'us-ca', stubs: [bare({ netPay: 1000, payFrequency: 'weekly' })] },
  { id: 'fail-no-frequency', jurisdiction: 'kr', stubs: [bare({ grossPay: 2485000, payDate: '2026-10-25' })] },
  { id: 'fail-empty-list', jurisdiction: 'us-ca', stubs: [] },
  // ---- several paystubs ----
  {
    id: 'several-ytd-latest-first-in-input',
    jurisdiction: 'us-ca',
    stubs: [
      bare({ grossPay: 3200, ytdGross: 30200, payFrequency: 'monthly', periodStart: '10/01/2026', periodEnd: '10/31/2026' }),
      bare({ grossPay: 3000, ytdGross: 27000, payFrequency: 'monthly', periodStart: '09/01/2026', periodEnd: '09/30/2026' }),
    ],
  },
  {
    id: 'several-ytd-latest-last-in-input',
    jurisdiction: 'us-ca',
    stubs: [
      bare({ grossPay: 3000, ytdGross: 27000, payFrequency: 'monthly', periodStart: '09/01/2026', periodEnd: '09/30/2026' }),
      bare({ grossPay: 3200, ytdGross: 30200, payFrequency: 'monthly', periodStart: '10/01/2026', periodEnd: '10/31/2026' }),
    ],
  },
  {
    id: 'several-average-same-frequency',
    jurisdiction: 'us-ca',
    stubs: [
      bare({ grossPay: 1500, payFrequency: 'biweekly', periodStart: '09/07/2026', periodEnd: '09/20/2026' }),
      bare({ grossPay: 1620, payFrequency: 'biweekly', periodStart: '09/21/2026', periodEnd: '10/04/2026' }),
    ],
  },
  {
    id: 'several-duplicate-dropped',
    jurisdiction: 'us-ca',
    stubs: [
      bare({ grossPay: 3000, payFrequency: 'monthly', periodStart: '09/01/2026', periodEnd: '09/30/2026' }),
      bare({ grossPay: 3300, payFrequency: 'monthly', periodStart: '10/01/2026', periodEnd: '10/31/2026' }),
      bare({ grossPay: 3300, payFrequency: 'monthly', periodStart: '10/01/2026', periodEnd: '10/31/2026' }),
    ],
  },
  {
    id: 'several-other-frequency-excluded',
    jurisdiction: 'us-ca',
    stubs: [
      bare({ grossPay: 700, payFrequency: 'weekly', periodStart: '09/01/2026', periodEnd: '09/07/2026' }),
      bare({ grossPay: 3300, payFrequency: 'monthly', periodStart: '10/01/2026', periodEnd: '10/31/2026' }),
      bare({ grossPay: 3100 }),
    ],
  },
  {
    id: 'several-reference-tie-later-input-wins',
    jurisdiction: 'us-ca',
    stubs: [
      bare({ grossPay: 2000, ytdGross: 18000, payFrequency: 'monthly', periodEnd: '09/30/2026' }),
      bare({ grossPay: 2100, ytdGross: 18900, payFrequency: 'monthly', periodEnd: '09/30/2026' }),
    ],
  },
  {
    id: 'several-stub-without-dates-never-reference',
    jurisdiction: 'us-ca',
    stubs: [bare({ grossPay: 9999, ytdGross: 99999, payFrequency: 'monthly' }), bare({ grossPay: 2000, payFrequency: 'monthly', periodEnd: '06/30/2026' })],
  },
  {
    id: 'several-latest-without-gross-not-used-for-frequency',
    jurisdiction: 'us-ca',
    stubs: [bare({ payFrequency: 'semimonthly', periodEnd: '10/20/2026' }), bare({ grossPay: 1500, payFrequency: 'biweekly', periodEnd: '01/31/2026' })],
  },
  // ---- rounding ----
  { id: 'round-average-half-up', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 0.25, payFrequency: 'biweekly' })] },
  { id: 'round-ytd-half-up', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1, ytdGross: 2.25, payFrequency: 'monthly', periodEnd: '02/28/2026', periodStart: '02/01/2026' })] },
  { id: 'round-cents-from-ieee-double', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1.005, payFrequency: 'weekly' })] },
  { id: 'round-cents-third-decimal', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 100.125, netPay: 100.13, payFrequency: 'monthly' })] },
  // ---- input errors ----
  // null means absent, for every field.
  { id: 'null-fields-are-absent', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 1000, netPay: null, ytdGross: null, hoursWorked: null, hourlyRate: null, payFrequency: null, payDate: null, periodStart: null, periodEnd: null, deductions: null })] },
  { id: 'null-gross-is-no-gross', jurisdiction: 'us-ca', stubs: [bare({ grossPay: null, netPay: 900, payDate: '10/20/2026', payFrequency: 'weekly' })] },
  { id: 'error-null-deduction-amount', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, deductions: [{ amount: null }] })], expectError: true },
  { id: 'error-negative-money', jurisdiction: 'us-ca', stubs: [bare({ grossPay: -5 })], expectError: true },
  { id: 'error-negative-deduction', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, deductions: [{ amount: -1 }] })], expectError: true },
  { id: 'error-unknown-frequency', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, payFrequency: 'daily' })], expectError: true },
  { id: 'error-negative-hours', jurisdiction: 'us-ca', stubs: [bare({ grossPay: 500, hoursWorked: -1 })], expectError: true },
  // Month-name dates (the Skeletonizer masks these as one date token).
  { id: 'date-month-name-first', jurisdiction: 'us-ca', stubs: [stub({ payDate: 'October 20, 2026', periodStart: 'Oct. 1 2026', periodEnd: 'October 15, 2026' })] },
  { id: 'date-day-first-spanish', jurisdiction: 'us-ca', stubs: [stub({ payDate: '20 de octubre de 2026', periodStart: '1 octubre 2026', periodEnd: '15 de octubre de 2026' })] },
  { id: 'date-month-name-ordinal-and-case', jurisdiction: 'us-ca', stubs: [stub({ payDate: 'OCT 20th, 2026', periodStart: 'oct 1st 2026', periodEnd: 'Oct. 15th, 2026' })] },
  { id: 'date-month-name-invalid-day', jurisdiction: 'us-ca', stubs: [stub({ payDate: 'February 30, 2026' })] },
  { id: 'date-month-name-in-kr', jurisdiction: 'kr', stubs: [stub({ payDate: 'October 20, 2026', periodStart: '2026-10-01', periodEnd: '2026-10-15' })] },
];

// Form W-2 (validation/SPEC.md section 9).
const w2 = (extra = {}) => ({ taxYear: 2025, wages: 27640.18, federalIncomeTaxWithheld: 1402, socialSecurityWages: 28880.18, medicareWages: 28880.18, stateWages: 27640.18, ...extra });
export const w2Cases = [
  { id: 'w2-sample', forms: [w2()] },
  { id: 'w2-rounds-to-whole-units', forms: [w2({ wages: 27640.5, medicareWages: 27640.5 })] },
  { id: 'w2-two-employers-same-year-summed', forms: [w2(), w2({ wages: 4210.75, medicareWages: 4210.75, socialSecurityWages: 4210.75, stateWages: 4210.75 })] },
  { id: 'w2-latest-year-only', forms: [w2({ taxYear: 2024, wages: 25000 }), w2()] },
  { id: 'w2-year-missing-counts-with-latest', forms: [w2(), w2({ taxYear: null, wages: 1000, medicareWages: 1000 })] },
  { id: 'w2-medicare-below-wages-warn', forms: [w2({ medicareWages: 20000 })] },
  { id: 'w2-medicare-missing-skipped', forms: [w2({ medicareWages: null })] },
  { id: 'w2-odd-year-warn', forms: [w2({ taxYear: 1925 })] },
  { id: 'w2-no-wages', forms: [w2({ wages: null }), w2({ wages: 0 })] },
  { id: 'w2-empty', forms: [] },
];
