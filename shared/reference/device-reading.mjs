// Reference implementation of the on-device reading of a paystub (validation/DEVICE_READING.md):
// the per-document response constraint, the deterministic checks of each part, and the order in
// which the parts are asked. Zero dependencies. Code only rejects or leaves fields out; it never
// picks or fills in a placeholder.
import { parseNumber, rehydrate } from './silhouette.mjs';
import { ValidationInputError, dayNumber, parseDate, validatePaystubs } from './validate.mjs';

const PLACEHOLDER = /⟦([NDW][0-9]+)⟧/g;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const near = (a, b) => Math.abs(a - b) < 0.005;
const MONEY_WITH_CENTS = /[.,][0-9]{2}$/;

/** Core checks of validation/SPEC.md section 5 that never warn on a correct reading. */
export const CORE_CHECKS = ['period-length', 'pay-date', 'ytd-gross', 'ytd-periods', 'dates-parsed'];
export const GROSS_PART_FIELDS = ['grossPay', 'ytdGross'];
export const NAME_FIELDS = ['employerName', 'employeeName'];

// ---------- 1. Parts and the response constraint ----------

/** Placeholder ids of a silhouette by kind, in order of first appearance. */
export function placeholderIds(skeleton) {
  const out = { N: [], D: [], W: [] };
  for (const m of skeleton.matchAll(PLACEHOLDER)) {
    const id = m[1];
    if (!out[id[0]].includes(id)) out[id[0]].push(id);
  }
  return out;
}

/** Field names of a part: 'core' (all but list fields), 'gross', 'deductions' or 'deductions-again' (list fields). */
export function partFields(schema, part) {
  if (part === 'gross') return GROSS_PART_FIELDS.filter((name) => schema.properties[name]?.['x-kind'] === 'number');
  const list = part === 'deductions' || part === 'deductions-again';
  return Object.entries(schema.properties)
    .filter(([, spec]) => part === 'whole' || (spec['x-kind'] === 'list') === list)
    .map(([name]) => name);
}

const idOrNull = (ids) => (ids.length > 0 ? { type: ['string', 'null'], enum: [...ids, null] } : { type: 'null' });

function fieldConstraint(spec, ids) {
  switch (spec['x-kind']) {
    case 'text':
      return ids.W.length > 0 ? { type: ['array', 'null'], minItems: 1, items: { type: 'string', enum: [...ids.W] } } : { type: 'null' };
    case 'date':
      return idOrNull(ids.D);
    case 'number':
      return idOrNull(ids.N);
    case 'enum':
      return { type: ['string', 'null'], enum: [...(spec.enum ?? []), null] };
    case 'list': {
      const kinds = spec.items?.properties?.kind?.enum ?? [];
      return {
        type: 'array',
        items: {
          type: 'object',
          properties: { amount: ids.N.length > 0 ? { type: 'string', enum: [...ids.N] } : { type: 'null' }, kind: { type: 'string', enum: [...kinds] } },
          required: ['amount', 'kind'],
          additionalProperties: false,
        },
      };
    }
    default:
      return { type: ['string', 'null'], enum: [...ids.N, ...ids.D, ...ids.W, null] };
  }
}

/** The strict response constraint (JSON Schema) of one part, for one silhouette. */
export function deviceConstraint(schema, skeleton, part) {
  const ids = placeholderIds(skeleton);
  const fields = partFields(schema, part);
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((name) => [name, fieldConstraint(schema.properties[name], ids)])),
    required: fields,
    additionalProperties: false,
  };
}

// ---------- 2. Checks ----------

/** Whether a reference fits a field of this kind. */
function fits(kind, ref, map) {
  if (Array.isArray(ref)) {
    if (kind === 'date') return ref.length === 3 && ref.every((r) => typeof r === 'string' && r.startsWith('N') && Object.hasOwn(map, r));
    return ref.length > 0 && ref.every((r) => fits(kind, r, map));
  }
  if (typeof ref !== 'string' || !Object.hasOwn(map, ref)) return false;
  if (kind === 'number') return ref.startsWith('N');
  if (kind === 'date') return ref.startsWith('D');
  if (kind === 'text') return ref.startsWith('W');
  return true;
}

const values = (schema, pointers, map) => rehydrate(schema, pointers, map);

function checkWarnings(v, jurisdiction, which) {
  try {
    const result = validatePaystubs([v], jurisdiction);
    return (result.checks[0] ?? []).filter((c) => c.status === 'warn' && which.includes(c.id)).map((c) => `check:${c.id}`);
  } catch (error) {
    if (error instanceof ValidationInputError) return ['values:malformed'];
    throw error;
  }
}

/** Whether `ytd` fits as year to date for this gross pay, frequency and date: no ytd-gross or ytd-periods warning. */
export function fitsYtd(v, ytd, jurisdiction) {
  if (typeof v.grossPay !== 'number' || ytd < v.grossPay) return false;
  try {
    const result = validatePaystubs([{ grossPay: v.grossPay, ytdGross: ytd, payFrequency: v.payFrequency, periodEnd: v.periodEnd, payDate: v.payDate }], jurisdiction);
    return !(result.checks[0] ?? []).some((c) => c.status === 'warn' && (c.id === 'ytd-gross' || c.id === 'ytd-periods'));
  } catch (error) {
    if (error instanceof ValidationInputError) return true;
    throw error;
  }
}

function numbersOnLineOf(skeleton, id) {
  const line = skeleton.split('\n').find((l) => l.includes(`⟦${id}⟧`));
  return line ? [...line.matchAll(/⟦(N[0-9]+)⟧/g)].map((m) => m[1]) : [];
}

/** Same-line rule (DEVICE_READING.md section 4.2). */
export function sameLineYtdProblems(schema, pointers, skeleton, map, jurisdiction) {
  const gross = pointers.grossPay;
  if (typeof gross !== 'string') return [];
  const v = values(schema, pointers, map);
  if (typeof v.grossPay !== 'number') return [];
  const amount = (id) => parseNumber(map[id] ?? '');
  const candidates = numbersOnLineOf(skeleton, gross).filter((id) => id !== gross && amount(id) !== undefined && fitsYtd(v, amount(id), jurisdiction));
  if (candidates.length !== 1 || typeof v.ytdGross !== 'number') return [];
  return near(v.ytdGross, amount(candidates[0])) ? [] : ['ytdGross:not-on-gross-line'];
}

/** Larger-candidate rule (DEVICE_READING.md section 4.3). */
export function largerYtdProblems(schema, pointers, skeleton, map, jurisdiction) {
  const v = values(schema, pointers, map);
  if (typeof v.ytdGross !== 'number' || typeof v.grossPay !== 'number') return [];
  const ids = new Set([...skeleton.matchAll(/⟦(N[0-9]+)⟧/g)].map((m) => m[1]));
  for (const id of ids) {
    if (!MONEY_WITH_CENTS.test(map[id] ?? '')) continue;
    const n = parseNumber(map[id] ?? '');
    if (n !== undefined && n > v.ytdGross && !near(n, v.ytdGross) && fitsYtd(v, n, jurisdiction)) return ['ytdGross:ambiguous'];
  }
  return [];
}

/** Amount fields whose placeholder must be money with cents when the silhouette prints cents (section 4.1). */
export const MONEY_FIELDS = ['grossPay', 'netPay', 'ytdGross'];

/** The silhouette prints amounts with cents: some N placeholder's text is money with cents. */
const printsCents = (map) => Object.entries(map).some(([id, text]) => id.startsWith('N') && MONEY_WITH_CENTS.test(text));

/** A reference to an N placeholder whose text has no cents, in a silhouette that prints cents: a ZIP code, an id, a year. */
const notMoney = (ref, map) => typeof ref === 'string' && ref.startsWith('N') && map[ref] !== undefined && !MONEY_WITH_CENTS.test(map[ref]) && printsCents(map);

/** Problems of the core (deductions ignored); empty: the core may be used (DEVICE_READING.md section 4.1). */
export function coreProblems(schema, pointers, skeleton, map, jurisdiction) {
  if (!isObject(pointers)) return ['not-an-object'];
  const problems = [];
  for (const [name, spec] of Object.entries(schema.properties)) {
    const kind = spec['x-kind'];
    const value = pointers[name];
    if (kind === 'list' || value === undefined || value === null) continue;
    if (kind === 'enum') {
      if (!(spec.enum ?? []).includes(value)) problems.push(`${name}:not-an-option`);
    } else if (!fits(kind, value, map)) problems.push(`${name}:bad-reference`);
    else if (MONEY_FIELDS.includes(name) && notMoney(value, map)) problems.push(`${name}:not-money`);
  }
  const core = Object.fromEntries(Object.entries(pointers).filter(([k]) => k !== 'deductions'));
  const v = values(schema, core, map);
  if (typeof v.grossPay !== 'number') problems.push('grossPay:missing');
  if (typeof v.grossPay === 'number' && typeof v.netPay === 'number' && v.netPay > v.grossPay) problems.push('netPay:above-gross');
  problems.push(...checkWarnings(v, jurisdiction, CORE_CHECKS));
  problems.push(...sameLineYtdProblems(schema, core, skeleton, map, jurisdiction));
  problems.push(...largerYtdProblems(schema, core, skeleton, map, jurisdiction));
  return problems;
}

/** Problems of the deductions, given the core (DEVICE_READING.md section 6). */
export function deductionsProblems(schema, pointers, map, jurisdiction) {
  if (!isObject(pointers)) return ['not-an-object'];
  const kinds = schema.properties.deductions?.items?.properties?.kind?.enum ?? [];
  const list = pointers.deductions;
  if (list === undefined || list === null) return ['deductions:missing'];
  if (!Array.isArray(list)) return ['deductions:not-a-list'];
  const problems = [];
  for (const item of list) {
    if (!isObject(item) || !fits('number', item.amount, map)) problems.push('deductions:bad-reference');
    else if (notMoney(item.amount, map)) problems.push('deductions:not-money');
    else if (item.kind !== undefined && item.kind !== null && !kinds.includes(item.kind)) problems.push('deductions:not-an-option');
  }
  const v = values(schema, pointers, map);
  if (typeof v.netPay !== 'number' || typeof v.grossPay !== 'number') problems.push('deductions:cannot-check');
  else problems.push(...checkWarnings(v, jurisdiction, ['net-sum']));
  return [...new Set(problems)];
}

const wordIds = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/** The two names share a placeholder. */
export function namesProblems(pointers) {
  const employer = new Set(wordIds(pointers.employerName));
  return wordIds(pointers.employeeName).some((id) => employer.has(id)) ? ['names:shared-placeholder'] : [];
}

/** A name cut short: next to an answered word, with only one or two spaces between, a word placeholder the answer leaves out. */
export function incompleteNameProblems(pointers, skeleton) {
  const out = [];
  for (const field of NAME_FIELDS) {
    const answered = new Set(wordIds(pointers[field]));
    if (answered.size === 0) continue;
    let cut = false;
    for (const line of skeleton.split('\n')) {
      const tokens = [...line.matchAll(PLACEHOLDER)];
      for (let i = 0; i < tokens.length && !cut; i++) {
        if (!answered.has(tokens[i][1])) continue;
        for (const j of [i - 1, i + 1]) {
          const other = tokens[j];
          if (!other || !other[1].startsWith('W') || answered.has(other[1])) continue;
          const [a, b] = j < i ? [other, tokens[i]] : [tokens[i], other];
          if (/^ {1,2}$/.test(line.slice(a.index + a[0].length, b.index))) cut = true;
        }
      }
      if (cut) break;
    }
    if (cut) out.push(`${field}:incomplete`);
  }
  return out;
}

/** Hours worked or hourly rate on the placeholder answered for gross pay, net pay or year to date. */
export function sharedAmountProblems(pointers) {
  const amounts = new Set(['grossPay', 'netPay', 'ytdGross'].map((f) => pointers[f]).filter((v) => typeof v === 'string'));
  return ['hoursWorked', 'hourlyRate'].filter((f) => typeof pointers[f] === 'string' && amounts.has(pointers[f])).map((f) => `${f}:shares-placeholder`);
}

/** Fields left out as not read, and why (DEVICE_READING.md section 5). */
export function notReadFields(pointers, skeleton) {
  const names = namesProblems(pointers);
  const incomplete = incompleteNameProblems(pointers, skeleton);
  const shared = sharedAmountProblems(pointers);
  const fields = [...(names.length > 0 ? NAME_FIELDS : []), ...[...incomplete, ...shared].map((p) => p.split(':')[0])];
  return { problems: [...names, ...incomplete, ...shared], fields: [...new Set(fields)] };
}

/** Year to date left out although the document has exactly one place for it (DEVICE_READING.md section 4.4). */
export function ytdMissingWithCandidate(schema, pointers, skeleton, map, jurisdiction) {
  const gross = pointers.grossPay;
  if (typeof gross !== 'string' || (pointers.ytdGross !== undefined && pointers.ytdGross !== null)) return false;
  const v = values(schema, pointers, map);
  if (typeof v.grossPay !== 'number') return false;
  const fitting = (id) => {
    const n = parseNumber(map[id] ?? '');
    return n !== undefined && fitsYtd(v, n, jurisdiction);
  };
  const onLine = numbersOnLineOf(skeleton, gross).filter((id) => id !== gross && fitting(id));
  if (onLine.length > 0) return onLine.length === 1;
  const amounts = new Set(
    [...skeleton.matchAll(/⟦(N[0-9]+)⟧/g)]
      .map((m) => m[1])
      .filter((id) => MONEY_WITH_CENTS.test(map[id] ?? '') && !near(parseNumber(map[id] ?? '') ?? Number.NaN, v.grossPay) && fitting(id))
      .map((id) => parseNumber(map[id])),
  );
  return amounts.size === 1;
}

// ---------- Shown only when confirmed (DEVICE_READING.md section 6) ----------

/** Labels that mark net pay, per document language (words the Skeletonizer keeps visible). */
export const NET_PAY_LABELS = { en: ['net', 'take home'], es: ['neto', 'neta', 'líquido', 'liquido'], ko: ['실수령', '실지급', '차인지급'] };

function netLabelled(skeleton, id, language) {
  const line = skeleton.split('\n').find((l) => l.includes(`⟦${id}⟧`));
  if (!line) return false;
  const text = line.replace(/⟦[NDW][0-9]+⟧/g, ' ').toLowerCase();
  const labels = [...(NET_PAY_LABELS[language] ?? []), ...(language === 'en' ? [] : NET_PAY_LABELS.en)];
  return labels.some((label) => (/^[a-z ]+$/.test(label) ? new RegExp(`(^|[^a-z])${label}([^a-z]|$)`).test(text) : text.includes(label)));
}

/** Fields of a reading about to be used that no check confirms, and why. */
export function unconfirmedFields(schema, pointers, skeleton, map, jurisdiction, language) {
  const v = values(schema, pointers, map);
  const problems = [];
  if (pointers.hoursWorked !== undefined || pointers.hourlyRate !== undefined) {
    const { hoursWorked: h, hourlyRate: r, grossPay: g } = v;
    const confirmed =
      typeof h === 'number' &&
      typeof r === 'number' &&
      typeof g === 'number' &&
      [...new Set([...skeleton.matchAll(/⟦(N[0-9]+)⟧/g)].map((m) => m[1]))].some((id) => {
        const text = map[id] ?? '';
        const m = MONEY_WITH_CENTS.test(text) ? parseNumber(text) : undefined;
        return m !== undefined && m <= g + 0.005 && Math.abs(r * h - m) <= 0.01 + 1e-9;
      });
    if (!confirmed) problems.push('hoursWorked:unconfirmed', 'hourlyRate:unconfirmed');
  }
  if (typeof pointers.netPay === 'string') {
    const byDeductions = Array.isArray(pointers.deductions) && deductionsProblems(schema, pointers, map, jurisdiction).length === 0;
    if (!byDeductions && !netLabelled(skeleton, pointers.netPay, language)) problems.push('netPay:unconfirmed');
  }
  const pay = typeof v.payDate === 'string' ? parseDate(v.payDate, jurisdiction) : null;
  if (pay) {
    const start = typeof v.periodStart === 'string' ? parseDate(v.periodStart, jurisdiction) : null;
    const end = typeof v.periodEnd === 'string' ? parseDate(v.periodEnd, jurisdiction) : null;
    if ((start && dayNumber(pay) <= dayNumber(start)) || (end && dayNumber(pay) < dayNumber(end))) problems.push('payDate:before-period-end');
  }
  const kept = problems.filter((p) => pointers[p.split(':')[0]] !== undefined);
  return { problems: kept, fields: [...new Set(kept.map((p) => p.split(':')[0]))] };
}

// ---------- 3. The reading, part by part ----------

/** One answer of the device: the model's text, parsed and limited to the part's fields. */
export function readPass(schema, part, text) {
  const fields = partFields(schema, part);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (!isObject(parsed)) return { part, parsed: false, problems: ['not-json'], extraKeys: [], missingKeys: [] };
  const keys = Object.keys(parsed);
  const value = Object.fromEntries(Object.entries(parsed).filter(([k, v]) => v !== null && fields.includes(k)));
  return { part, parsed: true, value, problems: [], extraKeys: keys.filter((k) => !fields.includes(k)), missingKeys: fields.filter((k) => !keys.includes(k)) };
}

const isGrossProblem = (p) => /^(grossPay|ytdGross):/.test(p) || p === 'check:ytd-gross' || p === 'check:ytd-periods';

/**
 * The reading of DEVICE_READING.md section 3, with the device's answers given as text per part
 * (`answers.core`, `answers.gross`, `answers.deductions`, `answers.deductionsAgain`). Returns the
 * parts asked, each pass, and the outcome: `on-device` with the value and the fields not read, or
 * `failed` with the problems (a failed on-device attempt).
 */
export function readOnDevice(schema, skeleton, map, jurisdiction, answers, language = 'en') {
  const ask = (part) => {
    const key = part === 'deductions-again' ? 'deductionsAgain' : part;
    if (typeof answers[key] !== 'string') throw new Error(`no answer given for the ${part} part`);
    return readPass(schema, part, answers[key]);
  };
  const checkCore = (v) => coreProblems(schema, v, skeleton, map, jurisdiction);
  const passes = [];
  const core0 = ask('core');
  let core = core0.value ? { ...core0, problems: checkCore(core0.value) } : core0;
  passes.push(core);
  const grossFailed = core.value !== undefined && core.problems.length > 0 && core.problems.every(isGrossProblem);
  const ytdMissing = core.value !== undefined && core.problems.length === 0 && ytdMissingWithCandidate(schema, core.value, skeleton, map, jurisdiction);
  if (core.value && (grossFailed || ytdMissing)) {
    const gross0 = ask('gross');
    const merged = gross0.value ? { ...core.value, ...gross0.value } : undefined;
    const answered = merged !== undefined && merged.ytdGross !== undefined;
    const problems = merged ? checkCore(merged) : gross0.problems;
    passes.push({ ...gross0, problems: ytdMissing && !answered && problems.length === 0 ? ['ytdGross:still-missing'] : problems });
    if (merged && problems.length === 0 && (grossFailed || answered)) core = { ...core, value: merged, problems: [] };
  }
  if (!core.value || core.problems.length > 0) {
    return { asked: passes.map((p) => p.part), passes, outcome: 'failed', problems: passes[passes.length - 1].problems };
  }
  const contradictions = notReadFields(core.value, skeleton);
  const notRead = [...contradictions.fields];
  const coreValue = Object.fromEntries(Object.entries(core.value).filter(([k]) => !notRead.includes(k)));
  if (contradictions.problems.length > 0) passes[0] = { ...passes[0], marked: contradictions.problems };
  const readDeductions = (part) => {
    const pass = ask(part);
    const merged = pass.value ? { ...coreValue, ...pass.value } : coreValue;
    const checked = pass.value ? { ...pass, problems: deductionsProblems(schema, merged, map, jurisdiction) } : pass;
    passes.push(checked);
    return { pass: checked, merged };
  };
  let ded = readDeductions('deductions');
  if (ded.pass.value && ded.pass.problems.includes('check:net-sum')) ded = readDeductions('deductions-again');
  const deductionsNotRead = !ded.pass.value || ded.pass.problems.length > 0;
  if (deductionsNotRead) notRead.push('deductions');
  const read = deductionsNotRead ? coreValue : ded.merged;
  // Shown only when confirmed: values that feed no result and that no check confirms are left out.
  const unconfirmed = unconfirmedFields(schema, read, skeleton, map, jurisdiction, language);
  notRead.push(...unconfirmed.fields);
  if (unconfirmed.problems.length > 0) passes[0] = { ...passes[0], marked: [...(passes[0].marked ?? []), ...unconfirmed.problems] };
  const value = Object.fromEntries(Object.entries(read).filter(([k]) => !unconfirmed.fields.includes(k)));
  return { asked: passes.map((p) => p.part), passes, outcome: 'on-device', value, notRead };
}

// ---------- 9. Form W-2 ----------

/** W-2 boxes that hold money (boxes 1, 2, 3, 5 and 16). */
export const W2_MONEY_FIELDS = ['wages', 'federalIncomeTaxWithheld', 'socialSecurityWages', 'medicareWages', 'stateWages'];

/**
 * Problems of a W-2 answer, from the device or the cloud (DEVICE_READING.md section 9): references that do not
 * fit, money boxes answered from a number without cents (a box number, a street number, a ZIP code), no
 * wages, and a tax year that is not a year (the 2 of "W-2", a box number).
 */
export function w2Problems(schema, pointers, map) {
  if (!isObject(pointers)) return ['not-an-object'];
  const problems = [];
  for (const [name, spec] of Object.entries(schema.properties)) {
    const value = pointers[name];
    if (value === undefined || value === null) continue;
    if (!fits(spec['x-kind'], value, map)) problems.push(`${name}:bad-reference`);
    else if (W2_MONEY_FIELDS.includes(name) && notMoney(value, map)) problems.push(`${name}:not-money`);
  }
  if (problems.some((p) => p.endsWith(':bad-reference'))) return problems;
  const v = values(schema, pointers, map);
  if (typeof v.wages !== 'number') problems.push('wages:missing');
  // The year rule of validation/SPEC.md section 9 (check w2-year): an integer from 2000 to 2100.
  if (typeof v.taxYear === 'number' && !(Number.isInteger(v.taxYear) && v.taxYear >= 2000 && v.taxYear <= 2100)) problems.push('taxYear:not-a-year');
  return problems;
}

/** The fields of a W-2 answer left out as not read: a money box that is not money, a tax year that is not a year. */
export function w2LeftOut(schema, pointers, map) {
  const problems = w2Problems(schema, pointers, map).filter((p) => p.endsWith(':not-money') || p === 'taxYear:not-a-year');
  return { problems, fields: problems.map((p) => p.split(':')[0]) };
}
