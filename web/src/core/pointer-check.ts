// The deterministic checks of a pointer answer before it is shown for confirmation, in two parts.
// (Year to date that may be another line's, and names that run into each other: see below.)
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

// ---------- Year to date that may be another line's ----------
//
// A paystub's earnings table often has a year-to-date column on every earnings line and on the gross
// line. A small model sometimes takes the Regular line's year to date for the gross one: it is above the
// period's gross and fits the number of pay periods, so the checks above cannot see it. These rules look
// at the real amounts this device has, and only reject: no code picks another placeholder for the person.

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Whether `ytd` fits as the year to date for this gross pay, frequency and date (the ytd-gross and ytd-periods checks). */
function fitsYtd(v: PaystubValues, ytd: number, jurisdiction: string): boolean {
  if (typeof v.grossPay !== 'number' || ytd < v.grossPay) return false;
  try {
    const result = validatePaystubs(Raw.of([{ grossPay: v.grossPay, ytdGross: ytd, payFrequency: v.payFrequency, periodEnd: v.periodEnd, payDate: v.payDate }]), jurisdiction);
    return !(result.checks[0] ?? []).some((c) => c.status === 'warn' && (c.id === 'ytd-gross' || c.id === 'ytd-periods'));
  } catch (error) {
    if (error instanceof ValidationInputError) return true;
    throw error;
  }
}

/** Number placeholders of the skeleton line that holds `id` (in reading order), or [] when none does. */
function numbersOnLineOf(skeleton: string, id: string): string[] {
  const line = skeleton.split('\n').find((l) => l.includes(`⟦${id}⟧`));
  return line ? [...line.matchAll(/⟦(N[0-9]+)⟧/g)].map((m) => m[1] as string) : [];
}

/**
 * Same-line rule. When the line that holds the answered gross pay holds exactly one other number
 * placeholder that fits as year to date, an answered year to date must have that amount. Amounts are
 * compared, not ids: a paystub that writes the same year to date twice has two right answers.
 */
export function sameLineYtdProblems(schema: PointerSchema, pointers: Record<string, unknown>, skeleton: Skeleton, rawMap: Raw<PlaceholderMap>, jurisdiction: string): string[] {
  const gross = pointers['grossPay'];
  if (typeof gross !== 'string') return [];
  const v = values(schema, pointers, rawMap);
  if (typeof v.grossPay !== 'number') return [];
  const map = reveal(rawMap);
  const amount = (id: string) => parseNumber(map[id] ?? '');
  const candidates = numbersOnLineOf(skeleton, gross)
    .filter((id) => id !== gross)
    .filter((id) => {
      const n = amount(id);
      return n !== undefined && fitsYtd(v, n, jurisdiction);
    });
  // A year to date left out is not a wrong one: the review shows it as not found, to be typed.
  if (candidates.length !== 1 || typeof v.ytdGross !== 'number') return [];
  const expected = amount(candidates[0] as string) as number;
  return near(v.ytdGross, expected) ? [] : ['ytdGross:not-on-gross-line'];
}

/**
 * Larger-candidate rule. When another amount of money in the document is larger than the answered year
 * to date and also fits as year to date for this pay period, the year to date is ambiguous. It covers
 * layouts where the gross year to date is not on the gross line (a "Year to Date" block, a labelled
 * "YTD Gross" line). Numbers written without cents (ids, ZIP codes) are not candidates.
 */
export function largerYtdProblems(schema: PointerSchema, pointers: Record<string, unknown>, skeleton: Skeleton, rawMap: Raw<PlaceholderMap>, jurisdiction: string): string[] {
  const v = values(schema, pointers, rawMap);
  if (typeof v.ytdGross !== 'number' || typeof v.grossPay !== 'number') return [];
  const ytd = v.ytdGross;
  const map = reveal(rawMap);
  const ids = new Set([...skeleton.matchAll(/⟦(N[0-9]+)⟧/g)].map((m) => m[1] as string));
  for (const id of ids) {
    // Only amounts of money (written with cents): ids, ZIP codes and years are not a year to date.
    if (!/[.,][0-9]{2}$/.test(map[id] ?? '')) continue;
    const n = parseNumber(map[id] ?? '');
    if (n !== undefined && n > ytd && !near(n, ytd) && fitsYtd(v, n, jurisdiction)) return ['ytdGross:ambiguous'];
  }
  return [];
}

/**
 * The two names share a placeholder: one of them runs into the other (a contradiction, not a guess).
 * The names feed no rule; a reading with this problem keeps its other values and marks the names not read.
 */
export function namesProblems(pointers: Record<string, unknown>): string[] {
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const employer = new Set(ids(pointers['employerName']));
  return ids(pointers['employeeName']).some((id) => employer.has(id)) ? ['names:shared-placeholder'] : [];
}

/**
 * A name cut short: the answered word placeholders are directly followed or preceded, on the same line,
 * by a word placeholder the answer leaves out, with nothing but one or two spaces between them (no
 * visible text). Wider gaps are not counted, because a layout may put two names on one line separated
 * by spaces. Names feed no rule; the name is marked not read and never extended by code.
 */
export function incompleteNameProblems(pointers: Record<string, unknown>, skeleton: Skeleton): string[] {
  const out: string[] = [];
  for (const field of ['employerName', 'employeeName']) {
    const ids = Array.isArray(pointers[field]) ? (pointers[field] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    if (ids.length === 0) continue;
    const answered = new Set(ids);
    let cut = false;
    for (const line of skeleton.split('\n')) {
      // Each placeholder on the line, with the text between it and the previous one.
      const tokens = [...line.matchAll(/⟦([NDW][0-9]+)⟧/g)];
      for (let i = 0; i < tokens.length && !cut; i++) {
        const id = tokens[i]?.[1] as string;
        if (!answered.has(id)) continue;
        for (const j of [i - 1, i + 1]) {
          const other = tokens[j];
          if (!other) continue;
          const otherId = other[1] as string;
          if (!otherId.startsWith('W') || answered.has(otherId)) continue;
          const [a, b] = j < i ? [other, tokens[i]] : [tokens[i], other];
          const gap = line.slice((a?.index ?? 0) + (a?.[0].length ?? 0), b?.index ?? 0);
          if (/^ {1,2}$/.test(gap)) cut = true;
        }
      }
      if (cut) break;
    }
    if (cut) out.push(`${field}:incomplete`);
  }
  return out;
}

/**
 * One placeholder, one field: hours worked or hourly rate that points at the placeholder answered for
 * gross pay, net pay or year to date is a contradiction. Those two feed no rule; the field is marked not
 * read and the reading keeps its other values.
 */
export function sharedAmountProblems(pointers: Record<string, unknown>): string[] {
  const amounts = new Set(['grossPay', 'netPay', 'ytdGross'].map((f) => pointers[f]).filter((v): v is string => typeof v === 'string'));
  return ['hoursWorked', 'hourlyRate'].filter((f) => typeof pointers[f] === 'string' && amounts.has(pointers[f] as string)).map((f) => `${f}:shares-placeholder`);
}

/**
 * Fields to leave out of a reading as not read, with the problems that say why: names that share a
 * placeholder (both names), a name cut short (with the silhouette), and hours or rate that share a
 * placeholder with an amount. None of them feeds a rule.
 */
export function notReadFields(pointers: Record<string, unknown>, skeleton?: Skeleton): { problems: string[]; fields: string[] } {
  const names = namesProblems(pointers);
  const incomplete = skeleton !== undefined ? incompleteNameProblems(pointers, skeleton) : [];
  const shared = sharedAmountProblems(pointers);
  const fields = [...(names.length > 0 ? ['employerName', 'employeeName'] : []), ...[...incomplete, ...shared].map((p) => p.split(':')[0] as string)];
  return { problems: [...names, ...incomplete, ...shared], fields: [...new Set(fields)] };
}

/**
 * Year to date left out although the document has one place for it: the answered gross line holds
 * exactly one other amount that fits as year to date, or, when the gross line holds none, exactly one
 * amount of money in the document (other than gross pay's own amount) fits. Then the device may be
 * asked again for gross pay and year to date; code never fills the field in.
 */
export function ytdMissingWithCandidate(schema: PointerSchema, pointers: Record<string, unknown>, skeleton: Skeleton, rawMap: Raw<PlaceholderMap>, jurisdiction: string): boolean {
  const gross = pointers['grossPay'];
  if (typeof gross !== 'string' || (pointers['ytdGross'] !== undefined && pointers['ytdGross'] !== null)) return false;
  const v = values(schema, pointers, rawMap);
  if (typeof v.grossPay !== 'number') return false;
  const grossPay = v.grossPay;
  const map = reveal(rawMap);
  const fits = (id: string) => {
    const n = parseNumber(map[id] ?? '');
    return n !== undefined && fitsYtd(v, n, jurisdiction);
  };
  const onLine = numbersOnLineOf(skeleton, gross).filter((id) => id !== gross && fits(id));
  if (onLine.length > 0) return onLine.length === 1;
  const money = new Set(
    [...skeleton.matchAll(/⟦(N[0-9]+)⟧/g)]
      .map((m) => m[1] as string)
      .filter((id) => /[.,][0-9]{2}$/.test(map[id] ?? '') && !near(parseNumber(map[id] ?? '') ?? Number.NaN, grossPay) && fits(id))
      .map((id) => parseNumber(map[id] ?? '')),
  );
  return money.size === 1;
}

/**
 * Problems with the core of a pointer answer (its deductions are ignored); empty: the core may be used.
 * With the silhouette, also the two year-to-date rules (sameLineYtdProblems, largerYtdProblems). Both
 * raise no alarm on any of the 38 English evaluation paystubs, whichever right placeholder is answered
 * (src/core/ytd-check.test.ts).
 */
export function corePointerProblems(schema: PointerSchema, pointers: unknown, rawMap: Raw<PlaceholderMap>, jurisdiction: string, skeleton?: Skeleton): string[] {
  if (!isObject(pointers)) return ['not-an-object'];
  const problems = coreFieldProblems(schema, pointers, reveal(rawMap));
  const { deductions, ...core } = pointers;
  void deductions;
  const v = values(schema, core, rawMap);
  if (typeof v.grossPay !== 'number') problems.push('grossPay:missing');
  if (typeof v.grossPay === 'number' && typeof v.netPay === 'number' && v.netPay > v.grossPay) problems.push('netPay:above-gross');
  // Year to date below this period's gross is always a problem (ytd-gross), whatever else holds.
  problems.push(...checkWarnings(v, jurisdiction, CORE_CHECKS));
  if (skeleton !== undefined) {
    problems.push(...sameLineYtdProblems(schema, core, skeleton, rawMap, jurisdiction));
    problems.push(...largerYtdProblems(schema, core, skeleton, rawMap, jurisdiction));
  }
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
