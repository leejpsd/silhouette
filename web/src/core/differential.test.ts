// Differential test: the web port against shared/reference/silhouette.mjs (read from disk, not
// copied) on seeded pseudo-random inputs, to catch divergences the fixtures do not cover.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { Raw, reveal } from './types';
import { buildAllowlist, buildIntroducers, parseNumber, rehydrate, skeletonize, type AllowlistFile, type PointerSchema } from './skeleton';
import { GeneralizeError, canonical, generalize, type Bands, type ExactProfile } from './generalize';
import { InputError, RuleError, UNKNOWN, evaluate, verdicts, type Answers, type RulePack } from './rules';

interface ReferenceModule {
  skeletonize(text: string, allow: Set<string>, introducers?: Set<string>, hide?: Set<string>): { skeleton: string; map: Record<string, string> };
  parseNumber(token: string): number | undefined;
  rehydrate(schema: unknown, pointers: unknown, map: Record<string, string>): unknown;
  generalize(exact: unknown, bands: unknown): unknown;
  canonical(profile: unknown): string;
  evaluate(expr: unknown, data: unknown, ctx?: { unavailable?: Set<string>; unknownReads?: Set<string> }): unknown;
  UNKNOWN: symbol;
  InputError: new (...args: never[]) => Error;
  verdicts(pack: unknown, bands: unknown, answers: unknown): unknown;
  RuleError: new (...args: never[]) => Error;
  GeneralizeError: new (...args: never[]) => Error;
}

const sharedUrl = new URL('../../../shared/', import.meta.url);
const referenceUrl = new URL('reference/silhouette.mjs', sharedUrl).href;
const ref = (await import(/* @vite-ignore */ referenceUrl)) as ReferenceModule;
const readJson = <T>(rel: string): T => JSON.parse(readFileSync(new URL(rel, sharedUrl), 'utf8')) as T;

// Mulberry32: small seeded PRNG so failures are reproducible.
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  'Gross', 'Pay', 'net', 'Year-to-Date', 'Smith-Jones', "O'Brien", 'O’Neil', 'José', 'Ñandú', '급여', '지급액',
  'é', 'Å', 'ﬁ', '😀', '⟦', '⟧', '⟦N1⟧', '-', '/', '.', ',', "'", '’', '$', '%', ' ', '  ', '\t', '\n', '\r\n', '\r',
  'Jordan', 'Gross', 'Federal', 'Security', ', ', ' & ', 'payroll@example.com', 'user_name', 'October 17, 2026', '17 de octubre de 2026',
  'Sept 3rd, 2026', 'May', '2026', '\u200b', '\u0007', '\ue000', '１２', '²', '₩', '€', '·',
  '0', '7', '12', '004417', '1,284.50', '1.284,50', '10/01/2026', '2026-10-15', '123-45-6789', '12.5', '3,400', '١٢',
];

function randomText(next: () => number): string {
  const length = Math.floor(next() * 30);
  let out = '';
  for (let i = 0; i < length; i++) out += PIECES[Math.floor(next() * PIECES.length)];
  return out;
}

/** Runs fn and returns its JSON result, or the name of the contract error class it threw. */
function outcome(fn: () => unknown, errors: Record<string, new (...args: never[]) => Error>): string {
  try {
    return `ok:${JSON.stringify(fn())}`;
  } catch (error) {
    for (const [name, errorClass] of Object.entries(errors)) if (error instanceof errorClass) return `error:${name}`;
    throw error;
  }
}
const OUR_ERRORS = { RuleError, GeneralizeError, InputError };
const refErrors = (): Record<string, new (...args: never[]) => Error> => ({ RuleError: ref.RuleError, GeneralizeError: ref.GeneralizeError, InputError: ref.InputError });

describe('differential: web port vs shared/reference/silhouette.mjs', () => {
  const allowFiles = ['en', 'es', 'ko'].map((l) => readJson<AllowlistFile>(`skeleton/allowlist/${l}.json`));
  const allow = buildAllowlist(allowFiles);
  const refAllow = new Set(allow);
  const intro = buildIntroducers(allowFiles);
  const refIntro = new Set(intro);

  it('skeletonize and rehydrate agree on 3000 random documents', () => {
    const next = prng(20261112);
    const schema = readJson<PointerSchema>('schemas/pointer.paystub.json');
    for (let i = 0; i < 3000; i++) {
      const text = randomText(next);
      // Every third document hides a few of its own words (section 4.3), sometimes one hyphen part.
      const words = text.split(/[^A-Za-z@_-]+/).filter((w) => w !== '');
      const hide = new Set<string>();
      if (i % 3 === 0) {
        for (let h = 0; h < 2 && words.length > 0; h++) {
          const w = (words[Math.floor(next() * words.length)] as string).toLowerCase();
          const parts = w.split('-');
          hide.add(next() < 0.5 ? w : (parts[Math.floor(next() * parts.length)] as string));
        }
      }
      const ours = skeletonize(Raw.of(text), allow, intro, hide);
      const theirs = ref.skeletonize(text, refAllow, refIntro, new Set(hide));
      expect(ours.skeleton, JSON.stringify(text)).toBe(theirs.skeleton);
      expect(JSON.stringify(reveal(ours.map))).toBe(JSON.stringify(theirs.map));

      const ids = Object.keys(theirs.map);
      const pick = (): string => ids[Math.floor(next() * ids.length)] ?? `N${i}`;
      const pointers = {
        grossPay: pick(), netPay: pick(), payDate: next() < 0.5 ? pick() : [pick(), pick(), pick()],
        employeeName: [pick(), pick(), 'W999'], payFrequency: next() < 0.5 ? 'weekly' : pick(),
        deductions: [{ amount: pick(), kind: 'medicare' }, { kind: 'other' }, pick()],
      };
      expect(JSON.stringify(reveal(rehydrate(schema, pointers, ours.map)))).toBe(
        JSON.stringify(ref.rehydrate(schema, pointers, theirs.map)),
      );
    }
  });

  it('parseNumber agrees on number-like tokens', () => {
    const next = prng(7);
    const chars = '0123456789,.';
    for (let i = 0; i < 5000; i++) {
      let token = '';
      const length = 1 + Math.floor(next() * 10);
      for (let j = 0; j < length; j++) token += chars[Math.floor(next() * chars.length)];
      expect(parseNumber(token) ?? null, token).toBe(ref.parseNumber(token) ?? null);
    }
  });

  it('generalize agrees on random exact profiles, including skipped and invalid fields', () => {
    const bands = readJson<Bands>('bands/zz-test.json');
    const next = prng(42);
    const pickOf = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T;
    let errors = 0;
    for (let i = 0; i < 3000; i++) {
      const exact: Record<string, unknown> = { jurisdiction: pickOf(['zz-test', 'zz-test', 'zz-test', 'ZZ test']) };
      const income = next();
      if (income < 0.4) exact['annualIncome'] = Math.round((next() * 140000 - 5000) * 100) / 100;
      else if (income < 0.45) exact['annualIncome'] = pickOf([null, Number.NaN, Infinity, '1000']);
      else if (income < 0.8) exact['incomeBand'] = pickOf(['A', 'B', 'C', 'D', 'E', 'Z', null]);
      if (next() < 0.8) exact['householdSize'] = pickOf([1, 2, 3, 6, 7, 10, 0, -1, 2.5, null]);
      if (next() < 0.8) exact['childAges'] = pickOf([[], [4], [4, 9], [17, 18, 30], [1, 2, 3, 12], null, ['4']]);
      if (next() < 0.8) exact['county'] = pickOf(['testshire', 'test-shire-2', 'Los Angeles/CA', '-bad', null]);
      if (next() < 0.8) exact['housing'] = pickOf(['renter', 'owner', 'other', 'tenant', null]);
      const a = outcome(() => canonical(generalize(Raw.of(exact as unknown as ExactProfile), bands)), OUR_ERRORS);
      const b = outcome(() => ref.canonical(ref.generalize(exact, bands)), refErrors());
      expect(a, JSON.stringify(exact)).toBe(b);
      if (a.startsWith('error:')) errors++;
    }
    expect(errors).toBeGreaterThan(100);
  });

  it('verdicts agree on random answers (exact, banded, invalid, multi, skipped)', () => {
    const pack = readJson<RulePack>('rulepacks/zz-test/pack.json');
    const bands = readJson<Bands>('bands/zz-test.json');
    const next = prng(99);
    const pickOf = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)] as T;
    const maybe = <T>(value: T): T | undefined => (next() < 0.75 ? value : undefined);
    let errors = 0;
    for (let i = 0; i < 4000; i++) {
      const answers: Record<string, unknown> = {};
      const r = next();
      if (r < 0.45) answers['annualIncome'] = Math.floor(next() * 120000) - (next() < 0.05 ? 200000 : 0);
      else if (r < 0.5) answers['annualIncome'] = pickOf([null, Number.NaN, '12000', Infinity]);
      else if (r < 0.9) answers['incomeBand'] = maybe(pickOf(['A', 'B', 'C', 'D', 'E', 'Z', null]));
      answers['householdSize'] = maybe(1 + Math.floor(next() * 9));
      answers['numChildren'] = maybe(Math.floor(next() * 5));
      answers['hasEarnedIncome'] = maybe(pickOf(['yes', 'no']));
      answers['housing'] = maybe(pickOf(['renter', 'owner', 'other', null]));
      answers['residentStatus'] = maybe(pickOf(['eligible', 'not-eligible']));
      answers['benefits'] = maybe(pickOf([[], ['snap'], ['medicaid', 'ssi'], ['ssi'], null]));
      answers['hasOlderMember'] = maybe(pickOf(['yes', 'no']));
      for (const key of Object.keys(answers)) if (answers[key] === undefined) delete answers[key];
      const a = outcome(() => verdicts(pack, bands, Raw.of(answers as Answers)), OUR_ERRORS);
      expect(a, JSON.stringify(answers)).toBe(outcome(() => ref.verdicts(pack, bands, answers), refErrors()));
      if (a.startsWith('error:')) errors++;
    }
    expect(errors).toBeGreaterThan(20);
  });

  it('evaluate agrees on random expressions, including errors', () => {
    const data = { a: 5, b: 2, s: 'x', t: true, f: false, n: null, list: [1, 2], o: { k: 3 }, constants: { k: 10 } };
    const unavailable = ['u1', 'u2'];
    const next = prng(1234);
    const ops = ['var', '==', '!=', '<', '<=', '>', '>=', 'and', 'or', '!', 'if', '+', '*', '-', '/', 'min', 'max', 'floor', 'in', 'cat', 'pow'];
    const leaves: unknown[] = [0, 1, 2.5, -3, 'x', 'a', '', true, false, null, [1, 2], ['x', 'y'], { var: 'a' }, { var: 's' },
      { var: 't' }, { var: 'n' }, { var: 'list' }, { var: 'o.k' }, { var: 'constants.k' }, { var: 'list.0' }, { var: 'constructor' }, { var: 'u1' }, { var: 'u2.x' }, 7, -2.5];
    const gen = (depth: number): unknown => {
      if (depth === 0 || next() < 0.3) return leaves[Math.floor(next() * leaves.length)];
      const op = ops[Math.floor(next() * ops.length)] as string;
      const count = Math.floor(next() * 4);
      if (op === 'var') return { var: next() < 0.7 ? gen(0) : gen(depth - 1) };
      if (count === 1 && next() < 0.5) return { [op]: gen(depth - 1) };
      return { [op]: Array.from({ length: count }, () => gen(depth - 1)) };
    };
    let errors = 0;
    for (let i = 0; i < 20000; i++) {
      const expr = gen(4);
      const run = (fn: (ctx: { unavailable: Set<string>; unknownReads: Set<string> }) => unknown, unknown: symbol) => () => {
        const ctx = { unavailable: new Set(unavailable), unknownReads: new Set<string>() };
        const value = fn(ctx);
        return value === unknown ? { unknown: [...ctx.unknownReads].sort() } : value;
      };
      const a = outcome(run((ctx) => evaluate(expr, data, ctx), UNKNOWN), OUR_ERRORS);
      expect(a, JSON.stringify(expr)).toBe(outcome(run((ctx) => ref.evaluate(expr, data, ctx), ref.UNKNOWN), refErrors()));
      if (a.startsWith('error:')) errors++;
    }
    expect(errors).toBeGreaterThan(1000);
    expect(errors).toBeLessThan(20000);
  });
});

describe('differential: validation against shared/reference/validate.mjs', () => {
  it('agrees on 3000 random paystub sets', async () => {
    const refUrl = new URL('../../../shared/reference/validate.mjs', import.meta.url).href;
    const vref = (await import(/* @vite-ignore */ refUrl)) as {
      validatePaystubs: (v: unknown, j: string) => unknown;
      ValidationInputError: new (...a: never[]) => Error;
    };
    const { validatePaystubs, ValidationInputError } = await import('./validate');
    const next = prng(31);
    const pickOf = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T;
    const maybe = <T>(v: T): T | undefined => (next() < 0.7 ? v : undefined);
    const money = () => pickOf([0, 0.25, 1.005, 99.99, 1271.88, 2000, 23103.25, 2485000, -1]);
    const date = () =>
      pickOf(['10/20/2026', '10/15/2026', '2026-10-25', '26.10.25', '02/29/2026', '01/31/2026', '15/10/2026', 'October 17, 2026', '17 de octubre de 2026', 'Feb 30, 2026', 'x']);
    const outcome = (fn: () => unknown, err: new (...a: never[]) => Error) => {
      try {
        return JSON.stringify(fn());
      } catch (e) {
        if (e instanceof err) return 'ValidationInputError';
        throw e;
      }
    };
    for (let i = 0; i < 3000; i++) {
      const stubs = Array.from({ length: 1 + Math.floor(next() * 3) }, () => {
        const s: Record<string, unknown> = {
          grossPay: maybe(money()),
          netPay: maybe(money()),
          ytdGross: maybe(money()),
          hourlyRate: maybe(money()),
          hoursWorked: maybe(pickOf([40, 62, 80.5, 0])),
          payFrequency: maybe(pickOf(['weekly', 'biweekly', 'semimonthly', 'monthly'])),
          payDate: maybe(date()),
          periodStart: maybe(date()),
          periodEnd: maybe(date()),
          deductions: maybe([{ amount: pickOf([10, 58.4, 250560]) }]),
        };
        for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k];
        return s;
      });
      const jurisdiction = pickOf(['us-ca', 'kr', 'zz-test', 'xx']);
      const ours = outcome(() => validatePaystubs(Raw.of(stubs as never), jurisdiction), ValidationInputError);
      expect(ours, JSON.stringify(stubs)).toBe(outcome(() => vref.validatePaystubs(stubs, jurisdiction), vref.ValidationInputError));
    }
  });
});
