import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from '../../core/types';
import { buildAllowlist, buildIntroducers, skeletonize, type AllowlistFile } from '../../core/skeleton';
import { phoneLines } from './phone-view';

const en = JSON.parse(readFileSync(new URL('../../../../shared/skeleton/allowlist/en.json', import.meta.url), 'utf8')) as AllowlistFile;

describe('the "On this phone" view', () => {
  it('restores every line, placeholders with their original text and ids', () => {
    const text = 'Employee Lucia Lindqvist   ID 004417\nPay Frequency: Weekly\nGross Pay 1,200.00';
    const { skeleton, map } = skeletonize(Raw.of(text), buildAllowlist([en]), buildIntroducers([en]));
    const lines = phoneLines(skeleton, map);
    expect(lines.map((l) => l.map((s) => s.text).join(''))).toEqual(text.split('\n'));
    expect(lines[0]?.filter((s) => s.ref).map((s) => s.ref)).toEqual(['W1', 'W2', 'N1']);
  });
});
