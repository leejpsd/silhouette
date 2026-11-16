// Every rule pack shipped in ../shared/rulepacks/ must pass the shared authoring linter
// (shared/reference/lint.mjs, called directly; not ported) and evaluate without RuleError.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sharedUrl = new URL('../../../shared/', import.meta.url);
const lintUrl = new URL('reference/lint.mjs', sharedUrl).href;
const { lintPack } = (await import(/* @vite-ignore */ lintUrl)) as { lintPack: (pack: unknown, bands: unknown) => string[] };
const readJson = (rel: string): unknown => JSON.parse(readFileSync(new URL(rel, sharedUrl), 'utf8'));

const packs = readdirSync(new URL('rulepacks/', sharedUrl), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(new URL(`rulepacks/${d.name}/pack.json`, sharedUrl)))
  .map((d) => d.name);

describe('shared/rulepacks', () => {
  it('includes the zz-test pack and the California pack', () => expect(packs).toEqual(expect.arrayContaining(['zz-test', 'us-ca'])));
  for (const id of packs) {
    it(`${id} passes shared/reference/lint.mjs`, () => {
      expect(lintPack(readJson(`rulepacks/${id}/pack.json`), readJson(`bands/${id}.json`))).toEqual([]);
    });
  }
});
