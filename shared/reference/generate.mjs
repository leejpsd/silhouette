import fs from 'node:fs';
import * as s from './silhouette.mjs';
import * as c from './cases.mjs';
import { cases as validateCases } from './validate.cases.mjs';
import { ValidationInputError, validatePaystubs } from './validate.mjs';
import { cases as modelSchemaCases, errorCases as modelSchemaErrorCases } from './model-schema.cases.mjs';
import { toModelSchema } from './model-schema.mjs';

export function build() {
  const bands = c.readJson('../bands/zz-test.json');
  const pack = c.readJson('../rulepacks/zz-test/pack.json');
  const skeletons = Object.fromEntries(
    c.skeletonCases.map((k) => [k.id, s.skeletonize(k.text, c.allowlist(k.locale), c.introducers(k.locale))]),
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
    'validate.json': {
      spec: 'validation/SPEC.md v1',
      cases: validateCases.map((k) => {
        try {
          const expected = validatePaystubs(k.stubs, k.jurisdiction);
          if (k.expectError) throw new Error(`${k.id}: expected ValidationInputError`);
          return { id: k.id, jurisdiction: k.jurisdiction, stubs: k.stubs, expected };
        } catch (e) {
          if (!(e instanceof ValidationInputError) || !k.expectError) throw e;
          return { id: k.id, jurisdiction: k.jurisdiction, stubs: k.stubs, expectedError: 'ValidationInputError' };
        }
      }),
    },
    'model-schema.json': {
      spec: 'schemas/MODEL_SCHEMA.md v1',
      cases: [
        ...modelSchemaCases.map((k) => ({ id: k.id, schema: k.schema, options: k.options, expected: toModelSchema(k.schema, k.options) })),
        ...modelSchemaErrorCases.map((k) => {
          try { toModelSchema(k.schema); } catch { return { id: k.id, schema: k.schema, options: {}, expectedError: true }; }
          throw new Error(`${k.id}: expected an error`);
        }),
      ],
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
