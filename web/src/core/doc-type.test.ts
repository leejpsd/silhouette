import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from './types';
import { detectDocType } from './doc-type';

const sample = (name: string) => readFileSync(new URL(`../../../shared/samples/${name}`, import.meta.url), 'utf8');

describe('detectDocType', () => {
  it('reads the bundled W-2 as a W-2 and the bundled paystubs as paystubs', () => {
    expect(detectDocType(Raw.of(sample('w2-en-01.txt')))).toBe('w2');
    expect(detectDocType(Raw.of(sample('paystub-en-01.txt')))).toBe('paystub');
    expect(detectDocType(Raw.of(sample('payslip-ko-01.txt')))).toBe('paystub');
  });
  it('knows the form by either title, near the top only', () => {
    expect(detectDocType(Raw.of('\n\nWage and Tax Statement 2025\nWages 1.00'))).toBe('w2');
    expect(detectDocType(Raw.of('Copy C\nForm W2 2025'))).toBe('w2');
    expect(detectDocType(Raw.of(['Pay stub', 'a', 'b', 'c', 'd', 'e', 'f', 'See your W-2 in January'].join('\n')))).toBe('paystub');
    expect(detectDocType(Raw.of('Earnings statement\nGross pay 1,271.88'))).toBe('paystub');
  });
});
