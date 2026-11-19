// The year-to-date rules of the core check (same line as gross pay; no larger amount that also fits)
// and the names rule, measured on every English evaluation paystub and on the real on-device mistakes
// of the recorded run. A correct reading must never raise an alarm: for each paystub, every right
// placeholder for gross pay and year to date is tried (a paystub may write the same amount twice).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Raw } from './types';
import { skeletonize } from './skeleton';
import { allowlistFor, introducersFor } from '../ui/doc/allowlists';
import { corePointerProblems, goldPlaceholderIds, incompleteNameProblems, largerYtdProblems, namesProblems, notReadFields, sameLineYtdProblems, sharedAmountProblems, ytdMissingWithCandidate } from './pointer-check';
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
    const run = JSON.parse(read(new URL('../../eval/results/on-device/history/device-check-2026-11-16T1807-chrome157-macos.json', import.meta.url))) as {
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
    let notMoney = 0;
    const missed: string[] = [];
    for (const d of GOLD) {
      const goldYtd = new Set(d.ids['ytdGross'] ?? []);
      const gross = d.ids['grossPay']?.[0];
      for (const m of new Set([...d.skeleton.matchAll(/⟦(N[0-9]+)⟧/g)].map((x) => x[1] as string))) {
        if (goldYtd.has(m)) continue;
        const reading = { ...d.right, grossPay: gross, ytdGross: m };
        const before = corePointerProblems(S, reading, d.map, J);
        if (before.some((p) => !p.endsWith(':not-money'))) continue;
        simulated++;
        if (before.length > 0) notMoney++;
        if (corePointerProblems(S, reading, d.map, J, d.skeleton).length > 0) caught++;
        else missed.push(`${d.file} ${m}`);
      }
    }
    // Ids, ZIP codes and years (no cents) are caught as not money, the employee number of en-l04-1 among
    // them. The misses: a paystub without any year to date (en-l03-1), where nothing tells the two apart.
    expect({ simulated, caught, notMoney }).toEqual({ simulated: 34, caught: 32, notMoney: 14 });
    expect(missed.map((m) => m.split(' ')[0])).toEqual(['en-l03-1.txt', 'en-l03-1.txt']);
  });
});

describe('year to date left out', () => {
  it('asks again where the document has one place for it, never where it has none (en-l03); en-l08 has two candidates', () => {
    const trigger = (d: (typeof GOLD)[number]) => (d.ids['grossPay'] ?? []).some((g) => ytdMissingWithCandidate(S, { ...d.right, grossPay: g, ytdGross: undefined }, d.skeleton, d.map, J));
    const withYtd = GOLD.filter((d) => (d.ids['ytdGross'] ?? []).length > 0);
    const without = GOLD.filter((d) => (d.ids['ytdGross'] ?? []).length === 0);
    expect(without.map((d) => d.file)).toEqual(['en-l03-1.txt', 'en-l03-2.txt', 'en-l03-3.txt']);
    expect(without.filter(trigger)).toEqual([]);
    expect(withYtd).toHaveLength(35);
    // A "Year to Date" block with both gross and net amounts that fit: two candidates, so no new request.
    expect(withYtd.filter((d) => !trigger(d)).map((d) => d.file)).toEqual(['en-l08-1.txt', 'en-l08-2.txt', 'en-l08-3.txt']);
    // Not a trigger when the year to date is answered.
    for (const d of GOLD) for (const r of d.readings) expect(ytdMissingWithCandidate(S, r, d.skeleton, d.map, J) && r.ytdGross !== undefined).toBe(false);
  });

  it('the real run 4 misses (sample and L01: year to date null) would ask again', () => {
    const sample = silhouette(read(new URL('../../../shared/samples/paystub-en-01.txt', import.meta.url)));
    const l01 = GOLD.find((g) => g.file === 'en-l01-1.txt');
    expect(ytdMissingWithCandidate(S, { grossPay: 'N12', payFrequency: 'semimonthly', payDate: 'D3', periodStart: 'D1', periodEnd: 'D2' }, sample.skeleton, sample.map, J)).toBe(true);
    expect(ytdMissingWithCandidate(S, { ...l01?.right, ytdGross: undefined }, l01!.skeleton, l01!.map, J)).toBe(true);
  });
});

describe('one placeholder, one field', () => {
  it('no false alarm on any right reading, with every right id for gross pay, year to date, hours and rate', () => {
    const alarms: string[] = [];
    for (const d of GOLD) {
      const hours = d.ids['hoursWorked']?.length ? d.ids['hoursWorked'] : [undefined];
      const rates = d.ids['hourlyRate']?.length ? d.ids['hourlyRate'] : [undefined];
      for (const r of d.readings) for (const h of hours) for (const rate of rates) {
        const found = sharedAmountProblems({ ...r, hoursWorked: h, hourlyRate: rate });
        if (found.length > 0) alarms.push(`${d.file}: ${found.join(', ')}`);
      }
    }
    expect(alarms).toEqual([]);
  });

  it('the real L07 mistake (hours worked on gross pay\'s placeholder) leaves hours out', () => {
    expect(notReadFields({ grossPay: 'N18', netPay: 'N28', ytdGross: 'N19', hoursWorked: 'N18', hourlyRate: 'N3' })).toEqual({ problems: ['hoursWorked:shares-placeholder'], fields: ['hoursWorked'] });
  });
});

describe('names cut short', () => {
  it('no false alarm on any right name: every line that holds a gold name, read as on that line', () => {
    let readings = 0;
    const alarms: string[] = [];
    for (const d of GOLD) {
      for (const field of ['employerName', 'employeeName']) {
        for (const line of d.skeleton.split('\n')) {
          const ids = (d.ids[field] ?? []).filter((id) => line.includes(`⟦${id}⟧`));
          if (ids.length === 0) continue;
          readings++;
          const found = incompleteNameProblems({ [field]: ids }, d.skeleton);
          if (found.length > 0) alarms.push(`${d.file} ${field}: ${found.join(', ')}`);
        }
      }
    }
    expect(alarms).toEqual([]);
    expect(readings).toBe(76);
  });

  it('catches the two real shortened names of the 3-repetition run (sample: W1 for W1 W2 W3; L07: W1, and W4 for W4 W5)', () => {
    const sample = silhouette(read(new URL('../../../shared/samples/paystub-en-01.txt', import.meta.url)));
    expect(incompleteNameProblems({ employerName: ['W1'], employeeName: ['W4', 'W5'] }, sample.skeleton)).toEqual(['employerName:incomplete']);
    const l07 = GOLD.find((g) => g.file === 'en-l07-3.txt');
    expect(incompleteNameProblems({ employerName: ['W1'], employeeName: ['W4'] }, l07!.skeleton)).toEqual(['employerName:incomplete', 'employeeName:incomplete']);
    expect(notReadFields({ employerName: ['W1'], employeeName: ['W4'] }, l07!.skeleton).fields).toEqual(['employerName', 'employeeName']);
  });

  it('a gap of three or more spaces, or any visible text, is not counted (two names may share a line)', () => {
    const skeleton = '⟦W1⟧ ⟦W2⟧   ⟦W3⟧ ⟦W4⟧\nEmployee: ⟦W5⟧, ⟦W6⟧' as never;
    expect(incompleteNameProblems({ employerName: ['W1', 'W2'], employeeName: ['W3', 'W4'] }, skeleton)).toEqual([]);
    expect(incompleteNameProblems({ employeeName: ['W5'] }, skeleton)).toEqual([]);
    expect(incompleteNameProblems({ employerName: ['W1'] }, skeleton)).toEqual(['employerName:incomplete']);
    expect(incompleteNameProblems({ employerName: ['W2'] }, skeleton)).toEqual(['employerName:incomplete']);
  });
});

describe('names that run into each other', () => {
  it('the real L10 mistake (employee W4 W5 W3, employer W1 W2 W3) shares a placeholder', () => {
    expect(namesProblems({ employerName: ['W1', 'W2', 'W3'], employeeName: ['W4', 'W5', 'W3'] })).toEqual(['names:shared-placeholder']);
    expect(namesProblems({ employerName: ['W1', 'W2', 'W3'], employeeName: ['W4', 'W5'] })).toEqual([]);
  });
});
