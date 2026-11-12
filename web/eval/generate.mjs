// Deterministic generator of the extraction evaluation set (web/eval/dataset/).
// Every person, employer, landlord, address and number is invented. Seeded PRNG: running this
// twice produces byte-identical files.
//
//   node eval/generate.mjs
//
// Output per document: {id}.txt (the document) and {id}.gold.json (true field values, in the
// form the Rehydrator produces: numbers as numbers, dates as the printed text, names as their
// word tokens joined by single spaces). manifest.json lists every document.
//
// Checks enforced here (the run fails otherwise):
// - gross = Σ earnings lines and net = gross − Σ deductions, in integer cents (paystubs and payslips);
// - every word of a name is masked by the shared reference Skeletonizer (so it is reachable by
//   pointers), and every gold date and amount appears in the document;
// - every gold number and date appears verbatim in the document.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { skeletonize } from '../../shared/reference/silhouette.mjs';

const HERE = new URL('./', import.meta.url);
const OUT = new URL('dataset/', HERE);
const allowlist = (locale) =>
  new Set([
    ...JSON.parse(readFileSync(new URL('../../shared/skeleton/allowlist/en.json', HERE), 'utf8')).words,
    ...JSON.parse(readFileSync(new URL(`../../shared/skeleton/allowlist/${locale}.json`, HERE), 'utf8')).words,
  ]);
const introducers = (locale) =>
  new Set(['en', locale].flatMap((l) => JSON.parse(readFileSync(new URL(`../../shared/skeleton/allowlist/${l}.json`, HERE), 'utf8')).introducers ?? []));
const WORD = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;

// ---------- deterministic helpers ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261112);
const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (list) => list[Math.floor(rng() * list.length)];

/** Cents → "1,234.56" (or "1,234,560" with decimals = 0). */
function money(cents, decimals = 2) {
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals === 2 ? `${grouped}.${frac}` : grouped;
}
const pct = (cents, rate) => Math.round(cents * rate);

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dim = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
function addDays({ y, m, d }, n) {
  let date = { y, m, d };
  for (let i = 0; i < Math.abs(n); i++) {
    if (n > 0) {
      date = date.d < dim(date.y, date.m) ? { ...date, d: date.d + 1 } : date.m < 12 ? { y: date.y, m: date.m + 1, d: 1 } : { y: date.y + 1, m: 1, d: 1 };
    } else {
      date = date.d > 1 ? { ...date, d: date.d - 1 } : date.m > 1 ? { y: date.y, m: date.m - 1, d: dim(date.y, date.m - 1) } : { y: date.y - 1, m: 12, d: 31 };
    }
  }
  return date;
}
const dayOfYear = ({ y, m, d }) => Array.from({ length: m - 1 }, (_, i) => dim(y, i + 1)).reduce((a, b) => a + b, 0) + d;
const p2 = (n) => String(n).padStart(2, '0');
const DATE_FORMATS = {
  mdy: (t) => `${p2(t.m)}/${p2(t.d)}/${t.y}`,
  mdyDash: (t) => `${p2(t.m)}-${p2(t.d)}-${t.y}`,
  mdyShort: (t) => `${p2(t.m)}/${p2(t.d)}/${String(t.y).slice(2)}`,
  iso: (t) => `${t.y}-${p2(t.m)}-${p2(t.d)}`,
  dot: (t) => `${t.y}.${p2(t.m)}.${p2(t.d)}`,
};

const nameText = (printed) => (printed.match(WORD) ?? []).join(' ');
function assertReachable(printed, allow, what) {
  for (const word of printed.match(WORD) ?? []) {
    const lower = word.toLowerCase();
    if (allow.has(lower) || (lower.includes('-') && lower.split('-').every((p) => allow.has(p)))) {
      throw new Error(`${what}: "${word}" is allowlisted, so "${printed}" could not be pointed at`);
    }
  }
}
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

// ---------- invented names ----------

const EMPLOYER_A = ['NORTHWIND', 'BRIGHTWATER', 'CEDARLINE', 'QUILLMARK', 'TALLGRASS', 'IRONBRIDGE', 'SILVERPINE', 'BLUEHARBOR', 'REDMESA', 'STONEFIELD', 'GOLDLEAF', 'OAKCREST', 'WILLOWBY', 'SUNDALE', 'MARIGOLD'];
const EMPLOYER_B = ['STAFFING', 'LOGISTICS', 'FOODS', 'BAKERY', 'CLINIC', 'MOTORS', 'ROOFING', 'PRINTING', 'LAUNDRY', 'GROCERS', 'FREIGHT', 'TEXTILES'];
const EMPLOYER_C = ['LLC', 'INC', 'CORP'];
const FIRST = ['Maria', 'Daniel', 'Aisha', 'Kenji', 'Lucia', 'Omar', 'Grace', 'Tomasz', 'Priya', 'Mateo', 'Hana', 'Samuel', 'Ines', 'Victor', 'Leila', 'Noah', 'Rosa', 'Ethan', 'Mina', 'Felix'];
const LAST = ['Lopez', 'Okafor', 'Brennan', 'Takeda', 'Moreau', 'Haddad', 'Lindqvist', 'Novak', 'Raman', 'Herrera', 'Kowalski', 'Abara', 'Fontaine', 'Delgado', 'Strand'];
const STREETS = ['Juniper', 'Larkspur', 'Hawthorne', 'Mulberry', 'Kestrel', 'Bramble', 'Sycamore', 'Thistle'];
const STREET_TYPES = ['Ave', 'St', 'Rd', 'Blvd'];
const CITIES = ['Riverton', 'Lakemont', 'Fairhaven', 'Brookdale', 'Glenwood', 'Ashford'];
const STATES = ['CA', 'WA', 'AZ', 'TX', 'NV'];
const titleCase = (w) => w[0] + w.slice(1).toLowerCase();

function employer(style) {
  const words = [pick(EMPLOYER_A), pick(EMPLOYER_B), pick(EMPLOYER_C)];
  return style === 'title' ? words.map(titleCase).join(' ') : words.join(' ');
}
const person = () => `${pick(FIRST)} ${pick(LAST)}`;
const address = () => `${int(10, 9899)} ${pick(STREETS)} ${pick(STREET_TYPES)}, ${pick(CITIES)}, ${pick(STATES)} ${int(85001, 99399)}`;

// ---------- paystub data ----------

const FREQ = {
  weekly: { periods: 52, label: { plain: 'Weekly', dash: 'Weekly' } },
  biweekly: { periods: 26, label: { plain: 'Biweekly', dash: 'Bi-Weekly' } },
  semimonthly: { periods: 24, label: { plain: 'Semimonthly', dash: 'Semi-Monthly' } },
  monthly: { periods: 12, label: { plain: 'Monthly', dash: 'Monthly' } },
};

function payPeriod(freq) {
  const y = 2026;
  const m = int(2, 11);
  let start;
  let end;
  if (freq === 'weekly' || freq === 'biweekly') {
    end = { y, m, d: int(1, dim(y, m)) };
    start = addDays(end, freq === 'weekly' ? -6 : -13);
  } else if (freq === 'semimonthly') {
    const firstHalf = rng() < 0.5;
    start = { y, m, d: firstHalf ? 1 : 16 };
    end = { y, m, d: firstHalf ? 15 : dim(y, m) };
  } else {
    start = { y, m, d: 1 };
    end = { y, m, d: dim(y, m) };
  }
  const payDate = addDays(end, int(0, 6));
  const doy = dayOfYear(end);
  const elapsed =
    freq === 'weekly' ? Math.ceil(doy / 7) : freq === 'biweekly' ? Math.ceil(doy / 14) : freq === 'semimonthly' ? (m - 1) * 2 + (end.d <= 15 ? 1 : 2) : m;
  return { start, end, payDate, elapsed };
}

const HOURS = { weekly: [30, 40], biweekly: [64, 80], semimonthly: [70, 88], monthly: [150, 176] };

/**
 * One paystub's numbers. `extra` earnings lines are used by the multi-earnings layout.
 * All amounts are integer cents; hours are hundredths.
 */
function paystubData({ freq, hourly, overtime, extraLines = false, ytd, dedKinds }) {
  const period = payPeriod(freq);
  const lines = [];
  let rate = null;
  let hours = null;
  if (hourly) {
    rate = int(1600, 4500);
    const [lo, hi] = HOURS[freq];
    hours = int(lo * 2, hi * 2) * 50; // .00 or .50
    lines.push({ label: 'Regular', rate, hours, amount: Math.round((rate * hours) / 100) });
    if (overtime) {
      const otRate = Math.round(rate * 1.5);
      const otHours = int(2, 19) * 50;
      lines.push({ label: 'Overtime', rate: otRate, hours: otHours, amount: Math.round((otRate * otHours) / 100) });
    }
    if (extraLines) {
      lines.push({ label: 'Holiday', rate, hours: 800, amount: Math.round((rate * 800) / 100) });
      const diff = int(100, 250);
      const diffHours = int(4, 16) * 100;
      lines.push({ label: 'Shift Differential', rate: diff, hours: diffHours, amount: Math.round((diff * diffHours) / 100) });
    }
  } else {
    const annual = int(32, 96) * 100000; // whole dollars × 1000, in cents
    lines.push({ label: 'Salary', rate: null, hours: null, amount: Math.round(annual / FREQ[freq].periods) });
  }
  const gross = lines.reduce((a, l) => a + l.amount, 0);
  const DED = {
    federal_tax: { label: 'Federal Income Tax', amount: pct(gross, int(80, 120) / 1000) },
    social_security: { label: 'Social Security', amount: pct(gross, 0.062) },
    medicare: { label: 'Medicare', amount: pct(gross, 0.0145) },
    state_tax: { label: 'State Income Tax', amount: pct(gross, int(20, 60) / 1000) },
    health: { label: 'Health Insurance', amount: int(2500, 12000) },
    retirement: { label: 'Retirement Plan', amount: pct(gross, int(3, 6) / 100) },
  };
  const deductions = dedKinds.map((kind) => ({ kind, ...DED[kind] }));
  const dedTotal = deductions.reduce((a, d) => a + d.amount, 0);
  const net = gross - dedTotal;
  if (net <= 0) throw new Error('net must be positive');
  // YTD: this period plus earlier periods within ±5 % of this one.
  const prior = Math.round(gross * (1 + (int(-50, 50) / 1000)));
  const ytdGross = ytd ? gross + prior * (period.elapsed - 1) : null;
  const ytdOf = (cents) => (ytd ? cents + Math.round((cents * prior) / gross) * (period.elapsed - 1) : null);
  return {
    freq,
    period,
    lines: lines.map((l) => ({ ...l, ytd: ytdOf(l.amount) })),
    gross,
    ytdGross,
    deductions: deductions.map((d) => ({ ...d, ytd: ytdOf(d.amount) })),
    dedTotal,
    dedTotalYtd: ytdOf(dedTotal),
    net,
    rate,
    hours,
    hourly,
  };
}

const RATE = (c) => money(c); // rates in dollars with cents
const HRS = (h) => money(h); // hours with 2 decimals, e.g. 62.00

// ---------- the ten English paystub layouts ----------

const LAYOUTS = {
  /** L01 classic: Rate/Hours/Current/YTD columns, deductions Current/YTD. */
  L01: (s) => [
    `${pad(s.employer, 47)}Earnings Statement`,
    `Employee: ${pad(s.employee, 22)} Employee ID: ${s.employeeId}`,
    `Address: ${s.address}`,
    `Pay Period: ${s.fmt(s.d.period.start)} - ${s.fmt(s.d.period.end)}      Pay Date: ${s.fmt(s.d.period.payDate)}`,
    `Pay Frequency: ${FREQ[s.d.freq].label.dash}`,
    '',
    `${pad('Earnings', 18)}${pad('Rate', 10)}${pad('Hours', 10)}${pad('Current', 15)}YTD`,
    ...s.d.lines.map((l) => `${pad(l.label, 18)}${pad(RATE(l.rate), 10)}${pad(HRS(l.hours), 10)}${pad(money(l.amount), 15)}${money(l.ytd)}`),
    `${pad('Gross Pay', 38)}${pad(money(s.d.gross), 15)}${money(s.d.ytdGross)}`,
    '',
    `${pad('Deductions', 38)}${pad('Current', 15)}YTD`,
    ...s.d.deductions.map((d) => `${pad(d.label, 38)}${pad(money(d.amount), 15)}${money(d.ytd)}`),
    `${pad('Net Pay', 38)}${money(s.d.net)}`,
  ],
  /** L02 YTD column first, hours before rate, "Gross Earnings". */
  L02: (s) => [
    `${s.employer}`,
    `EARNINGS STATEMENT                Check Date ${s.fmt(s.d.period.payDate)}`,
    `Name: ${s.employee}         ID ${s.employeeId}`,
    `Period Beginning: ${s.fmt(s.d.period.start)}    Period Ending: ${s.fmt(s.d.period.end)}`,
    `Frequency: ${FREQ[s.d.freq].label.plain}`,
    '',
    `${pad('Description', 16)}${pad('Hours', 9)}${pad('Rate', 9)}${pad('YTD', 14)}Current`,
    ...s.d.lines.map((l) => `${pad(l.label, 16)}${pad(HRS(l.hours), 9)}${pad(RATE(l.rate), 9)}${pad(money(l.ytd), 14)}${money(l.amount)}`),
    `${pad('Gross Earnings', 34)}${pad(money(s.d.ytdGross), 14)}${money(s.d.gross)}`,
    '',
    `${pad('Withholdings', 34)}${pad('YTD', 14)}Current`,
    ...s.d.deductions.map((d) => `${pad(d.label, 34)}${pad(money(d.ytd), 14)}${money(d.amount)}`),
    `${pad('Net Pay', 48)}${money(s.d.net)}`,
  ],
  /** L03 salaried, no YTD, single amount column, "Total Gross". */
  L03: (s) => [
    `${s.employer}`,
    `Pay Stub for ${s.employee}`,
    `Pay Date ${s.fmt(s.d.period.payDate)}   Pay Period ${s.fmt(s.d.period.start)} to ${s.fmt(s.d.period.end)}`,
    `Pay Frequency: ${FREQ[s.d.freq].label.dash}`,
    '',
    `${pad('Earnings', 30)}Amount`,
    ...s.d.lines.map((l) => `${pad(l.label, 30)}${money(l.amount)}`),
    `${pad('Total Gross', 30)}${money(s.d.gross)}`,
    '',
    `${pad('Deductions', 30)}Amount`,
    ...s.d.deductions.map((d) => `${pad(d.label, 30)}${money(d.amount)}`),
    `${pad('Total Deductions', 30)}${money(s.d.dedTotal)}`,
    `${pad('Net Pay', 30)}${money(s.d.net)}`,
  ],
  /** L04 key: value list, dollar signs, no tables. */
  L04: (s) => [
    `Employer: ${s.employer}`,
    `Employee: ${s.employee}`,
    `Employee Number: ${s.employeeId}`,
    `Frequency: ${FREQ[s.d.freq].label.plain}`,
    `Period Start: ${s.fmt(s.d.period.start)}`,
    `Period End: ${s.fmt(s.d.period.end)}`,
    `Pay Date: ${s.fmt(s.d.period.payDate)}`,
    `Hourly Rate: $${RATE(s.d.rate)}`,
    `Regular Hours: ${HRS(s.d.hours)}`,
    `Gross Pay: $${money(s.d.gross)}`,
    ...s.d.deductions.map((d) => `${d.label}: $${money(d.amount)}`),
    `Net Pay: $${money(s.d.net)}`,
    `YTD Gross: $${money(s.d.ytdGross)}`,
  ],
  /** L05 deductions in two columns, YTD gross on the gross line. */
  L05: (s) => {
    const ded = s.d.deductions;
    const rows = [];
    for (let i = 0; i < ded.length; i += 2) {
      const a = ded[i];
      const b = ded[i + 1];
      rows.push(`${pad(a.label, 22)}${pad(money(a.amount), 12)}${b ? `${pad(b.label, 22)}${money(b.amount)}` : ''}`);
    }
    return [
      `${s.employer}                PAYROLL ADVICE`,
      `${s.employee}   Employee ID ${s.employeeId}`,
      `Pay Period ${s.fmt(s.d.period.start)} - ${s.fmt(s.d.period.end)}   Paid ${s.fmt(s.d.period.payDate)}   ${FREQ[s.d.freq].label.dash}`,
      '',
      `${pad('Earnings', 14)}${pad('Hours', 10)}${pad('Rate', 10)}Amount`,
      ...s.d.lines.map((l) => `${pad(l.label, 14)}${pad(HRS(l.hours), 10)}${pad(RATE(l.rate), 10)}${money(l.amount)}`),
      `Gross Pay ${money(s.d.gross)}      YTD Gross ${money(s.d.ytdGross)}`,
      '',
      'Deductions',
      ...rows,
      `Total Deductions ${money(s.d.dedTotal)}`,
      `Net Pay ${money(s.d.net)}`,
    ];
  },
  /** L06 address blocks, check number, direct deposit repeating net pay; salaried with YTD. */
  L06: (s) => [
    `${s.employer}`,
    `${s.employerAddress}`,
    `Phone ${int(200, 989)}-${int(200, 989)}-${int(1000, 9999)}`,
    '',
    `Pay To: ${s.employee}`,
    `${s.address}`,
    '',
    `Check Number ${int(10000, 99999)}     Pay Date ${s.fmt(s.d.period.payDate)}`,
    `Pay Period ${s.fmt(s.d.period.start)} - ${s.fmt(s.d.period.end)}     Pay Frequency ${FREQ[s.d.freq].label.dash}`,
    '',
    `${pad('Earnings', 26)}${pad('This Period', 16)}Year to Date`,
    ...s.d.lines.map((l) => `${pad(l.label, 26)}${pad(money(l.amount), 16)}${money(l.ytd)}`),
    `${pad('Gross Pay', 26)}${pad(money(s.d.gross), 16)}${money(s.d.ytdGross)}`,
    ...s.d.deductions.map((d) => `${pad(d.label, 26)}${pad(money(d.amount), 16)}${money(d.ytd)}`),
    `${pad('Net Pay', 26)}${money(s.d.net)}`,
    '',
    `Direct Deposit Account ending ${int(1000, 9999)}   Amount $${money(s.d.net)}`,
  ],
  /** L07 weekly hourly with four earnings lines, "Total Gross", retirement deduction. */
  L07: (s) => [
    `${s.employer} - Weekly Pay Statement`,
    `Employee ${s.employee} (${s.employeeId})`,
    `Week ${s.fmt(s.d.period.start)} through ${s.fmt(s.d.period.end)}    Pay Date ${s.fmt(s.d.period.payDate)}`,
    `Pay Frequency: ${FREQ[s.d.freq].label.plain}`,
    '',
    `${pad('Type', 20)}${pad('Hours', 9)}${pad('Rate', 9)}${pad('Current', 13)}YTD`,
    ...s.d.lines.map((l) => `${pad(l.label, 20)}${pad(HRS(l.hours), 9)}${pad(RATE(l.rate), 9)}${pad(money(l.amount), 13)}${money(l.ytd)}`),
    `${pad('Total Gross', 38)}${pad(money(s.d.gross), 13)}${money(s.d.ytdGross)}`,
    '',
    ...s.d.deductions.map((d) => `${pad(d.label, 38)}${pad(money(d.amount), 13)}${money(d.ytd)}`),
    `${pad('Net Pay', 38)}${money(s.d.net)}`,
  ],
  /** L08 "Gross Earnings" and "Take Home Pay", separate year-to-date summary. */
  L08: (s) => [
    'PAY STATEMENT',
    `${s.employer}`,
    `${s.employee}                Employee ID ${s.employeeId}`,
    `Pay Date: ${s.fmt(s.d.period.payDate)}   Period: ${s.fmt(s.d.period.start)} - ${s.fmt(s.d.period.end)}   Pay Frequency: ${FREQ[s.d.freq].label.dash}`,
    '',
    ...s.d.lines.map((l) => `${pad(l.label, 16)}${pad(HRS(l.hours), 8)} hours at ${pad(RATE(l.rate), 8)}${money(l.amount)}`),
    `${pad('Gross Earnings', 42)}${money(s.d.gross)}`,
    ...s.d.deductions.map((d) => `${pad(d.label, 42)}${money(d.amount)}`),
    `${pad('Take Home Pay', 42)}${money(s.d.net)}`,
    '',
    'Year to Date',
    `Gross ${money(s.d.ytdGross)}   Deductions ${money(s.d.dedTotalYtd)}   Net ${money(s.d.ytdGross - s.d.dedTotalYtd)}`,
  ],
  /** L09 monthly salaried with YTD, short years. */
  L09: (s) => [
    `${s.employer}`,
    `Monthly Salary Statement`,
    `Employee: ${s.employee}`,
    `Pay Schedule: ${FREQ[s.d.freq].label.plain}    Pay Date: ${s.fmt(s.d.period.payDate)}`,
    `Covers ${s.fmt(s.d.period.start)} - ${s.fmt(s.d.period.end)}`,
    '',
    `${pad('', 28)}${pad('Current', 14)}YTD`,
    ...s.d.lines.map((l) => `${pad(`${l.label}`, 28)}${pad(money(l.amount), 14)}${money(l.ytd)}`),
    `${pad('Gross Pay', 28)}${pad(money(s.d.gross), 14)}${money(s.d.ytdGross)}`,
    ...s.d.deductions.map((d) => `${pad(d.label, 28)}${pad(money(d.amount), 14)}${money(d.ytd)}`),
    `${pad('Net Pay', 28)}${pad(money(s.d.net), 14)}${money(s.d.ytdGross - s.d.dedTotalYtd)}`,
  ],
  /** L10 one table with earnings, deductions (negative) and summary rows; EIN; ISO dates. */
  L10: (s) => [
    `${pad('', 12)}${s.employer}`,
    `${pad('', 12)}EIN ${int(10, 99)}-${int(1000000, 9999999)}`,
    '',
    `Employee ${s.employee}   ID ${s.employeeId}`,
    `Period ${s.fmt(s.d.period.start)} to ${s.fmt(s.d.period.end)}   Paid on ${s.fmt(s.d.period.payDate)}   Pay Frequency: ${FREQ[s.d.freq].label.plain}`,
    '',
    `${pad('Description', 26)}${pad('Hours', 8)}${pad('Rate', 9)}${pad('Current', 13)}YTD`,
    ...s.d.lines.map((l) => `${pad(l.label, 26)}${pad(HRS(l.hours), 8)}${pad(RATE(l.rate), 9)}${pad(money(l.amount), 13)}${money(l.ytd)}`),
    ...s.d.deductions.map((d) => `${pad(d.label, 43)}${pad(`-${money(d.amount)}`, 13)}-${money(d.ytd)}`),
    `${pad('Gross Pay', 43)}${pad(money(s.d.gross), 13)}${money(s.d.ytdGross)}`,
    `${pad('Net Pay', 43)}${money(s.d.net)}`,
  ],
};

/** Per layout: how its paystubs are drawn (frequencies cycle so all four appear). */
const LAYOUT_SPEC = {
  L01: { hourly: true, overtime: true, ytd: true, date: 'mdy', ded: ['federal_tax', 'social_security', 'medicare', 'state_tax'] },
  L02: { hourly: true, overtime: true, ytd: true, date: 'mdyDash', ded: ['federal_tax', 'social_security', 'medicare', 'health'] },
  L03: { hourly: false, ytd: false, date: 'mdyShort', ded: ['federal_tax', 'social_security', 'medicare', 'state_tax', 'health'] },
  L04: { hourly: true, overtime: false, ytd: true, date: 'mdy', ded: ['federal_tax', 'social_security', 'medicare'] },
  L05: { hourly: true, overtime: true, ytd: true, date: 'mdy', ded: ['federal_tax', 'state_tax', 'social_security', 'medicare', 'retirement'] },
  L06: { hourly: false, ytd: true, date: 'mdy', ded: ['federal_tax', 'social_security', 'medicare', 'health', 'retirement'] },
  L07: { hourly: true, overtime: true, extraLines: true, ytd: true, date: 'mdy', ded: ['federal_tax', 'social_security', 'medicare', 'retirement'], freq: ['weekly'] },
  L08: { hourly: true, overtime: true, ytd: true, date: 'mdyDash', ded: ['federal_tax', 'social_security', 'medicare', 'state_tax'] },
  L09: { hourly: false, ytd: true, date: 'mdyShort', ded: ['federal_tax', 'social_security', 'medicare', 'health'], freq: ['monthly'] },
  L10: { hourly: true, overtime: false, ytd: true, date: 'iso', ded: ['federal_tax', 'social_security', 'medicare', 'state_tax', 'health'] },
};

const FREQ_CYCLE = ['weekly', 'biweekly', 'semimonthly', 'monthly'];

function englishPaystub(layout, index, allow) {
  const spec = LAYOUT_SPEC[layout];
  const freq = spec.freq ? spec.freq[0] : FREQ_CYCLE[(index + Number(layout.slice(1))) % 4];
  const d = paystubData({ freq, hourly: spec.hourly, overtime: spec.overtime, extraLines: spec.extraLines, ytd: spec.ytd, dedKinds: spec.ded });
  const s = {
    d,
    employer: employer(rng() < 0.5 ? 'upper' : 'title'),
    employee: person(),
    employeeId: String(int(1000, 99999)).padStart(6, '0'),
    address: address(),
    employerAddress: address(),
    fmt: DATE_FORMATS[spec.date],
  };
  assertReachable(s.employer, allow, `${layout} employer`);
  assertReachable(s.employee, allow, `${layout} employee`);
  const text = LAYOUTS[layout](s).join('\n') + '\n';
  const gold = {
    employerName: nameText(s.employer),
    employeeName: nameText(s.employee),
    payFrequency: d.freq,
    payDate: s.fmt(d.period.payDate),
    periodStart: s.fmt(d.period.start),
    periodEnd: s.fmt(d.period.end),
    grossPay: d.gross / 100,
    netPay: d.net / 100,
    ...(d.ytdGross !== null ? { ytdGross: d.ytdGross / 100 } : {}),
    ...(d.hourly ? { hoursWorked: d.hours / 100, hourlyRate: d.rate / 100 } : {}),
    deductions: d.deductions.map((x) => ({ amount: x.amount / 100, kind: x.kind })),
  };
  return { text, gold, freq };
}

// ---------- Korean payslips (3 layouts) ----------

const KO_COMPANY_A = ['한빛물류', '새솔식품', '다온건설', '푸른제약', '동해물산', '미래정밀'];
const KO_NAMES = ['김지원', '이서연', '박민준', '최유나', '정하늘', '강도윤', '윤가람', '한예린'];
const KO_DEPT = ['운영팀', '생산팀', '영업팀', '물류팀'];

function koreanData() {
  const base = int(180, 380) * 10000;
  const items = [{ label: '기본급', amount: base }];
  if (rng() < 0.7) items.push({ label: '연장근로수당', amount: int(5, 40) * 10000 + int(0, 9) * 1000 });
  items.push({ label: '식대', amount: 200000 });
  if (rng() < 0.3) items.push({ label: '상여금', amount: int(10, 50) * 10000 });
  const gross = items.reduce((a, i) => a + i.amount, 0);
  const tenWon = (x) => Math.floor(x / 10) * 10;
  const incomeTax = tenWon(gross * (int(10, 45) / 1000));
  const health = tenWon(gross * 0.03545);
  const deductions = [
    { label: '소득세', amount: incomeTax },
    { label: '지방소득세', amount: tenWon(incomeTax * 0.1) },
    { label: '국민연금', amount: tenWon(gross * 0.045) },
    { label: '건강보험', amount: health },
    { label: '장기요양보험', amount: tenWon(health * 0.1295) },
    { label: '고용보험', amount: tenWon(gross * 0.009) },
  ];
  const dedTotal = deductions.reduce((a, d) => a + d.amount, 0);
  const m = int(1, 11);
  return { items, gross, deductions, dedTotal, net: gross - dedTotal, month: m, pay: { y: 2026, m: m + 1 > 12 ? 12 : m + 1, d: int(5, 25) } };
}

const won = (amount) => money(amount * 100, 0);

const KO_LAYOUTS = {
  /** K1 sample-like: separate earnings and deductions lists, spelled-out pay date (N-triple). */
  K1: (k) => ({
    lines: [
      '급여명세서',
      `회사명: ${k.company}      귀속 연월: 2026년 ${k.d.month}월`,
      `성명: ${k.name}      사번: ${k.id}      부서: ${k.dept}`,
      `지급일: ${k.d.pay.y}년 ${k.d.pay.m}월 ${k.d.pay.d}일`,
      '',
      `${pad('지급 항목', 22)}금액`,
      ...k.d.items.map((i) => `${pad(i.label, 22)}${won(i.amount)}`),
      `${pad('지급합계', 22)}${won(k.d.gross)}`,
      '',
      `${pad('공제 항목', 22)}금액`,
      ...k.d.deductions.map((x) => `${pad(x.label, 22)}${won(x.amount)}`),
      `${pad('공제합계', 22)}${won(k.d.dedTotal)}`,
      '',
      `${pad('실수령액', 22)}${won(k.d.net)}`,
    ],
    payDate: `${k.d.pay.y}-${k.d.pay.m}-${k.d.pay.d}`,
  }),
  /** K2 side-by-side earnings | deductions, dotted pay date (one DATE token). */
  K2: (k) => {
    const rows = [];
    const n = Math.max(k.d.items.length, k.d.deductions.length);
    for (let i = 0; i < n; i++) {
      const a = k.d.items[i];
      const b = k.d.deductions[i];
      rows.push(`${pad(a ? a.label : '', 12)}${pad(a ? won(a.amount) : '', 14)}${pad(b ? b.label : '', 12)}${b ? won(b.amount) : ''}`);
    }
    return {
      lines: [
        `${k.company}  급여 명세서`,
        `${k.name} (${k.dept})   사번 ${k.id}`,
        `귀속 2026년 ${k.d.month}월   지급일 ${DATE_FORMATS.dot(k.d.pay)}`,
        '',
        `${pad('지급 항목', 12)}${pad('금액', 14)}${pad('공제 항목', 12)}금액`,
        ...rows,
        `${pad('지급총액', 12)}${pad(won(k.d.gross), 14)}${pad('공제총액', 12)}${won(k.d.dedTotal)}`,
        '',
        `실지급액 ${won(k.d.net)}`,
      ],
      payDate: DATE_FORMATS.dot(k.d.pay),
    };
  },
  /** K3 compact "label: amount원" list, ISO pay date, 차인지급액 for net. */
  K3: (k) => ({
    lines: [
      `[${k.company}] 급여 내역`,
      `성명: ${k.name}`,
      `부서: ${k.dept} / 사번: ${k.id}`,
      `지급일: ${DATE_FORMATS.iso(k.d.pay)}`,
      '',
      ...k.d.items.map((i) => `${i.label}: ${won(i.amount)}원`),
      `지급합계: ${won(k.d.gross)}원`,
      ...k.d.deductions.map((x) => `${x.label}: ${won(x.amount)}원`),
      `공제합계: ${won(k.d.dedTotal)}원`,
      `차인지급액: ${won(k.d.net)}원`,
    ],
    payDate: DATE_FORMATS.iso(k.d.pay),
  }),
};

function koreanPayslip(layout, allow) {
  const k = { d: koreanData(), company: `${pick(KO_COMPANY_A)} 주식회사`, name: pick(KO_NAMES), id: String(int(10000, 99999)), dept: pick(KO_DEPT) };
  assertReachable(k.company, allow, `${layout} company`);
  assertReachable(k.name, allow, `${layout} name`);
  const { lines, payDate } = KO_LAYOUTS[layout](k);
  const gold = {
    employerName: nameText(k.company),
    employeeName: nameText(k.name),
    payDate,
    grossPay: k.d.gross,
    netPay: k.d.net,
    deductions: k.d.deductions.map((x) => ({ amount: x.amount })),
  };
  return { text: lines.join('\n') + '\n', gold };
}

// ---------- leases (2 layouts) ----------

const LANDLORD_A = ['Harbor', 'Summit', 'Meadow', 'Granite', 'Copper'];
const LANDLORD_B = ['Pointe', 'Ridge', 'Hollow', 'Crossing', 'Gables'];

function leaseData() {
  const start = { y: 2026, m: int(1, 9), d: 1 };
  const end = addDays({ y: start.y + 1, m: start.m, d: 1 }, -1);
  const rent = int(120, 340) * 1000; // whole dollars in cents
  const deposit = rng() < 0.5 ? rent : Math.round(rent * 1.5);
  const tenants = rng() < 0.5 ? [person()] : [person(), person()];
  return { start, end, rent, deposit, tenants, landlord: `${pick(LANDLORD_A)} ${pick(LANDLORD_B)} Rentals ${pick(EMPLOYER_C)}`, occupants: int(tenants.length, 5), unit: `${int(1, 9)}${pick(['A', 'B', 'C'])}`, address: address() };
}

const LEASE_LAYOUTS = {
  /** E1 labelled fields. */
  E1: (l, fmt) => [
    'RESIDENTIAL LEASE AGREEMENT',
    '',
    `Landlord: ${l.landlord}`,
    `Tenant(s): ${l.tenants.join(' and ')}`,
    `Premises: ${l.address}, Unit ${l.unit}`,
    `Lease Term: begins ${fmt(l.start)} and ends ${fmt(l.end)}`,
    `Monthly Rent: $${money(l.rent)} due on the 1st day of each month`,
    `Security Deposit: $${money(l.deposit)}`,
    `Occupants: ${l.occupants}`,
    `Late Fee: $${money(int(25, 95) * 100)} after the 5th day`,
  ],
  /** E2 numbered clauses with sentences. */
  E2: (l, fmt) => [
    'LEASE',
    '',
    `1. PARTIES. This lease is made between ${l.landlord} (Landlord) and ${l.tenants.join(' and ')} (Tenant).`,
    `2. PREMISES. ${l.address}, Unit ${l.unit}.`,
    `3. TERM. Commencement Date: ${fmt(l.start)}. Expiration Date: ${fmt(l.end)}.`,
    `4. RENT. Tenant shall pay $${money(l.rent)} per month.`,
    `5. DEPOSIT. Tenant has paid a security deposit of $${money(l.deposit)}.`,
    `6. OCCUPANTS. The premises shall be occupied by no more than ${l.occupants} persons.`,
    `7. UTILITIES. Tenant pays electricity; Landlord pays water.`,
  ],
};

function lease(layout, allow) {
  const l = leaseData();
  const fmt = layout === 'E1' ? DATE_FORMATS.mdy : DATE_FORMATS.iso;
  for (const t of l.tenants) assertReachable(t, allow, `${layout} tenant`);
  // "Rentals" and the suffix are not allowlisted; check the whole landlord name.
  assertReachable(l.landlord, allow, `${layout} landlord`);
  const gold = {
    tenantNames: l.tenants.map(nameText).join(' '),
    landlordName: nameText(l.landlord),
    monthlyRent: l.rent / 100,
    deposit: l.deposit / 100,
    leaseStart: fmt(l.start),
    leaseEnd: fmt(l.end),
    occupantCount: l.occupants,
  };
  return { text: LEASE_LAYOUTS[layout](l, fmt).join('\n') + '\n', gold };
}

// ---------- write ----------

function verbatimCheck(id, text, gold) {
  const values = [];
  for (const [k, v] of Object.entries(gold)) {
    if (k === 'deductions') for (const x of v) values.push(x.amount);
    else if (typeof v === 'number' || /Date|period|lease/.test(k)) values.push(v);
  }
  for (const v of values) {
    if (typeof v === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(v) && !text.includes(v) && text.includes('년')) continue; // N-triple
    const printed = typeof v === 'number' ? [money(Math.round(v * 100)), money(Math.round(v * 100), 0), String(v)] : [v];
    if (!printed.some((p) => text.includes(p))) throw new Error(`${id}: gold value ${v} not in the document`);
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const manifest = [];
const write = (id, meta, { text, gold }) => {
  verbatimCheck(id, text, gold);
  writeFileSync(new URL(`${id}.txt`, OUT), text);
  writeFileSync(new URL(`${id}.gold.json`, OUT), JSON.stringify(gold, null, 2) + '\n');
  manifest.push({ id, ...meta });
};

const allowEn = allowlist('en');
for (const layout of Object.keys(LAYOUTS)) {
  for (let i = 0; i < 3; i++) {
    const doc = englishPaystub(layout, i, allowEn);
    write(`en-${layout.toLowerCase()}-${i + 1}`, { docType: 'paystub', language: 'en', layout, frequency: doc.freq }, doc);
  }
}
const allowKo = allowlist('ko');
for (const layout of Object.keys(KO_LAYOUTS)) {
  for (let i = 0; i < 2; i++) write(`ko-${layout.toLowerCase()}-${i + 1}`, { docType: 'paystub', language: 'ko', layout }, koreanPayslip(layout, allowKo));
}
for (const layout of Object.keys(LEASE_LAYOUTS)) {
  for (let i = 0; i < 2; i++) write(`lease-${layout.toLowerCase()}-${i + 1}`, { docType: 'lease', language: 'en', layout }, lease(layout, allowEn));
}
// ---------- L11: names with label words, e-mail and phone, month-name dates, frequency in words ----------

const L11_EMPLOYERS = ['Federal Security Services LLC', 'Gross & Daughters Bakery', 'Net Health Clinic INC', 'Union Pay Systems CORP',
  'State Bank Staffing LLC', 'Regular Rate Freight INC', 'Total Care Medical LLC', 'Direct Deposit Couriers INC'];
const L11_EMPLOYEES = ['Jordan Gross', 'Bill Rate', 'Ana Bank', 'Robin Federal', 'Sam Holiday', 'Pat Sick', 'Lee Union', 'Dana Medical'];
const L11_FREQUENCY_TEXT = { weekly: 'Every week', biweekly: 'Every two weeks', semimonthly: 'Twice a month', monthly: 'Once a month' };
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const monthDate = (abbr) => (t) => `${(abbr ? MONTH_ABBR : MONTH_FULL)[t.m - 1]} ${t.d}, ${t.y}`;

function l11Paystub(i) {
  const freq = FREQ_CYCLE[i % 4];
  const d = paystubData({ freq, hourly: i % 2 === 0, overtime: i % 4 === 0, ytd: true, dedKinds: ['federal_tax', 'social_security', 'medicare', 'state_tax'] });
  const employerName = L11_EMPLOYERS[i];
  const employee = L11_EMPLOYEES[i];
  const fmt = monthDate(i % 3 === 2);
  const slug = employerName.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  const earnings = d.lines.map((l) =>
    d.hourly
      ? `${pad(l.label, 18)}${pad(HRS(l.hours), 9)}${pad(RATE(l.rate), 9)}${pad(money(l.amount), 13)}${money(l.ytd)}`
      : `${pad(l.label, 36)}${pad(money(l.amount), 13)}${money(l.ytd)}`,
  );
  const text = [
    `${employerName}`,
    `Payroll questions: payroll@${slug}.example or (555) ${int(100, 999)}-${int(1000, 9999)}`,
    '',
    `Employee: ${employee}        Employee ID: ${String(int(1000, 99999)).padStart(6, '0')}`,
    `Pay Date: ${fmt(d.period.payDate)}`,
    `Pay Period: ${fmt(d.period.start)} to ${fmt(d.period.end)}`,
    `Pay Frequency: ${L11_FREQUENCY_TEXT[freq]}`,
    '',
    d.hourly ? `${pad('Earnings', 18)}${pad('Hours', 9)}${pad('Rate', 9)}${pad('Current', 13)}YTD` : `${pad('Earnings', 36)}${pad('Current', 13)}YTD`,
    ...earnings,
    `${pad('Gross Pay', 36)}${pad(money(d.gross), 13)}${money(d.ytdGross)}`,
    '',
    ...d.deductions.map((x) => `${pad(x.label, 36)}${pad(money(x.amount), 13)}${money(x.ytd)}`),
    `${pad('Net Pay', 36)}${money(d.net)}`,
  ].join('\n') + '\n';
  const gold = {
    employerName: nameText(employerName),
    employeeName: nameText(employee),
    payFrequency: freq,
    payDate: fmt(d.period.payDate),
    periodStart: fmt(d.period.start),
    periodEnd: fmt(d.period.end),
    grossPay: d.gross / 100,
    netPay: d.net / 100,
    ytdGross: d.ytdGross / 100,
    ...(d.hourly ? { hoursWorked: d.hours / 100, hourlyRate: d.rate / 100 } : {}),
    deductions: d.deductions.map((x) => ({ amount: x.amount / 100, kind: x.kind })),
  };
  return { text, gold, freq };
}

for (let i = 0; i < 8; i++) {
  const doc = l11Paystub(i);
  write(`en-l11-${i + 1}`, { docType: 'paystub', language: 'en', layout: 'L11', frequency: doc.freq }, doc);
}

// Every word of every gold name must be masked by the shared reference Skeletonizer.
for (const entry of manifest) {
  const text = readFileSync(new URL(`${entry.id}.txt`, OUT), 'utf8');
  const gold = JSON.parse(readFileSync(new URL(`${entry.id}.gold.json`, OUT), 'utf8'));
  const { map } = skeletonize(text, allowlist(entry.language), introducers(entry.language));
  const masked = new Set(Object.values(map));
  for (const field of ['employerName', 'employeeName', 'tenantNames', 'landlordName']) {
    if (typeof gold[field] !== 'string') continue;
    for (const word of gold[field].split(' ')) {
      if (!masked.has(word)) throw new Error(`${entry.id}: "${word}" of ${field} is not masked, so it could not be pointed at`);
    }
  }
}

writeFileSync(new URL('manifest.json', OUT), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${manifest.length} documents to eval/dataset/`);
