// Generates SilhouetteCore/Tests/SilhouetteCoreTests/ios-edge-cases.json from the reference
// implementation in shared/reference/silhouette.mjs. These cases pin behaviour where Swift and
// JavaScript differ by default (grapheme clusters vs code points, canonical equivalence,
// Unicode normalization, number formatting). Run: node ios/scripts/gen-edge-cases.mjs
import fs from 'node:fs';
import * as s from '../../shared/reference/silhouette.mjs';

const here = new URL('.', import.meta.url);
const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, here), 'utf8'));
const allowlist = (locale) =>
  new Set([...readJson('../../shared/skeleton/allowlist/en.json').words, ...readJson(`../../shared/skeleton/allowlist/${locale}.json`).words]);

const skeletonInputs = [
  ['digit-then-combining-mark', 'en', 'Gross 5\u{301} Pay 12\u{308}.50'],
  ['decomposed-accent-is-composed', 'es', 'Salario bruto: Jose\u{301} cafe\u{301}'],
  ['decomposed-hangul-is-composed', 'ko', '\u{1100}\u{1173}\u{11B8}\u{110B}\u{1167} \u{1100}\u{1161}'],
  ['kelvin-sign-normalizes', 'en', '\u{212A}elvin Net Pay'],
  ['bracket-removal-after-nfc', 'en', 'Net e\u{27E6}\u{301} Pay'],
  ['emoji-zwj-sequence', 'en', 'Net Pay \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} 1,000.00'],
  ['flag-and-skin-tone', 'en', '\u{1F1FA}\u{1F1F8} \u{1F44D}\u{1F3FD} Gross'],
  ['fullwidth-and-arabic-digits', 'en', 'Total \u{FF11}\u{FF12}\u{FF13} \u{663}\u{664} Pay'],
  ['dotted-capital-i', 'en', '\u{130}NCOME Income'],
  ['cr-cr-lf', 'en', 'Gross\r\r\nNet\n\rPay'],
  ['hyphen-with-combining-mark', 'en', 'Year-\u{301}to-Date Pre-Tax'],
  ['apostrophe-forms', 'en', "Employee's Employee\u{2019}s O'Neil"],
  ['astral-letters', 'en', '\u{10400}\u{10401} \u{1D400}BC Gross'],
  ['date-like-runs', 'en', '2026-10-15-01 1/2/3/4 12.34.56 1.2.3.4.5'],
  ['trailing-newline-number', 'en', 'Net Pay 1,000\n'],
];

const numbers = [0, -0, 1, -1, 2.5, 0.1, 0.000001, 1e-7, 123456789012345680000, 1e21, 1.5e300, 2 ** 53, 1 / 3, 100, 12345.678, -0.5e-10];
const parseNumberTokens = ['1,000\n', '1,284.50', '00.5', '1,000,000.000001', '9007199254740993', '123456789012345678901234567890'];

const evaluatorData = { z: 0, big: 2 ** 53, s: 'e\u{301}', kelvin: '\u{212A}', K: 1, D: { '\u{301}': 7 } };
const evaluatorCases = [
  ['min-negative-zero', { min: [0, { '-': [0, 0] }, { '*': [-1, 0] }] }],
  ['max-negative-zero-first', { max: [{ '*': [-1, 0] }, 0] }],
  ['div-by-negative-zero', { '/': [1, { '*': [-1, 0] }] }],
  ['cat-negative-zero', { cat: ['x', { '*': [-1, 0] }] }],
  ['cat-largest-safe-integer', { cat: [9007199254740991] }],
  ['error-cat-unsafe-integer', { cat: [{ var: 'big' }] }],
  ['eq-decomposed-vs-precomposed', { '==': [{ var: 's' }, '\u{E9}'] }],
  ['in-decomposed-vs-precomposed', { in: ['\u{E9}', [{ var: 's' }]] }],
  ['var-kelvin-sign-is-not-K', { var: '\u{212A}' }],
  ['eq-kelvin-vs-K', { '==': [{ var: 'kelvin' }, 'K'] }],
  ['var-dot-then-combining-mark', { var: 'D.\u{301}' }],
  ['floor-negative-fraction', { floor: -0.5 }],
  ['overflow-is-infinite-then-error', { '<': [{ '*': [1e308, 10] }, 1] }],
  ['true-is-not-one', { '==': [true, 1] }],
  ['true-is-not-a-number', { '+': [true, 1] }],
];

const out = {
  generatedFrom: 'shared/reference/silhouette.mjs',
  skeleton: skeletonInputs.map(([id, locale, input]) => ({ id, locale, input, expected: s.skeletonize(input, allowlist(locale)) })),
  jsNumberToString: numbers.map((n) => ({ value: n, expected: String(n) })),
  parseNumber: parseNumberTokens.map((token) => ({ token, expected: s.parseNumber(token) ?? null })),
  evaluator: {
    data: evaluatorData,
    cases: evaluatorCases.map(([id, expr]) => {
      try {
        const v = s.evaluate(expr, evaluatorData, {});
        // JSON cannot carry -0, so it is flagged separately.
        return { id, expr, expected: v, negativeZero: Object.is(v, -0) };
      } catch (e) {
        if (!(e instanceof s.RuleError)) throw e;
        return { id, expr, expectedError: 'RuleError' };
      }
    }),
  },
};

fs.writeFileSync(new URL('../SilhouetteCore/Tests/SilhouetteCoreTests/ios-edge-cases.json', here), JSON.stringify(out, null, 2) + '\n');
console.log('wrote ios-edge-cases.json');
