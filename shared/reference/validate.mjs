// Reference implementation of validation and annualization of confirmed paystub values.
// Spec: validation/SPEC.md. Zero dependencies, no clock, no time zones. Money in integer cents;
// every ratio in exact BigInt arithmetic.

export const PERIODS_PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const PERIOD_DAYS = { weekly: [7, 7], biweekly: [14, 14], semimonthly: [13, 16], monthly: [28, 31] };
export const DATE_ORDER = { 'us-ca': 'MDY', 'zz-test': 'MDY', kr: 'YMD' };
const FREQUENCIES = Object.keys(PERIODS_PER_YEAR);

/** Thrown for malformed input. Messages never contain values. */
export class ValidationInputError extends Error {}

// ---------- 1. Money ----------

export function toCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ValidationInputError('money values must be finite and non-negative');
  }
  return Math.round(value * 100);
}

/** Exact non-negative num/den rounded to the nearest integer, halves up. */
const roundRatio = (num, den) => Number((2n * num + den) / (2n * den));

// ---------- 2. Dates ----------

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;

/** Days since 1970-01-01, proleptic Gregorian. */
export function dayNumber({ year, month, day }) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const DATE_TEXT = /^([0-9]{1,4})[/.\-]([0-9]{1,2})[/.\-]([0-9]{1,4})$/;

// Month names accepted in dates: English full and abbreviated, Spanish full (ASCII case-insensitive).
const MONTH_NAMES = [
  ['january', 'jan', 'enero'], ['february', 'feb', 'febrero'], ['march', 'mar', 'marzo'], ['april', 'apr', 'abril'],
  ['may', 'mayo'], ['june', 'jun', 'junio'], ['july', 'jul', 'julio'], ['august', 'aug', 'agosto'],
  ['september', 'sept', 'sep', 'septiembre', 'setiembre'], ['october', 'oct', 'octubre'],
  ['november', 'nov', 'noviembre'], ['december', 'dec', 'diciembre'],
];
const MONTH_WORD = MONTH_NAMES.flat().sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).join('|');
const MONTH_FIRST = new RegExp(`^(${MONTH_WORD})\\.? ([0-9]{1,2})(?:st|nd|rd|th)?,? ([0-9]{4})$`, 'i');
const DAY_FIRST = new RegExp(`^([0-9]{1,2})(?:st|nd|rd|th)? (?:de )?(${MONTH_WORD})\\.?,? (?:del? )?([0-9]{4})$`, 'i');
const monthNumber = (word) => MONTH_NAMES.findIndex((names) => names.includes(word.toLowerCase())) + 1;

/** Returns a date, null (looks like a month-name date but is invalid) or undefined (not a month-name date). */
function parseMonthNameDate(text) {
  let m = MONTH_FIRST.exec(text);
  let parts = m ? { month: monthNumber(m[1]), day: Number(m[2]), year: Number(m[3]) } : null;
  if (!parts) {
    m = DAY_FIRST.exec(text);
    if (m) parts = { day: Number(m[1]), month: monthNumber(m[2]), year: Number(m[3]) };
  }
  if (!parts) return undefined;
  const { year, month, day } = parts;
  if (year < 1900 || year > 2099 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function parseDate(text, jurisdiction) {
  const named = parseMonthNameDate(text.trim());
  if (named !== undefined) return named;
  const m = DATE_TEXT.exec(text.trim());
  if (!m) return null;
  const [, a, b, c] = m;
  const order = a.length === 4 ? 'YMD' : DATE_ORDER[jurisdiction];
  if (!order) return null;
  const [ys, ms, ds] = order === 'YMD' ? [a, b, c] : order === 'MDY' ? [c, a, b] : [c, b, a];
  if (ds.length > 2 || ms.length > 2) return null;
  let year;
  if (ys.length === 4) year = Number(ys);
  else if (ys.length === 2) year = 2000 + Number(ys);
  else return null;
  const month = Number(ms);
  const day = Number(ds);
  if (year < 1900 || year > 2099 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

const p2 = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${String(d.year).padStart(4, '0')}-${p2(d.month)}-${p2(d.day)}`;

// ---------- 3. Frequencies ----------

export function frequencyForLength(days) {
  if (days === 7) return 'weekly';
  if (days === 14) return 'biweekly';
  if (days >= 13 && days <= 16) return 'semimonthly';
  if (days >= 28 && days <= 31) return 'monthly';
  return null;
}

function normalize(input, index, jurisdiction) {
  // A field that is null is absent, exactly as if the key were missing.
  const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null));
  const money = (v) => (v === undefined ? null : toCents(v));
  if (values.payFrequency !== undefined && !FREQUENCIES.includes(values.payFrequency)) {
    throw new ValidationInputError('unknown pay frequency');
  }
  if (values.hoursWorked !== undefined && (typeof values.hoursWorked !== 'number' || !Number.isFinite(values.hoursWorked) || values.hoursWorked < 0)) {
    throw new ValidationInputError('hours must be finite and non-negative');
  }
  const date = (t) => (t === undefined ? null : parseDate(t, jurisdiction));
  const periodStart = date(values.periodStart);
  const periodEnd = date(values.periodEnd);
  let frequency = values.payFrequency ?? null;
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

// ---------- 4. Checks ----------

function elapsedMonths(d) {
  const D = daysInMonth(d.year, d.month);
  return { num: BigInt((d.month - 1) * D + d.day), den: BigInt(D) };
}

function checkStub(s, raw) {
  const checks = [];
  const add = (id, status) => checks.push({ id, status });

  if (s.gross !== null && s.net !== null) {
    const diff = Math.abs(s.gross - s.deductions.reduce((a, b) => a + b, 0) - s.net);
    add('net-sum', diff * 100 <= s.gross ? 'ok' : 'warn');
  } else add('net-sum', 'skipped');

  if (s.rate !== null && s.hoursHundredths !== null && s.gross !== null) {
    const product = BigInt(s.rate) * BigInt(s.hoursHundredths);
    const gross = BigInt(s.gross) * 100n;
    // Rate × hours is the regular pay: overtime and other earnings add to it, so gross may be more. Only
    // a product that is above gross (by more than 1 %) cannot be right.
    add('rate-hours', (product - gross) * 100n <= gross ? 'ok' : 'warn');
  } else add('rate-hours', 'skipped');

  if (s.periodStart && s.periodEnd) {
    const length = dayNumber(s.periodEnd) - dayNumber(s.periodStart) + 1;
    if (length < 1) add('period-length', 'warn');
    else if (s.frequency === null || s.frequencyInferred) add('period-length', s.frequency === null ? 'warn' : 'ok');
    else {
      const [lo, hi] = PERIOD_DAYS[s.frequency];
      add('period-length', length >= lo && length <= hi ? 'ok' : 'warn');
    }
  } else add('period-length', 'skipped');

  if (s.payDate && s.periodEnd) add('pay-date', Math.abs(dayNumber(s.payDate) - dayNumber(s.periodEnd)) <= 31 ? 'ok' : 'warn');
  else add('pay-date', 'skipped');

  if (s.ytd !== null && s.gross !== null) add('ytd-gross', s.ytd >= s.gross ? 'ok' : 'warn');
  else add('ytd-gross', 'skipped');

  const ref = s.periodEnd ?? s.payDate;
  if (s.ytd !== null && s.gross !== null && s.gross > 0 && s.frequency !== null && ref) {
    const e = elapsedMonths(ref);
    const p = BigInt(PERIODS_PER_YEAR[s.frequency]);
    const n = (p * e.num + 12n * e.den - 1n) / (12n * e.den);
    const ytd2 = 2n * BigInt(s.ytd);
    const gross = BigInt(s.gross);
    add('ytd-periods', ytd2 >= n * gross && ytd2 <= 3n * n * gross ? 'ok' : 'warn');
  } else add('ytd-periods', 'skipped');

  const dates = [[raw.payDate, s.payDate], [raw.periodStart, s.periodStart], [raw.periodEnd, s.periodEnd]].filter(([t]) => t !== undefined && t !== null);
  add('dates-parsed', dates.length === 0 ? 'skipped' : dates.every(([, d]) => d !== null) ? 'ok' : 'warn');
  return checks;
}

// ---------- 5–6. Several paystubs and annualization ----------

const referenceDay = (s) => {
  const d = s.periodEnd ?? s.payDate;
  return d ? dayNumber(d) : null;
};

/**
 * @param {object[]} values confirmed paystub values (see validation/SPEC.md section 1)
 * @param {string} jurisdiction
 */
export function validatePaystubs(values, jurisdiction) {
  const stubs = values.map((v, i) => normalize(v, i, jurisdiction));
  const checks = stubs.map((s, i) => checkStub(s, values[i]));

  const seen = new Set();
  const duplicates = [];
  const unique = stubs.filter((s) => {
    const key = [s.periodStart, s.periodEnd, s.payDate].map((d) => (d ? isoDate(d) : '-')).join('|') + `|${s.gross ?? '-'}`;
    if (seen.has(key)) {
      duplicates.push(s.index);
      return false;
    }
    seen.add(key);
    return true;
  });

  let reference = null;
  for (const s of unique) {
    const day = referenceDay(s);
    if (day === null) continue;
    if (reference === null || day >= referenceDay(reference)) reference = s;
  }

  if (reference && reference.ytd !== null && reference.ytd > 0) {
    const refDate = reference.periodEnd ?? reference.payDate;
    const e = elapsedMonths(refDate);
    if (e.num >= e.den) {
      return {
        checks,
        duplicates,
        failure: null,
        annualization: {
          annualIncome: roundRatio(BigInt(reference.ytd) * 12n * e.den, 100n * e.num),
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

  const withGross = unique.filter((s) => s.gross !== null);
  if (withGross.length === 0) return { checks, duplicates, failure: 'no-gross', annualization: null };
  let latestWithGross = null;
  for (const s of withGross) {
    const day = referenceDay(s);
    if (day !== null && (latestWithGross === null || day >= referenceDay(latestWithGross))) latestWithGross = s;
  }
  const frequency = latestWithGross?.frequency ?? withGross.find((s) => s.frequency !== null)?.frequency ?? null;
  if (frequency === null) return { checks, duplicates, failure: 'no-frequency', annualization: null };
  const used = withGross.filter((s) => s.frequency === frequency || s.frequency === null);
  const total = used.reduce((a, s) => a + BigInt(s.gross), 0n);
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

const W2_MONEY = ['wages', 'federalIncomeTaxWithheld', 'socialSecurityWages', 'medicareWages', 'stateWages'];

/**
 * validation/SPEC.md section 9. A W-2's box 1 (wages) is the year's earned income from that employer:
 * nothing is projected. The forms of the latest tax year are summed (one per employer); a form without
 * a year counts with them.
 * @param {object[]} values confirmed W-2 values: wages, taxYear, and optionally the other boxes
 */
export function validateW2s(values) {
  const forms = values.map((v, index) => {
    if (typeof v !== 'object' || v === null) throw new ValidationInputError('each form must be an object');
    const out = { index };
    for (const key of W2_MONEY) out[key] = v[key] === undefined || v[key] === null ? null : toCents(v[key]);
    const year = v.taxYear;
    if (year !== undefined && year !== null && (typeof year !== 'number' || !Number.isInteger(year))) throw new ValidationInputError('taxYear must be an integer');
    out.taxYear = year ?? null;
    return out;
  });
  const checks = forms.map((f) => [
    // Box 5 (Medicare wages) is box 1 plus pre-tax deductions: it is not less than box 1.
    { id: 'w2-medicare-wages', status: f.wages === null || f.medicareWages === null ? 'skipped' : f.medicareWages >= f.wages ? 'ok' : 'warn' },
    { id: 'w2-year', status: f.taxYear === null ? 'skipped' : f.taxYear >= 2000 && f.taxYear <= 2100 ? 'ok' : 'warn' },
  ]);
  const withWages = forms.filter((f) => f.wages !== null && f.wages > 0);
  if (withWages.length === 0) return { checks, failure: 'no-wages', annualization: null };
  const years = withWages.map((f) => f.taxYear).filter((y) => y !== null);
  const taxYear = years.length > 0 ? Math.max(...years) : null;
  const used = withWages.filter((f) => f.taxYear === null || f.taxYear === taxYear);
  const wagesCents = used.reduce((a, f) => a + f.wages, 0);
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
