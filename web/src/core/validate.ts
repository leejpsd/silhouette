// Validation and annualization of confirmed paystub values.
// Spec: shared/validation/SPEC.md (section numbers below refer to it).
//
// Deterministic and clock-free: no Date objects, no time zones, no "today". Money is handled as
// integer cents and every ratio uses exact BigInt arithmetic, so Kotlin and Swift can reproduce
// every result bit for bit. Inputs are Raw; results are plain data (not CloudSafe).

import { reveal, type Raw } from './types';

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

/** Section 4: pay periods per year. */
export const PERIODS_PER_YEAR: Readonly<Record<PayFrequency, number>> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

/** Section 4: inclusive period-length ranges in days. */
const PERIOD_DAYS: Readonly<Record<PayFrequency, readonly [number, number]>> = {
  weekly: [7, 7],
  biweekly: [14, 14],
  semimonthly: [13, 16],
  monthly: [28, 31],
};

export type DateOrder = 'MDY' | 'DMY' | 'YMD';

/** Section 3: date order of a jurisdiction's documents. Unknown jurisdictions parse only year-first dates. */
export const DATE_ORDER: Readonly<Record<string, DateOrder>> = { 'us-ca': 'MDY', 'zz-test': 'MDY', kr: 'YMD' };

/** Confirmed values of one paystub (rehydrated, then confirmed or typed by the user). */
export interface PaystubValues {
  readonly grossPay?: number | undefined;
  readonly netPay?: number | undefined;
  readonly ytdGross?: number | undefined;
  readonly hoursWorked?: number | undefined;
  readonly hourlyRate?: number | undefined;
  readonly payFrequency?: PayFrequency | undefined;
  /** Unparsed date text as rehydrated (skeleton/SPEC.md section 5) or typed. */
  readonly payDate?: string | undefined;
  readonly periodStart?: string | undefined;
  readonly periodEnd?: string | undefined;
  readonly deductions?: readonly { readonly amount: number; readonly kind?: string | undefined }[] | undefined;
}

/** Thrown for malformed input (negative or non-finite money, unknown frequency). Messages never contain values. */
export class ValidationInputError extends Error {
  override readonly name = 'ValidationInputError';
}

// ---------- 2. Money ----------

/** Section 2: a money value in integer cents, rounded half away from zero. Rejects negative or non-finite values. */
export function toCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new ValidationInputError('money values must be finite and non-negative');
  return Math.round(value * 100);
}

/** Exact non-negative rational num/den rounded to the nearest integer, halves up. */
function roundRatio(num: bigint, den: bigint): number {
  return Number((2n * num + den) / (2n * den));
}

// ---------- 3. Dates ----------

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export function daysInMonth(year: number, month: number): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/** Days since 1970-01-01 in the proleptic Gregorian calendar (no time zone involved). */
export function dayNumber({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const DATE_TEXT = /^([0-9]{1,4})[/.\-]([0-9]{1,2})[/.\-]([0-9]{1,4})$/;

/** Month names, as in the Skeletonizer (shared/skeleton/SPEC.md section 2). */
const MONTH_NAMES: readonly (readonly string[])[] = [
  ['january', 'jan', 'enero'], ['february', 'feb', 'febrero'], ['march', 'mar', 'marzo'], ['april', 'apr', 'abril'],
  ['may', 'mayo'], ['june', 'jun', 'junio'], ['july', 'jul', 'julio'], ['august', 'aug', 'agosto'],
  ['september', 'sept', 'sep', 'septiembre', 'setiembre'], ['october', 'oct', 'octubre'],
  ['november', 'nov', 'noviembre'], ['december', 'dec', 'diciembre'],
];
const MONTH_WORD = MONTH_NAMES.flat().sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).join('|');
const MONTH_FIRST = new RegExp(`^(${MONTH_WORD})\\.? ([0-9]{1,2})(?:st|nd|rd|th)?,? ([0-9]{4})$`, 'i');
const DAY_FIRST = new RegExp(`^([0-9]{1,2})(?:st|nd|rd|th)? (?:de )?(${MONTH_WORD})\\.?,? (?:del? )?([0-9]{4})$`, 'i');
const monthNumber = (word: string): number => MONTH_NAMES.findIndex((names) => names.includes(word.toLowerCase())) + 1;

/** A date, null (a month-name date that is invalid), or undefined (not a month-name date). */
function parseMonthNameDate(text: string): CivilDate | null | undefined {
  let m = MONTH_FIRST.exec(text);
  let parts: CivilDate | null = m ? { month: monthNumber(m[1] as string), day: Number(m[2]), year: Number(m[3]) } : null;
  if (!parts) {
    m = DAY_FIRST.exec(text);
    if (m) parts = { day: Number(m[1]), month: monthNumber(m[2] as string), year: Number(m[3]) };
  }
  if (!parts) return undefined;
  const { year, month, day } = parts;
  if (year < 1900 || year > 2099 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/**
 * Section 3: parses date text. A 4-digit first component means year-month-day in every jurisdiction
 * (this covers rehydrated N-triples such as "2026-10-25"). Otherwise the jurisdiction's order
 * applies. Two-digit years are 2000–2099; four-digit years must be 1900–2099.
 */
export function parseDate(text: string, jurisdiction: string): CivilDate | null {
  const named = parseMonthNameDate(text.trim());
  if (named !== undefined) return named;
  const m = DATE_TEXT.exec(text.trim());
  if (!m) return null;
  const [a = '', b = '', c = ''] = [m[1], m[2], m[3]];
  const order: DateOrder | undefined = a.length === 4 ? 'YMD' : DATE_ORDER[jurisdiction];
  if (!order) return null;
  const [ys, ms, ds] = order === 'YMD' ? [a, b, c] : order === 'MDY' ? [c, a, b] : [c, b, a];
  if (ds.length > 2 || ms.length > 2) return null;
  let year: number;
  if (ys.length === 4) year = Number(ys);
  else if (ys.length === 2) year = 2000 + Number(ys);
  else return null;
  const month = Number(ms);
  const day = Number(ds);
  if (year < 1900 || year > 2099 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isoDate(d: CivilDate): string {
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

// ---------- Normalized stub ----------

interface Stub {
  readonly index: number;
  readonly gross: number | null;
  readonly net: number | null;
  readonly ytd: number | null;
  readonly rate: number | null;
  readonly hoursHundredths: number | null;
  readonly deductions: readonly number[];
  readonly frequency: PayFrequency | null;
  readonly frequencyInferred: boolean;
  readonly payDate: CivilDate | null;
  readonly periodStart: CivilDate | null;
  readonly periodEnd: CivilDate | null;
}

const FREQUENCIES: readonly PayFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly'];

/** Section 4: frequency implied by a period length; 14 days is biweekly, never semimonthly. */
export function frequencyForLength(days: number): PayFrequency | null {
  if (days === 7) return 'weekly';
  if (days === 14) return 'biweekly';
  if (days >= 13 && days <= 16) return 'semimonthly';
  if (days >= 28 && days <= 31) return 'monthly';
  return null;
}

function normalize(input: PaystubValues, index: number, jurisdiction: string): Stub {
  // A field that is null is absent, exactly as if the key were missing (every field, deductions too).
  const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null)) as PaystubValues;
  const money = (v: number | undefined): number | null => (v === undefined ? null : toCents(v));
  if (values.payFrequency !== undefined && !FREQUENCIES.includes(values.payFrequency)) {
    throw new ValidationInputError('unknown pay frequency');
  }
  if (values.hoursWorked !== undefined && (!Number.isFinite(values.hoursWorked) || values.hoursWorked < 0)) {
    throw new ValidationInputError('hours must be finite and non-negative');
  }
  const date = (t: string | undefined): CivilDate | null => (t === undefined ? null : parseDate(t, jurisdiction));
  const periodStart = date(values.periodStart);
  const periodEnd = date(values.periodEnd);
  let frequency: PayFrequency | null = values.payFrequency ?? null;
  let frequencyInferred = false;
  if (frequency === null && periodStart && periodEnd) {
    frequency = frequencyForLength(dayNumber(periodEnd) - dayNumber(periodStart) + 1);
    frequencyInferred = frequency !== null;
  }
  return {
    index,
    gross: money(values.grossPay),
    net: money(values.netPay),
    ytd: money(values.ytdGross),
    rate: money(values.hourlyRate),
    hoursHundredths: values.hoursWorked === undefined ? null : Math.round(values.hoursWorked * 100),
    deductions: (values.deductions ?? []).map((d) => toCents(d.amount)),
    frequency,
    frequencyInferred,
    payDate: date(values.payDate),
    periodStart,
    periodEnd,
  };
}

// ---------- 5. Checks ----------

export type CheckId = 'net-sum' | 'rate-hours' | 'period-length' | 'pay-date' | 'ytd-gross' | 'ytd-periods' | 'dates-parsed';
export type CheckStatus = 'ok' | 'warn' | 'skipped';

export interface Check {
  readonly id: CheckId;
  readonly status: CheckStatus;
}

/** Elapsed months to a date as an exact fraction ((m−1)·D + d) / D, D = days in that month. */
function elapsedMonths(d: CivilDate): { num: bigint; den: bigint } {
  const D = daysInMonth(d.year, d.month);
  return { num: BigInt((d.month - 1) * D + d.day), den: BigInt(D) };
}

function checkStub(s: Stub, raw: PaystubValues): Check[] {
  const checks: Check[] = [];
  const add = (id: CheckId, status: CheckStatus) => checks.push({ id, status });

  // net-sum: |gross − Σdeductions − net| ≤ 1 % of gross.
  if (s.gross !== null && s.net !== null) {
    const diff = Math.abs(s.gross - s.deductions.reduce((a, b) => a + b, 0) - s.net);
    add('net-sum', diff * 100 <= s.gross ? 'ok' : 'warn');
  } else add('net-sum', 'skipped');

  // rate-hours: rate × hours is not more than 1 % above gross. It may be less: overtime and other
  // earnings add to the regular pay (validation/SPEC.md, since v1.25).
  if (s.rate !== null && s.hoursHundredths !== null && s.gross !== null) {
    const product = BigInt(s.rate) * BigInt(s.hoursHundredths); // cents × hundredths
    const gross = BigInt(s.gross) * 100n;
    add('rate-hours', (product - gross) * 100n <= gross ? 'ok' : 'warn');
  } else add('rate-hours', 'skipped');

  // period-length: length within the frequency's range; start after end is a warning.
  if (s.periodStart && s.periodEnd) {
    const length = dayNumber(s.periodEnd) - dayNumber(s.periodStart) + 1;
    if (length < 1) add('period-length', 'warn');
    else if (s.frequency === null || s.frequencyInferred) add('period-length', s.frequency === null ? 'warn' : 'ok');
    else {
      const [lo, hi] = PERIOD_DAYS[s.frequency];
      add('period-length', length >= lo && length <= hi ? 'ok' : 'warn');
    }
  } else add('period-length', 'skipped');

  // pay-date: within 31 days of the period end, either side.
  if (s.payDate && s.periodEnd) {
    add('pay-date', Math.abs(dayNumber(s.payDate) - dayNumber(s.periodEnd)) <= 31 ? 'ok' : 'warn');
  } else add('pay-date', 'skipped');

  // ytd-gross: year-to-date is at least this period's gross.
  if (s.ytd !== null && s.gross !== null) add('ytd-gross', s.ytd >= s.gross ? 'ok' : 'warn');
  else add('ytd-gross', 'skipped');

  // ytd-periods: YTD ÷ gross lies within [0.5·n, 1.5·n], n = ceil(P · elapsedMonths / 12).
  const ref = s.periodEnd ?? s.payDate;
  if (s.ytd !== null && s.gross !== null && s.gross > 0 && s.frequency !== null && ref) {
    const e = elapsedMonths(ref);
    const p = BigInt(PERIODS_PER_YEAR[s.frequency]);
    const n = (p * e.num + 12n * e.den - 1n) / (12n * e.den); // ceil
    const ytd2 = 2n * BigInt(s.ytd);
    const gross = BigInt(s.gross);
    add('ytd-periods', ytd2 >= n * gross && ytd2 <= 3n * n * gross ? 'ok' : 'warn');
  } else add('ytd-periods', 'skipped');

  // dates-parsed: every date that was given parsed.
  const dates = ([[raw.payDate, s.payDate], [raw.periodStart, s.periodStart], [raw.periodEnd, s.periodEnd]] as const).filter(
    ([text]) => text !== undefined && text !== null,
  );
  add('dates-parsed', dates.length === 0 ? 'skipped' : dates.every(([, d]) => d !== null) ? 'ok' : 'warn');
  return checks;
}

// ---------- 6–7. Several paystubs and annualization ----------

export type AnnualizeMethod = 'ytd' | 'average';

export interface Annualization {
  /** Whole currency units, rounded half up. */
  readonly annualIncome: number;
  readonly method: AnnualizeMethod;
  readonly basis: {
    /** ytd: the YTD gross in cents and the reference date (ISO). */
    readonly ytdCents?: number;
    readonly referenceDate?: string;
    /** ytd: elapsed months as an exact fraction. */
    readonly elapsedMonths?: { readonly numerator: number; readonly denominator: number };
    /** average: mean gross per period in cents (rounded half up) and periods per year. */
    readonly averageGrossCents?: number;
    readonly periodsPerYear?: number;
    readonly frequency?: PayFrequency;
    readonly stubsUsed: readonly number[];
  };
}

export type AnnualizeFailure = 'no-gross' | 'no-frequency';

export interface ValidationResult {
  /** Checks per input stub, in input order. */
  readonly checks: readonly (readonly Check[])[];
  readonly annualization: Annualization | null;
  readonly failure: AnnualizeFailure | null;
  /** Indexes of stubs dropped as duplicates (section 6). */
  readonly duplicates: readonly number[];
}

function referenceDay(s: Stub): number | null {
  const d = s.periodEnd ?? s.payDate;
  return d ? dayNumber(d) : null;
}

/**
 * Validates confirmed paystubs and annualizes their income.
 * Order of preference: YTD method on the reference stub, then the average-gross method.
 */
export function validatePaystubs(rawStubs: Raw<readonly PaystubValues[]>, jurisdiction: string): ValidationResult {
  const values = reveal(rawStubs);
  const stubs = values.map((v, i) => normalize(v, i, jurisdiction));
  const checks = stubs.map((s, i) => checkStub(s, values[i] as PaystubValues));

  // Section 6: duplicates share period start, period end, pay date and gross; the first one is kept.
  const seen = new Set<string>();
  const duplicates: number[] = [];
  const unique = stubs.filter((s) => {
    const key = [s.periodStart, s.periodEnd, s.payDate].map((d) => (d ? isoDate(d) : '-')).join('|') + `|${s.gross ?? '-'}`;
    if (seen.has(key)) {
      duplicates.push(s.index);
      return false;
    }
    seen.add(key);
    return true;
  });

  // Section 6: the reference stub has the latest reference date (period end, else pay date); ties go to the later input.
  let reference: Stub | null = null;
  for (const s of unique) {
    const day = referenceDay(s);
    if (day === null) continue;
    const best = reference ? (referenceDay(reference) as number) : null;
    if (best === null || day >= best) reference = s;
  }

  // Section 7a: year-to-date method. Needs YTD > 0 on the reference stub and at least one elapsed month.
  if (reference && reference.ytd !== null && reference.ytd > 0) {
    const refDate = (reference.periodEnd ?? reference.payDate) as CivilDate;
    const e = elapsedMonths(refDate);
    if (e.num >= e.den) {
      const annualIncome = roundRatio(BigInt(reference.ytd) * 12n * e.den, 100n * e.num);
      return {
        checks,
        duplicates,
        failure: null,
        annualization: {
          annualIncome,
          method: 'ytd',
          basis: {
            ytdCents: reference.ytd,
            referenceDate: isoDate(refDate),
            elapsedMonths: { numerator: Number(e.num), denominator: Number(e.den) },
            stubsUsed: [reference.index],
          },
        },
      };
    }
  }

  // Section 7b: average-gross method over stubs of the reference frequency (or of unknown frequency).
  const withGross = unique.filter((s) => s.gross !== null);
  if (withGross.length === 0) return { checks, duplicates, failure: 'no-gross', annualization: null };
  // The frequency comes from the latest-dated paystub that has a gross (ties: later input), else
  // from the first paystub with a gross and a frequency, so at least one paystub is always used.
  let latestWithGross: Stub | null = null;
  for (const s of withGross) {
    const day = referenceDay(s);
    if (day !== null && (latestWithGross === null || day >= (referenceDay(latestWithGross) as number))) latestWithGross = s;
  }
  const frequency = latestWithGross?.frequency ?? withGross.find((s) => s.frequency !== null)?.frequency ?? null;
  if (frequency === null) return { checks, duplicates, failure: 'no-frequency', annualization: null };
  const used = withGross.filter((s) => s.frequency === frequency || s.frequency === null);
  const total = used.reduce((a, s) => a + BigInt(s.gross as number), 0n);
  const count = BigInt(used.length);
  const periods = PERIODS_PER_YEAR[frequency];
  return {
    checks,
    duplicates,
    failure: null,
    annualization: {
      annualIncome: roundRatio(total * BigInt(periods), 100n * count),
      method: 'average',
      basis: {
        averageGrossCents: roundRatio(total, count),
        periodsPerYear: periods,
        frequency,
        stubsUsed: used.map((s) => s.index),
      },
    },
  };
}

// ---------- 9. Form W-2 ----------

/** Confirmed values of one Form W-2 (shared/schemas/pointer.w2.json): box 1 is `wages`. */
export interface W2Values {
  readonly taxYear?: number | null | undefined;
  readonly wages?: number | null | undefined;
  readonly federalIncomeTaxWithheld?: number | null | undefined;
  readonly socialSecurityWages?: number | null | undefined;
  readonly medicareWages?: number | null | undefined;
  readonly stateWages?: number | null | undefined;
}

export type W2CheckId = 'w2-medicare-wages' | 'w2-year';

export interface W2Check {
  readonly id: W2CheckId;
  readonly status: CheckStatus;
}

export interface W2Annualization {
  /** Whole currency units, rounded half up. */
  readonly annualIncome: number;
  readonly method: 'w2';
  readonly basis: {
    /** Box 1 of the forms used, summed, in cents. */
    readonly wagesCents: number;
    /** The latest tax year among the forms with wages; null when none has a year. */
    readonly taxYear: number | null;
    readonly formsUsed: readonly number[];
  };
}

export interface W2ValidationResult {
  /** Checks per input form, in input order. */
  readonly checks: readonly (readonly W2Check[])[];
  readonly failure: 'no-wages' | null;
  readonly annualization: W2Annualization | null;
}

const W2_MONEY = ['wages', 'federalIncomeTaxWithheld', 'socialSecurityWages', 'medicareWages', 'stateWages'] as const;

/**
 * Section 9. A W-2's box 1 (wages) is the year's earned income from that employer: nothing is
 * projected. The forms of the latest tax year are summed (one per employer); a form without a year
 * counts with them.
 */
export function validateW2s(rawForms: Raw<readonly W2Values[]>): W2ValidationResult {
  const forms = reveal(rawForms).map((v, index) => {
    if (typeof v !== 'object' || v === null) throw new ValidationInputError('each form must be an object');
    const cents: Partial<Record<(typeof W2_MONEY)[number], number | null>> = {};
    for (const key of W2_MONEY) cents[key] = v[key] === undefined || v[key] === null ? null : toCents(v[key] as number);
    const year = v.taxYear;
    if (year !== undefined && year !== null && (typeof year !== 'number' || !Number.isInteger(year))) throw new ValidationInputError('taxYear must be an integer');
    return { index, wages: cents.wages ?? null, medicareWages: cents.medicareWages ?? null, taxYear: year ?? null };
  });
  const checks = forms.map((f): W2Check[] => [
    // Box 5 (Medicare wages) is box 1 plus pre-tax deductions: it is not less than box 1.
    { id: 'w2-medicare-wages', status: f.wages === null || f.medicareWages === null ? 'skipped' : f.medicareWages >= f.wages ? 'ok' : 'warn' },
    { id: 'w2-year', status: f.taxYear === null ? 'skipped' : f.taxYear >= 2000 && f.taxYear <= 2100 ? 'ok' : 'warn' },
  ]);
  const withWages = forms.filter((f) => f.wages !== null && f.wages > 0);
  if (withWages.length === 0) return { checks, failure: 'no-wages', annualization: null };
  const years = withWages.map((f) => f.taxYear).filter((y): y is number => y !== null);
  const taxYear = years.length > 0 ? Math.max(...years) : null;
  const used = withWages.filter((f) => f.taxYear === null || f.taxYear === taxYear);
  const wagesCents = used.reduce((a, f) => a + (f.wages as number), 0);
  return {
    checks,
    failure: null,
    annualization: {
      annualIncome: roundRatio(BigInt(wagesCents), 100n),
      method: 'w2',
      basis: { wagesCents, taxYear, formsUsed: used.map((f) => f.index) },
    },
  };
}
