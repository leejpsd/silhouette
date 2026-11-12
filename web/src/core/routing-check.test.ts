// Self-test for scripts/check-routing.mjs (the static routing rule run by `npm run typecheck`).

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

interface Checker {
  scan(source: string, file: string): string[];
  scanTree(root: string): string[];
}
const checkerUrl = new URL('../../scripts/check-routing.mjs', import.meta.url).href;
const { scan, scanTree } = (await import(/* @vite-ignore */ checkerUrl)) as Checker;

describe('scripts/check-routing.mjs', () => {
  it('finds no violation in src/', () => {
    expect(scanTree(fileURLToPath(new URL('../../', import.meta.url)))).toEqual([]);
  });

  const bad: [string, string, string][] = [
    ['as Skeleton', 'src/ai/x.ts', 'const s = text as Skeleton;'],
    ['double cast', 'src/ui/x.tsx', 'const s = text as unknown as Generalized<Profile>;'],
    ['cast inside union', 'src/ai/x.ts', 'const s = text as Public<string> | null;'],
    ['cast to CloudSafe', 'src/ai/x.ts', 'const s = raw as CloudSafe;'],
    ['cast in a test file', 'src/ai/x.test.ts', 'const s = text as Skeleton;'],
    ['angle-bracket cast', 'src/ai/x.ts', 'const s = <Skeleton>text;'],
    ['cast in core outside types.ts', 'src/core/skeleton.ts', 'const s = text as Skeleton;'],
    ['reveal import in ai', 'src/ai/x.ts', "import { reveal } from '../core/types';"],
    ['aliased reveal import in ui', 'src/ui/x.tsx', "import { reveal as r } from '../core/types';"],
    ['namespace reveal in data', 'src/data/x.ts', 'const v = core.reveal(raw);'],
    ['string-key reveal', 'src/data/x.ts', "const v = core['reveal'](raw);"],
    ['mapRaw in ui', 'src/ui/x.tsx', 'const v = core.mapRaw(raw, f);'],
    ['brandSkeleton outside skeleton.ts', 'src/core/rules.ts', 'brandSkeleton(x);'],
    ['brandGeneralized in ai', 'src/ai/x.ts', 'brandGeneralized(x);'],
    ['reveal in tasks.ts', 'src/ai/tasks.ts', "import { reveal } from '../core/types';"],
    ['cloud mode in on-device.ts', 'src/ai/on-device.ts', 'const m = { mode: InferenceMode.PREFER_ON_DEVICE };'],
    ['cloud mode string in on-device.ts', 'src/ai/on-device.ts', "const m = { mode: 'only_in_cloud' };"],
    ['firebase/ai in ui', 'src/ui/x.tsx', "import { getAI } from 'firebase/ai';"],
  ];
  for (const [label, file, source] of bad) {
    it(`reports: ${label}`, () => expect(scan(source, file)).toHaveLength(1));
  }

  const good: [string, string, string][] = [
    ['casts in types.ts', 'src/core/types.ts', 'const s = v as Skeleton;'],
    ['reveal in core', 'src/core/rules.ts', 'const a = reveal(raw);'],
    ['brandSkeleton in skeleton.ts', 'src/core/skeleton.ts', 'brandSkeleton(x);'],
    ['type annotations are fine', 'src/ai/x.ts', 'function f(s: Skeleton): Generalized<P> | null { return null; }'],
    ['unrelated casts are fine', 'src/ui/x.tsx', 'const n = v as number;'],
    ['comments are ignored', 'src/ai/x.ts', '// never call reveal() here\nconst a = 1;'],
    ['type tests may name reveal', 'src/ai/routing.test-d.ts', "import { reveal } from '../core/types';"],
    ['reveal in on-device.ts', 'src/ai/on-device.ts', 'const blob = reveal(photo);'],
    ['tests may reveal to assert', 'src/ai/tasks.test.ts', 'expect(reveal(result.value)).toBe(1);'],
    ['ONLY_ON_DEVICE in on-device.ts', 'src/ai/on-device.ts', 'const m = { mode: InferenceMode.ONLY_ON_DEVICE };'],
    ['firebase/ai in ai', 'src/ai/firebase.ts', "import { getAI } from 'firebase/ai';"],
  ];
  for (const [label, file, source] of good) {
    it(`allows: ${label}`, () => expect(scan(source, file)).toEqual([]));
  }
});
