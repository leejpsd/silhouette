// Runtime checks for the Raw wrapper: no serialization or inspection path reveals the value.

import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';

import { Raw, mapRaw, reveal } from './types';

const SECRET = 'Zyxwanda 9917734';

describe('Raw', () => {
  const raw = Raw.of({ name: SECRET, nested: [SECRET] });

  it('does not reveal its value through JSON, string conversion or inspection', () => {
    const outputs = [
      JSON.stringify(raw),
      JSON.stringify({ wrapped: raw, list: [raw] }),
      String(raw),
      `${raw}`,
      inspect(raw, { showHidden: true, depth: Infinity }),
      inspect({ wrapped: raw }, { showHidden: true, depth: Infinity }),
      JSON.stringify(Object.keys(raw)),
      JSON.stringify(Object.getOwnPropertyNames(raw)),
      JSON.stringify({ ...raw }),
      JSON.stringify(structuredCloneSafe(raw)),
    ];
    for (const out of outputs) expect(out).not.toContain('Zyxwanda');
  });

  it('serializes to a fixed marker', () => {
    expect(JSON.stringify(raw)).toBe('"[Raw]"');
    expect(String(raw)).toBe('[Raw]');
  });

  it('reveal and mapRaw give deterministic code access to the value', () => {
    expect(reveal(raw).name).toBe(SECRET);
    expect(reveal(mapRaw(raw, (v) => v.name.length))).toBe(SECRET.length);
  });
});

function structuredCloneSafe(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return null;
  }
}
