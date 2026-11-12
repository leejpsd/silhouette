// Conformance suite: runs every file in ../shared/fixtures/conformance/ (read from disk, never
// copied) and the canary fixtures in ../shared/fixtures/canary/ against the web port.
// "Byte-identical" is asserted by comparing JSON.stringify output (key order included) in
// addition to deep equality.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { Raw, reveal } from './types';
import {
  TOKEN_FLAGS,
  TOKEN_SOURCE,
  buildAllowlist,
  buildIntroducers,
  normalize,
  parseNumber,
  parseTypedAmount,
  rehydrate,
  skeletonize,
  type AllowlistFile,
  type PlaceholderMap,
  type PointerSchema,
} from './skeleton';
import { GeneralizeError, canonical, generalize, type Bands, type ExactProfile } from './generalize';
import { InputError, RuleError, UNKNOWN, evaluate, verdicts, type Answers, type RulePack } from './rules';
import { ValidationInputError, validatePaystubs, type PaystubValues } from './validate';
import { toModelSchema, type ModelSchemaOptions } from '../ai/model-schema';

const SHARED = fileURLToPath(new URL('../../../shared/', import.meta.url));
const CONFORMANCE_DIR = join(SHARED, 'fixtures', 'conformance');
const CANARY_DIR = join(SHARED, 'fixtures', 'canary');

const readText = (rel: string): string => readFileSync(join(SHARED, rel), 'utf8');
const readJson = <T>(rel: string): T => JSON.parse(readText(rel)) as T;

const allowlistFiles = (locale: string): AllowlistFile[] => [
  readJson<AllowlistFile>('skeleton/allowlist/en.json'),
  readJson<AllowlistFile>(`skeleton/allowlist/${locale}.json`),
];
const introducers = (locale: string): ReadonlySet<string> => buildIntroducers(allowlistFiles(locale));
const allowlist = (locale: string): ReadonlySet<string> =>
  buildAllowlist([
    readJson<AllowlistFile>('skeleton/allowlist/en.json'),
    readJson<AllowlistFile>(`skeleton/allowlist/${locale}.json`),
  ]);

/** Exact equality: deep equality plus identical serialization (key order, number formatting). */
function expectExact(actual: unknown, expected: unknown): void {
  expect(actual).toStrictEqual(expected);
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
}

// ---------- Fixture shapes ----------

interface SkeletonFixture {
  cases: { id: string; locale: string; input: string; hide?: string[]; expected: { skeleton: string; map: PlaceholderMap } }[];
}
interface RehydrateFixture {
  numbers: { token: string; expected: number | null }[];
  typedAmounts: { text: string; expected: number | null }[];
  cases: { id: string; schema: string; map: PlaceholderMap; pointers: unknown; expected: unknown }[];
}
interface GeneralizeFixture {
  bands: string;
  cases: (
    | { id: string; exact: ExactProfile; expected: unknown; expectedCanonical: string }
    | { id: string; exact: ExactProfile; expectedError: 'GeneralizeError' }
  )[];
}
interface EvaluatorFixture {
  data: unknown;
  unavailable: string[];
  cases: (
    | { id: string; expr: unknown; expected: unknown }
    | { id: string; expr: unknown; expectedError: 'RuleError' }
    | { id: string; expr: unknown; expectedUnknown: true; expectedUnknownReads: string[] }
  )[];
}

/** Maps a fixture's `expectedError` name to the web port's error class. */
const ERRORS = { GeneralizeError, RuleError, InputError, ValidationInputError } as const;
function expectError(fn: () => unknown, name: string): void {
  const errorClass = ERRORS[name as keyof typeof ERRORS] as (new (...args: never[]) => Error) | undefined;
  expect(errorClass, `unknown expectedError ${name}`).toBeDefined();
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown, `expected ${name}`).toBeInstanceOf(errorClass as new (...args: never[]) => Error);
}
interface VerdictFixture {
  pack: string;
  bands: string;
  cases: ({ id: string; answers: Answers; expected: unknown } | { id: string; answers: Answers; expectedError: 'InputError' })[];
}

// ---------- Runners, one per conformance file ----------

const runners: Record<string, (fixture: unknown) => void> = {
  'skeleton.json': (raw) => {
    const fixture = raw as SkeletonFixture;
    it('has cases', () => expect(fixture.cases.length).toBeGreaterThan(0));
    for (const k of fixture.cases) {
      describe(k.id, () => {
        const allow = allowlist(k.locale);
        const result = skeletonize(Raw.of(k.input), allow, introducers(k.locale), new Set(k.hide ?? []));
        const map = reveal(result.map);

        it('produces the expected skeleton and map', () => {
          expect(result.skeleton).toBe(k.expected.skeleton);
          expectExact(map, k.expected.map);
        });

        it('leaves no digit and no non-allowlisted word in the skeleton', () => {
          const stripped = result.skeleton.replace(/⟦[DNW][0-9]+⟧/g, '');
          expect(stripped).not.toMatch(/[0-9]/);
          for (const word of stripped.match(/[\p{L}\p{M}]+/gu) ?? []) {
            expect(allow.has(word.toLowerCase()), `"${word}" survived but is not allowlisted`).toBe(true);
          }
        });

        it('reconstructs the normalized input from skeleton + map', () => {
          const rebuilt = result.skeleton.replace(/⟦([DNW][0-9]+)⟧/g, (_, id: string) => map[id] ?? '');
          expect(rebuilt).toBe(normalize(k.input));
        });
      });
    }
  },

  'rehydrate.json': (raw) => {
    const fixture = raw as RehydrateFixture;
    it('has number and pointer cases', () => {
      expect(fixture.numbers.length).toBeGreaterThan(0);
      expect(fixture.cases.length).toBeGreaterThan(0);
    });
    describe('parseNumber', () => {
      for (const n of fixture.numbers) {
        it(JSON.stringify(n.token), () => expectExact(parseNumber(n.token) ?? null, n.expected));
      }
    });
    describe('parseTypedAmount (section 5.1)', () => {
      it('has cases', () => expect(fixture.typedAmounts.length).toBeGreaterThan(0));
      for (const n of fixture.typedAmounts) {
        it(JSON.stringify(n.text), () => expectExact(parseTypedAmount(n.text) ?? null, n.expected));
      }
    });
    for (const k of fixture.cases) {
      it(k.id, () => {
        const schema = readJson<PointerSchema>(`schemas/${k.schema}`);
        expectExact(reveal(rehydrate(schema, k.pointers, Raw.of(k.map))), k.expected);
      });
    }
  },

  'generalize.json': (raw) => {
    const fixture = raw as GeneralizeFixture;
    const bands = readJson<Bands>(fixture.bands);
    it('has cases', () => expect(fixture.cases.length).toBeGreaterThan(0));
    for (const k of fixture.cases) {
      it(k.id, () => {
        if ('expectedError' in k) {
          expectError(() => generalize(Raw.of(k.exact), bands), k.expectedError);
          return;
        }
        const profile = generalize(Raw.of(k.exact), bands);
        expectExact(profile, k.expected);
        expect(canonical(profile)).toBe(k.expectedCanonical);
      });
    }
  },

  'evaluator.json': (raw) => {
    const fixture = raw as EvaluatorFixture;
    it('has cases', () => expect(fixture.cases.length).toBeGreaterThan(0));
    for (const k of fixture.cases) {
      it(k.id, () => {
        const reads = new Set<string>();
        const run = () => evaluate(k.expr, fixture.data, { unavailable: new Set(fixture.unavailable), unknownReads: reads });
        if ('expectedError' in k) expectError(run, k.expectedError);
        else if ('expectedUnknown' in k) {
          expect(run()).toBe(UNKNOWN);
          expectExact([...reads].sort(), k.expectedUnknownReads);
        } else expectExact(run(), k.expected);
      });
    }
  },

  'verdict.json': (raw) => {
    const fixture = raw as VerdictFixture;
    const pack = readJson<RulePack>(fixture.pack);
    const bands = readJson<Bands>(fixture.bands);
    it('has cases', () => expect(fixture.cases.length).toBeGreaterThan(0));
    for (const k of fixture.cases) {
      it(k.id, () => {
        if ('expectedError' in k) expectError(() => verdicts(pack, bands, Raw.of(k.answers)), k.expectedError);
        else expectExact(verdicts(pack, bands, Raw.of(k.answers)), k.expected);
      });
    }
  },
};

const extraRunners: Record<string, (fixture: unknown) => void> = {
  'validate.json': (raw) => {
    const fixture = raw as { cases: ({ id: string; jurisdiction: string; stubs: PaystubValues[] } & ({ expected: unknown } | { expectedError: string }))[] };
    it('has at least 40 cases', () => expect(fixture.cases.length).toBeGreaterThanOrEqual(40));
    for (const c of fixture.cases) {
      it(c.id, () => {
        const run = () => validatePaystubs(Raw.of(c.stubs), c.jurisdiction);
        if ('expectedError' in c) expectError(run, c.expectedError);
        else expectExact(run(), c.expected);
      });
    }
  },
  'model-schema.json': (raw) => {
    const fixture = raw as { cases: { id: string; schema: Record<string, unknown>; options: ModelSchemaOptions; expected?: unknown; expectedError?: boolean }[] };
    it('has cases', () => expect(fixture.cases.length).toBeGreaterThan(0));
    for (const c of fixture.cases) {
      it(c.id, () => {
        if (c.expectedError) expect(() => toModelSchema(c.schema, c.options)).toThrow();
        else expectExact(toModelSchema(c.schema, c.options), c.expected);
      });
    }
  },
};
Object.assign(runners, extraRunners);

// ---------- Every file in the conformance folder ----------

const conformanceFiles = readdirSync(CONFORMANCE_DIR).sort();

describe('shared/fixtures/conformance', () => {
  it('contains the seven known files (contract v1.3) and every file has a runner', () => {
    expect(conformanceFiles).toEqual([
      'evaluator.json',
      'generalize.json',
      'model-schema.json',
      'rehydrate.json',
      'skeleton.json',
      'validate.json',
      'verdict.json',
    ]);
    for (const file of conformanceFiles) expect(Object.hasOwn(runners, file), `no runner for ${file}`).toBe(true);
  });

  for (const file of conformanceFiles) {
    describe(file, () => {
      const runner = runners[file];
      if (runner === undefined) {
        it('has a runner', () => expect.fail(`no runner for ${file}`));
        return;
      }
      runner(JSON.parse(readFileSync(join(CONFORMANCE_DIR, file), 'utf8')));
    });
  }
});

// ---------- Canary ----------

interface CanaryFixture {
  document: string;
  locale: string;
  canaries: string[];
}

const canaryFiles = readdirSync(CANARY_DIR).filter((f) => f.endsWith('.json')).sort();

describe('shared/fixtures/canary', () => {
  it('has at least one canary fixture', () => expect(canaryFiles.length).toBeGreaterThan(0));

  for (const file of canaryFiles) {
    it(`${file}: no canary string appears in the skeleton`, () => {
      const canary = JSON.parse(readFileSync(join(CANARY_DIR, file), 'utf8')) as CanaryFixture;
      expect(canary.canaries.length).toBeGreaterThan(0);
      const text = readFileSync(join(CANARY_DIR, canary.document), 'utf8');
      const { skeleton } = skeletonize(Raw.of(text), allowlist(canary.locale), introducers(canary.locale));
      // Sanity: the document really contains canaries, so the check is meaningful. (Some canaries
      // are derived forms such as "1487.5" that do not appear literally.)
      expect(canary.canaries.some((value) => normalize(text).includes(value))).toBe(true);
      for (const value of canary.canaries) {
        expect(skeleton.includes(value), `leaked: ${value}`).toBe(false);
      }
    });
  }
});

// ---------- Spec text ----------

describe('shared/reference/silhouette.mjs', () => {
  it('the tokenizer is the reference TOKEN_SOURCE, byte for byte, with flags gu', async () => {
    const referenceUrl = new URL('../../../shared/reference/silhouette.mjs', import.meta.url).href;
    const ref = (await import(/* @vite-ignore */ referenceUrl)) as { TOKEN_SOURCE: string };
    expect(TOKEN_SOURCE).toBe(ref.TOKEN_SOURCE);
    expect(TOKEN_FLAGS).toBe('gu');
  });
});
