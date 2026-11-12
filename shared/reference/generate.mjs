import fs from 'node:fs';
import * as s from './silhouette.mjs';
import * as c from './cases.mjs';

export function build() {
  const bands = c.readJson('../bands/zz-test.json');
  const pack = c.readJson('../rulepacks/zz-test/pack.json');
  const skeletons = Object.fromEntries(
    c.skeletonCases.map((k) => [k.id, s.skeletonize(k.text, c.allowlist(k.locale))]),
  );
  return {
    'skeleton.json': {
      spec: 'skeleton/SPEC.md v1',
      cases: c.skeletonCases.map((k) => ({ id: k.id, locale: k.locale, input: k.text, expected: skeletons[k.id] })),
    },
    'rehydrate.json': {
      spec: 'skeleton/SPEC.md v1 section 5',
      numbers: c.numberCases.map((token) => ({ token, expected: s.parseNumber(token) ?? null })),
      cases: c.rehydrateCases.map((k) => ({
        id: k.id, schema: k.schema, map: skeletons[k.skeletonCase].map, pointers: k.pointers,
        expected: s.rehydrate(c.readJson(`../schemas/${k.schema}`), k.pointers, skeletons[k.skeletonCase].map),
      })),
    },
    'generalize.json': {
      spec: 'rulepacks/SPEC.md v1.1 section 6', bands: 'bands/zz-test.json',
      cases: c.generalizeCases.map((k) => {
        try {
          const profile = s.generalize(k.exact, bands);
          return { id: k.id, exact: k.exact, expected: profile, expectedCanonical: s.canonical(profile) };
        } catch (e) {
          if (!(e instanceof s.GeneralizeError)) throw e;
          return { id: k.id, exact: k.exact, expectedError: 'GeneralizeError' };
        }
      }),
    },
    'evaluator.json': {
      spec: 'rulepacks/SPEC.md v1.2 section 3', data: c.evaluatorData, unavailable: c.evaluatorUnavailable,
      cases: c.evaluatorCases.map((k) => {
        try {
          const reads = new Set();
          const value = s.evaluate(k.expr, c.evaluatorData, { unavailable: new Set(c.evaluatorUnavailable), unknownReads: reads });
          return value === s.UNKNOWN
            ? { id: k.id, expr: k.expr, expectedUnknown: true, expectedUnknownReads: [...reads].sort() }
            : { id: k.id, expr: k.expr, expected: value };
        } catch (e) {
          if (!(e instanceof s.RuleError)) throw e;
          return { id: k.id, expr: k.expr, expectedError: 'RuleError' };
        }
      }),
    },
    'verdict.json': {
      spec: 'rulepacks/SPEC.md v1.2 section 5', pack: 'rulepacks/zz-test/pack.json', bands: 'bands/zz-test.json',
      cases: c.verdictCases.map((k) => {
        try {
          return { id: k.id, answers: k.answers, expected: s.verdicts(pack, bands, k.answers) };
        } catch (e) {
          if (!(e instanceof s.InputError)) throw e;
          return { id: k.id, answers: k.answers, expectedError: 'InputError' };
        }
      }),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, content] of Object.entries(build())) {
    fs.writeFileSync(new URL(`../fixtures/conformance/${name}`, import.meta.url), JSON.stringify(content, null, 2) + '\n');
    console.log('wrote', name);
  }
}
