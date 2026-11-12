// Authoring-time linter for rule packs and bands. Run before a pack ships:
//   node lint.mjs ../rulepacks/us-ca/pack.json ../bands/us-ca.json
// Platforms do not need to port this; they port the strict evaluator in silhouette.mjs.
import fs from 'node:fs';
import { evaluate, RuleError } from './silhouette.mjs';

const QUESTION_ID = /^[a-z][A-Za-z0-9]*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = ['annualIncome', 'incomeBand', 'constants', 'householdSizeCapped', 'constructor', 'toString', 'valueOf',
  'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString'];
const ARITY = { var: [1, 1], if: [3, 3], and: [1, Infinity], or: [1, Infinity], '!': [1, 1], '==': [2, 2], '!=': [2, 2],
  '<': [2, 2], '<=': [2, 2], '>': [2, 2], '>=': [2, 2], '+': [2, Infinity], '*': [2, Infinity], '-': [2, 2], '/': [2, 2],
  min: [1, Infinity], max: [1, Infinity], floor: [1, 1], in: [2, 2], cat: [1, Infinity] };

const COMPARISONS = ['<', '<=', '>', '>='];
const isIncomeVar = (e) => e && typeof e === 'object' && !Array.isArray(e) && e.var === 'annualIncome';

function walk(expr, where, errors, reads) {
  if (expr === null || typeof expr !== 'object') return;
  if (Array.isArray(expr)) return expr.forEach((e) => walk(e, where, errors, reads));
  const keys = Object.keys(expr);
  if (keys.length !== 1) return void errors.push(`${where}: expression object must have exactly one operator`);
  const op = keys[0];
  if (!Object.hasOwn(ARITY, op)) return void errors.push(`${where}: unsupported operator "${op}"`);
  const args = Array.isArray(expr[op]) ? expr[op] : [expr[op]];
  const [min, max] = ARITY[op];
  if (args.length < min || args.length > max) errors.push(`${where}: "${op}" takes ${min}${max === min ? '' : max === Infinity ? '+' : `-${max}`} arguments`);
  if (COMPARISONS.includes(op) && args.length === 2 && ((isIncomeVar(args[0]) && args[1] === 0) || (isIncomeVar(args[1]) && args[0] === 0))) {
    errors.push(`${where}: compares annualIncome with 0; ask a question instead (authoring rule)`);
  }
  if (op === 'var') {
    const target = expr[op];
    if (typeof target === 'string') reads.add(target.split('.')[0]);
    else if (target && typeof target === 'object' && !Array.isArray(target) && Array.isArray(target.cat) &&
             typeof target.cat[0] === 'string' && target.cat[0].startsWith('constants.')) {
      reads.add('constants');
      target.cat.slice(1).forEach((e) => walk(e, where, errors, reads));
    } else errors.push(`${where}: "var" takes a path string or a "cat" that starts with "constants."`);
    return;
  }
  args.forEach((e) => walk(e, where, errors, reads));
}

/** Allowlist words are lowercase NFC, made of letters only, and free of characters whose case mapping differs by platform. */
export function lintAllowlist(list) {
  const errors = [];
  for (const word of list.words ?? []) {
    if (typeof word !== 'string' || word === '') { errors.push('allowlist: empty or non-string entry'); continue; }
    if (word !== word.normalize('NFC')) errors.push(`allowlist: "${word}" is not NFC`);
    if (word !== word.toLowerCase()) errors.push(`allowlist: "${word}" is not lowercase`);
    if (!/^[\p{L}\p{M}]+$/u.test(word)) errors.push(`allowlist: "${word}" contains something other than letters`);
    if (/[\u03C3\u03C2\u0130\u0131\u00DF]/u.test(word)) errors.push(`allowlist: "${word}" uses a letter whose case mapping differs across platforms`);
  }
  if (new Set(list.words).size !== (list.words ?? []).length) errors.push('allowlist: duplicate entries');
  if (!Array.isArray(list.introducers)) errors.push('allowlist: "introducers" must be an array (it may be empty)');
  else {
    const words = new Set(list.words ?? []);
    for (const word of list.introducers) if (!words.has(word)) errors.push(`allowlist: introducer "${word}" is not in "words"`);
    if (new Set(list.introducers).size !== list.introducers.length) errors.push('allowlist: duplicate introducers');
  }
  return errors;
}

export function lintBands(bands) {
  const errors = [];
  const list = bands.annualIncome ?? [];
  if (!list.length || list[0].min !== 0) errors.push('bands: first income band must start at 0');
  list.forEach((b, i) => {
    if (typeof b.id !== 'string' || !/^[A-Za-z0-9+-]+$/.test(b.id)) errors.push(`bands: bad band id at index ${i}`);
    const last = i === list.length - 1;
    if (last ? b.max !== null : !Number.isInteger(b.max)) errors.push(`bands: band ${b.id} has a bad max`);
    if (i > 0 && b.min !== list[i - 1].max + 1) errors.push(`bands: band ${b.id} does not start right after the previous band`);
  });
  if (new Set(list.map((b) => b.id)).size !== list.length) errors.push('bands: duplicate income band ids');
  if (!Number.isInteger(bands.householdSizeCap) || bands.householdSizeCap < 1) errors.push('bands: householdSizeCap must be a positive integer');
  for (const b of bands.childAgeBands ?? []) if (!/^[A-Za-z0-9+-]+$/.test(b.id)) errors.push('bands: bad child age band id');
  return errors;
}

export function lintPack(pack, bands) {
  const errors = lintBands(bands);
  if (!SLUG.test(pack.jurisdiction ?? '')) errors.push('pack: jurisdiction must be a slug');
  if (pack.constants === null || typeof pack.constants !== 'object' || Array.isArray(pack.constants)) errors.push('pack: constants must be an object (use {} when there are none)');
  if (pack.jurisdiction !== bands.jurisdiction) errors.push('pack: jurisdiction differs from bands file');
  const questionIds = new Set();
  for (const q of pack.questions ?? []) {
    if (!QUESTION_ID.test(q.id) || RESERVED.includes(q.id)) errors.push(`question "${q.id}": id is malformed or reserved`);
    if (questionIds.has(q.id)) errors.push(`question "${q.id}": duplicate id`);
    questionIds.add(q.id);
    if (typeof q.sensitive !== 'boolean') errors.push(`question "${q.id}": "sensitive" must be true or false`);
    if (q.type === 'int' && !(Number.isInteger(q.min) && Number.isInteger(q.max) && q.min <= q.max)) errors.push(`question "${q.id}": int questions need integer min and max`);
    if (!['int', 'enum', 'bool', 'multi'].includes(q.type)) errors.push(`question "${q.id}": unknown type`);
    if (['enum', 'multi'].includes(q.type) && !(Array.isArray(q.values) && q.values.length)) errors.push(`question "${q.id}": needs values`);
  }
  if (pack.questionOrder !== undefined) {
    const expected = [...questionIds, 'income'].sort().join();
    if (!Array.isArray(pack.questionOrder) || [...pack.questionOrder].sort().join() !== expected) {
      errors.push('pack: questionOrder must list every question id and "income" exactly once');
    }
  }
  const sample = { constants: pack.constants ?? {}, householdSizeCapped: '1' };
  for (const q of pack.questions ?? []) sample[q.id] = q.type === 'int' ? 1 : q.type === 'bool' ? true : q.type === 'multi' ? [] : q.values?.[0];
  const points = (bands.annualIncome ?? []).flatMap((b) => [b.min, b.max ?? b.min + 1]);

  for (const program of pack.programs ?? []) {
    if (!SLUG.test(program.id ?? '')) errors.push(`program "${program.id}": id must be a slug`);
    const allRequires = new Set(['annualIncome']);
    for (const c of program.criteria ?? []) {
      const where = `${program.id}/${c.id}`;
      if (!SLUG.test(c.id ?? '')) errors.push(`${where}: criterion id must be a slug`);
      for (const r of c.requires ?? []) {
        if (r !== 'annualIncome' && !questionIds.has(r)) errors.push(`${where}: requires unknown variable "${r}"`);
        allRequires.add(r);
      }
      const reads = new Set();
      walk(c.logic, where, errors, reads);
      if (c.uncertainIf !== undefined) {
        const extra = new Set();
        walk(c.uncertainIf, `${where}/uncertainIf`, errors, extra);
        if (extra.has('annualIncome')) errors.push(`${where}: uncertainIf must not read annualIncome`);
        extra.forEach((name) => reads.add(name));
        try {
          if (typeof evaluate(c.uncertainIf, sample) !== 'boolean') errors.push(`${where}: uncertainIf does not return a boolean`);
        } catch (e) {
          if (!(e instanceof RuleError)) throw e;
          errors.push(`${where}: uncertainIf: ${e.message}`);
        }
      }
      for (const name of reads) {
        if (name === 'constants') continue;
        if (name === 'householdSizeCapped') {
          if (!c.requires.includes('householdSize')) errors.push(`${where}: reads householdSizeCapped but does not require householdSize`);
        } else if (!c.requires.includes(name)) errors.push(`${where}: reads "${name}" but does not list it in requires`);
      }
      for (const income of points) {
        try {
          if (typeof evaluate(c.logic, { ...sample, annualIncome: income }) !== 'boolean') errors.push(`${where}: logic does not return a boolean`);
        } catch (e) {
          if (!(e instanceof RuleError)) throw e;
          errors.push(`${where}: ${e.message}`);
        }
      }
    }
    if (program.amount !== undefined) {
      const where = `${program.id}/amount`;
      const reads = new Set();
      walk(program.amount, where, errors, reads);
      for (const name of reads) {
        if (!['constants', 'householdSizeCapped'].includes(name) && !allRequires.has(name)) errors.push(`${where}: reads "${name}", which no criterion requires`);
      }
      try {
        const amount = evaluate(program.amount, { ...sample, annualIncome: points[0] });
        if (typeof amount !== 'number' || !Number.isFinite(amount)) errors.push(`${where}: does not return a number`);
      } catch (e) {
        if (!(e instanceof RuleError)) throw e;
        errors.push(`${where}: ${e.message}`);
      }
    }
  }
  return [...new Set(errors)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [packPath, bandsPath] = process.argv.slice(2);
  const errors = lintPack(JSON.parse(fs.readFileSync(packPath, 'utf8')), JSON.parse(fs.readFileSync(bandsPath, 'utf8')));
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('pack ok');
}
