// The deterministic checks of a pointer answer before it is shown for confirmation, in two parts.
//
// The core (names, dates, pay frequency, gross, net, year to date, hours, rate) decides the yearly
// income. A core that fails its check is a failed attempt (routing.json `onDeviceFailure`), never a
// set of values to confirm:
// - every reference names a placeholder of this silhouette, of the kind the field takes: names word
//   placeholders (W), dates date placeholders (D, or three number placeholders), amounts number
//   placeholders (N); fixed lists take one of their options;
// - gross pay is there, and net pay is not above it;
// - the checks that never warn on a correct reading of the evaluation set: the period length, the pay
//   date, dates that parse, year to date at least the period's gross, and year to date that fits the
//   number of pay periods so far. Rate × hours is left out (overtime makes it warn on correct
//   readings), and so is net pay against the deductions, which belongs to the second part.
//
// The deductions are a second part. They feed no result and no yearly income: when they do not hold
// up (a wrong reference, or net pay not equal to gross minus the deductions), they are left out and
// marked as not read, and the core is still used.
// Problems are named by field and check only; they never contain document values. Every problem found
// is reported, not only the first.

import { reveal, Raw, type Skeleton } from './types';
import { parseNumber, rehydrate, type PlaceholderMap, type PointerSchema } from './skeleton';
import { validatePaystubs, ValidationInputError, type PaystubValues } from './validate';

/** Core checks that warn only when a reading is wrong (measured on all 38 English evaluation paystubs). */
export const CORE_CHECKS: ReadonlySet<string> = new Set(['period-length', 'pay-date', 'ytd-gross', 'ytd-periods', 'dates-parsed']);
/** Every check used on a whole answer (core and deductions). */
export const STRICT_CHECKS: ReadonlySet<string> = new Set([...CORE_CHECKS, 'net-sum']);

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Whether a reference fits a field of this kind. */
function fits(kind: string | undefined, ref: unknown, map: PlaceholderMap): boolean {
  if (Array.isArray(ref)) {
    // A name is a list of word placeholders; a date may be written as three numbers.
    if (kind === 'date') return ref.length === 3 && ref.every((r) => typeof r === 'string' && r.startsWith('N') && Object.hasOwn(map, r));
    return ref.length > 0 && ref.every((r) => fits(kind, r, map));
  }
  if (typeof ref !== 'string' || !Object.hasOwn(map, ref)) return false;
  if (kind === 'number') return ref.startsWith('N');
  if (kind === 'date') return ref.startsWith('D');
  if (kind === 'text') return ref.startsWith('W');
  return true;
}

/** Field problems of every non-list field present in the answer. */
function coreFieldProblems(schema: PointerSchema, p: Record<string, unknown>, map: PlaceholderMap): string[] {
  const out: string[] = [];
  for (const [name, spec] of Object.entries(schema.properties)) {
    const kind = spec['x-kind'];
    if (kind === 'list') continue;
    const value = p[name];
    if (value === undefined || value === null) continue;
    if (kind === 'enum') {
      if (!(spec.enum ?? []).includes(value as string)) out.push(`${name}:not-an-option`);
    } else if (!fits(kind, value, map)) out.push(`${name}:bad-reference`);
  }
  return out;
}

function values(schema: PointerSchema, pointers: Record<string, unknown>, rawMap: Raw<PlaceholderMap>): PaystubValues {
  return reveal(rehydrate(schema, pointers, rawMap)) as unknown as PaystubValues;
}

function checkWarnings(v: PaystubValues, jurisdiction: string, which: ReadonlySet<string>): string[] {
  try {
    const result = validatePaystubs(Raw.of([v]), jurisdiction);
    return (result.checks[0] ?? []).filter((c) => c.status === 'warn' && which.has(c.id)).map((c) => `check:${c.id}`);
  } catch (error) {
    if (error instanceof ValidationInputError) return ['values:malformed'];
    throw error;
  }
}

/** Problems with the core of a pointer answer (its deductions are ignored); empty: the core may be used. */
export function corePointerProblems(schema: PointerSchema, pointers: unknown, rawMap: Raw<PlaceholderMap>, jurisdiction: string): string[] {
  if (!isObject(pointers)) return ['not-an-object'];
  const problems = coreFieldProblems(schema, pointers, reveal(rawMap));
  const { deductions, ...core } = pointers;
  void deductions;
  const v = values(schema, core, rawMap);
  if (typeof v.grossPay !== 'number') problems.push('grossPay:missing');
  if (typeof v.grossPay === 'number' && typeof v.netPay === 'number' && v.netPay > v.grossPay) problems.push('netPay:above-gross');
  // Year to date below this period's gross is always a problem (ytd-gross), whatever else holds.
  problems.push(...checkWarnings(v, jurisdiction, CORE_CHECKS));
  return problems;
}

/**
 * Problems with the deductions of an answer, given its core: a reference that is not a number
 * placeholder, a kind outside the list, or net pay that is not gross minus the deductions. Empty: the
 * deductions may be used. A list that cannot be checked (no net pay) counts as not read.
 */
export function deductionsProblems(schema: PointerSchema, pointers: unknown, rawMap: Raw<PlaceholderMap>, jurisdiction: string): string[] {
  if (!isObject(pointers)) return ['not-an-object'];
  const map = reveal(rawMap);
  const spec = schema.properties['deductions'];
  const kinds = spec?.items?.properties['kind']?.enum ?? [];
  const list = pointers['deductions'];
  if (list === undefined || list === null) return ['deductions:missing'];
  if (!Array.isArray(list)) return ['deductions:not-a-list'];
  const problems: string[] = [];
  for (const item of list) {
    if (!isObject(item) || !fits('number', item['amount'], map)) problems.push('deductions:bad-reference');
    else if (item['kind'] !== undefined && item['kind'] !== null && !kinds.includes(item['kind'] as string)) problems.push('deductions:not-an-option');
  }
  const v = values(schema, pointers, rawMap);
  if (typeof v.netPay !== 'number' || typeof v.grossPay !== 'number') problems.push('deductions:cannot-check');
  else problems.push(...checkWarnings(v, jurisdiction, new Set(['net-sum'])));
  return [...new Set(problems)];
}

/** Problems with a whole answer (core and deductions), as one list. */
export function pointerProblems(schema: PointerSchema, pointers: unknown, skeleton: Skeleton, rawMap: Raw<PlaceholderMap>, jurisdiction: string): string[] {
  void skeleton;
  const core = corePointerProblems(schema, pointers, rawMap, jurisdiction);
  if (core.includes('not-an-object')) return core;
  return [...core, ...deductionsProblems(schema, pointers, rawMap, jurisdiction).filter((p) => p !== 'deductions:missing')];
}

/**
 * For the on-device check (synthetic documents only): which placeholders hold each gold value. A gold
 * number matches every N placeholder with that number; a date, every D placeholder with that text; a
 * name, every W or N placeholder that is one of its words. Ids only, never values.
 */
export function goldPlaceholderIds(gold: Readonly<Record<string, unknown>>, rawMap: Raw<PlaceholderMap>): Record<string, string[]> {
  const map = reveal(rawMap);
  const entries = Object.entries(map);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const numberIds = (n: number) => entries.filter(([id, text]) => id.startsWith('N') && near(parseNumber(text) ?? Number.NaN, n)).map(([id]) => id);
  const out: Record<string, string[]> = {};
  for (const [field, value] of Object.entries(gold)) {
    if (typeof value === 'number') out[field] = numberIds(value);
    else if (typeof value === 'string') {
      const words = new Set(value.toLowerCase().split(/\s+/));
      const dates = entries.filter(([id, text]) => id.startsWith('D') && text === value).map(([id]) => id);
      out[field] = dates.length > 0 ? dates : entries.filter(([id, text]) => !id.startsWith('D') && words.has(text.toLowerCase())).map(([id]) => id);
    } else if (Array.isArray(value)) {
      out[field] = value.flatMap((item) => (typeof (item as { amount?: unknown }).amount === 'number' ? numberIds((item as { amount: number }).amount) : []));
    }
  }
  return out;
}
