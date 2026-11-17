// Reference implementation of the on-device check's scoring and summary (validation/DEVICE_CHECK.md),
// a minimal JSON Schema validator for its run files (schemas/device-check-run.v3.json), and the judges'
// prepared household. Zero dependencies.
import { rehydrate } from './silhouette.mjs';

// ---------- 1. Scoring a reading ----------

const near = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : a === b);

/** The fields the yearly income is worked out from (validation/SPEC.md section 7). */
export const INCOME_INPUTS = ['grossPay', 'ytdGross', 'payFrequency', 'periodStart', 'periodEnd', 'payDate'];

/**
 * Field-by-field status of a reading against the gold answers, by value: `correct` (the answered
 * placeholder holds the gold value, whichever placeholder that is), `wrong` (another value),
 * `missing` (no value where the document has one), `spurious` (a value where the document has none),
 * `absent` (no value, none expected). Deductions are one field: right when the answered list has as
 * many items as the gold list and every gold amount is among the answered amounts.
 */
export function fieldStatuses(schema, pointers, map, gold) {
  const values = rehydrate(schema, pointers, map);
  const out = {};
  for (const [name, spec] of Object.entries(schema.properties)) {
    const want = gold[name];
    const got = values[name];
    const has = spec['x-kind'] === 'list' ? Array.isArray(got) && got.length > 0 : got !== undefined && got !== null;
    if (want === undefined || want === null) {
      out[name] = has ? 'spurious' : 'absent';
      continue;
    }
    if (!has) {
      out[name] = 'missing';
      continue;
    }
    if (spec['x-kind'] === 'list') {
      const wanted = want.map((d) => d.amount);
      const answered = got.map((d) => d.amount);
      out[name] = wanted.length === answered.length && wanted.every((w) => answered.some((a) => near(a, w))) ? 'correct' : 'wrong';
    } else out[name] = near(got, want) ? 'correct' : 'wrong';
  }
  return out;
}

/** Fields right in a reading, out of the fields the gold answers have. */
export function scoreFields(statuses, gold) {
  const expected = Object.keys(gold).filter((k) => gold[k] !== null && gold[k] !== undefined);
  return { correct: expected.filter((k) => statuses[k] === 'correct').length, total: expected.length };
}

/** The yearly-income inputs as right (or rightly absent), not found, or wrong. */
export function incomeInputs(statuses) {
  const of = (want) => INCOME_INPUTS.filter((f) => want.includes(statuses[f]));
  return { right: of(['correct', 'absent', undefined]), notFound: of(['missing']), wrong: of(['wrong', 'spurious']) };
}

/** Fields whose value reached the person wrong (a value that is not the document's, or one where it has none). */
export const wrongFields = (statuses) => Object.entries(statuses).filter(([, s]) => s === 'wrong' || s === 'spurious').map(([f]) => f);

// ---------- 2. Summary of a run ----------

/** Where a case was finally answered: version 3 records it in `ran`; versions 1 and 2 in `final.ran`, else `ran`. */
export const finalRan = (c, version) => (version >= 3 ? c.ran : (c.final?.ran ?? c.ran));
/** Where a case's first attempt ran. */
export const firstRan = (c, version) => (version >= 3 ? (c.first?.ran ?? c.ran) : c.ran);
/** Fields right in the first answer of an extraction case. */
export const firstFields = (c, version) => (version >= 3 ? c.first?.fields : c.fields);

export function summarize(cases, version) {
  const fields = cases.map((c) => firstFields(c, version)).filter(Boolean);
  const afterDevice = (c) => c.final?.retried === true && finalRan(c, version) === 'IN_CLOUD';
  const extraction = cases.filter((c) => c.task === 'document.pointer.extract');
  const split = cases.some((c) => c.final?.incomeInputs);
  return {
    onDevice: cases.filter((c) => finalRan(c, version) === 'ON_DEVICE').length,
    inCloudAfterDevice: cases.filter(afterDevice).length,
    inCloud: cases.filter((c) => finalRan(c, version) === 'IN_CLOUD' && !afterDevice(c)).length,
    notRun: cases.filter((c) => finalRan(c, version) === 'not-run').length,
    total: cases.length,
    firstOnDevice: cases.filter((c) => firstRan(c, version) === 'ON_DEVICE').length,
    fieldsCorrect: fields.reduce((a, f) => a + f.correct, 0),
    fieldsTotal: fields.reduce((a, f) => a + f.total, 0),
    finalCorrect: cases.some((c) => c.final) ? cases.reduce((a, c) => a + (c.final?.fields.correct ?? 0), 0) : null,
    retriedInCloud: cases.filter((c) => c.final?.retried).length,
    deductionsNotRead: cases.filter((c) => c.final?.deductionsNotRead).length,
    incomeInputsCorrect: cases.some((c) => c.final?.incomeInputsCorrect !== undefined) ? cases.filter((c) => c.final?.incomeInputsCorrect).length : null,
    extractionCases: extraction.length,
    income: split
      ? {
          allRight: cases.filter((c) => c.final?.incomeInputs && c.final.incomeInputs.notFound.length === 0 && c.final.incomeInputs.wrong.length === 0).length,
          notFound: cases.filter((c) => c.final?.incomeInputs && c.final.incomeInputs.notFound.length > 0 && c.final.incomeInputs.wrong.length === 0).length,
          wrong: cases.filter((c) => c.final?.incomeInputs && c.final.incomeInputs.wrong.length > 0).length,
        }
      : null,
    wrongReachedPerson: cases.some((c) => c.final?.wrongFields) ? cases.filter((c) => (c.final?.wrongFields?.length ?? 0) > 0).length : null,
  };
}

/** "device-check-2026-11-16T1744-chrome157-macos.json": UTC date and time, the client's first word and major version, the platform. */
export function runFileName({ date, browser, platform }) {
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const [name = 'browser', version = ''] = browser.split(' ');
  const time = /T(\d{2}):(\d{2})/.exec(date);
  return `device-check-${date.slice(0, 10)}${time ? `T${time[1]}${time[2]}` : ''}-${slug(name)}${version.split('.')[0] ?? ''}-${slug(platform)}.json`;
}

// ---------- 3. JSON Schema (the subset the run-file schema uses) ----------

/** Problems of `value` against `schema` (type, const, enum, required, properties, additionalProperties, items, minimum, $ref to #/$defs). */
export function validate(schema, value, root = schema, path = '$') {
  if (schema.$ref) return validate(root.$defs[schema.$ref.replace('#/$defs/', '')], value, root, path);
  const problems = [];
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = typeOf(value);
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) return [`${path}: expected ${types.join(' or ')}, got ${t}`];
  }
  if ('const' in schema && value !== schema.const) problems.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${path}: not one of ${JSON.stringify(schema.enum)}`);
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) problems.push(`${path}: below ${schema.minimum}`);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) problems.push(`${path}: missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub) problems.push(...validate(sub, v, root, `${path}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${path}: unexpected ${key}`);
      else if (typeof schema.additionalProperties === 'object') problems.push(...validate(schema.additionalProperties, v, root, `${path}.${key}`));
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => problems.push(...validate(schema.items, v, root, `${path}[${i}]`)));
  return problems;
}

// ---------- 4. The judges' prepared household ----------

/**
 * The household's Quick Check answers (by question id) as verdict-engine answers: the income question
 * gives `incomeBand` or `annualIncome`; every other answer keeps its question id.
 */
export function engineAnswers(answers) {
  const out = {};
  for (const [id, value] of Object.entries(answers)) {
    if (id === 'income') {
      if (value.kind === 'band') out.incomeBand = value.bandId;
      else out.annualIncome = value.amount;
    } else out[id] = value;
  }
  return out;
}
