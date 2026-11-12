// Reference implementation of the /shared contracts. Zero dependencies.
// Specs: ../skeleton/SPEC.md and ../rulepacks/SPEC.md

// ---------- Skeletonizer ----------

// Characters that are kept verbatim and never belong to a word (skeleton/SPEC.md section 2).
// Everything that is not listed here, and is not an ASCII digit, is word material and gets masked
// unless the whole word is allowlisted. The list is explicit so that it does not depend on the
// Unicode tables of the platform.
export const SAFE_CLASS =
  '\\u0009\\u000A\\u0020\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000' + // whitespace
  '\\u0021-\\u002F\\u003A-\\u003F\\u005B-\\u005E\\u0060\\u007B-\\u007E' + // ASCII punctuation and symbols, except @ and _ (they join words: e-mail addresses, user names)
  '\\u00A2\\u00A3\\u00A5\\u00A7\\u00B0\\u00B1\\u00B6\\u00B7\\u00D7\\u00F7' + // ¢ £ ¥ § ° ± ¶ · × ÷
  '\\u2013\\u2014\\u2018\\u2019\\u201C\\u201D\\u2022\\u2026\\u20A9\\u20AC\\u2116' + // – — ‘ ’ “ ” • … ₩ € №
  '\\u3001\\u3002\\u3008-\\u3011\\u3014\\u3015\\u30FB' + // 、。〈〉《》「」『』【】〔〕・
  '\\uFF01\\uFF05\\uFF08\\uFF09\\uFF0B-\\uFF0F\\uFF1A\\uFF1B\\uFF1D\\uFF1F\\uFF3B\\uFF3D\\uFF5E'; // fullwidth ！％（）＋，－．／：；＝？［］～

const X = `[^0-9${SAFE_CLASS}]`;

// Month names (English full and abbreviated, Spanish full), matched ASCII case-insensitively.
export const MONTHS = [
  ['january', 'jan', 'enero'], ['february', 'feb', 'febrero'], ['march', 'mar', 'marzo'], ['april', 'apr', 'abril'],
  ['may', 'mayo'], ['june', 'jun', 'junio'], ['july', 'jul', 'julio'], ['august', 'aug', 'agosto'],
  ['september', 'sept', 'sep', 'septiembre', 'setiembre'], ['october', 'oct', 'octubre'],
  ['november', 'nov', 'noviembre'], ['december', 'dec', 'diciembre'],
];
// ASCII case-insensitive, written out as [aA] classes: a regex-wide ignore-case flag would also fold
// non-ASCII letters (U+017F LONG S matches "s" under Unicode case folding).
const eitherCase = (word) => [...word].map((ch) => `[${ch}${ch.toUpperCase()}]`).join('');
const MONTH = `(?:${MONTHS.flat().sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).map(eitherCase).join('|')})`;
const ORD = ['st', 'nd', 'rd', 'th'].map(eitherCase).join('|');
const DE = eitherCase('de');
const EL = eitherCase('l');
// "October 17, 2026", "Oct. 17 2026", "17 October 2026", "17 de octubre de 2026"
export const MONTH_DATE_SOURCE =
  `${MONTH}\\.? [0-9]{1,2}(?:${ORD})?,? [0-9]{4}(?![0-9])|[0-9]{1,2}(?:${ORD})? (?:${DE} )?${MONTH}\\.?,? (?:${DE}${EL}? )?[0-9]{4}(?![0-9])`;
export const TOKEN_SOURCE =
  `(${MONTH_DATE_SOURCE}|[0-9]{1,4}[/.\\-][0-9]{1,2}[/.\\-][0-9]{1,4})|([0-9]+(?:[.,][0-9]+)*)|(${X}+(?:['\\u2019\\-]${X}+)*)|([\\s\\S])`;
const TOKEN = new RegExp(TOKEN_SOURCE, 'gu');

export function normalize(text) {
  return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[⟦⟧]/g, '');
}

function isAllowlisted(word, allow) {
  const lower = word.toLowerCase();
  if (allow.has(lower)) return true;
  if (!lower.includes('-')) return false;
  return lower.split('-').every((part) => allow.has(part));
}

// Separators that keep two words in the same phrase: "Jordan Gross", "Smith, John", "Smith & Jones".
const PHRASE_JOINERS = new Set([' ', ', ', ' & ']);

/**
 * @param {string} text Raw document text
 * @param {Set<string>} allow Lowercase allowlist (document language ∪ en)
 * @param {Set<string>} [introducers] Lowercase introducer list (document language ∪ en), a subset of `allow`
 * @returns {{skeleton: string, map: Record<string, string>}}
 */
export function skeletonize(text, allow, introducers = new Set()) {
  const input = normalize(text);
  // Pass 1: tokens. Consecutive safe characters form one separator token.
  const tokens = [];
  for (const m of input.matchAll(TOKEN)) {
    if (m[1] !== undefined) tokens.push({ kind: 'D', text: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: 'N', text: m[2] });
    else if (m[3] !== undefined) tokens.push({ kind: 'W', text: m[3], keep: isAllowlisted(m[3], allow) });
    else if (tokens.length && tokens[tokens.length - 1].kind === 'O') tokens[tokens.length - 1].text += m[4];
    else tokens.push({ kind: 'O', text: m[4] });
  }
  // Pass 2: a phrase is masked as a whole. If any word of a phrase is not allowlisted, an allowlisted
  // neighbour is probably part of the same name ("Jordan Gross", "Federal Security Services").
  for (let i = 0; i < tokens.length; ) {
    if (tokens[i].kind !== 'W') { i++; continue; }
    let j = i;
    while (j + 2 < tokens.length && tokens[j + 1].kind === 'O' && PHRASE_JOINERS.has(tokens[j + 1].text) && tokens[j + 2].kind === 'W') j += 2;
    // Leading introducers ("Employee", "This Lease is made between") are labels in front of a name,
    // never part of it. They keep their own decision; the rest of the phrase is decided as before.
    let start = i;
    while (start < j && tokens[start].keep && introducers.has(tokens[start].text.toLowerCase())) start += 2;
    let keep = true;
    for (let k = start; k <= j; k += 2) keep = keep && tokens[k].keep;
    for (let k = start; k <= j; k += 2) tokens[k].keep = keep;
    i = j + 1;
  }
  // Pass 3: placeholders, numbered in document order.
  const counters = { D: 0, N: 0, W: 0 };
  const map = {};
  let skeleton = '';
  for (const t of tokens) {
    if (t.kind === 'O' || (t.kind === 'W' && t.keep)) { skeleton += t.text; continue; }
    const id = `${t.kind}${++counters[t.kind]}`;
    map[id] = t.text;
    skeleton += `⟦${id}⟧`;
  }
  return { skeleton, map };
}

// ---------- Rehydrator ----------

/** Own-property read: inherited members such as `constructor` are never visible. */
const own = (obj, key) =>
  obj !== null && typeof obj === 'object' && Object.hasOwn(obj, key) ? obj[key] : undefined;

const NUMBER_FORMAT = /^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]+)?$/;

export function parseNumber(token) {
  if (!NUMBER_FORMAT.test(token)) return undefined;
  return Number(token.replace(/,/g, ''));
}

function readField(spec, ref, map) {
  const kind = spec['x-kind'];
  if (kind === 'enum') return spec.enum.includes(ref) ? ref : undefined;
  const has = (r) => typeof r === 'string' && Object.hasOwn(map, r);
  if (kind === 'number') {
    if (!has(ref) || ref[0] !== 'N') return undefined;
    return parseNumber(map[ref]);
  }
  if (kind === 'date') {
    if (has(ref) && ref[0] === 'D') return map[ref];
    if (Array.isArray(ref) && ref.length === 3 && ref.every((r) => has(r) && r[0] === 'N')) {
      return ref.map((r) => map[r]).join('-');
    }
    return undefined;
  }
  if (kind === 'text') {
    if (!Array.isArray(ref)) return undefined;
    const parts = ref.filter(has).map((r) => map[r]);
    return parts.length ? parts.join(' ') : undefined;
  }
  return undefined;
}

/**
 * @param {object} schema Pointer schema with x-kind annotations
 * @param {object} pointers Model output
 * @param {Record<string, string>} map Placeholder map from skeletonize()
 */
export function rehydrate(schema, pointers, map) {
  const out = {};
  for (const [name, spec] of Object.entries(schema.properties)) {
    const ref = own(pointers, name);
    if (ref === undefined || ref === null) continue;
    if (spec['x-kind'] === 'list') {
      if (!Array.isArray(ref)) continue;
      const items = [];
      for (const entry of ref) {
        const item = {};
        for (const [sub, subSpec] of Object.entries(spec.items.properties)) {
          const value = readField(subSpec, own(entry, sub), map);
          if (value !== undefined) item[sub] = value;
        }
        if ((spec.items.required ?? []).every((key) => key in item)) items.push(item);
      }
      if (items.length) out[name] = items;
      continue;
    }
    const value = readField(spec, ref, map);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

// ---------- Generalizer ----------

/** Thrown when a profile silhouette cannot be built. Messages never contain user values. */
export class GeneralizeError extends Error {}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOUSING = ['renter', 'owner', 'other'];
const given = (v) => v !== undefined && v !== null;

function bandFor(bands, income) {
  const value = Math.floor(Math.max(income, 0));
  return bands.annualIncome.find((b) => value >= b.min && (b.max === null || value <= b.max));
}

/**
 * @param {object} exact {jurisdiction, annualIncome?|incomeBand?, householdSize?, childAges?, county?, housing?}
 * @param {object} bands bands/{jurisdiction}.json
 * Unanswered fields become null. Invalid input throws GeneralizeError.
 */
export function generalize(exact, bands) {
  if (typeof exact.jurisdiction !== 'string' || !SLUG.test(exact.jurisdiction)) {
    throw new GeneralizeError('jurisdiction must be a slug');
  }
  let incomeBand = null;
  if (given(exact.annualIncome)) {
    if (typeof exact.annualIncome !== 'number' || !Number.isFinite(exact.annualIncome)) {
      throw new GeneralizeError('annualIncome must be a finite number');
    }
    const band = bandFor(bands, exact.annualIncome);
    if (!band) throw new GeneralizeError('annualIncome is not covered by any band');
    incomeBand = band.id;
  } else if (given(exact.incomeBand)) {
    if (!bands.annualIncome.some((b) => b.id === exact.incomeBand)) {
      throw new GeneralizeError('unknown income band');
    }
    incomeBand = exact.incomeBand;
  }
  let householdSize = null;
  if (given(exact.householdSize)) {
    if (!Number.isInteger(exact.householdSize) || exact.householdSize < 1) {
      throw new GeneralizeError('householdSize must be a positive integer');
    }
    const cap = bands.householdSizeCap;
    householdSize = exact.householdSize > cap ? `${cap}+` : exact.householdSize;
  }
  let childAgeBands = null;
  if (given(exact.childAges)) {
    if (!Array.isArray(exact.childAges) || !exact.childAges.every((a) => typeof a === 'number' && Number.isFinite(a))) {
      throw new GeneralizeError('childAges must be a list of numbers');
    }
    childAgeBands = bands.childAgeBands
      .filter((b) => exact.childAges.some((age) => age >= b.min && age <= b.max))
      .map((b) => b.id);
  }
  let county = null;
  if (given(exact.county)) {
    if (typeof exact.county !== 'string' || !SLUG.test(exact.county)) throw new GeneralizeError('county must be a slug');
    county = exact.county;
  }
  let housing = null;
  if (given(exact.housing)) {
    if (!HOUSING.includes(exact.housing)) throw new GeneralizeError('unknown housing value');
    housing = exact.housing;
  }
  return { jurisdiction: exact.jurisdiction, incomeBand, householdSize, childAgeBands, county, housing };
}

/** Canonical form: keys in schema order, no whitespace. Values never need escaping (slugs, band ids, integers, null). */
export const canonical = (profile) => JSON.stringify(profile);

// ---------- Expression evaluator ----------

/** Thrown when an expression is malformed or its operands have the wrong type. A pack that throws is invalid. */
export class RuleError extends Error {}

/** The third truth value: the answer depends on something the user has not told us. */
export const UNKNOWN = Symbol('unknown');

const isNumber = (x) => typeof x === 'number' && Number.isFinite(x);
const isPrimitive = (x) => x === null || ['number', 'string', 'boolean'].includes(typeof x);

function lookup(data, path) {
  let node = data;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node) || !Object.hasOwn(node, key)) return null;
    node = node[key];
  }
  return node;
}

/**
 * @param {*} expr Expression
 * @param {object} data Variables
 * @param {{unavailable?: Set<string>, unknownReads?: Set<string>}} [ctx]
 *   `unavailable`: top-level variable names whose value is not known. Reading one gives UNKNOWN
 *   and records the name in `unknownReads`.
 * @returns the value, or UNKNOWN
 */
export function evaluate(expr, data, ctx = {}) {
  if (expr === null || typeof expr !== 'object') return expr;
  if (Array.isArray(expr)) return expr.map((e) => evaluate(e, data, ctx));
  const keys = Object.keys(expr);
  if (keys.length !== 1) throw new RuleError('an expression object has exactly one operator');
  const op = keys[0];
  const raw = expr[op];
  const fail = (why) => { throw new RuleError(`${op}: ${why}`); };

  if (op === 'var') {
    const path = evaluate(raw, data, ctx);
    if (path === UNKNOWN) return UNKNOWN;
    if (typeof path !== 'string' || path === '') fail('path must be a non-empty string');
    const top = path.split('.')[0];
    if (ctx.unavailable?.has(top)) {
      ctx.unknownReads?.add(top);
      return UNKNOWN;
    }
    return lookup(data, path);
  }

  const args = Array.isArray(raw) ? raw : [raw];
  const arity = (min, max = min) => {
    if (args.length < min || args.length > max) fail('wrong number of arguments');
  };
  const truth = (x) => (x === UNKNOWN || typeof x === 'boolean' ? x : fail('operand must be a boolean'));

  // Three-valued logic, evaluated left to right. `and` stops at the first false, `or` at the first true.
  if (op === 'if') {
    arity(3);
    const condition = truth(evaluate(args[0], data, ctx));
    if (condition === UNKNOWN) return UNKNOWN;
    return condition ? evaluate(args[1], data, ctx) : evaluate(args[2], data, ctx);
  }
  if (op === 'and' || op === 'or') {
    arity(1, Infinity);
    const decisive = op === 'or';
    let sawUnknown = false;
    for (const a of args) {
      const value = truth(evaluate(a, data, ctx));
      if (value === decisive) return decisive;
      if (value === UNKNOWN) sawUnknown = true;
    }
    return sawUnknown ? UNKNOWN : !decisive;
  }

  const v = args.map((a) => evaluate(a, data, ctx));
  const arityOf = { '!': [1], '==': [2], '!=': [2], '<': [2], '<=': [2], '>': [2], '>=': [2], '+': [2, Infinity], '*': [2, Infinity],
    '-': [2], '/': [2], min: [1, Infinity], max: [1, Infinity], floor: [1], in: [2], cat: [1, Infinity] }[op];
  if (!arityOf) fail('unsupported operator');
  arity(...arityOf);
  if (v.some((x) => x === UNKNOWN || (Array.isArray(x) && x.includes(UNKNOWN)))) return UNKNOWN;
  const numbers = () => (v.every(isNumber) ? v : fail('operands must be numbers'));
  switch (op) {
    case '!': return typeof v[0] === 'boolean' ? !v[0] : fail('operand must be a boolean');
    case '==': if (!v.every(isPrimitive)) fail('operands must be primitives'); return v[0] === v[1];
    case '!=': if (!v.every(isPrimitive)) fail('operands must be primitives'); return v[0] !== v[1];
    case '<': numbers(); return v[0] < v[1];
    case '<=': numbers(); return v[0] <= v[1];
    case '>': numbers(); return v[0] > v[1];
    case '>=': numbers(); return v[0] >= v[1];
    case '+': return numbers().reduce((a, b) => a + b);
    case '*': return numbers().reduce((a, b) => a * b);
    case '-': numbers(); return v[0] - v[1];
    case '/': numbers(); if (v[1] === 0) fail('division by zero'); return v[0] / v[1];
    case 'min': return Math.min(...numbers());
    case 'max': return Math.max(...numbers());
    case 'floor': numbers(); return Math.floor(v[0]);
    case 'in':
      if (!isPrimitive(v[0]) || !Array.isArray(v[1]) || !v[1].every(isPrimitive)) fail('expects a primitive and a list of primitives');
      return v[1].includes(v[0]);
    case 'cat':
      if (!v.every((x) => typeof x === 'string' || Number.isSafeInteger(x))) fail('operands must be strings or integers');
      return v.map(String).join('');
    default:
      return fail('unsupported operator');
  }
}

// ---------- Verdict engine ----------

function numericLiterals(node, out = []) {
  if (typeof node === 'number') out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => numericLiterals(n, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((n) => numericLiterals(n, out));
  return out;
}

function samplePoints(band, literals) {
  const min = band.min;
  const max = band.max === null ? Math.max(min, ...literals) + 1 : band.max;
  const points = new Set([min, max]);
  for (const v of literals) {
    if (v < min || v > max) continue;
    for (const p of [v - 1, v, v + 1]) points.add(Math.min(max, Math.max(min, p)));
  }
  return [...points].sort((a, b) => a - b);
}

/** Thrown when the answers passed to verdicts() are malformed. Messages never contain user values. */
export class InputError extends Error {}

/**
 * @param {object} pack rulepacks/{jurisdiction}/pack.json
 * @param {object} bands bands/{jurisdiction}.json
 * @param {object} answers {annualIncome?, incomeBand?, ...question answers}
 */
export function verdicts(pack, bands, answers) {
  const income = own(answers, 'annualIncome');
  const exactIncome = given(income);
  if (exactIncome && !isNumber(income)) throw new InputError('annualIncome must be a finite number');
  const bandId = own(answers, 'incomeBand');
  const band = exactIncome || !given(bandId) ? null : bands.annualIncome.find((b) => b.id === bandId);
  if (band === undefined) throw new InputError('unknown income band');
  const base = { constants: pack.constants };
  const unavailable = new Set();
  for (const q of pack.questions) {
    const answer = own(answers, q.id);
    if (given(answer)) base[q.id] = answer;
    else unavailable.add(q.id);
  }
  if (typeof base.householdSize === 'number') {
    base.householdSizeCapped = String(Math.min(base.householdSize, bands.householdSizeCap));
  } else unavailable.add('householdSizeCapped');
  if (exactIncome) base.annualIncome = Math.max(income, 0);
  else if (band === null) unavailable.add('annualIncome');

  // Evaluates a boolean expression once, or at every sample point when only a band is known.
  const assess = (logic, literalsFrom, reads) => {
    const once = (data) => {
      const result = evaluate(logic, data, { unavailable, unknownReads: reads });
      if (result !== UNKNOWN && typeof result !== 'boolean') throw new RuleError('criterion logic must return a boolean');
      return result;
    };
    if (exactIncome || band === null) return [once(base)];
    const literals = [...numericLiterals(pack.constants), ...numericLiterals(literalsFrom)];
    return samplePoints(band, literals).map((point) => once({ ...base, annualIncome: point }));
  };

  return pack.programs.map((program) => {
    const dependsOn = new Set();
    const criteria = program.criteria.map((criterion) => {
      const reads = new Set();
      const results = assess(criterion.logic, criterion.logic, reads);
      let state;
      if (results.includes(true) && results.includes(false)) state = 'mixed';
      else if (results.includes(UNKNOWN)) state = 'unknown';
      else state = results[0] ? 'pass' : 'fail';
      if (state === 'fail' && criterion.uncertainIf !== undefined) {
        const uncertain = evaluate(criterion.uncertainIf, base, { unavailable, unknownReads: reads });
        if (uncertain === UNKNOWN) state = 'unknown';
        else if (typeof uncertain !== 'boolean') throw new RuleError('uncertainIf must return a boolean');
        else if (uncertain) state = 'mixed';
      }
      if (state === 'unknown') {
        for (const name of reads) dependsOn.add(name === 'householdSizeCapped' ? 'householdSize' : name);
      }
      return { id: criterion.id, state };
    });
    const states = criteria.map((c) => c.state);
    const verdict = states.includes('fail')
      ? 'unlikely'
      : states.includes('mixed')
        ? 'maybe'
        : states.includes('unknown')
          ? 'depends'
          : 'likely';
    const result = { programId: program.id, verdict, criteria, dependsOn: [...dependsOn].sort() };
    if (verdict === 'likely' && exactIncome && program.amount !== undefined) {
      const amount = evaluate(program.amount, base, { unavailable });
      if (amount !== UNKNOWN) {
        if (!isNumber(amount)) throw new RuleError('amount must return a number');
        result.estimatedAmount = Math.floor(amount);
      }
    }
    return result;
  });
}
