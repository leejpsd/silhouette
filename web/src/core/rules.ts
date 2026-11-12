// Rules engine: expression evaluator (section 3) and verdict algorithm (sections 4–5) of
// shared/rulepacks/SPEC.md (v1.2). Ported from shared/reference/silhouette.mjs. No model is involved.
//
// v1.2: three-valued logic. Reading an unanswered variable gives UNKNOWN and records its name;
// `and`/`or`/`if` follow Kleene logic; other operators check arity, then return UNKNOWN if any
// operand is UNKNOWN. Violations throw RuleError; malformed answers throw InputError.

import { reveal, type Json, type Raw } from './types';
import type { Bands, IncomeBand } from './generalize';

// ---------- Rule pack types ----------

export type Expression = Json;

export interface Criterion {
  readonly id: string;
  /** Documentation checked by the linter; the engine does not use it (v1.2). */
  readonly requires: readonly string[];
  readonly logic: Expression;
  readonly uncertainIf?: Expression | undefined;
}

export interface Program {
  readonly id: string;
  readonly name: string;
  readonly criteria: readonly Criterion[];
  readonly amount?: Expression | undefined;
  readonly period?: string | undefined;
  readonly caveats?: readonly string[] | undefined;
  readonly docsRequired?: readonly string[] | undefined;
  readonly applyUrl?: string | undefined;
  readonly sources?: readonly Json[] | undefined;
}

export type QuestionType = 'int' | 'bool' | 'enum' | 'multi';

export interface Question {
  readonly id: string;
  readonly type: QuestionType | string;
  readonly values?: readonly string[] | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly sensitive: boolean;
}

/** shared/rulepacks/{jurisdiction}/pack.json */
export interface RulePack {
  readonly jurisdiction: string;
  readonly version: number;
  readonly verifiedOn: string | null;
  readonly constants: { readonly [key: string]: Json };
  readonly questions: readonly Question[];
  readonly questionOrder?: readonly string[] | undefined;
  readonly programs: readonly Program[];
}

/** Answers passed to the verdict engine. Always handled as Raw. */
export interface Answers {
  readonly annualIncome?: number | null | undefined;
  readonly incomeBand?: string | null | undefined;
  readonly [questionId: string]: unknown;
}

export type CriterionState = 'pass' | 'fail' | 'mixed' | 'unknown';
export type Verdict = 'likely' | 'maybe' | 'depends' | 'unlikely';

export interface CriterionResult {
  readonly id: string;
  readonly state: CriterionState;
}

export interface ProgramVerdict {
  readonly programId: string;
  readonly verdict: Verdict;
  readonly criteria: readonly CriterionResult[];
  readonly dependsOn: readonly string[];
  readonly estimatedAmount?: number;
}

// ---------- Expression evaluator ----------

/** Thrown when an expression is malformed or its operands have the wrong type. A pack that throws is invalid. */
export class RuleError extends Error {
  override readonly name = 'RuleError';
}

/** Thrown when the answers passed to verdicts() are malformed. Messages never contain user values. */
export class InputError extends Error {
  override readonly name = 'InputError';
}

/** The third truth value: the answer depends on something the user has not told us. */
export const UNKNOWN: unique symbol = Symbol('unknown');
export type Unknown = typeof UNKNOWN;

export interface EvalContext {
  /** Top-level variable names whose value is not known. Reading one gives UNKNOWN. */
  readonly unavailable?: ReadonlySet<string> | undefined;
  /** Receives the names of unavailable variables that were read. */
  readonly unknownReads?: Set<string> | undefined;
}

type Primitive = number | string | boolean | null;

const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isPrimitive = (x: unknown): x is Primitive =>
  x === null || typeof x === 'number' || typeof x === 'string' || typeof x === 'boolean';
const given = <T>(v: T | null | undefined): v is T => v !== undefined && v !== null;

function own(obj: unknown, key: string): unknown {
  return obj !== null && typeof obj === 'object' && Object.hasOwn(obj, key)
    ? (obj as Record<string, unknown>)[key]
    : undefined;
}

/** Own-property dotted lookup. A missing key, or a walk into a non-object or an array, gives null. */
function lookup(data: unknown, path: string): unknown {
  let node: unknown = data;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object' || Array.isArray(node) || !Object.hasOwn(node, key)) return null;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

const ARITY: Readonly<Record<string, readonly [number, number]>> = {
  '!': [1, 1], '==': [2, 2], '!=': [2, 2], '<': [2, 2], '<=': [2, 2], '>': [2, 2], '>=': [2, 2],
  '+': [2, Infinity], '*': [2, Infinity], '-': [2, 2], '/': [2, 2], min: [1, Infinity], max: [1, Infinity],
  floor: [1, 1], in: [2, 2], cat: [1, Infinity],
};

/**
 * Evaluates an expression with the strict, three-valued semantics of rulepacks/SPEC.md v1.2
 * section 3. Returns the value or UNKNOWN; violations throw RuleError.
 */
export function evaluate(expr: unknown, data: unknown, ctx: EvalContext = {}): unknown {
  if (expr === null || typeof expr !== 'object') return expr;
  if (Array.isArray(expr)) return expr.map((e: unknown) => evaluate(e, data, ctx));
  const keys = Object.keys(expr);
  if (keys.length !== 1) throw new RuleError('an expression object has exactly one operator');
  const op = keys[0] as string;
  const raw: unknown = (expr as Record<string, unknown>)[op];
  const fail = (why: string): never => {
    throw new RuleError(`${op}: ${why}`);
  };

  if (op === 'var') {
    const path = evaluate(raw, data, ctx);
    if (path === UNKNOWN) return UNKNOWN;
    if (typeof path !== 'string' || path === '') return fail('path must be a non-empty string');
    const top = path.split('.')[0] as string;
    if (ctx.unavailable?.has(top)) {
      ctx.unknownReads?.add(top);
      return UNKNOWN;
    }
    return lookup(data, path);
  }

  const args: readonly unknown[] = Array.isArray(raw) ? raw : [raw];
  const arity = (min: number, max = min): void => {
    if (args.length < min || args.length > max) fail('wrong number of arguments');
  };
  const truth = (x: unknown): boolean | Unknown =>
    x === UNKNOWN || typeof x === 'boolean' ? x : fail('operand must be a boolean');

  // Three-valued logic, left to right. `and` stops at the first false, `or` at the first true.
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
  const range = ARITY[op];
  if (!range) return fail('unsupported operator');
  arity(range[0], range[1]);
  if (v.some((x) => x === UNKNOWN || (Array.isArray(x) && x.includes(UNKNOWN)))) return UNKNOWN;
  const numbers = (): number[] => (v.every(isNumber) ? v : fail('operands must be numbers'));
  const primitives = (): Primitive[] => (v.every(isPrimitive) ? v : fail('operands must be primitives'));
  switch (op) {
    case '!': return typeof v[0] === 'boolean' ? !v[0] : fail('operand must be a boolean');
    case '==': { const [x, y] = primitives(); return x === y; }
    case '!=': { const [x, y] = primitives(); return x !== y; }
    case '<': { const [x = 0, y = 0] = numbers(); return x < y; }
    case '<=': { const [x = 0, y = 0] = numbers(); return x <= y; }
    case '>': { const [x = 0, y = 0] = numbers(); return x > y; }
    case '>=': { const [x = 0, y = 0] = numbers(); return x >= y; }
    case '+': return numbers().reduce((x, y) => x + y);
    case '*': return numbers().reduce((x, y) => x * y);
    case '-': { const [x = 0, y = 0] = numbers(); return x - y; }
    case '/': {
      const [x = 0, y = 0] = numbers();
      if (y === 0) fail('division by zero');
      return x / y;
    }
    case 'min': return Math.min(...numbers());
    case 'max': return Math.max(...numbers());
    case 'floor': { const [x = 0] = numbers(); return Math.floor(x); }
    case 'in': {
      const [needle, haystack] = v;
      if (!isPrimitive(needle) || !Array.isArray(haystack) || !haystack.every(isPrimitive)) {
        fail('expects a primitive and a list of primitives');
      }
      return (haystack as Primitive[]).includes(needle as Primitive);
    }
    case 'cat':
      if (!v.every((x) => typeof x === 'string' || Number.isSafeInteger(x))) fail('operands must be strings or integers');
      return v.map(String).join('');
    default:
      return fail('unsupported operator');
  }
}

// ---------- Verdict engine ----------

/** Every numeric literal anywhere in a JSON value (object values, array items, scalars). */
export function numericLiterals(node: unknown, out: number[] = []): number[] {
  if (typeof node === 'number') out.push(node);
  else if (Array.isArray(node)) node.forEach((n: unknown) => numericLiterals(n, out));
  else if (node !== null && typeof node === 'object') Object.values(node).forEach((n: unknown) => numericLiterals(n, out));
  return out;
}

/** Sample points for a band (SPEC.md section 5), sorted ascending, without duplicates. */
export function samplePoints(band: IncomeBand, literals: readonly number[]): number[] {
  const min = band.min;
  const max = band.max === null ? Math.max(min, ...literals) + 1 : band.max;
  const points = new Set<number>([min, max]);
  for (const v of literals) {
    if (v < min || v > max) continue;
    for (const p of [v - 1, v, v + 1]) points.add(Math.min(max, Math.max(min, p)));
  }
  return [...points].sort((a, b) => a - b);
}

/**
 * Decides a verdict for every program in the pack. Deterministic; the answers are Raw and the
 * result is plain data (not CloudSafe), so it cannot be sent to a cloud-capable call as is.
 */
/** The data expressions are evaluated against (section 4), shared by verdicts() and criterionReasons(). */
interface EngineData {
  readonly base: Record<string, unknown>;
  readonly unavailable: Set<string>;
  readonly exactIncome: boolean;
  readonly band: IncomeBand | null;
}

function engineData(pack: RulePack, bands: Bands, answers: Answers): EngineData {
  const income = own(answers, 'annualIncome');
  const exactIncome = given(income);
  if (exactIncome && !isNumber(income)) throw new InputError('annualIncome must be a finite number');
  const bandId = own(answers, 'incomeBand');
  const found = exactIncome || !given(bandId) ? null : bands.annualIncome.find((b) => b.id === bandId);
  if (found === undefined) throw new InputError('unknown income band');
  const band: IncomeBand | null = found;

  const base: Record<string, unknown> = { constants: pack.constants };
  const unavailable = new Set<string>();
  for (const q of pack.questions) {
    const answer = own(answers, q.id);
    if (given(answer)) base[q.id] = answer;
    else unavailable.add(q.id);
  }
  if (typeof base['householdSize'] === 'number') {
    base['householdSizeCapped'] = String(Math.min(base['householdSize'], bands.householdSizeCap));
  } else unavailable.add('householdSizeCapped');
  if (exactIncome) base['annualIncome'] = Math.max(income as number, 0);
  else if (band === null) unavailable.add('annualIncome');
  return { base, unavailable, exactIncome, band };
}

export function verdicts(pack: RulePack, bands: Bands, rawAnswers: Raw<Answers>): ProgramVerdict[] {
  const { base, unavailable, exactIncome, band } = engineData(pack, bands, reveal(rawAnswers));

  // Evaluates a boolean expression once, or at every sample point when only a band is known.
  const assess = (logic: Expression, reads: Set<string>): (boolean | Unknown)[] => {
    const once = (data: unknown): boolean | Unknown => {
      const result = evaluate(logic, data, { unavailable, unknownReads: reads });
      if (result !== UNKNOWN && typeof result !== 'boolean') throw new RuleError('criterion logic must return a boolean');
      return result;
    };
    if (exactIncome || band === null) return [once(base)];
    const literals = [...numericLiterals(pack.constants), ...numericLiterals(logic)];
    return samplePoints(band, literals).map((point) => once({ ...base, annualIncome: point }));
  };

  return pack.programs.map((program) => {
    const dependsOn = new Set<string>();
    const criteria = program.criteria.map((criterion): CriterionResult => {
      const reads = new Set<string>();
      const results = assess(criterion.logic, reads);
      let state: CriterionState;
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
    const verdict: Verdict = states.includes('fail')
      ? 'unlikely'
      : states.includes('mixed')
        ? 'maybe'
        : states.includes('unknown')
          ? 'depends'
          : 'likely';
    const sortedDependsOn = [...dependsOn].sort();
    if (verdict === 'likely' && exactIncome && program.amount !== undefined) {
      const amount = evaluate(program.amount, base, { unavailable });
      if (amount !== UNKNOWN) {
        if (!isNumber(amount)) throw new RuleError('amount must return a number');
        return { programId: program.id, verdict, criteria, dependsOn: sortedDependsOn, estimatedAmount: Math.floor(amount) };
      }
    }
    return { programId: program.id, verdict, criteria, dependsOn: sortedDependsOn };
  });
}

// ---------- Reasons (why this result) ----------

const COMPARISONS: ReadonlySet<string> = new Set(['<', '<=', '>', '>=']);

/** A comparison of an answer with a limit inside a criterion, as the rules state it. */
export interface Comparison {
  readonly variable: string;
  readonly op: '<' | '<=' | '>' | '>=';
  /** The limit for this person's answers (a table lookup is resolved); null when it depends on an unanswered question. */
  readonly limit: number | null;
  /** The person's value: a number, the income band when only a band was given, or null when unanswered. */
  readonly yours: number | IncomeBand | null;
}

export interface CriterionReason {
  readonly id: string;
  readonly state: CriterionState;
  readonly comparisons: readonly Comparison[];
}

/**
 * Finds `{op: [{"var": name}, limit]}` at the top of a criterion's logic or directly inside a top-level
 * `and` / `or`, where `name` is an answer (not a constant).
 */
function comparisonsOf(logic: unknown): { variable: string; op: Comparison['op']; limit: unknown }[] {
  const out: { variable: string; op: Comparison['op']; limit: unknown }[] = [];
  const visit = (node: unknown, depth: number) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
    const [op, args] = Object.entries(node)[0] ?? [];
    if (op === undefined || !Array.isArray(args)) return;
    if (COMPARISONS.has(op) && args.length === 2) {
      const left = args[0] as { var?: unknown } | null;
      if (left && typeof left === 'object' && typeof left.var === 'string' && !left.var.startsWith('constants.')) {
        out.push({ variable: left.var, op: op as Comparison['op'], limit: args[1] });
      }
    } else if ((op === 'and' || op === 'or') && depth === 0) {
      for (const child of args) visit(child, depth + 1);
    }
  };
  visit(logic, 0);
  return out;
}

/**
 * The reasons for one program's verdict: each criterion with the state on screen and, where it compares
 * an answer with a limit, the limit and the person's value. Deterministic; no model. The result holds
 * the person's own values: it is for display on this device and for ONLY_ON_DEVICE tasks.
 */
export function criterionReasons(pack: RulePack, bands: Bands, rawAnswers: Raw<Answers>, programId: string): CriterionReason[] {
  const program = pack.programs.find((p) => p.id === programId);
  const result = verdicts(pack, bands, rawAnswers).find((v) => v.programId === programId);
  if (!program || !result) return [];
  const { base, unavailable, exactIncome, band } = engineData(pack, bands, reveal(rawAnswers));
  return program.criteria.map((criterion) => {
    const state = result.criteria.find((c) => c.id === criterion.id)?.state ?? 'unknown';
    const comparisons = comparisonsOf(criterion.logic).map(({ variable, op, limit }): Comparison => {
      const value = evaluate(limit, base, { unavailable });
      const yours =
        variable === 'annualIncome'
          ? exactIncome
            ? (base['annualIncome'] as number)
            : band
          : isNumber(base[variable])
            ? (base[variable] as number)
            : null;
      return { variable, op, limit: isNumber(value) ? value : null, yours };
    });
    return { id: criterion.id, state, comparisons };
  });
}
