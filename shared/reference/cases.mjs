// Conformance cases. generate.mjs runs them through the reference implementation
// and writes ../fixtures/conformance/*.json. Platforms must reproduce every `expected`.
import fs from 'node:fs';

const here = new URL('.', import.meta.url);
export const read = (rel) => fs.readFileSync(new URL(rel, here), 'utf8');
export const readJson = (rel) => JSON.parse(read(rel));

export const allowlist = (locale) =>
  new Set([...readJson('../skeleton/allowlist/en.json').words, ...readJson(`../skeleton/allowlist/${locale}.json`).words]);

export const skeletonCases = [
  { id: 'paystub-en-01', locale: 'en', text: read('../samples/paystub-en-01.txt') },
  { id: 'payslip-ko-01', locale: 'ko', text: read('../samples/payslip-ko-01.txt') },
  { id: 'paystub-canary-01', locale: 'en', text: read('../fixtures/canary/paystub-canary-01.txt') },
  { id: 'edge-hyphen-apostrophe', locale: 'en',
    text: "Year-to-Date Gross: $3,400.00 (O'Brien & Smith-Jones) Pre-Tax 401k W-2 12.5%" },
  { id: 'edge-injected-brackets', locale: 'en', text: 'Net Pay ⟦N1⟧ 900.10 ⟧⟦' },
  { id: 'edge-crlf', locale: 'en', text: 'Gross Pay 10.00\r\nNet Pay 9.00\rTotal 1' },
  { id: 'edge-es', locale: 'es', text: 'Salario bruto: 1,250.00   Empleado: José Ñandú   Fecha de pago: 15/10/2026' },
  { id: 'edge-ids-and-phones', locale: 'en', text: 'SSN: 123-45-6789  Account 000123456  Check No. 5521  555-123-4567' },
];

export const rehydrateCases = [
  { id: 'paystub-en-01-correct', skeletonCase: 'paystub-en-01', schema: 'pointer.paystub.json',
    pointers: {
      employerName: ['W1', 'W2', 'W3'], employeeName: ['W4', 'W5'],
      periodStart: 'D1', periodEnd: 'D2', payDate: 'D3',
      grossPay: 'N12', netPay: 'N22', ytdGross: 'N13', hoursWorked: 'N5', hourlyRate: 'N4',
      payFrequency: 'semimonthly',
      deductions: [
        { amount: 'N14', kind: 'federal_tax' }, { amount: 'N16', kind: 'social_security' },
        { amount: 'N18', kind: 'medicare' }, { amount: 'N20', kind: 'state_tax' },
      ],
    } },
  { id: 'paystub-en-01-bad-refs', skeletonCase: 'paystub-en-01', schema: 'pointer.paystub.json',
    pointers: {
      employeeName: ['W4', 'W5', 'W99'], grossPay: 'N99', netPay: 'W4', ytdGross: 'N13', payDate: 'N1',
      periodStart: null, hoursWorked: ['N5'],
      payFrequency: 'fortnightly',
      deductions: [{ kind: 'bribe', amount: 'N14' }, { amount: 'D1' }, { kind: 'other' }],
    } },
  { id: 'payslip-ko-01-correct', skeletonCase: 'payslip-ko-01', schema: 'pointer.paystub.json',
    pointers: {
      employerName: ['W1', 'W2'], employeeName: ['W3'], payDate: ['N4', 'N5', 'N6'],
      grossPay: 'N10', netPay: 'N18',
      deductions: [{ amount: 'N11' }, { amount: 'N12' }, { amount: 'N13' }, { amount: 'N14' }, { amount: 'N15' }, { amount: 'N16' }],
    } },
];

export const numberCases = ['1,284.50', '1.284,50', '004417', '12,34', '2,485,000', '18.50', '1,2345', '0', '.5', '7.'];

export const generalizeCases = [
  { id: 'exact-mid-band', exact: { jurisdiction: 'zz-test', annualIncome: 30524.9, householdSize: 3, childAges: [4, 9], county: 'testshire', housing: 'renter' } },
  { id: 'band-edge-low', exact: { jurisdiction: 'zz-test', annualIncome: 14999.99, householdSize: 1, childAges: [], county: 'testshire', housing: 'owner' } },
  { id: 'band-edge-high', exact: { jurisdiction: 'zz-test', annualIncome: 15000, householdSize: 2, childAges: [17, 18, 30], county: 'testshire', housing: 'other' } },
  { id: 'top-band-large-household', exact: { jurisdiction: 'zz-test', annualIncome: 250000, householdSize: 9, childAges: [1, 2, 3, 12], county: 'testshire', housing: 'renter' } },
  { id: 'negative-income', exact: { jurisdiction: 'zz-test', annualIncome: -500, householdSize: 6, childAges: [5, 6], county: 'testshire', housing: 'renter' } },
  { id: 'band-chosen-by-user', exact: { jurisdiction: 'zz-test', incomeBand: 'C', householdSize: 4, childAges: [10], county: 'testshire', housing: 'renter' } },
  { id: 'everything-skipped', exact: { jurisdiction: 'zz-test' } },
  { id: 'partly-skipped', exact: { jurisdiction: 'zz-test', incomeBand: 'B', householdSize: null, county: 'test-shire-2' } },
  { id: 'no-children-answered', exact: { jurisdiction: 'zz-test', annualIncome: 20000, householdSize: 2, childAges: [], county: 'testshire', housing: 'owner' } },
  { id: 'error-unknown-band', exact: { jurisdiction: 'zz-test', incomeBand: 'Z', householdSize: 2 } },
  { id: 'error-household-zero', exact: { jurisdiction: 'zz-test', annualIncome: null, incomeBand: null, householdSize: 0 } },
  { id: 'error-county-not-slug', exact: { jurisdiction: 'zz-test', incomeBand: 'A', county: 'Los Angeles/CA' } },
  { id: 'error-housing-unknown', exact: { jurisdiction: 'zz-test', incomeBand: 'A', housing: 'tenant' } },
  { id: 'error-household-fraction', exact: { jurisdiction: 'zz-test', incomeBand: 'A', householdSize: 2.5 } },
];

// Expression evaluator cases (rulepacks/SPEC.md section 3). `data` is shared by all cases.
export const evaluatorData = { a: 5, b: 2, s: 'x', t: true, f: false, n: null, list: [1, 2], constants: { limit: { '3': 34000 }, k: 10 }, hh: '3' };
export const evaluatorCases = [
  { id: 'literal-number', expr: 7 },
  { id: 'literal-string', expr: 'x' },
  { id: 'var-top', expr: { var: 'a' } },
  { id: 'var-dotted', expr: { var: 'constants.limit.3' } },
  { id: 'var-computed-path', expr: { var: { cat: ['constants.limit.', { var: 'hh' }] } } },
  { id: 'var-missing-is-null', expr: { var: 'nope' } },
  { id: 'var-inherited-is-null', expr: { var: 'constructor' } },
  { id: 'var-through-array-is-null', expr: { var: 'list.0' } },
  { id: 'eq-number', expr: { '==': [{ var: 'a' }, 5] } },
  { id: 'eq-mixed-types-false', expr: { '==': ['5', 5] } },
  { id: 'eq-null', expr: { '==': [{ var: 'nope' }, null] } },
  { id: 'neq', expr: { '!=': [{ var: 's' }, 'y'] } },
  { id: 'lt', expr: { '<': [{ var: 'b' }, { var: 'a' }] } },
  { id: 'lte-equal', expr: { '<=': [5, { var: 'a' }] } },
  { id: 'gt', expr: { '>': [{ var: 'a' }, { var: 'constants.k' }] } },
  { id: 'gte', expr: { '>=': [{ var: 'a' }, 5] } },
  { id: 'and-short-circuits', expr: { and: [{ var: 'f' }, { '<': [{ var: 'n' }, 1] }] } },
  { id: 'or-short-circuits', expr: { or: [{ var: 't' }, { '<': [{ var: 'n' }, 1] }] } },
  { id: 'and-many', expr: { and: [true, { var: 't' }, { '>': [{ var: 'a' }, 1] }] } },
  { id: 'not', expr: { '!': { var: 'f' } } },
  { id: 'if-lazy-else', expr: { if: [{ var: 't' }, 1, { '/': [1, 0] }] } },
  { id: 'add-many', expr: { '+': [1, 2, 3.5] } },
  { id: 'mul', expr: { '*': [{ var: 'a' }, 0.1] } },
  { id: 'sub', expr: { '-': [{ var: 'a' }, { var: 'b' }] } },
  { id: 'div', expr: { '/': [{ var: 'a' }, { var: 'b' }] } },
  { id: 'min', expr: { min: [3000, { '*': [{ var: 'a' }, 100] }] } },
  { id: 'max-single', expr: { max: [4] } },
  { id: 'in-true', expr: { in: [{ var: 's' }, ['x', 'y']] } },
  { id: 'in-false', expr: { in: [3, { var: 'list' }] } },
  { id: 'cat', expr: { cat: ['a', { var: 's' }, 'b'] } },
  { id: 'error-null-compare', expr: { '<': [{ var: 'nope' }, 1] } },
  { id: 'error-string-compare', expr: { '>=': ['10', 9] } },
  { id: 'error-string-add', expr: { '+': ['1', 2] } },
  { id: 'error-add-one-arg', expr: { '+': [1] } },
  { id: 'error-sub-three-args', expr: { '-': [5, 2, 1] } },
  { id: 'error-div-zero', expr: { '/': [1, 0] } },
  { id: 'error-max-empty', expr: { max: [] } },
  { id: 'error-if-five-args', expr: { if: [true, 1, false, 2, 3] } },
  { id: 'error-if-non-boolean', expr: { if: [1, 'a', 'b'] } },
  { id: 'error-and-non-boolean', expr: { and: [1, true] } },
  { id: 'error-not-non-boolean', expr: { '!': 0 } },
  { id: 'error-in-string-haystack', expr: { in: ['x', 'xyz'] } },
  { id: 'cat-integer', expr: { cat: ['a', 1, { min: [{ var: 'a' }, 3] }] } },
  { id: 'error-cat-fraction', expr: { cat: ['a', 1.5] } },
  { id: 'error-cat-boolean', expr: { cat: ['a', true] } },
  { id: 'error-two-operators', expr: { '<': [1, 2], '>': [2, 1] } },
  { id: 'error-unknown-operator', expr: { between: [1, 2, 3] } },
  { id: 'error-var-default-form', expr: { var: ['a', 0] } },
  { id: 'error-eq-array', expr: { '==': [{ var: 'list' }, 1] } },
  { id: 'floor', expr: { floor: { '/': [{ var: 'a' }, { var: 'b' }] } } },
  { id: 'floor-negative', expr: { floor: -2.5 } },
  { id: 'error-floor-string', expr: { floor: 'x' } },
  // Three-valued logic: `u1` and `u2` are unavailable (see evaluatorUnavailable).
  { id: 'unknown-var', expr: { var: 'u1' } },
  { id: 'unknown-nested-path', expr: { var: 'u1.deep' } },
  { id: 'unknown-compare', expr: { '<': [{ var: 'u1' }, 1] } },
  { id: 'unknown-arithmetic', expr: { '+': [{ var: 'u1' }, 1] } },
  { id: 'unknown-eq', expr: { '==': [{ var: 'u1' }, 'x'] } },
  { id: 'unknown-not', expr: { '!': { '==': [{ var: 'u1' }, 1] } } },
  { id: 'unknown-in-needle', expr: { in: [{ var: 'u1' }, ['x']] } },
  { id: 'unknown-in-haystack', expr: { in: ['x', { var: 'u1' }] } },
  { id: 'unknown-cat-path', expr: { var: { cat: ['constants.limit.', { var: 'u1' }] } } },
  { id: 'and-false-beats-unknown', expr: { and: [{ '==': [{ var: 'u1' }, 1] }, { var: 'f' }] } },
  { id: 'and-true-and-unknown', expr: { and: [{ var: 't' }, { '==': [{ var: 'u1' }, 1] }] } },
  { id: 'or-true-beats-unknown', expr: { or: [{ '==': [{ var: 'u1' }, 1] }, { var: 't' }] } },
  { id: 'or-false-and-unknown', expr: { or: [{ var: 'f' }, { '==': [{ var: 'u1' }, 1] }, { '==': [{ var: 'u2' }, 1] }] } },
  { id: 'if-unknown-condition', expr: { if: [{ '==': [{ var: 'u1' }, 1] }, 1, 2] } },
  { id: 'if-known-condition-unknown-branch', expr: { if: [{ var: 't' }, { var: 'u2' }, 2] } },
  { id: 'if-known-condition-skips-unknown-branch', expr: { if: [{ var: 'f' }, { var: 'u2' }, 2] } },
  { id: 'error-unknown-does-not-hide-arity', expr: { '<': [{ var: 'u1' }] } },
];
export const evaluatorUnavailable = ['u1', 'u2'];

export const verdictCases = [
  { id: 'exact-all-likely', answers: { hasEarnedIncome: 'yes', annualIncome: 30524, householdSize: 3, numChildren: 2, housing: 'renter', residentStatus: 'eligible' } },
  { id: 'exact-over-limits', answers: { hasEarnedIncome: 'yes', annualIncome: 52000, householdSize: 2, numChildren: 0, housing: 'owner', residentStatus: 'eligible' } },
  { id: 'exact-zero-income', answers: { hasEarnedIncome: 'no', annualIncome: 0, householdSize: 1, numChildren: 0, housing: 'renter', residentStatus: 'eligible' } },
  { id: 'exact-sensitive-skipped', answers: { hasEarnedIncome: 'yes', annualIncome: 19000, householdSize: 1, numChildren: 0, housing: 'other' } },
  { id: 'band-straddles-threshold', answers: { hasEarnedIncome: 'yes', incomeBand: 'C', householdSize: 3, numChildren: 1, housing: 'renter', residentStatus: 'eligible' } },
  { id: 'band-clear-pass', answers: { hasEarnedIncome: 'yes', incomeBand: 'A', householdSize: 4, numChildren: 2, housing: 'renter', residentStatus: 'eligible' } },
  { id: 'band-top-open', answers: { hasEarnedIncome: 'yes', incomeBand: 'E', householdSize: 6, numChildren: 3, housing: 'owner', residentStatus: 'eligible' } },
  { id: 'band-with-skips', answers: { incomeBand: 'B', housing: 'renter' } },
  { id: 'nothing-known', answers: {} },
  { id: 'large-household-capped', answers: { hasEarnedIncome: 'yes', annualIncome: 54000, householdSize: 9, numChildren: 5, housing: 'renter', residentStatus: 'not-eligible' } },
  // v1.2: three-valued logic, uncertainIf, multi questions, floor
  { id: 'benefit-qualifies-without-income', answers: { householdSize: 2, benefits: ['snap'] } },
  { id: 'benefit-qualifies-nothing-else-known', answers: { benefits: ['medicaid', 'ssi'] } },
  { id: 'no-benefit-income-unknown', answers: { householdSize: 2, benefits: [] } },
  { id: 'no-benefit-income-passes', answers: { hasEarnedIncome: 'yes', annualIncome: 30000, householdSize: 2, benefits: ['ssi'], hasOlderMember: 'no' } },
  { id: 'benefits-skipped-income-passes', answers: { annualIncome: 30000, householdSize: 2 } },
  { id: 'benefits-skipped-income-fails', answers: { annualIncome: 90000, householdSize: 2 } },
  { id: 'over-gross-with-older-member', answers: { annualIncome: 40000, householdSize: 2, benefits: [], hasOlderMember: 'yes' } },
  { id: 'over-gross-no-older-member', answers: { annualIncome: 40000, householdSize: 2, benefits: [], hasOlderMember: 'no' } },
  { id: 'over-gross-older-member-skipped', answers: { annualIncome: 40000, householdSize: 2, benefits: [] } },
  { id: 'under-gross-step-amount', answers: { hasEarnedIncome: 'yes', annualIncome: 12345, householdSize: 1, benefits: [], hasOlderMember: 'no' } },
  { id: 'band-with-benefit', answers: { incomeBand: 'D', householdSize: 3, benefits: ['snap'], hasOlderMember: 'yes' } },
  { id: 'negative-income-is-zero', answers: { annualIncome: -500, hasEarnedIncome: 'yes', householdSize: 1, numChildren: 0, housing: 'renter', residentStatus: 'eligible', benefits: [], hasOlderMember: 'no' } },
  { id: 'error-income-is-a-string', answers: { annualIncome: '12000', householdSize: 1 } },
  { id: 'error-income-and-unknown-band', answers: { incomeBand: 'Z', householdSize: 1 } },
  { id: 'household-above-table', answers: { annualIncome: 60000, householdSize: 8, benefits: [], hasOlderMember: 'no' } },
];
