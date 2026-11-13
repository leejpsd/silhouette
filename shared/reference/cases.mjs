// Conformance cases. generate.mjs runs them through the reference implementation
// and writes ../fixtures/conformance/*.json. Platforms must reproduce every `expected`.
import fs from 'node:fs';

const here = new URL('.', import.meta.url);
export const read = (rel) => fs.readFileSync(new URL(rel, here), 'utf8');
export const readJson = (rel) => JSON.parse(read(rel));

export const allowlist = (locale) =>
  new Set([...readJson('../skeleton/allowlist/en.json').words, ...readJson(`../skeleton/allowlist/${locale}.json`).words]);

export const introducers = (locale) =>
  new Set([...readJson('../skeleton/allowlist/en.json').introducers, ...readJson(`../skeleton/allowlist/${locale}.json`).introducers]);

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
  // Deny by default: anything that is not explicitly safe is masked, whatever the platform's Unicode tables say.
  { id: 'deny-non-ascii-digits', locale: 'en', text: 'Gross Pay \u0661\u0662\u0663\u0664 \uFF11\uFF12\uFF13 \u00B2\u00B3 \u0967\u0968\u0969 \u2460 \u216B' },
  { id: 'deny-emoji-and-joiners', locale: 'en', text: 'Name: \u{1F600} \u{1F468}\u200D\u{1F469}\u200D\u{1F467} Net Pay 5' },
  { id: 'deny-private-use-and-unassigned', locale: 'en', text: 'Pay \uE000 \uF870 \u{2EBF0} \u{1E5D0} \u{10FFFF} Date' },
  { id: 'deny-zero-width-inside-word', locale: 'en', text: 'Pay\u200BDate Net\u00ADPay \uFEFFGross' },
  { id: 'deny-control-characters', locale: 'en', text: 'Net\u0000Pay \u0007 Gross\u001FPay \u007F' },
  { id: 'safe-punctuation-and-currency', locale: 'en', text: 'Gross \u2013 Net \u2014 \u201CPay\u201D \u2026 \u20AC9 \u20A98 \u00A37 \u00A56 5\u00D74\u00F72\u00B11 3\u00B0 \u2022 \u00B7 \u2116 2' },
  { id: 'safe-unicode-spaces', locale: 'en', text: 'Net\u00A0Pay\u2003Gross\u3000Pay\u202FTotal\u2009YTD' },
  { id: 'nfc-then-mask', locale: 'en', text: 'Jose\u0301 \u212A \u1100\u1161 Cafe\u0301-Gross 1\u0332' },
  { id: 'case-mapping-words', locale: 'en', text: '\u039F\u0394\u039F\u03A3 Stra\u00DFe \u0130stanbul GROSS gross Gross PAY' },
  { id: 'fullwidth-forms', locale: 'ko', text: '\uC9C0\uAE09\uD569\uACC4\uFF1A\uFF12\uFF0C\uFF14\uFF18\uFF15\uFF0C\uFF10\uFF10\uFF10 \uFF08\uC6D0\uFF09 \uFF27\uFF52\uFF4F\uFF53\uFF53' },
  { id: 'bracket-removal-after-nfc', locale: 'en', text: 'Net \u27E6N1\u27E7 \u27E6\u27E6W9\u27E7 Pay' },
  // A phrase is masked as a whole: an allowlisted word next to a masked word is part of the same name.
  { id: 'phrase-name-with-allowlisted-word', locale: 'en', text: 'Employee: Jordan Gross   Employer: Federal Security Services, Medical Group' },
  { id: 'phrase-joiners', locale: 'en', text: 'Smith & Gross Pay   Lopez, Net   Gross-Smith Pay   Gross Pay / Jordan   Gross Pay: Jordan' },
  { id: 'phrase-breaks-on-wide-gaps', locale: 'en', text: 'Net Pay  Jordan   Gross Pay\tLopez\nNet Pay\nJordan' },
  { id: 'phrase-all-allowlisted-stays', locale: 'en', text: 'Federal Income Tax   Social Security   Year to Date Gross Pay' },
  // Leading introducers keep their own decision; the name behind them is still masked as a whole.
  { id: 'introducer-before-name', locale: 'en', text: 'Employee Lucia Lindqvist\nEMPLOYER NORTHWIND STAFFING LLC\nPay Stub for Jordan Gross' },
  { id: 'introducer-run-in-sentence', locale: 'en', text: 'This Lease is made between Jordan Gross and Maria Lopez, Tenants' },
  { id: 'introducer-only-at-phrase-start', locale: 'en', text: 'Jordan Gross Employee\nGross Pay Jordan\nEmployee Gross Jordan\nSmith and Gross' },
  { id: 'introducer-whole-token-only', locale: 'en', text: 'Pay-to Jordan Gross\nEmployee\'s Jordan Gross\nEmployee  Jordan Gross' },
  { id: 'introducer-document-language', locale: 'es', text: 'Empleado Lucía Hernández\nDe la Cruz María\nEmployee Lucía Hernández' },
  { id: 'introducer-other-language-not-used', locale: 'en', text: 'Empleado Lucía Hernández' },
  { id: 'introducer-in-korean-document', locale: 'ko', text: 'Employee Kim Minji\n성명 김민지' },
  // Words the user hides are masked wherever they occur, and their whole phrase with them.
  { id: 'hide-word-everywhere', locale: 'en', hide: ['gross'], text: 'Gross Pay   Net Pay\nYTD Gross   GROSS\nYear-to-Date Gross-Pay' },
  { id: 'hide-introducer-masks-phrase', locale: 'en', hide: ['employee'], text: 'Employee Lucia Lindqvist\nEmployee: Lucia Lindqvist\nEmployer Northwind' },
  { id: 'hide-last-word-masks-introducer', locale: 'en', hide: ['date'], text: 'Pay Date   Pay Period\nFor Jordan Gross' },
  { id: 'hide-unknown-word-no-effect', locale: 'en', hide: ['lindqvist', 'absent'], text: 'Employee Lucia Lindqvist   Net Pay' },
  { id: 'email-and-usernames', locale: 'en', text: 'Contact payroll@brightharbor.example or @pay or john_gross or net_pay' },
  { id: 'month-name-dates', locale: 'en', text: 'Pay Date: October 17, 2026   Period: Oct. 1 2026 - 15 October 2026   17 de octubre de 2026   Sept 3rd, 2026   MAY 5, 2026' },
  { id: 'month-name-ascii-case-only', locale: 'en', text: 'Augu\u017Ft 17, 2026   AUGUST 17, 2026   17 DE AGOSTO DE 2026   Oct. 3RD, 2026   \u212Aay 5, 2026' },
  { id: 'month-name-not-a-date', locale: 'en', text: 'Mayfield 12, 2026   May 2026   3 March 20267   Mar 5   June Carter' },
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

export const numberCases = ['1,284.50', '1.284,50', '004417', '12,34', '2,485,000', '18.50', '1,2345', '0', '.5', '7.', '12\n', ' 12', '\uFF11\uFF12', '1e3', '-5', ''];

// Amounts typed by the user (skeleton/SPEC.md section 5.1).
export const typedAmountCases = [
  '28000.50', '28,000.50', '28000.5', '28000', '0', '0.00', '$28,000.50', '$ 28000', '  28000  ', '\t28000\n', '\u00A028000\u00A0',
  '\u20AC1,200', '\u00A31200.5', '\u00A51200', '\u20A91,200,000', ' $\u00A01,200 ',
  '28.000,50', '28 000', '1,2345', '12,34', '.5', '7.', '-5', '+5', '1e3', '28000$', '$$5', '$', '', '   ', 'USD 5', '5 USD',
  '60.000', '1.271', '28,000.505', '0.125', '0.5', '12.34',
  '\uFF12\uFF18', '\u30005', '\u20095', '5\u200B', '28000.50.1', '0x10', 'Infinity', 'NaN', "28'000",
];

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
  { id: 'error-county-trailing-newline', exact: { jurisdiction: 'zz-test', incomeBand: 'A', county: 'testshire\n' } },
  { id: 'error-county-uppercase', exact: { jurisdiction: 'zz-test', incomeBand: 'A', county: 'Testshire' } },
  { id: 'error-jurisdiction-trailing-newline', exact: { jurisdiction: 'zz-test\n', incomeBand: 'A' } },
  { id: 'error-band-id-not-exact', exact: { jurisdiction: 'zz-test', incomeBand: 'a' } },
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
  // Strings compare by code points: canonically equivalent strings are different strings.
  { id: 'eq-kelvin-is-not-k', expr: { '==': ['K', '\u212A'] } },
  { id: 'eq-composed-is-not-decomposed', expr: { '==': ['\u00E9', 'e\u0301'] } },
  { id: 'in-composed-is-not-decomposed', expr: { in: ['\u00E9', ['e\u0301', 'x']] } },
  { id: 'var-path-is-exact', expr: { var: 'constants.limit.\uFF13' } },
  { id: 'float-sum', expr: { '+': [0.1, 0.2] } },
  { id: 'zero-equals-negative-zero', expr: { '==': [0, { '*': [-1, 0] }] } },
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

// Verdicts from the silhouette alone (rulepacks/SPEC.md section 7). Each `exact` is generalized first.
export const silhouetteVerdictCases = [
  { id: 'full-profile-low-band', exact: { jurisdiction: 'zz-test', annualIncome: 12000, householdSize: 3, childAges: [4, 9], county: 'testshire', housing: 'renter' } },
  { id: 'full-profile-mid-band', exact: { jurisdiction: 'zz-test', annualIncome: 30524.9, householdSize: 3, childAges: [4, 9], county: 'testshire', housing: 'renter' } },
  { id: 'full-profile-top-band', exact: { jurisdiction: 'zz-test', annualIncome: 250000, householdSize: 2, childAges: [], county: 'testshire', housing: 'owner' } },
  { id: 'band-only', exact: { jurisdiction: 'zz-test', incomeBand: null, householdSize: 1, housing: 'other' }, bandFrom: 14999.99 },
  { id: 'household-over-cap-is-unknown', exact: { jurisdiction: 'zz-test', annualIncome: 30000, householdSize: 9, housing: 'renter' } },
  { id: 'household-at-cap', exact: { jurisdiction: 'zz-test', annualIncome: 30000, householdSize: 6, housing: 'renter' } },
  { id: 'income-only', exact: { jurisdiction: 'zz-test', annualIncome: 20000 } },
  { id: 'nothing-answered', exact: { jurisdiction: 'zz-test' } },
];

// Checks on model text (prompts/OUTPUT_CHECKS.md).
export const outputCheckCases = [
  { id: 'en-definite-claim', locale: 'en', scope: 'personal', text: 'Good news: you qualify for this program.' },
  { id: 'en-definite-negative', locale: 'en', scope: 'personal', text: "Based on this, you don't qualify." },
  { id: 'en-curly-apostrophe', locale: 'en', scope: 'personal', text: 'Sadly you\u2019re not eligible this year.' },
  { id: 'en-case-and-spacing', locale: 'en', scope: 'personal', text: 'YOU   ARE\nELIGIBLE for help.' },
  { id: 'en-conditional-is-fine', locale: 'en', scope: 'personal', text: 'To find out if you qualify, the app checks your answers on this device. It can also tell you when you are eligible to apply.' },
  { id: 'en-may-is-fine-for-personal', locale: 'en', scope: 'personal', text: 'You may qualify because your household is under the limit.' },
  { id: 'en-may-is-blocked-for-general', locale: 'en', scope: 'general', text: 'You may qualify because your household is under the limit.' },
  { id: 'en-general-neutral', locale: 'en', scope: 'general', text: 'This program lowers utility bills for households under an income limit. Your result above shows whether you may qualify.' },
  { id: 'en-second-occurrence-counts', locale: 'en', scope: 'general', text: 'The app shows whether you may qualify. From what I see, you may qualify.' },
  { id: 'es-definite-claim', locale: 'es', scope: 'personal', text: 'Buenas noticias: calificas para este programa.' },
  { id: 'es-conditional-is-fine', locale: 'es', scope: 'personal', text: 'La app revisa en tu dispositivo si calificas.' },
  { id: 'es-overall-blocked-for-general', locale: 'es', scope: 'general', text: 'Es posible que califiques para este programa.' },
  { id: 'es-general-neutral', locale: 'es', scope: 'general', text: 'Este programa reduce la factura de servicios para hogares con ingresos bajos.' },
  // Sentences from real replies that must stay allowed.
  { id: 'en-real-points-to-screen', locale: 'en', scope: 'general', text: 'Check the screen above to see your result for this program.' },
  { id: 'en-real-change-result', locale: 'en', scope: 'general', text: 'To change this result, you would need to change the things the program looks at.' },
  { id: 'en-real-no-need-to-share', locale: 'en', scope: 'general', text: 'Because the app checks these things on your device, you do not need to share or send that information.' },
  { id: 'es-real-checks-points', locale: 'es', scope: 'general', text: 'El programa Ayuda de alimentos (prueba) revisa ciertos puntos para ver si puedes recibir beneficios.' },
  { id: 'es-real-already-checked', locale: 'es', scope: 'general', text: 'La aplicación ya revisó esta información en tu dispositivo para ver si cumples con las reglas del programa.' },
  { id: 'es-real-points-to-screen', locale: 'es', scope: 'general', text: 'Revisa la parte de arriba de esta pantalla para ver lo que decidió la aplicación sobre tu caso.' },
  { id: 'es-real-could-change', locale: 'es', scope: 'general', text: 'Como estos datos se comprobaron en tu dispositivo, los cambios en tu situación con respecto a ellos podrían cambiar este resultado.' },
  { id: 'unknown-locale-uses-english', locale: 'fr', scope: 'personal', text: 'You qualify.' },
  { id: 'empty-text', locale: 'en', scope: 'general', text: '' },
];
