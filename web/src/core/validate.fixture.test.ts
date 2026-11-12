// Runs the validation conformance fixture against src/core/validate.ts, plus a seeded differential
// test against the zero-dependency reference implementation.
// Default locations: shared/fixtures/conformance/validate.json and shared/reference/validate.mjs.
// SILHOUETTE_VALIDATION_DIR may point at a directory holding validate.json and
// validate.reference.mjs instead. The suite is skipped when neither is present.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { Raw } from './types';
import { ValidationInputError, validatePaystubs, type PaystubValues } from './validate';

const shared = fileURLToPath(new URL('../../../shared/', import.meta.url));
const dir = process.env['SILHOUETTE_VALIDATION_DIR'];
const fixturePath = dir ? join(dir, 'validate.json') : join(shared, 'fixtures/conformance/validate.json');
const referencePath = dir ? join(dir, 'validate.reference.mjs') : join(shared, 'reference/validate.mjs');
const present = existsSync(fixturePath) && existsSync(referencePath);

interface Fixture {
  cases: ({ id: string; jurisdiction: string; stubs: PaystubValues[] } & ({ expected: unknown } | { expectedError: string }))[];
}

describe.skipIf(!present)('validation conformance fixture', () => {
  const fixture: Fixture = present ? (JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture) : { cases: [] };

  it('has at least 40 cases', () => expect(fixture.cases.length).toBeGreaterThanOrEqual(40));

  for (const c of fixture.cases) {
    it(c.id, () => {
      const run = () => validatePaystubs(Raw.of(c.stubs), c.jurisdiction);
      if ('expectedError' in c) expect(run).toThrow(ValidationInputError);
      else expect(JSON.stringify(run())).toBe(JSON.stringify(c.expected));
    });
  }
});

describe.skipIf(!present)('validation: differential against the reference implementation', () => {
  it('agrees on 3000 random paystub sets', async () => {
    const ref = (await import(/* @vite-ignore */ referencePath)) as {
      validatePaystubs: (v: unknown, j: string) => unknown;
      ValidationInputError: new (...a: never[]) => Error;
    };
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)] as T;
    const maybe = <T>(v: T): T | undefined => (next() < 0.7 ? v : undefined);
    const money = () => pick([0, 0.25, 1.005, 99.99, 1271.88, 2000, 23103.25, 2485000, -1]);
    const date = () => pick(['10/20/2026', '10/01/2026', '10/15/2026', '2026-10-25', '26.10.25', '02/29/2026', '01/31/2026', '15/10/2026', '12/31/2026', 'x']);
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
          hoursWorked: maybe(pick([40, 62, 80.5, 0])),
          payFrequency: maybe(pick(['weekly', 'biweekly', 'semimonthly', 'monthly'])),
          payDate: maybe(date()),
          periodStart: maybe(date()),
          periodEnd: maybe(date()),
          deductions: maybe([{ amount: pick([10, 58.4, 250560]) }]),
        };
        for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k];
        return s;
      });
      const jurisdiction = pick(['us-ca', 'kr', 'zz-test', 'xx']);
      const ours = outcome(() => validatePaystubs(Raw.of(stubs as PaystubValues[]), jurisdiction), ValidationInputError);
      expect(ours, JSON.stringify(stubs)).toBe(outcome(() => ref.validatePaystubs(stubs, jurisdiction), ref.ValidationInputError));
    }
  });
});
