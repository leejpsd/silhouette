// Scoring of rehydrated fields against gold values. Pure functions (unit-tested in score.test.mjs).
//
// Per field and document, one outcome:
//   correct   gold present, prediction equals gold
//   missing   gold present, no prediction (omitted, null, or dropped by the Rehydrator)
//   wrong     gold present, prediction differs (a real but wrong placeholder)
//   spurious  gold absent, prediction present
//   absent    gold absent, no prediction
// Deductions are scored as a multiset of amounts (kinds reported separately).

export const TARGET_FIELDS = ['grossPay', 'netPay', 'ytdGross', 'payFrequency'];

const equal = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : a === b);

export function scoreField(gold, predicted) {
  const has = (v) => v !== undefined && v !== null && v !== '';
  if (has(gold)) return !has(predicted) ? 'missing' : equal(gold, predicted) ? 'correct' : 'wrong';
  return has(predicted) ? 'spurious' : 'absent';
}

export function scoreDeductions(gold = [], predicted = []) {
  const left = predicted.map((d) => d.amount);
  let matched = 0;
  let kindCorrect = 0;
  let kindScored = 0;
  for (const g of gold) {
    const i = left.findIndex((a) => equal(a, g.amount));
    if (i === -1) continue;
    matched++;
    const p = predicted.find((d) => equal(d.amount, g.amount));
    if (g.kind !== undefined) {
      kindScored++;
      if (p?.kind === g.kind) kindCorrect++;
    }
    left.splice(i, 1);
  }
  return { gold: gold.length, predicted: predicted.length, matched, extra: left.length, exact: matched === gold.length && left.length === 0, kindCorrect, kindScored };
}

/** Scores one document. `fields` are the schema's property names; `pointers` the raw model output. */
export function scoreDocument(fields, gold, rehydrated, pointers) {
  const outcomes = {};
  const invalid = [];
  for (const f of fields) {
    if (f === 'deductions') continue;
    outcomes[f] = scoreField(gold[f], rehydrated?.[f]);
    const raw = pointers?.[f];
    if (outcomes[f] === 'missing' && raw !== undefined && raw !== null) invalid.push(f);
  }
  const deductions = fields.includes('deductions') ? scoreDeductions(gold.deductions, rehydrated?.deductions) : null;
  const allCorrect = Object.values(outcomes).every((o) => o === 'correct' || o === 'absent') && (deductions === null || deductions.exact);
  return { outcomes, deductions, invalid, allCorrect };
}

/** Aggregates scored documents into per-field metrics. */
export function aggregate(scored) {
  const fields = {};
  for (const doc of scored) {
    for (const [f, o] of Object.entries(doc.score?.outcomes ?? {})) {
      fields[f] ??= { correct: 0, missing: 0, wrong: 0, spurious: 0, absent: 0, invalid: 0, docs: 0 };
      fields[f][o]++;
      fields[f].docs++;
      if (doc.score.invalid.includes(f)) fields[f].invalid++;
    }
  }
  for (const m of Object.values(fields)) {
    const goldPresent = m.correct + m.missing + m.wrong;
    const predicted = m.correct + m.wrong + m.spurious;
    m.recall = goldPresent ? m.correct / goldPresent : null;
    m.precision = predicted ? m.correct / predicted : null;
    m.wrongRate = m.docs ? (m.wrong + m.spurious) / m.docs : null;
  }
  const ded = scored.map((d) => d.score?.deductions).filter(Boolean);
  const deductions = ded.length
    ? {
        itemRecall: ded.reduce((a, d) => a + d.matched, 0) / Math.max(1, ded.reduce((a, d) => a + d.gold, 0)),
        itemPrecision: ded.reduce((a, d) => a + d.matched, 0) / Math.max(1, ded.reduce((a, d) => a + d.predicted, 0)),
        exactDocs: ded.filter((d) => d.exact).length / ded.length,
        kindAccuracy: ded.reduce((a, d) => a + d.kindCorrect, 0) / Math.max(1, ded.reduce((a, d) => a + d.kindScored, 0)),
      }
    : null;
  const ok = scored.filter((d) => d.ok);
  const sum = (k) => ok.reduce((a, d) => a + (d.usage?.[k] ?? 0), 0);
  const latencies = ok.map((d) => d.latencyMs).sort((a, b) => a - b);
  return {
    documents: scored.length,
    errors: scored.length - ok.length,
    allFieldsCorrect: scored.filter((d) => d.score?.allCorrect).length / Math.max(1, scored.length),
    fields,
    deductions,
    tokens: {
      prompt: ok.length ? Math.round(sum('promptTokenCount') / ok.length) : null,
      output: ok.length ? Math.round(sum('candidatesTokenCount') / ok.length) : null,
      thoughts: ok.length ? Math.round(sum('thoughtsTokenCount') / ok.length) : null,
    },
    latencyMs: latencies.length ? { median: latencies[Math.floor(latencies.length / 2)], p90: latencies[Math.floor(latencies.length * 0.9)] } : null,
  };
}

/** Target check on English paystubs: recall ≥ 95 %, wrong ≤ 2 % on target fields, all-correct ≥ 80 %. */
export function targetMet(metrics) {
  const fieldsOk = TARGET_FIELDS.every((f) => {
    const m = metrics.fields[f];
    return m && m.recall !== null && m.recall >= 0.95 && m.wrongRate <= 0.02;
  });
  return fieldsOk && metrics.allFieldsCorrect >= 0.8;
}
