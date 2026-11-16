// The production bundle has no App Check debug-token code path and no value from a local env file
// (web/.env.local holds the debug token on a developer's machine).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { checkBundle } from './check-bundle.mjs';

describe('the production bundle', () => {
  it('contains no debug-token code path and no local env value', async () => {
    const out = mkdtempSync(join(tmpdir(), 'silhouette-bundle-'));
    // A production build as `npm run build` makes it (the test runner sets NODE_ENV to "test").
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await build({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, mode: 'production', logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
      // Only file names and rule names are reported, never a value.
      expect(checkBundle(out)).toEqual([]);
    } finally {
      process.env.NODE_ENV = nodeEnv;
      rmSync(out, { recursive: true, force: true });
    }
  }, 120_000);
});
