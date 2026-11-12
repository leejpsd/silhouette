// Generates SilhouetteCore/Tests/SilhouetteCoreTests/ios-edge-cases.json from the reference
// implementation in shared/reference/silhouette.mjs. These cases pin behaviour where Swift and
// JavaScript differ by default (grapheme clusters vs code points, canonical equivalence,
// Unicode normalization, number formatting). Run: node ios/scripts/gen-edge-cases.mjs
import fs from 'node:fs';
import * as s from '../../shared/reference/silhouette.mjs';
import * as v from '../../shared/reference/validate.mjs';

const here = new URL('.', import.meta.url);
const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, here), 'utf8'));
const lists = (locale) => [readJson('../../shared/skeleton/allowlist/en.json'), readJson(`../../shared/skeleton/allowlist/${locale}.json`)];
const allowlist = (locale) => new Set(lists(locale).flatMap((f) => f.words));
const introducers = (locale) => new Set(lists(locale).flatMap((f) => f.introducers ?? []));

// Cases not covered by shared/fixtures/conformance/skeleton.json.
const skeletonInputs = [
  ['cr-cr-lf', 'en', 'Gross\r\r\nNet\n\rPay'],
  ['hyphen-with-combining-mark', 'en', 'Year-\u{301}to-Date Pre-Tax'],
  ['apostrophe-forms', 'en', "Employee's Employee\u{2019}s O'Neil"],
  ['astral-letters', 'en', '\u{10400}\u{10401} \u{1D400}BC Gross'],
  ['date-like-runs', 'en', '2026-10-15-01 1/2/3/4 12.34.56 1.2.3.4.5'],
  ['month-name-upper-case-and-ordinal', 'en', 'PAY DATE: SEPT 3RD, 2026   17TH OCTOBER 2026   17 DE OCTUBRE DEL 2026'],
  ['month-name-needs-single-spaces', 'en', 'October  17, 2026   October 17,  2026   October\u{A0}17, 2026'],
  ['phrase-joiner-variants', 'en', 'Gross,Jordan   Gross ,Jordan   Gross\u{A0}Jordan   Gross &Jordan   Gross\u{2013}Jordan'],
  ['word-joiners-at-and-underscore', 'en', 'Net Pay@Gross _Gross Pay_ net_pay@example.com'],
  ['phrase-across-numbers', 'en', 'Gross Pay 5 Jordan Net Pay'],
];

const numbers = [0, -0, 1, -1, 2.5, 0.1, 0.000001, 1e-7, 123456789012345680000, 1e21, 1.5e300, 2 ** 53, 1 / 3, 100, 12345.678, -0.5e-10];
// Not covered by the `numbers` list in shared/fixtures/conformance/rehydrate.json.
const parseNumberTokens = ['00.5', '1,000,000.000001', '9007199254740993', '123456789012345678901234567890', '1,000\r', '1,000.'];

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
  ['var-dot-then-combining-mark', { var: 'D.\u{301}' }],
  ['floor-negative-fraction', { floor: -0.5 }],
  ['overflow-is-infinite-then-error', { '<': [{ '*': [1e308, 10] }, 1] }],
  ['true-is-not-one', { '==': [true, 1] }],
  ['true-is-not-a-number', { '+': [true, 1] }],
];

// parseDate from shared/reference/validate.mjs: JavaScript trim(), month names, anchors.
const dateTexts = [
  ['us-ca', ' 10/01/2026\u{3000}'], ['us-ca', '\u{A0}10/01/2026\u{FEFF}'], ['us-ca', '10/01/2026\n'], ['us-ca', '10/01/2026\u{200B}'],
  ['us-ca', 'Sept 31, 2026'], ['us-ca', 'SEPT 3RD, 2026'], ['zz-test', '17th October 2026'], ['kr', '17 de octubre del 2026'],
  ['us-ca', '2026-02-29'], ['us-ca', '2028-02-29'], ['us-ca', '0099-01-01'], ['us-ca', '1/2/99'], ['kr', '26.10.25'],
  ['xx', '10/01/2026'], ['xx', '2026/10/01'], ['us-ca', 'Oct 17 2026'], ['us-ca', 'Octo 17, 2026'],
];

const out = {
  generatedFrom: 'shared/reference/silhouette.mjs',
  skeleton: skeletonInputs.map(([id, locale, input]) => ({ id, locale, input, expected: s.skeletonize(input, allowlist(locale), introducers(locale)) })),
  jsNumberToString: numbers.map((n) => ({ value: n, expected: String(n) })),
  parseDate: dateTexts.map(([jurisdiction, text]) => {
    const d = v.parseDate(text, jurisdiction);
    return { jurisdiction, text, expected: d ? v.isoDate(d) : null };
  }),
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
