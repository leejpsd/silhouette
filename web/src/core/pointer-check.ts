// The deterministic check of a pointer answer before it is shown for confirmation: an answer that
// fails it is a failed attempt (routing.json `onDeviceFailure`), never a set of values to confirm.
//
// - every reference names a placeholder of this silhouette, of a kind that fits the field (numbers
//   point at N, dates at D or N);
// - gross pay is there;
// - the paystub checks that never warn on a correct reading of the evaluation set (net pay, the
//   period length, the pay date, year-to-date gross and periods, dates that parse) do not warn.
//   Rate × hours is left out: overtime and other pay make it warn on correct readings.
// The problems are named by field and check only; they never contain document values.

import { reveal, Raw, type Skeleton } from './types';
import { parseNumber, rehydrate, type PlaceholderMap, type PointerSchema } from './skeleton';
import { validatePaystubs, ValidationInputError, type PaystubValues } from './validate';

/** Checks that warn only when a reading is wrong (measured on all 38 English evaluation paystubs). */
export const STRICT_CHECKS: ReadonlySet<string> = new Set(['net-sum', 'period-length', 'pay-date', 'ytd-gross', 'ytd-periods', 'dates-parsed']);

const refs = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

function fieldProblems(schema: PointerSchema, pointers: unknown, map: PlaceholderMap): string[] {
  const out: string[] = [];
  if (pointers === null || typeof pointers !== 'object' || Array.isArray(pointers)) return ['not-an-object'];
  const p = pointers as Record<string, unknown>;
  const fits = (kind: string | undefined, ref: unknown): boolean => {
    if (typeof ref !== 'string' || !Object.hasOwn(map, ref)) return false;
    if (kind === 'number') return ref.startsWith('N');
    if (kind === 'date') return ref.startsWith('D') || ref.startsWith('N');
    return true;
  };
  for (const [name, spec] of Object.entries(schema.properties)) {
    const value = p[name];
    if (value === undefined || value === null) continue;
    const kind = spec['x-kind'];
    if (kind === 'enum') {
      if (!(spec.enum ?? []).includes(value as string)) out.push(`${name}:not-an-option`);
    } else if (kind === 'list') {
      for (const item of Array.isArray(value) ? value : []) {
        const amount = (item as Record<string, unknown> | null)?.['amount'];
        if (amount !== undefined && amount !== null && !fits('number', amount)) out.push(`${name}:bad-reference`);
      }
    } else if (!refs(value).every((r) => fits(kind, r))) out.push(`${name}:bad-reference`);
  }
  return out;
}

/** Problems with a pointer answer for a paystub; an empty list means it may be shown for confirmation. */
export function pointerProblems(schema: PointerSchema, pointers: unknown, skeleton: Skeleton, rawMap: Raw<PlaceholderMap>, jurisdiction: string): string[] {
  void skeleton;
  const problems = fieldProblems(schema, pointers, reveal(rawMap));
  if (problems.includes('not-an-object')) return problems;
  const values = reveal(rehydrate(schema, pointers, rawMap)) as unknown as PaystubValues;
  if (typeof values.grossPay !== 'number') problems.push('grossPay:missing');
  try {
    const result = validatePaystubs(Raw.of([values]), jurisdiction);
    for (const c of result.checks[0] ?? []) if (c.status === 'warn' && STRICT_CHECKS.has(c.id)) problems.push(`check:${c.id}`);
  } catch (error) {
    if (error instanceof ValidationInputError) problems.push('values:malformed');
    else throw error;
  }
  return problems;
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
