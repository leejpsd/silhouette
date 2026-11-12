// Regression tests for problems found by testing the app in a real browser.
import { describe, expect, it } from 'vitest';
import { Raw, reveal } from './types';
import { buildAllowlist, buildIntroducers, parseTypedAmount, skeletonize, visibleWords, type AllowlistFile } from './skeleton';
import { readFileSync } from 'node:fs';

const enFile = JSON.parse(readFileSync(new URL('../../../shared/skeleton/allowlist/en.json', import.meta.url), 'utf8')) as AllowlistFile;
const allow = buildAllowlist([enFile]);
const intro = buildIntroducers([enFile]);

describe('typed amounts', () => {
  it('reads decimals, thousands separators and a leading currency symbol', () => {
    expect(parseTypedAmount('28000.50')).toBe(28000.5);
    expect(parseTypedAmount('28000.5')).toBe(28000.5);
    expect(parseTypedAmount(' 28,000.50 ')).toBe(28000.5);
    expect(parseTypedAmount('$28,000')).toBe(28000);
    expect(parseTypedAmount('₩ 2,485,000')).toBe(2485000);
    expect(parseTypedAmount('32000')).toBe(32000);
  });
  it('rejects everything else instead of guessing', () => {
    for (const bad of ['28.000,50', '1,2345', '28000.', '.5', '28 000', '28000 USD', '-500', '', '$']) {
      expect(parseTypedAmount(bad), bad).toBeUndefined();
    }
  });
});

describe('hiding words in the preview', () => {
  const text = Raw.of('Employee: Ana Ruiz\nGross Pay 1,000.00\nNet Pay 900.00');
  it('masks the chosen word and its whole phrase, only in this document', () => {
    const before = skeletonize(text, allow, intro);
    expect(before.skeleton).toContain('Gross Pay');
    expect(visibleWords(before.skeleton)).toContain('Gross');
    const after = skeletonize(text, allow, intro, { hide: new Set(['gross']) });
    expect(after.skeleton).not.toContain('Gross');
    expect(after.skeleton).not.toContain('Gross Pay'); // "Pay" is in the same phrase
    expect(after.skeleton).toContain('Net Pay'); // other phrases are untouched
    expect(Object.values(reveal(after.map))).toEqual(expect.arrayContaining(['Gross', 'Pay']));
  });
  it('with nothing hidden gives exactly the normal skeleton', () => {
    expect(skeletonize(text, allow, intro, { hide: new Set() }).skeleton).toBe(skeletonize(text, allow, intro).skeleton);
  });

  it('a visible introducer in front of a masked name can be hidden too, and then masks with the name', () => {
    const doc = Raw.of('Employee Lucia Lindqvist   ID 004417');
    const shown = skeletonize(doc, allow, intro);
    expect(shown.skeleton).toBe('Employee ⟦W1⟧ ⟦W2⟧   ID ⟦N1⟧');
    expect(visibleWords(shown.skeleton)).toEqual(['Employee', 'ID']);
    const hidden = skeletonize(doc, allow, intro, { hide: new Set(['employee']) });
    expect(hidden.skeleton).toBe('⟦W1⟧ ⟦W2⟧ ⟦W3⟧   ID ⟦N1⟧');
    expect(reveal(hidden.map)['W1']).toBe('Employee');
  });

  it('hiding a word of a fully visible phrase masks the whole phrase', () => {
    const hidden = skeletonize(Raw.of('Pay Date: 10/20/2026'), allow, intro, { hide: new Set(['date']) });
    expect(hidden.skeleton).toBe('⟦W1⟧ ⟦W2⟧: ⟦D1⟧'); // "Pay" is an introducer, but the user hid its phrase
  });
});

describe('name pointers after phrase masking', async () => {
  const { tidyNamePointers } = await import('./tidy');
  const { rehydrate } = await import('./skeleton');
  const schema = JSON.parse(readFileSync(new URL('../../../shared/schemas/pointer.paystub.json', import.meta.url), 'utf8'));
  const run = (text: string, refs: string[]) => {
    const doc = skeletonize(Raw.of(text), allow); // without introducers: what a model sees when 4.2 does not apply
    return reveal(rehydrate(schema, tidyNamePointers(schema, { employeeName: refs }, doc.map, intro), doc.map))['employeeName'];
  };
  it('drops a label that was masked together with the name', () => {
    expect(run('Employee Lucia Lindqvist (004417)', ['W1', 'W2', 'W3'])).toBe('Lucia Lindqvist');
    expect(run('Pay Stub for Ines Strand', ['W1', 'W2', 'W3', 'W4', 'W5'])).toBe('Ines Strand');
  });
  it('keeps names that contain label words', () => {
    expect(run('Employee: Jordan Gross', ['W1', 'W2'])).toBe('Jordan Gross');
    expect(run('Federal Security Services LLC', ['W1', 'W2', 'W3', 'W4'])).toBe('Federal Security Services LLC');
  });
  it('also drops titles that are not shared introducers', () => {
    expect(run('Employee: Ms Ana Ruiz', ['W1', 'W2', 'W3'])).toBe('Ana Ruiz');
  });
  it('never empties a field', () => {
    expect(run('Employee For Ford', ['W1', 'W2'])).toBe('For');
  });
});
