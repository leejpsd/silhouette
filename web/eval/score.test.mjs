import { describe, expect, it } from 'vitest';
import { aggregate, scoreDeductions, scoreDocument, scoreField, targetMet } from './score.mjs';

describe('evaluation scoring', () => {
  it('classifies field outcomes', () => {
    expect(scoreField(12.5, 12.5)).toBe('correct');
    expect(scoreField(12.5, 12.504)).toBe('correct');
    expect(scoreField(12.5, undefined)).toBe('missing');
    expect(scoreField(12.5, 13)).toBe('wrong');
    expect(scoreField(undefined, 13)).toBe('spurious');
    expect(scoreField(undefined, undefined)).toBe('absent');
    expect(scoreField('Maria Lopez', 'Maria')).toBe('wrong');
  });

  it('matches deductions as a multiset of amounts', () => {
    const r = scoreDeductions([{ amount: 1, kind: 'medicare' }, { amount: 1 }, { amount: 2 }], [{ amount: 1, kind: 'medicare' }, { amount: 3 }]);
    expect(r).toMatchObject({ gold: 3, predicted: 2, matched: 1, extra: 1, exact: false, kindCorrect: 1, kindScored: 1 });
  });

  it('separates dropped pointers from omitted fields and aggregates', () => {
    const fields = ['grossPay', 'netPay', 'ytdGross', 'payFrequency', 'deductions'];
    const gold = { grossPay: 10, netPay: 8, payFrequency: 'weekly', deductions: [{ amount: 2 }] };
    const a = scoreDocument(fields, gold, { grossPay: 10, netPay: 8, payFrequency: 'weekly', deductions: [{ amount: 2 }] }, {});
    const b = scoreDocument(fields, gold, { grossPay: 9, ytdGross: 50 }, { netPay: 'W3' });
    expect(a.allCorrect).toBe(true);
    expect(b.outcomes).toEqual({ grossPay: 'wrong', netPay: 'missing', ytdGross: 'spurious', payFrequency: 'missing' });
    expect(b.invalid).toEqual(['netPay']);
    const m = aggregate([{ ok: true, score: a, usage: { promptTokenCount: 100 }, latencyMs: 10 }, { ok: true, score: b, latencyMs: 30 }]);
    expect(m.fields.grossPay).toMatchObject({ correct: 1, wrong: 1, recall: 0.5, precision: 0.5, wrongRate: 0.5 });
    expect(m.fields.ytdGross).toMatchObject({ spurious: 1, recall: null, wrongRate: 0.5 });
    expect(m.allFieldsCorrect).toBe(0.5);
    expect(targetMet(m)).toBe(false);
  });
});
