// The content security policy and headers that e2e/hosting.spec.ts tests are the ones deployed: the
// copy in web/hosting/ is identical to the `hosting` section of the root firebase.json.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as { hosting?: unknown };

describe('hosting configuration', () => {
  it('web/hosting/firebase.hosting.json is the hosting section of firebase.json', () => {
    expect(read('../hosting/firebase.hosting.json').hosting).toEqual(read('../../firebase.json').hosting);
  });
});
