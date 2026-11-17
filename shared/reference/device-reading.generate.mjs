// Builds fixtures/conformance/device-reading.json from device-reading.cases.mjs and the reference
// implementation in device-reading.mjs.
import { readJson } from './cases.mjs';
import * as d from './device-reading.mjs';
import * as k from './device-reading.cases.mjs';

const JURISDICTION = 'us-ca';

/** A pass as the fixture records it (the value is in the outcome; latency is not deterministic). */
const passRecord = (p) => ({
  part: p.part,
  parsed: p.parsed,
  problems: p.problems,
  ...(p.marked ? { marked: p.marked } : {}),
  extraKeys: p.extraKeys,
  missingKeys: p.missingKeys,
});

export function buildDeviceReading() {
  const schema = readJson('../schemas/pointer.paystub.json');
  const doc = (id) => k.documents[id];
  return {
    spec: 'validation/DEVICE_READING.md v2',
    confirmedOnly: { language: 'en' },
    schema: 'schemas/pointer.paystub.json',
    jurisdiction: JURISDICTION,
    documents: k.documents,
    constraints: k.constraintCases.map((c) => ({ ...c, expected: d.deviceConstraint(schema, doc(c.document).skeleton, c.part) })),
    checks: k.checkCases.map((c) => {
      const { skeleton, map } = doc(c.document);
      c = { ...c, pointers: Object.fromEntries(Object.entries(c.pointers).filter(([, v]) => v !== undefined)) };
      return {
        ...c,
        expected: {
          core: d.coreProblems(schema, c.pointers, skeleton, map, JURISDICTION),
          deductions: d.deductionsProblems(schema, c.pointers, map, JURISDICTION),
          notRead: d.notReadFields(c.pointers, skeleton),
          ytdMissingWithCandidate: d.ytdMissingWithCandidate(schema, c.pointers, skeleton, map, JURISDICTION),
          unconfirmed: d.unconfirmedFields(schema, c.pointers, skeleton, map, JURISDICTION, 'en'),
        },
      };
    }),
    readings: k.readingCases.map((c) => {
      const { skeleton, map } = doc(c.document);
      const r = d.readOnDevice(schema, skeleton, map, JURISDICTION, c.answers);
      return {
        ...c,
        expected: {
          asked: r.asked,
          passes: r.passes.map(passRecord),
          outcome: r.outcome,
          ...(r.outcome === 'on-device' ? { value: r.value, notRead: r.notRead } : { problems: r.problems }),
        },
      };
    }),
    gold: {
      $comment:
        'Every right reading of the 38 English evaluation paystubs: each combination of the alternatives over base (see device-reading.cases.mjs rightReadings), and each line run of gold name placeholders. Expected: no core problem, nothing left out, and (with the gold deductions) nothing unconfirmed for every reading; ytdMissingWhenLeftOut gives, per grossPay alternative, whether leaving year to date out asks the gross part again.',
      cases: k.goldCases.map((g) => {
        const { skeleton, map } = doc(g.document);
        const readings = k.rightReadings(g);
        // With the gold deductions, every right reading is also confirmed: no right value is left out.
        const problems = readings.flatMap((r) => [
          ...d.coreProblems(schema, r, skeleton, map, JURISDICTION),
          ...d.notReadFields(r, skeleton).problems,
          ...d.unconfirmedFields(schema, g.deductions.length ? { ...r, deductions: g.deductions } : r, skeleton, map, JURISDICTION, 'en').problems,
        ]);
        const nameProblems = Object.entries(g.names).flatMap(([field, runs]) => runs.flatMap((ids) => d.incompleteNameProblems({ [field]: ids }, skeleton)));
        const ytdMissingWhenLeftOut = (g.alternatives.grossPay ?? []).map((grossPay) => {
          const { ytdGross, ...rest } = { ...g.base, grossPay };
          void ytdGross;
          return d.ytdMissingWithCandidate(schema, rest, skeleton, map, JURISDICTION);
        });
        return { ...g, expected: { readings: readings.length, problems: [...problems, ...nameProblems], ytdMissingWhenLeftOut } };
      }),
    },
  };
}
