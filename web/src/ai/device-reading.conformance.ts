// Runner for shared/fixtures/conformance/device-reading.json (validation/DEVICE_READING.md), used by
// src/core/conformance.test.ts. It runs the web implementation itself: the response constraint of each
// part, the checks of src/core/pointer-check.ts, and the reading part by part through extractPointers
// with a fake device that answers each part with the fixture's text. Test code only.
import { expect, it } from 'vitest';
import { Raw } from '../core/types';
import type { PlaceholderMap } from '../core/skeleton';
import type { Skeleton } from '../core/types';
import { corePointerProblems, deductionsProblems, incompleteNameProblems, notReadFields, pointerProblems, ytdMissingWithCandidate } from '../core/pointer-check';
import { setModelProviderForTests } from './model-port';
import { setDeviceModelForTests } from './device-fake';
import { POINTER_SCHEMAS, activePointerConfig, extractPointers } from './tasks';
import { deviceResponseConstraint, type DevicePart } from './device-schema';

type Doc = { skeleton: Skeleton; map: PlaceholderMap };
interface Fixture {
  jurisdiction: string;
  documents: Record<string, Doc>;
  constraints: { id: string; document: string; part: DevicePart; expected: unknown }[];
  checks: {
    id: string;
    document: string;
    pointers: Record<string, unknown>;
    expected: { core: string[]; deductions: string[]; notRead: { problems: string[]; fields: string[] }; ytdMissingWithCandidate: boolean };
  }[];
  readings: {
    id: string;
    document: string;
    answers: Record<string, string>;
    expected: { asked: string[]; passes: unknown[]; outcome: 'on-device' | 'failed'; value?: unknown; notRead?: string[]; problems?: string[] };
  }[];
  gold: {
    cases: {
      document: string;
      base: Record<string, unknown>;
      alternatives: Record<string, string[]>;
      names: Record<string, string[][]>;
      expected: { readings: number; problems: string[]; ytdMissingWhenLeftOut: boolean[] };
    }[];
  };
}

const S = POINTER_SCHEMAS.paystub;

/** Every right reading of a gold case: each combination of the alternatives over the base. */
export function rightReadings(g: Fixture['gold']['cases'][number]): Record<string, unknown>[] {
  const choices = (field: string): (string | undefined)[] => (g.alternatives[field]?.length ? (g.alternatives[field] as string[]) : [undefined]);
  const out: Record<string, unknown>[] = [];
  for (const grossPay of choices('grossPay'))
    for (const ytdGross of choices('ytdGross'))
      for (const hoursWorked of choices('hoursWorked'))
        for (const hourlyRate of choices('hourlyRate')) {
          const r: Record<string, unknown> = { ...g.base, grossPay, ytdGross, hoursWorked, hourlyRate };
          out.push(Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)));
        }
  return out;
}

/** The part a fake-device request is for, from its response constraint and system instruction. */
function partOf(params: unknown): DevicePart {
  const p = params as { onDeviceParams: { promptOptions: { responseConstraint: { properties: Record<string, unknown> } }; createOptions: { initialPrompts: { content: string }[] } } };
  const keys = Object.keys(p.onDeviceParams.promptOptions.responseConstraint.properties).join(',');
  if (keys === 'deductions') {
    const again = activePointerConfig().deviceParts?.deductionsAgain ?? '\u0000';
    return p.onDeviceParams.createOptions.initialPrompts[0]?.content.includes(again) ? 'deductions-again' : 'deductions';
  }
  return keys === 'grossPay,ytdGross' ? 'gross' : 'core';
}

export function runDeviceReadingFixture(raw: unknown): void {
  const fixture = raw as Fixture;
  const J = fixture.jurisdiction;
  const doc = (id: string) => {
    const d = fixture.documents[id] as Doc;
    return { skeleton: d.skeleton, map: Raw.of(d.map) };
  };

  it('has every section', () => {
    expect(fixture.constraints.length).toBeGreaterThan(0);
    expect(fixture.checks.length).toBeGreaterThan(0);
    expect(fixture.readings.length).toBeGreaterThan(0);
    expect(fixture.gold.cases.length).toBe(38);
  });

  for (const c of fixture.constraints) {
    it(`constraint ${c.id}`, () => expect(deviceResponseConstraint(S, activePointerConfig().schemaOptions, doc(c.document).skeleton, c.part)).toEqual(c.expected));
  }

  for (const c of fixture.checks) {
    it(`check ${c.id}`, () => {
      const { skeleton, map } = doc(c.document);
      expect(corePointerProblems(S, c.pointers, map, J, skeleton)).toEqual(c.expected.core);
      expect(deductionsProblems(S, c.pointers, map, J)).toEqual(c.expected.deductions);
      expect(notReadFields(c.pointers, skeleton)).toEqual(c.expected.notRead);
      expect(ytdMissingWithCandidate(S, c.pointers, skeleton, map, J)).toBe(c.expected.ytdMissingWithCandidate);
    });
  }

  for (const c of fixture.readings) {
    it(`reading ${c.id}`, async () => {
      const { skeleton, map } = doc(c.document);
      const asked: string[] = [];
      setDeviceModelForTests('available');
      setModelProviderForTests(async (params) => ({
        async generateContent() {
          if (params.mode === 'only_in_cloud') return { response: { text: () => '{}', inferenceSource: 'in_cloud' } };
          const part = partOf(params);
          asked.push(part);
          const text = c.answers[part === 'deductions-again' ? 'deductionsAgain' : part];
          if (text === undefined) throw new Error(`the fixture has no answer for the ${part} part`);
          return { response: { text: () => text, inferenceSource: 'on_device' } };
        },
      }));
      try {
        const result = await extractPointers(skeleton, 'paystub', 'en', {
          validate: (p) => pointerProblems(S, p, skeleton, map, J),
          checkParts: {
            core: (p) => corePointerProblems(S, p, map, J, skeleton),
            deductions: (p) => deductionsProblems(S, p, map, J),
            notRead: (p) => notReadFields(p, skeleton),
            ytdMissing: (p) => ytdMissingWithCandidate(S, p, skeleton, map, J),
          },
        });
        const passes = (result.deviceAttempt?.passes ?? []).map((p) => ({
          part: p.part,
          parsed: p.parsed,
          problems: p.problems,
          ...(p.marked ? { marked: p.marked } : {}),
          extraKeys: p.extraKeys,
          missingKeys: p.missingKeys,
        }));
        expect(asked).toEqual(c.expected.asked);
        expect(passes).toEqual(c.expected.passes);
        if (c.expected.outcome === 'on-device') {
          expect(result).toMatchObject({ inferenceSource: 'ON_DEVICE', reason: 'document-silhouette-only' });
          expect(result.value).toEqual(c.expected.value);
          expect(result.notRead).toEqual(c.expected.notRead);
        } else {
          // A failed on-device attempt: repeated once in the cloud (routing.json onDeviceFailure).
          expect(result.reason).toBe('on-device-failed');
          expect(result.deviceAttempt?.problems).toEqual(c.expected.problems);
        }
      } finally {
        setModelProviderForTests(null);
        setDeviceModelForTests('absent');
      }
    });
  }

  for (const g of fixture.gold.cases) {
    it(`gold ${g.document}: no false alarm on any right reading`, () => {
      const { skeleton, map } = doc(g.document);
      const readings = rightReadings(g);
      expect(readings).toHaveLength(g.expected.readings);
      const problems = readings.flatMap((r) => [...corePointerProblems(S, r, map, J, skeleton), ...notReadFields(r, skeleton).problems]);
      const names = Object.entries(g.names).flatMap(([field, runs]) => runs.flatMap((ids) => incompleteNameProblems({ [field]: ids }, skeleton)));
      expect([...problems, ...names]).toEqual(g.expected.problems);
      const trigger = (g.alternatives['grossPay'] ?? []).map((grossPay) => {
        const rest = Object.fromEntries(Object.entries({ ...g.base, grossPay }).filter(([k]) => k !== 'ytdGross'));
        return ytdMissingWithCandidate(S, rest, skeleton, map, J);
      });
      expect(trigger).toEqual(g.expected.ytdMissingWhenLeftOut);
    });
  }
}
