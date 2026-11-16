// The year-to-date rules of the core check (same line as gross pay; no larger amount that also fits)
// and the names rule, measured on every English evaluation paystub and on the real on-device mistakes
// of the recorded run. A correct reading must never raise an alarm: for each paystub, every right
// placeholder for gross pay and year to date is tried (a paystub may write the same amount twice).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from './types';
import { skeletonize } from './skeleton';
import { allowlistFor, introducersFor } from '../ui/doc/allowlists';
import { corePointerProblems, goldPlaceholderIds, largerYtdProblems, namesProblems, sameLineYtdProblems } from './pointer-check';
import { POINTER_SCHEMAS } from '../ai/tasks';

const S = POINTER_SCHEMAS.paystub;
const J = 'us-ca';
const DATASET = new URL('../../eval/dataset/', import.meta.url);
const read = (url: URL) => readFileSync(url, 'utf8');
const silhouette = (text: string) => skeletonize(Raw.of(text), allowlistFor('en'), introducersFor('en'));

const GOLD = readdirSync(DATASET)
  .filter((f) => /^en-l\d+-\d+\.txt$/.test(f))
  .sort()
  .map((f) => {
    const { skeleton, map } = silhouette(read(new URL(f, DATASET)));
    const gold = JSON.parse(read(new URL(f.replace('.txt', '.gold.json'), DATASET))) as Record<string, unknown>;
    const ids = goldPlaceholderIds(gold, map);
    // A right reading: the gold placeholder of every field (names as their words, the frequency as given).
    const right: Record<string, unknown> = {};
    for (const name of Object.keys(S.properties)) {
      if (name === 'deductions') continue;
      if (name === 'payFrequency') {
        if (typeof gold[name] === 'string') right[name] = gold[name];
      } else if (name === 'employerName' || name === 'employeeName') {
        if (ids[name]?.length) right[name] = ids[name];
      } else if (ids[name]?.length) right[name] = ids[name]?.[0];
    }
    const grossIds = ids['grossPay']?.length ? (ids['grossPay'] as string[]) : [undefined];
    const ytdIds = ids['ytdGross']?.length ? (ids['ytdGross'] as string[]) : [undefined];
    const readings = grossIds.flatMap((g) => ytdIds.map((y) => ({ ...right, grossPay: g, ytdGross: y })));
    return { file: f, skeleton, map, ids, right, readings };
  });

describe('year to date read from the wrong line', () => {
  it('covers the 38 English evaluation paystubs', () => expect(GOLD).toHaveLength(38));

  it('no false alarm on any right reading of any of them (both rules, and the whole core check)', () => {
    const alarms: string[] = [];
    for (const d of GOLD) {
      for (const r of d.readings) {
        const found = [
          ...sameLineYtdProblems(S, r, d.skeleton, d.map, J),
          ...largerYtdProblems(S, r, d.skeleton, d.map, J),
          ...corePointerProblems(S, r, d.map, J, d.skeleton),
          ...namesProblems(r),
        ];
        if (found.length > 0) alarms.push(`${d.file} ${String(r.grossPay)}/${String(r.ytdGross)}: ${found.join(', ')}`);
      }
    }
    expect(alarms).toEqual([]);
  });

  it('catches the three real on-device mistakes of the recorded run (sample and L01: N7 for N13; L07: N13 for N19)', () => {
    const run = JSON.parse(read(new URL('../../eval/results/on-device/device-check-2026-11-16T1807-chrome157-macos.json', import.meta.url))) as {
      cases: { id: string; device?: { passes?: { part: string; rawText: string }[] } }[];
    };
    const docs: Record<string, URL> = {
      'pointers: bundled sample': new URL('../../../shared/samples/paystub-en-01.txt', import.meta.url),
      'pointers: evaluation paystub L01': new URL('en-l01-1.txt', DATASET),
      'pointers: evaluation paystub L07': new URL('en-l07-3.txt', DATASET),
    };
    for (const [id, url] of Object.entries(docs)) {
      const { skeleton, map } = silhouette(read(url));
      const core = JSON.parse(run.cases.find((c) => c.id === id)?.device?.passes?.find((p) => p.part === 'core')?.rawText ?? '{}') as Record<string, unknown>;
      expect(sameLineYtdProblems(S, core, skeleton, map, J), id).toEqual(['ytdGross:not-on-gross-line']);
      expect(largerYtdProblems(S, core, skeleton, map, J), id).toEqual(['ytdGross:ambiguous']);
      expect(corePointerProblems(S, core, map, J, skeleton), id).toContain('ytdGross:not-on-gross-line');
    }
  });

  it('compares amounts, not ids: L10 writes its year to date twice (only earnings line and gross line), both are right', () => {
    const d = GOLD.find((g) => g.file === 'en-l10-1.txt');
    expect(d?.ids['ytdGross']).toEqual(['N7', 'N19']);
    for (const ytd of ['N7', 'N19']) expect(corePointerProblems(S, { ...d?.right, grossPay: 'N18', ytdGross: ytd }, d!.map, J, d!.skeleton)).toEqual([]);
  });

  it('simulated mistakes: any other amount that passes the other checks as year to date is caught where the layout allows', () => {
    // Every other number placeholder that the checks without these rules would accept as year to date.
    let simulated = 0;
    let caught = 0;
    const missed: string[] = [];
    for (const d of GOLD) {
      const goldYtd = new Set(d.ids['ytdGross'] ?? []);
      const gross = d.ids['grossPay']?.[0];
      for (const m of new Set([...d.skeleton.matchAll(/⟦(N[0-9]+)⟧/g)].map((x) => x[1] as string))) {
        if (goldYtd.has(m)) continue;
        const reading = { ...d.right, grossPay: gross, ytdGross: m };
        if (corePointerProblems(S, reading, d.map, J).length > 0) continue;
        simulated++;
        if (corePointerProblems(S, reading, d.map, J, d.skeleton).length > 0) caught++;
        else missed.push(`${d.file} ${m}`);
      }
    }
    // The misses: two paystubs without any year to date (en-l03-1) and an employee number that fits (en-l04-1).
    expect({ simulated, caught }).toEqual({ simulated: 34, caught: 31 });
    expect(missed.map((m) => m.split(' ')[0])).toEqual(['en-l03-1.txt', 'en-l03-1.txt', 'en-l04-1.txt']);
  });
});

describe('names that run into each other', () => {
  it('the real L10 mistake (employee W4 W5 W3, employer W1 W2 W3) shares a placeholder', () => {
    expect(namesProblems({ employerName: ['W1', 'W2', 'W3'], employeeName: ['W4', 'W5', 'W3'] })).toEqual(['names:shared-placeholder']);
    expect(namesProblems({ employerName: ['W1', 'W2', 'W3'], employeeName: ['W4', 'W5'] })).toEqual([]);
  });
});
