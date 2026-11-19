// Extraction review: every field next to its highlighted source, confirm or change each one,
// type what was not found, then deterministic checks and annualization (core/validate.ts): a paystub's
// income is projected over the year, a W-2's box 1 is the year's wages (validation/SPEC.md section 9).
// Confirmed values feed an exact annualIncome into the verdict engine.
import { bringIntoView } from '../design/motion';
import { moneyOnly } from '../design/inputs';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Raw } from '../../core/types';
import { parseNumber, readTypedAmount, type PointerSchema } from '../../core/skeleton';
import type { ReviewField, SourceSegment } from '../../core/review';
import {
  parseDate,
  validatePaystubs,
  validateW2s,
  type Annualization,
  type PayFrequency,
  type PaystubValues,
  type ValidationResult,
  type W2Annualization,
  type W2ValidationResult,
  type W2Values,
} from '../../core/validate';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import { useApp } from '../context';
import { dynamicKey, formatMoney, programName, type Locale, type Translate } from '../i18n';
import { NUMBER_FORMAT, PACK } from '../pack';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { InferenceBadge } from '../InferenceBadge';
import { emptyDocument, useDocument, type FlowDocType } from '../doc/state';
import { BlockActions } from '../design/block';
import { Alert, ArrowRight, Check, ChevronLeft, ChevronRight } from '../design/icons';
import { Marker, Paper, ActionLabel } from '../design/parts';
import type { Skeleton } from '../../core/types';
import { computeVerdicts, type DocumentChange, type IncomeBasis, type QuickCheckAnswers } from '../quickcheck';
import { BANDS } from '../pack';

type Kind = ReviewField['kind'];
type Status = 'pending' | 'confirmed' | 'empty';

interface Row {
  readonly name: string;
  readonly kind: Kind;
  readonly options: readonly string[];
  readonly text: string;
  readonly status: Status;
  readonly source: readonly (readonly SourceSegment[])[];
  /** The text was typed by the person (section 5.1 applies), not taken from the document. */
  readonly typed?: boolean;
}

interface DeductionRow {
  readonly amount: string;
  readonly typed?: boolean;
  readonly kind: string;
  readonly status: Status;
  readonly source: readonly (readonly SourceSegment[])[];
}

type ReviewSchema = PointerSchema & {
  properties: Record<string, { enum?: string[]; items?: { properties: Record<string, { enum?: string[] }> } }>;
};
const schemaOf = (docType: FlowDocType) => POINTER_SCHEMAS[docType] as unknown as ReviewSchema;
const DEDUCTION_KINDS = schemaOf('paystub').properties['deductions']?.items?.properties['kind']?.enum ?? [];

/** Text shown for a found value: the highlighted document token when there is one. */
function displayText(field: ReviewField): string {
  const highlighted = field.source.flatMap((line) => line.filter((s) => s.highlight).map((s) => s.text));
  if (field.kind === 'number' && highlighted.length === 1) return highlighted[0] as string;
  return field.value === null ? '' : String(field.value);
}

/**
 * The pointer, with this reading's own answer: the model answered one field with a placeholder id
 * ("grossPay": "N12") and this device put the value back (1,271.88). It arrives in that order: the
 * answer, then the value (styles.css, "The pointer"); with reduced motion both are simply there.
 */
/**
 * One line of the document twice: as the model saw it (the silhouette, placeholders as chips) and as this
 * device shows it (the values, the one put back marked). The model's line is part of what may leave.
 */
function TwoViews({ skeleton, field, refId }: { skeleton: Skeleton | null; field: ReviewField; refId: string }) {
  const { t } = useApp();
  const modelLine = skeleton?.split('\n').find((l) => l.includes(`⟦${refId}⟧`));
  const deviceLine = field.source[0];
  if (!modelLine || !deviceLine) return null;
  // Long runs of spaces (columns) shortened alike in both lines, so they stay comparable and fit.
  const squeeze = (text: string) => text.replace(/ {4,}/g, '   ');
  const parts = squeeze(modelLine.trim()).split(/⟦([NDW][0-9]+)⟧/);
  const deviceParts = deviceLine.map((seg, i, all) => {
    const text = squeeze(i === 0 ? seg.text.trimStart() : i === all.length - 1 ? seg.text.trimEnd() : seg.text);
    return seg.highlight ? <mark key={i}>{text}</mark> : <span key={i}>{text}</span>;
  });
  return (
    <div className="pointer-lines" data-testid="pointer-lines">
      <span className="pointer-label">{t('review.pointer.modelLine')}</span>
      <pre className="pointer-line pointer-line-model" data-testid="pointer-line-model">
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <span key={i} className={`line-tok${part === refId ? ' line-tok-ref' : ''}`}>
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </pre>
      <span className="pointer-label">{t('review.pointer.deviceLine')}</span>
      <pre className="pointer-line" data-testid="pointer-line-device">
        {deviceParts}
      </pre>
    </div>
  );
}

function PointerReveal({ review, source, machine, recordedDate, docType, skeleton }: { review: readonly ReviewField[]; source: string; machine?: string | undefined; recordedDate?: string | undefined; docType: FlowDocType; skeleton: Skeleton | null }) {
  const { t } = useApp();
  if (source !== 'ON_DEVICE' && source !== 'IN_CLOUD' && source !== 'RECORDED' && source !== 'RECORDED_CLOUD') return null;
  const scalar = (f: ReviewField) => f.refs.length === 1 && f.value !== null && /^N[0-9]+$/.test(f.refs[0] as string);
  // The value the yearly income comes from: gross pay on a paystub, box 1 (wages) on a W-2.
  const lead = docType === 'w2' ? 'wages' : 'grossPay';
  const field = review.find((f) => f.name === lead && scalar(f)) ?? review.find((f) => f.kind === 'number' && scalar(f));
  if (!field) return null;
  const ref = field.refs[0] as string;
  const value = displayText(field);
  return (
    <figure className="pointer-reveal" data-testid="pointer-reveal" data-source={source}>
      <div className="pointer-row">
        <div className="pointer-side">
          <span className="pointer-label">{t('review.pointer.said')}</span>
          <code className="pointer-answer" data-testid="pointer-answer">
            &quot;{field.name}&quot;: &quot;<span className="pointer-ref">{ref}</span>&quot;
          </code>
        </div>
        <span className="pointer-arrow" aria-hidden="true">
          <ArrowRight />
        </span>
        <div className="pointer-side">
          <span className="pointer-label">{t('review.pointer.put')}</span>
          <span className="pointer-value" data-testid="pointer-value">
            {value}
          </span>
        </div>
      </div>
      <TwoViews skeleton={skeleton} field={field} refId={ref} />
      <figcaption className="small">
        {source === 'RECORDED'
          ? t('review.pointer.recorded', { machine: machine ?? '', ref, value })
          : source === 'RECORDED_CLOUD'
            ? t('review.pointer.recordedCloud', { date: recordedDate ?? '', ref, value })
          : docType === 'w2'
            ? t(source === 'IN_CLOUD' ? 'review.pointer.cloudW2' : 'review.pointer.deviceW2', { ref, value })
            : t(source === 'IN_CLOUD' ? 'review.pointer.cloud' : 'review.pointer.device', { ref, value })}
      </figcaption>
    </figure>
  );
}

function initialRows(review: readonly ReviewField[] | null, docType: FlowDocType): { rows: Row[]; deductions: DeductionRow[] } {
  const rows: Row[] = [];
  let deductions: DeductionRow[] = [];
  for (const [name, spec] of Object.entries(schemaOf(docType).properties)) {
    const field = review?.find((f) => f.name === name);
    const kind = ((spec as { 'x-kind'?: Kind })['x-kind'] ?? 'text') as Kind;
    if (kind === 'list') {
      deductions = (field?.items ?? []).map((item) => {
        const amountText = item.source.flatMap((l) => l.filter((s) => s.highlight).map((s) => s.text))[0] ?? String(item.value['amount'] ?? '');
        return { amount: amountText, kind: String(item.value['kind'] ?? ''), status: 'pending' as Status, source: item.source };
      });
      continue;
    }
    const text = field ? displayText(field) : '';
    rows.push({ name, kind, options: spec.enum ?? [], text, status: text === '' ? 'empty' : 'pending', source: field?.source ?? [] });
  }
  return { rows, deductions };
}

/**
 * A number on this screen: typed text follows skeleton/SPEC.md section 5.1 (at most two digits after
 * the dot); a value taken from the document follows section 5 (an hourly rate may have more).
 */
const toNumber = (text: string, typed = false): number | undefined => {
  if (!typed) return parseNumber(text.trim());
  const read = readTypedAmount(text);
  return read.ok ? read.value : undefined;
};

/** The message for a typed number that is refused. A tax year is a whole number. */
const typedProblem = (text: string, field?: string): 'q.error.amountDecimals' | 'review.invalidNumber' | null => {
  const read = readTypedAmount(text);
  if (read.ok && field === 'taxYear' && !Number.isInteger(read.value)) return 'review.invalidNumber';
  return read.ok ? null : read.reason === 'decimals' ? 'q.error.amountDecimals' : 'review.invalidNumber';
};

/** The confirmed values, as validation takes them: PaystubValues for a paystub, W2Values for a W-2. */
/**
 * The values the checks and the yearly income are worked out from: the confirmed ones, and, when `found` says
 * so, values the reading found that do not decide the result (folded away, not confirmed): they feed only
 * the checks of the reading (net pay against the deductions, hours times rate). A check that flags one brings
 * it up with the deciding values, to be confirmed.
 */
function toValues(rows: readonly Row[], deductions: readonly DeductionRow[], found: (name: string) => boolean = () => false): PaystubValues & W2Values {
  const out: Record<string, unknown> = {};
  const used = (status: Row['status'], name: string) => status === 'confirmed' || (status === 'pending' && found(name));
  for (const row of rows) {
    if (!used(row.status, row.name) || row.text === '') continue;
    if (row.kind === 'number') out[row.name] = toNumber(row.text, row.typed);
    else out[row.name] = row.text;
    // A tax year is a whole number; anything else is left out (its check is then skipped).
    if (row.name === 'taxYear' && !Number.isInteger(out[row.name])) delete out[row.name];
  }
  const confirmed = deductions.filter((d) => used(d.status, 'deductions') && toNumber(d.amount, d.typed) !== undefined);
  if (confirmed.length > 0) {
    out['deductions'] = confirmed.map((d) => ({ amount: toNumber(d.amount, d.typed) as number, ...(d.kind ? { kind: d.kind } : {}) }));
  }
  if (out['payFrequency'] !== undefined) out['payFrequency'] = out['payFrequency'] as PayFrequency;
  return out as PaystubValues & W2Values;
}

/** Where a value came from: its document line on a paper slip, the value circled. */
function Source({ lines, t }: { lines: readonly (readonly SourceSegment[])[]; t: Translate }) {
  if (lines.length === 0) return null;
  return (
    <Paper size="small" className="source">
      <span className="paper-label source-label">{t('review.source')}</span>
      {lines.map((line, i) => (
        <pre key={i} className="source-line">
          {line.map((s, j) => (s.highlight ? <mark key={j}>{s.text}</mark> : <span key={j}>{s.text}</span>))}
        </pre>
      ))}
    </Paper>
  );
}

const money = (locale: Locale, cents: number) => formatMoney(locale, cents / 100, { cents: true });

/** Fields that are amounts of money (shown in the pack's currency). */
const MONEY_FIELDS: ReadonlySet<string> = new Set(['grossPay', 'netPay', 'ytdGross', 'hourlyRate', 'wages', 'federalIncomeTaxWithheld', 'socialSecurityWages', 'medicareWages', 'stateWages']);

/**
 * What decides the yearly income: shown first. A paystub: the date is the one it is worked out from, the
 * period end, or the pay date without one. A W-2: box 1 and the year it is for.
 */
const LEAD_FIELDS: Readonly<Record<FlowDocType, readonly string[]>> = {
  paystub: ['grossPay', 'ytdGross', 'payDate', 'payFrequency'],
  w2: ['wages', 'taxYear'],
};

/** The values each check compares; a value a check flags is shown with the leading values. */
const CHECK_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'net-sum': ['grossPay', 'netPay', 'deductions'],
  'rate-hours': ['hoursWorked', 'hourlyRate', 'grossPay'],
  'period-length': ['periodStart', 'periodEnd', 'payFrequency'],
  'pay-date': ['payDate', 'periodEnd'],
  'ytd-gross': ['ytdGross', 'grossPay'],
  'ytd-periods': ['ytdGross', 'payDate', 'payFrequency'],
  'dates-parsed': ['payDate', 'periodStart', 'periodEnd'],
  'w2-medicare-wages': ['wages', 'medicareWages'],
  'w2-year': ['taxYear'],
};

/**
 * The "how this was worked out" line. Its figures reproduce the shown result: elapsed months get
 * as many decimals as needed (2 to 6), and several paystubs show their actual sum and count.
 */
export function basisText(annual: Annualization, stubs: readonly PaystubValues[], locale: Locale, t: Translate): string {
  const amount = formatMoney(locale, annual.annualIncome);
  if (annual.method === 'ytd') {
    const ytd = (annual.basis.ytdCents ?? 0) / 100;
    const exact = (annual.basis.elapsedMonths?.numerator ?? 0) / (annual.basis.elapsedMonths?.denominator ?? 1);
    let digits = 2;
    while (digits < 6 && Math.round((ytd / Number(exact.toFixed(digits))) * 12) !== annual.annualIncome) digits++;
    // Written like the amounts beside it (the pack's number format).
    const months = new Intl.NumberFormat(NUMBER_FORMAT ?? locale, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number(exact.toFixed(digits)));
    const iso = annual.basis.referenceDate ?? '';
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : null;
    // Written as a date, not as 2026-10-15, and never broken across lines.
    const date = parsed ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed).replace(/ /g, '\u00A0') : iso;
    return t('review.basis.ytd', { ytd: money(locale, annual.basis.ytdCents ?? 0), date, months, amount });
  }
  const used = annual.basis.stubsUsed.map((i) => Math.round((stubs[i]?.grossPay ?? 0) * 100));
  const periods = annual.basis.periodsPerYear ?? 0;
  if (used.length > 1) {
    return t('review.basis.averageMany', { sum: money(locale, used.reduce((a, b) => a + b, 0)), count: used.length, periods, amount });
  }
  return t('review.basis.average', { average: money(locale, used[0] ?? annual.basis.averageGrossCents ?? 0), periods, amount });
}

/** The W-2 line: box 1 of the year's forms, as they are (nothing is projected). */
export function basisTextW2(annual: W2Annualization, locale: Locale, t: Translate): string {
  const amount = formatMoney(locale, annual.annualIncome);
  const count = annual.basis.formsUsed.length;
  if (annual.basis.taxYear === null) return count > 1 ? t('review.basis.w2ManyNoYear', { count, amount }) : t('review.basis.w2NoYear', { amount });
  const year = String(annual.basis.taxYear);
  return count > 1 ? t('review.basis.w2Many', { count, year, amount }) : t('review.basis.w2', { year, amount });
}

/** The basis kept with a yearly income worked out from paystubs or W-2s, for the results to show. */
export function incomeBasis(annual: Annualization | W2Annualization): IncomeBasis | undefined {
  if (annual.method === 'w2') return { method: 'w2', wagesCents: annual.basis.wagesCents, taxYear: annual.basis.taxYear, forms: annual.basis.formsUsed.length };
  if (annual.method === 'ytd') {
    const months = annual.basis.elapsedMonths;
    if (annual.basis.ytdCents === undefined || !annual.basis.referenceDate || !months) return undefined;
    return { method: 'ytd', ytdCents: annual.basis.ytdCents, referenceDate: annual.basis.referenceDate, monthsNumerator: months.numerator, monthsDenominator: months.denominator };
  }
  if (annual.basis.averageGrossCents === undefined || annual.basis.periodsPerYear === undefined) return undefined;
  return { method: 'average', averageCents: annual.basis.averageGrossCents, periodsPerYear: annual.basis.periodsPerYear };
}

/**
 * Which date of the reference paystub the year-to-date method used (validation/SPEC.md section 7: the
 * period end if it parses, else the pay date), so the review can say so. Null for the average method.
 */
export function referenceDateSource(annual: Annualization | W2Annualization, stubs: readonly PaystubValues[]): 'periodEnd' | 'payDate' | null {
  if (annual.method !== 'ytd') return null;
  const stub = stubs[annual.basis.stubsUsed[0] ?? -1];
  if (!stub) return null;
  return stub.periodEnd !== undefined && parseDate(stub.periodEnd, PACK.jurisdiction) !== null ? 'periodEnd' : 'payDate';
}

export function DocumentReviewScreen() {
  const { t, locale, setAnswer, answers } = useApp();
  const { doc, update, reset } = useDocument();
  const docType = doc.docType;
  const initial = useMemo(() => initialRows(doc.extraction?.review ?? null, docType), [doc.extraction, docType]);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [deductions, setDeductions] = useState<DeductionRow[]>(initial.deductions);
  const [editing, setEditing] = useState<string | null>(null);
  // Changing a value: its field comes into view and takes focus, with the old value selected. When the
  // editing ends, focus goes back to the row, not nowhere.
  const wasEditing = useRef<string | null>(null);
  useEffect(() => {
    const row = (name: string) => document.querySelector<HTMLElement>(`[data-testid="field-${CSS.escape(name)}"]`);
    if (editing !== null) {
      const box = row(editing)?.querySelector<HTMLElement>('.field-edit');
      const field = box?.querySelector<HTMLElement>('input, select');
      bringIntoView(box, { focus: field });
      if (field instanceof HTMLInputElement) field.select();
    } else if (wasEditing.current !== null) {
      row(wasEditing.current)?.querySelector<HTMLElement>('.field-toggle')?.focus({ preventScroll: true });
    }
    wasEditing.current = editing;
  }, [editing]);
  // Rows opened to show where the value was found and Change.
  const [opened, setOpened] = useState<readonly string[]>([]);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState<'q.error.amountDecimals' | 'review.invalidNumber' | null>(null);
  const [deductionProblem, setDeductionProblem] = useState<{ index: number; key: 'q.error.amountDecimals' | 'review.invalidNumber' } | null>(null);
  const [result, setResult] = useState<ValidationResult | W2ValidationResult | null>(null);
  const [typeAnyway, setTypeAnyway] = useState(false);
  const manual = doc.extraction === null;
  const nothingFound =
    doc.extraction !== null && doc.extraction.review.every((f) => f.value === null && f.items.length === 0);

  const pending = rows.filter((r) => r.status === 'pending').length + deductions.filter((d) => d.status === 'pending').length;
  const label = (name: string) => t(dynamicKey(`field.${docType}.${name}`));
  const setRow = (name: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.name === name ? { ...r, ...patch } : r)));
    setResult(null);
  };

  const save = (row: Row) => {
    const text = draft.trim();
    const problem = row.kind === 'number' && text !== '' ? typedProblem(text, row.name) : null;
    if (problem !== null) {
      setInvalid(problem);
      return;
    }
    setRow(row.name, { text, status: text === '' ? 'empty' : 'confirmed', typed: true });
    setEditing(null);
    setInvalid(null);
  };

  // Typing the numbers with nothing typed yet: there is nothing to check.
  const nothingTyped = manual && rows.every((r) => r.text === '') && deductions.length === 0;
  const [manualHint, setManualHint] = useState(false);
  const annualHeading = useRef<HTMLHeadingElement>(null);
  // The values that decide the result (worked out below, before the check can run).
  const leadNamesRef = useRef<ReadonlySet<string>>(new Set());
  const checkButton = useRef<HTMLButtonElement>(null);
  const check = () => {
    // Values found that do not decide the result feed the checks, folded or not (toValues).
    const current = toValues(rows, deductions, (name) => !leadNamesRef.current.has(name));
    setResult(docType === 'w2' ? validateW2s(Raw.of([...doc.confirmedW2s, current])) : validatePaystubs(Raw.of([...doc.confirmedStubs, current]), PACK.jurisdiction));
    // The button is replaced by the result: focus goes to the yearly income it worked out, and the
    // figure with its arithmetic comes into view (not only the heading at the bottom edge).
    requestAnimationFrame(() => bringIntoView(annualHeading.current?.closest('.validation'), { focus: annualHeading.current }));
  };

  const currentIndex = docType === 'w2' ? doc.confirmedW2s.length : doc.confirmedStubs.length;
  const annual = result?.annualization ?? null;
  // What this yearly income would change, kept with the answer so the results can show it.
  const documentChanges = useChanges(annual?.annualIncome ?? 0);

  // What decides the result first; everything else behind "More values", opened when it needs attention.
  // Deductions this device did not read (and none added): net pay against them cannot be checked.
  const deductionsUnread = doc.extraction?.deductionsNotRead === true && deductions.length === 0;
  const shownChecks = (result?.checks[currentIndex] ?? []).filter((c) => c.status !== 'skipped' && !(deductionsUnread && c.id === 'net-sum'));
  const flagged = new Set(shownChecks.filter((c) => c.status === 'warn').flatMap((c) => CHECK_FIELDS[c.id] ?? []));
  // The date the yearly income is worked out from (validation/SPEC.md section 7): the period end when
  // it parses, otherwise the pay date. That one is shown with the leading values.
  const periodEndText = rows.find((r) => r.name === 'periodEnd')?.text ?? '';
  const dateField = periodEndText !== '' && parseDate(periodEndText, PACK.jurisdiction) !== null ? 'periodEnd' : 'payDate';
  const leadOrder = [...LEAD_FIELDS[docType].map((n) => (n === 'payDate' ? dateField : n)), ...rows.map((r) => r.name).filter((n) => flagged.has(n))];
  const leadNames = new Set<string>(leadOrder);
  leadNamesRef.current = leadNames;
  const leadRows = [...new Set(leadOrder)].flatMap((n) => rows.filter((r) => r.name === n));
  const restRows = rows.filter((r) => !leadNames.has(r.name));
  // Fields a reading did not find (typing the numbers looked for nothing, so nothing is "not found").
  const restMissing = manual ? 0 : restRows.filter((r) => r.status === 'empty').length;
  // Only the values that decide the result need the person; the others are folded away as not used for it,
  // and open when one needs attention. Nothing is confirmed unseen.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreId = useId();
  const pendingId = useId();
  const [foldNotice, setFoldNotice] = useState(false);
  // "Check these values" pressed before the deciding values were confirmed: said beside the button.
  const [confirmFirst, setConfirmFirst] = useState(false);
  // "Check these values" needs the values that decide the result; folded values that were never
  // touched stay unconfirmed and are simply not used.
  const leadPending = leadRows.filter((r) => r.status === 'pending').length;
  const needsAttention = deductionProblem !== null || flagged.has('deductions') || (editing !== null && restRows.some((r) => r.name === editing));
  useEffect(() => {
    if (needsAttention) {
      setMoreOpen(true);
    }
  }, [needsAttention]);

  const fieldItem = (row: Row) => {
    const isEditing = editing === row.name;
    const inputId = `field-${row.name}`;
    const shownValue = () => {
      const left = row.text === '' && row.status !== 'confirmed' ? doc.extraction?.leftOut?.find((l) => l.field === row.name) : undefined;
      if (left) {
        return (
          <span className="not-found" data-testid={`left-out-${row.name}`}>
            {t(left.problem === 'not-a-year' ? 'review.leftOut.notAYear' : left.problem === 'not-consistent' ? 'review.leftOut.notConsistent' : 'review.leftOut.notMoney')}
          </span>
        );
      }
      if (row.text === '' && row.status !== 'confirmed' && doc.extraction?.notRead?.includes(row.name)) {
        return (
          <span className="not-found" data-testid={`not-read-${row.name}`}>
            {t('review.fieldNotRead')}
          </span>
        );
      }
      if (row.text === '') return <span className="not-found">{t(manual ? 'review.notTyped' : 'review.notFound')}</span>;
      if (row.kind === 'enum') return t(dynamicKey(`option.payFrequency.${row.text}`));
      // A found value is shown as the document writes it (its currency is the document's).
      return row.text;
    };
    const open = opened.includes(row.name);
    const detailId = `${inputId}-detail`;
    return (
      <li key={row.name} className={`field-row status-${row.status}`} data-testid={`field-${row.name}`} data-status={row.status} data-open={open || isEditing}>
        {/* A compact row: the label and the value in mono (opening it shows the source and Change),
            then the state: an empty ring to confirm, an ink check once confirmed. */}
        <div className="field-line">
          <button
            type="button"
            className="field-toggle"
            aria-expanded={open || isEditing}
            aria-controls={detailId}
            onClick={() => {
              // Typing the numbers: there is no source line to show, so the row opens straight into its field.
              if (manual && !isEditing) {
                setEditing(row.name);
                setDraft(row.text);
                setInvalid(null);
                return;
              }
              setOpened((o) => (o.includes(row.name) ? o.filter((n) => n !== row.name) : [...o, row.name]));
            }}
          >
            <span className="field-label" id={`${inputId}-label`}>
              {label(row.name)}
            </span>
            <span className="field-value" data-testid={`value-${row.name}`}>
              {shownValue()}
            </span>
          </button>
          {row.status === 'pending' ? (
            <button type="button" className="state-mark" aria-label={`${t('review.confirm')}: ${label(row.name)}`} onClick={() => setRow(row.name, { status: 'confirmed' })}>
              <span className="state-ring" aria-hidden="true" />
            </button>
          ) : row.status === 'confirmed' ? (
            <span className="state-mark done" role="img" aria-label={t('review.confirmed')}>
              <Check size={18} />
            </span>
          ) : (
            <span className="state-mark" aria-hidden="true" />
          )}
        </div>
        {isEditing ? (
          <div className="field-edit" id={detailId}>
            {row.kind === 'enum' ? (
              <select id={inputId} className="input" aria-labelledby={`${inputId}-label`} value={draft} onChange={(e) => setDraft(e.target.value)}>
                <option value="">{t('option.none')}</option>
                {row.options.map((o) => (
                  <option key={o} value={o}>
                    {t(dynamicKey(`option.payFrequency.${o}`))}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={inputId}
                className="input"
                aria-labelledby={`${inputId}-label`}
                inputMode={row.kind === 'number' ? 'decimal' : 'text'}
                autoComplete="off"
                aria-invalid={invalid ? true : undefined}
                value={draft}
                onChange={(e) => {
                  setDraft(row.kind === 'number' ? moneyOnly(e.target.value) : e.target.value);
                  setInvalid(null);
                }}
              />
            )}
            {row.kind === 'number' && !invalid && (() => {
              const read = readTypedAmount(draft);
              return read.ok ? (
                <p className="understood" aria-live="polite">
                  <Check size={14} />
                  {t('review.understood', { amount: MONEY_FIELDS.has(row.name) ? formatMoney(locale, read.value) : String(read.value) })}
                </p>
              ) : null;
            })()}
            {invalid && (
              <p className="error" role="alert" data-testid="review-number-error">
                <Alert />
                {t(invalid)}
              </p>
            )}
            <div className="button-row">
              <button type="button" className="small-action" onClick={() => save(row)}>
                {t('review.save')}
              </button>
              <button type="button" className="outline-button" onClick={() => setEditing(null)}>
                {t('review.cancel')}
              </button>
            </div>
          </div>
        ) : (
          open && (
            <div className="field-detail-row" id={detailId}>
              <Source lines={row.source} t={t} />
              <button
                type="button"
                className="text-link"
                aria-label={`${t('review.edit')}: ${label(row.name)}`}
                onClick={() => {
                  setEditing(row.name);
                  setDraft(row.text);
                  setInvalid(null);
                }}
              >
                {t('review.edit')}
              </button>
            </div>
          )
        )}
      </li>
    );
  };

  const deductionsSection = (
    <section className="deductions" aria-labelledby="deductions-title">
      <h2 id="deductions-title" className="section-heading">
        {t('field.paystub.deductions')}
      </h2>
      {deductionsUnread && (
        <p className="small muted" data-testid="deductions-not-read">
          {t('review.deductionsNotRead')}
        </p>
      )}
      <ul className="fields">
        {deductions.map((d, i) => (
          <li key={i} className={`field-row status-${d.status}`} data-testid={`deduction-${i}`} data-status={d.status}>
            <div className="deduction-edit">
              <label>
                <span>{t('field.deduction.amount')}</span>
                <input
                  className="input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={d.amount}
                  onChange={(e) => {
                    const amount = moneyOnly(e.target.value);
                    setDeductions((ds) => ds.map((x, j) => (j === i ? { ...x, amount, status: 'pending', typed: true } : x)));
                    setDeductionProblem(null);
                    setResult(null);
                  }}
                />
              </label>
              <label>
                <span>{t('field.deduction.kind')}</span>
                <select
                  className="input"
                  value={d.kind}
                  onChange={(e) => {
                    const kind = e.target.value;
                    setDeductions((ds) => ds.map((x, j) => (j === i ? { ...x, kind, status: 'pending' } : x)));
                    setResult(null);
                  }}
                >
                  <option value="">{t('option.none')}</option>
                  {DEDUCTION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(dynamicKey(`option.deduction.${k}`))}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {deductionProblem?.index === i && (
              <p className="error" role="alert" data-testid={`deduction-error-${i}`}>
                {t(deductionProblem.key)}
              </p>
            )}
            <Source lines={d.source} t={t} />
            <div className="button-row compact">
              {d.status === 'pending' && (
                <button
                  type="button"
                  className="outline-button small"
                  onClick={() => {
                    const problem = d.typed ? typedProblem(d.amount) : toNumber(d.amount) === undefined ? 'review.invalidNumber' : null;
                    if (problem !== null) return setDeductionProblem({ index: i, key: problem });
                    setDeductionProblem(null);
                    setDeductions((ds) => ds.map((x, j) => (j === i ? { ...x, status: 'confirmed' } : x)));
                    setResult(null);
                  }}
                >
                  {t('review.confirm')}
                </button>
              )}
              {d.status === 'confirmed' && (
                <span className="confirmed">
                  <Check size={16} />
                  {t('review.confirmed')}
                </span>
              )}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setDeductions((ds) => ds.filter((_, j) => j !== i));
                  setResult(null);
                }}
              >
                {t('review.removeDeduction')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="text-link" onClick={() => setDeductions((ds) => [...ds, { amount: '', kind: '', status: 'pending', source: [] }])}>
        {t('review.addDeduction')}
      </button>
    </section>
  );

  if (nothingFound && !typeAnyway && doc.extraction) {
    return (
      <div className="screen doc-review" data-testid="not-a-document">
        <ScreenHeading size={50} wideSize={64} maxLines={4}>
          {t('review.notDocument.title')}
        </ScreenHeading>
        <InferenceBadge source={doc.extraction.inferenceSource} reason={doc.extraction.reason} ranInCloudBecause={doc.extraction.ranInCloudBecause} />
        <p className="lead">{t('review.notDocument.body')}</p>
        <BlockActions>
          <button type="button" className="action" onClick={() => setTypeAnyway(true)}>
            <ActionLabel>{t('review.notDocument.typeIn')}</ActionLabel>
            <span className="action-arrow">
              <ArrowRight />
            </span>
          </button>
          <div className="block-links">
            <a className="text-link" href={routeHref({ name: 'doc' })}>
              {t('review.notDocument.another')}
            </a>
          </div>
        </BlockActions>
      </div>
    );
  }

  return (
    <div className="screen doc-review">
      <a className="text-link back-link" href={routeHref({ name: doc.skeleton ? 'doc-preview' : 'doc' })}>
        <ChevronLeft />
        {t('q.back')}
      </a>
      <div className="stack-8">
        <ScreenHeading size={50} wideSize={64} maxLines={3}>
          {manual ? t('doc.manual') : t('review.title')}
        </ScreenHeading>
        {doc.extraction && (
          <InferenceBadge source={doc.extraction.inferenceSource} reason={doc.extraction.reason} ranInCloudBecause={doc.extraction.ranInCloudBecause} />
        )}
      </div>
      {doc.extraction && <PointerReveal review={doc.extraction.review} source={doc.extraction.inferenceSource} machine={doc.extraction.recording?.machine} recordedDate={doc.extraction.recording?.date} docType={docType} skeleton={doc.skeleton} />}
      <p className="small">{manual ? t('review.manualLead') : t('review.lead')}</p>
      {manual && manualHint && nothingTyped && (
        <p className="error" role="alert">
          <Alert />
          {t('review.manualNothing')}
        </p>
      )}

      {/* The values that decide the result are confirmed with one press: they are all in view. The other
          values are folded away as not used for the result; once opened they can be confirmed together too. */}
      {!manual && (moreOpen ? pending > 0 : leadPending > 0) && (
        <div className="confirm-all">
          <button
            type="button"
            className="outline-button"
            aria-describedby={pendingId}
            onClick={() => {
              // Nothing is confirmed unseen: only the values in view are confirmed.
              setConfirmFirst(false);
              // The marks run down the list, one after another (styles.css, .fields-card[data-all]).
              const card = document.querySelector<HTMLElement>('.doc-review .fields-card');
              if (card) {
                card.dataset.all = 'true';
                setTimeout(() => delete card.dataset.all, 900);
              }
              // Folded: the values in view, which decide the result. Open: every value, all in view.
              const confirmable = new Set(moreOpen ? rows.map((r) => r.name) : leadRows.map((r) => r.name));
              setRows((rs) => rs.map((r) => (r.status === 'pending' && confirmable.has(r.name) ? { ...r, status: 'confirmed' } : r)));
              if (moreOpen) setDeductions((ds) => ds.map((d) => (d.status === 'pending' ? { ...d, status: 'confirmed' } : d)));
              setResult(null);
              setFoldNotice(false);
              // The button goes away: focus moves to the main action, which is now ready.
              requestAnimationFrame(() => checkButton.current?.focus());
            }}
          >
            {moreOpen ? t('review.confirmAllCount', { count: pending }) : t('review.confirmLeadCount', { count: leadPending })}
          </button>
          <p className={foldNotice ? 'small strong' : 'small'} id={pendingId} role="status" data-testid="review-pending">
            {moreOpen ? t('review.pending', { count: pending }) : t('review.pendingLead', { count: leadPending })}
          </p>
        </div>
      )}

      {/* One list: the values that decide the result, then "More values" as its last row. */}
      <div className="fields-card">
        <ul className="fields" data-testid="lead-fields">
          {leadRows.map(fieldItem)}
        </ul>

        <div className="more-values">
          <button
            ref={moreButton}
            type="button"
            className="disclosure more-values-button"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            data-testid="more-values"
            onClick={() => {
              setMoreOpen(!moreOpen);
            }}
          >
            {/* Counted as the button above counts: values found; fields not found are named apart. */}
            {restMissing > 0
              ? t('review.moreValues.notFound', { count: restRows.length - restMissing + deductions.length, missing: restMissing })
              : t('review.moreValues', { count: restRows.length + deductions.length })}
            <ChevronRight />
          </button>
          <div id={moreId} hidden={!moreOpen}>
            <ul className="fields">{restRows.map(fieldItem)}</ul>
            {docType === 'paystub' && deductionsSection}
          </div>
        </div>

      </div>

      {result && (
        <section className="validation" aria-labelledby="checks-title" data-testid="validation">
          <h2 className="section-heading" id="annual-title" ref={annualHeading} tabIndex={-1}>
            {t('review.annualTitle')}
          </h2>
          {annual ? (
            <>
              <p className="annual" data-testid="annual-income" data-amount={annual.annualIncome}>
                {formatMoney(locale, annual.annualIncome)}
              </p>
              <p className="basis" data-testid="basis">
                {annual.method === 'w2' ? basisTextW2(annual, locale, t) : basisText(annual, [...doc.confirmedStubs, toValues(rows, deductions)], locale, t)}
              </p>
              {(() => {
                const source = referenceDateSource(annual, [...doc.confirmedStubs, toValues(rows, deductions)]);
                return source ? (
                  <p className="small" data-testid="basis-date" data-source={source}>
                    {t(source === 'periodEnd' ? 'review.basis.dateIsPeriodEnd' : 'review.basis.dateIsPayDate')}
                  </p>
                ) : null;
              })()}
              {/* A W-2's line already counts its forms. */}
              {docType === 'paystub' && <p className="small muted">{t('review.stubsCount', { count: doc.confirmedStubs.length + 1 })}</p>}
              <Changes amount={annual.annualIncome} />
            </>
          ) : (
            <p className="error" role="alert">
              <Alert />
              {t(dynamicKey(`review.failure.${result.failure ?? 'no-gross'}`))}
            </p>
          )}
          <h2 id="checks-title" className={shownChecks.length > 0 ? 'section-heading' : 'visually-hidden'}>
            {t('review.checksTitle')}
          </h2>
          <ul className="checks">
            {shownChecks.map((c) => (
              <li key={c.id} className={`check check-${c.status}`} data-check={c.id} data-status={c.status}>
                {c.status === 'ok' ? <Check size={16} /> : <Alert />}
                <span>{t(dynamicKey(`check.${c.id}`))}</span>
                <span className="check-status">{t(c.status === 'ok' ? 'check.status.ok' : 'check.status.warn')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BlockActions>
        {annual ? (
          <>
            <ChangePreview amount={annual.annualIncome} />
            <button
              type="button"
              className="action"
              onClick={() => {
                // Read from a paystub or a W-2 (not typed): the results say how it was read, and the basis.
                // Read from a paystub or a W-2 (not typed): the results say how it was read, the basis, what the
                // document answered and what it changed. Wages are money from work: that answer becomes "yes".
                const { filled } = documentAnswers(answers, annual.annualIncome);
                if (filled.includes('hasEarnedIncome')) setAnswer('hasEarnedIncome', 'yes');
                setAnswer(
                  'income',
                  doc.extraction
                    ? { kind: 'exact', amount: annual.annualIncome, from: { paystub: doc.extraction.inferenceSource, basis: incomeBasis(annual), filled, changed: documentChanges } }
                    : { kind: 'exact', amount: annual.annualIncome },
                );
                reset(false);
                navigate({ name: 'results' });
              }}
            >
              <ActionLabel>{t('review.useIncome', { amount: formatMoney(locale, annual.annualIncome) })}</ActionLabel>
              <span className="action-arrow">
                <ArrowRight />
              </span>
            </button>
            <div className="block-links">
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  // Another of the same type: a W-2 from another employer, or another paystub.
                  const values = toValues(rows, deductions);
                  update({ ...(docType === 'w2' ? emptyDocument(doc.language, [], [...doc.confirmedW2s, values]) : emptyDocument(doc.language, [...doc.confirmedStubs, values])) });
                  navigate({ name: 'doc' });
                }}
              >
                {t(docType === 'w2' ? 'review.addAnotherW2' : 'review.addAnother')}
              </button>
            </div>
          </>
        ) : (
          <>
          {confirmFirst && leadPending > 0 && (
            <p className="block-alert" role="alert" data-testid="confirm-first">
              {t('review.confirmFirst')}
            </p>
          )}
          <button
            ref={checkButton}
            type="button"
            className="action"
            data-ready={leadPending === 0 && !nothingTyped}
            aria-describedby={leadPending > 0 ? pendingId : undefined}
            onClick={() => {
              // Not ready: the press is answered. It shows what still needs the person, in view.
              if (leadPending > 0) {
                setFoldNotice(true);
                setConfirmFirst(true);
                const first = document.querySelector<HTMLElement>('.doc-review .field-row[data-status="pending"]');
                bringIntoView(first, { focus: first?.querySelector<HTMLElement>('.state-mark') });
                return;
              }
              if (nothingTyped) {
                setManualHint(true);
                const first = document.querySelector<HTMLElement>('.doc-review .field-row .field-toggle');
                bringIntoView(first, { focus: first });
                return;
              }
              check();
            }}
          >
            <ActionLabel>{t('review.continue')}</ActionLabel>
            <span className="action-arrow">
              <ArrowRight />
            </span>
          </button>
          </>
        )}
      </BlockActions>

    </div>
  );
}

/**
 * What using this document's yearly income would answer: the yearly income, and money from work (wages on a
 * paystub or a W-2 are earned income) when that was not already "yes".
 */
function documentAnswers(answers: QuickCheckAnswers, amount: number): { answers: QuickCheckAnswers; filled: string[] } {
  const earned = answers['hasEarnedIncome'] !== 'yes';
  return {
    answers: { ...answers, income: { kind: 'exact', amount }, ...(earned ? { hasEarnedIncome: 'yes' } : {}) },
    filled: ['annualIncome', ...(earned ? ['hasEarnedIncome'] : [])],
  };
}

/** Results that would change if this yearly income (and money from work) were used. */
function useChanges(amount: number): DocumentChange[] {
  const { steps, answers, results } = useApp();
  return useMemo(() => {
    const after = computeVerdicts(PACK, BANDS, steps, documentAnswers(answers, amount).answers);
    return after.flatMap((a) => {
      const before = results.find((r) => r.programId === a.programId);
      return before && before.verdict !== a.verdict ? [{ programId: a.programId, before: before.verdict, after: a.verdict, amount: a.estimatedAmount }] : [];
    });
  }, [steps, answers, results, amount]);
}

function Changes({ amount }: { amount: number }) {
  const { t, locale } = useApp();
  const changes = useChanges(amount);
  const name = (id: string) => {
    const p = PACK.programs.find((x) => x.id === id);
    return p ? programName(locale, p) : id;
  };
  return (
    <section className="changes" aria-labelledby="changes-title">
      <h3 id="changes-title" className="small strong">
        {t('review.changesTitle')}
      </h3>
      {changes.length === 0 ? (
        <p className="small">{t('review.noChange')}</p>
      ) : (
        <ul className="change-list">
          {changes.map((c) => (
            <li key={c.programId} className="small">
              {t('review.change', { program: name(c.programId), before: t(dynamicKey(`verdict.${c.before}`)), after: t(dynamicKey(`verdict.${c.after}`)) })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** In the block: the first result this income would change, before and after. */
function ChangePreview({ amount }: { amount: number }) {
  const { t, locale } = useApp();
  const change = useChanges(amount)[0];
  if (!change) return null;
  const program = PACK.programs.find((p) => p.id === change.programId);
  return (
    <div className="change-preview" aria-hidden="true">
      <p className="change-line">
        <span className="struck">{t('review.before', { verdict: t(dynamicKey(`verdict.${change.before}`)) })}</span>
        <span className="marker-line">
          <Marker verdict={change.after} />
          {t(dynamicKey(`verdict.${change.after}`))}
        </span>
      </p>
      {program && <p className="change-name">{programName(locale, program)}</p>}
      {change.amount !== undefined && change.amount > 0 && <p className="amount">{formatMoney(locale, change.amount)}</p>}
    </div>
  );
}
