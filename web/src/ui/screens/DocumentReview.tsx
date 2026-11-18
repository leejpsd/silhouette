// Extraction review: every field next to its highlighted source, confirm or change each one,
// type what was not found, then deterministic checks and annualization (core/validate.ts).
// Confirmed values feed an exact annualIncome into the verdict engine.
import { bringIntoView } from '../design/motion';
import { moneyOnly } from '../design/inputs';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Raw } from '../../core/types';
import { parseNumber, readTypedAmount, type PointerSchema } from '../../core/skeleton';
import type { ReviewField, SourceSegment } from '../../core/review';
import { parseDate, validatePaystubs, type Annualization, type PayFrequency, type PaystubValues, type ValidationResult } from '../../core/validate';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import { useApp } from '../context';
import { dynamicKey, formatMoney, programName, type Locale, type Translate } from '../i18n';
import { NUMBER_FORMAT, PACK } from '../pack';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { InferenceBadge } from '../InferenceBadge';
import { emptyDocument, useDocument } from '../doc/state';
import { BlockActions } from '../design/block';
import { Alert, ArrowRight, Check, ChevronLeft, ChevronRight } from '../design/icons';
import { Marker, Paper, ActionLabel } from '../design/parts';
import { computeVerdicts } from '../quickcheck';
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

const schema = POINTER_SCHEMAS.paystub as unknown as PointerSchema & {
  properties: Record<string, { enum?: string[]; items?: { properties: Record<string, { enum?: string[] }> } }>;
};
const DEDUCTION_KINDS = schema.properties['deductions']?.items?.properties['kind']?.enum ?? [];

/** Text shown for a found value: the highlighted document token when there is one. */
function displayText(field: ReviewField): string {
  const highlighted = field.source.flatMap((line) => line.filter((s) => s.highlight).map((s) => s.text));
  if (field.kind === 'number' && highlighted.length === 1) return highlighted[0] as string;
  return field.value === null ? '' : String(field.value);
}

function initialRows(review: readonly ReviewField[] | null): { rows: Row[]; deductions: DeductionRow[] } {
  const rows: Row[] = [];
  let deductions: DeductionRow[] = [];
  for (const [name, spec] of Object.entries(schema.properties)) {
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

/** The message for a typed number that is refused. */
const typedProblem = (text: string): 'q.error.amountDecimals' | 'review.invalidNumber' | null => {
  const read = readTypedAmount(text);
  return read.ok ? null : read.reason === 'decimals' ? 'q.error.amountDecimals' : 'review.invalidNumber';
};

function toValues(rows: readonly Row[], deductions: readonly DeductionRow[]): PaystubValues {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.status !== 'confirmed' || row.text === '') continue;
    if (row.kind === 'number') out[row.name] = toNumber(row.text, row.typed);
    else out[row.name] = row.text;
  }
  const confirmed = deductions.filter((d) => d.status === 'confirmed' && toNumber(d.amount, d.typed) !== undefined);
  if (confirmed.length > 0) {
    out['deductions'] = confirmed.map((d) => ({ amount: toNumber(d.amount, d.typed) as number, ...(d.kind ? { kind: d.kind } : {}) }));
  }
  if (out['payFrequency'] !== undefined) out['payFrequency'] = out['payFrequency'] as PayFrequency;
  return out as PaystubValues;
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
const MONEY_FIELDS: ReadonlySet<string> = new Set(['grossPay', 'netPay', 'ytdGross', 'hourlyRate']);

/** What decides the yearly income: shown first. The date is the one it is worked out from: the period end, or the pay date without one. */
const LEAD_FIELDS = ['grossPay', 'ytdGross', 'payDate', 'payFrequency'] as const;

/** The values each check compares; a value a check flags is shown with the leading values. */
const CHECK_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'net-sum': ['grossPay', 'netPay', 'deductions'],
  'rate-hours': ['hoursWorked', 'hourlyRate', 'grossPay'],
  'period-length': ['periodStart', 'periodEnd', 'payFrequency'],
  'pay-date': ['payDate', 'periodEnd'],
  'ytd-gross': ['ytdGross', 'grossPay'],
  'ytd-periods': ['ytdGross', 'payDate', 'payFrequency'],
  'dates-parsed': ['payDate', 'periodStart', 'periodEnd'],
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

/**
 * Which date of the reference paystub the year-to-date method used (validation/SPEC.md section 7: the
 * period end if it parses, else the pay date), so the review can say so. Null for the average method.
 */
export function referenceDateSource(annual: Annualization, stubs: readonly PaystubValues[]): 'periodEnd' | 'payDate' | null {
  if (annual.method !== 'ytd') return null;
  const stub = stubs[annual.basis.stubsUsed[0] ?? -1];
  if (!stub) return null;
  return stub.periodEnd !== undefined && parseDate(stub.periodEnd, PACK.jurisdiction) !== null ? 'periodEnd' : 'payDate';
}

export function DocumentReviewScreen() {
  const { t, locale, setAnswer } = useApp();
  const { doc, update, reset } = useDocument();
  const initial = useMemo(() => initialRows(doc.extraction?.review ?? null), [doc.extraction]);
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
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [typeAnyway, setTypeAnyway] = useState(false);
  const manual = doc.extraction === null;
  const nothingFound =
    doc.extraction !== null && doc.extraction.review.every((f) => f.value === null && f.items.length === 0);

  const pending = rows.filter((r) => r.status === 'pending').length + deductions.filter((d) => d.status === 'pending').length;
  const label = (name: string) => t(dynamicKey(`field.paystub.${name}`));
  const setRow = (name: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.name === name ? { ...r, ...patch } : r)));
    setResult(null);
  };

  const save = (row: Row) => {
    const text = draft.trim();
    const problem = row.kind === 'number' && text !== '' ? typedProblem(text) : null;
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
  const checkButton = useRef<HTMLButtonElement>(null);
  const check = () => {
    const current = toValues(rows, deductions);
    setResult(validatePaystubs(Raw.of([...doc.confirmedStubs, current]), PACK.jurisdiction));
    // The button is replaced by the result: focus goes to the yearly income it worked out, and the
    // figure with its arithmetic comes into view (not only the heading at the bottom edge).
    requestAnimationFrame(() => bringIntoView(annualHeading.current?.closest('.validation'), { focus: annualHeading.current }));
  };

  const currentIndex = doc.confirmedStubs.length;
  const annual = result?.annualization ?? null;

  // What decides the result first; everything else behind "More values", opened when it needs attention.
  // Deductions this device did not read (and none added): net pay against them cannot be checked.
  const deductionsUnread = doc.extraction?.deductionsNotRead === true && deductions.length === 0;
  const shownChecks = (result?.checks[currentIndex] ?? []).filter((c) => c.status !== 'skipped' && !(deductionsUnread && c.id === 'net-sum'));
  const flagged = new Set(shownChecks.filter((c) => c.status === 'warn').flatMap((c) => CHECK_FIELDS[c.id] ?? []));
  // The date the yearly income is worked out from (validation/SPEC.md section 7): the period end when
  // it parses, otherwise the pay date. That one is shown with the leading values.
  const periodEndText = rows.find((r) => r.name === 'periodEnd')?.text ?? '';
  const dateField = periodEndText !== '' && parseDate(periodEndText, PACK.jurisdiction) !== null ? 'periodEnd' : 'payDate';
  const leadOrder = [...LEAD_FIELDS.map((n) => (n === 'payDate' ? dateField : n)), ...rows.map((r) => r.name).filter((n) => flagged.has(n))];
  const leadNames = new Set<string>(leadOrder);
  const leadRows = [...new Set(leadOrder)].flatMap((n) => rows.filter((r) => r.name === n));
  const restRows = rows.filter((r) => !leadNames.has(r.name));
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSeen, setMoreSeen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreId = useId();
  const pendingId = useId();
  const [foldNotice, setFoldNotice] = useState(false);
  // "Check these values" needs the values that decide the result; folded values that were never
  // touched stay unconfirmed and are simply not used.
  const leadPending = leadRows.filter((r) => r.status === 'pending').length;
  const restPending = restRows.some((r) => r.status === 'pending') || deductions.some((d) => d.status === 'pending');
  const moreUnseen = restPending && !moreSeen;
  const needsAttention = deductionProblem !== null || flagged.has('deductions') || (editing !== null && restRows.some((r) => r.name === editing));
  useEffect(() => {
    if (needsAttention) {
      setMoreOpen(true);
      setMoreSeen(true);
    }
  }, [needsAttention]);

  const fieldItem = (row: Row) => {
    const isEditing = editing === row.name;
    const inputId = `field-${row.name}`;
    const shownValue = () => {
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
        {label('deductions')}
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
      <p className="small">{manual ? t('review.manualLead') : t('review.lead')}</p>
      {manual && manualHint && nothingTyped && (
        <p className="error" role="alert">
          <Alert />
          {t('review.manualNothing')}
        </p>
      )}

      {!manual && pending > 0 && (
        <div className="confirm-all">
          <button
            type="button"
            className="outline-button"
            aria-describedby={pendingId}
            onClick={() => {
              // Nothing is confirmed unseen: the first press shows the values that were folded away.
              // Nothing is confirmed unseen: the first press opens the folded values and moves focus there,
              // and the status says how many still need a look.
              if (!moreOpen && moreUnseen) {
                setMoreOpen(true);
                setMoreSeen(true);
                setFoldNotice(true);
                requestAnimationFrame(() => moreButton.current?.focus());
                return;
              }
              // The marks run down the list, one after another (styles.css, .fields-card[data-all]).
              const card = document.querySelector<HTMLElement>('.doc-review .fields-card');
              if (card) {
                card.dataset.all = 'true';
                setTimeout(() => delete card.dataset.all, 900);
              }
              setRows((rs) => rs.map((r) => (r.status === 'pending' ? { ...r, status: 'confirmed' } : r)));
              setDeductions((ds) => ds.map((d) => (d.status === 'pending' ? { ...d, status: 'confirmed' } : d)));
              setResult(null);
              setFoldNotice(false);
              // The button goes away: focus moves to the main action, which is now ready.
              requestAnimationFrame(() => checkButton.current?.focus());
            }}
          >
            {t('review.confirmAllCount', { count: pending })}
          </button>
          <p className={foldNotice ? 'small strong' : 'small'} id={pendingId} role="status" data-testid="review-pending">
            {t('review.pending', { count: pending })}
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
              setMoreSeen(true);
            }}
          >
            {t('review.moreValues', { count: restRows.length + deductions.length })}
            <ChevronRight />
          </button>
          <div id={moreId} hidden={!moreOpen}>
            <ul className="fields">{restRows.map(fieldItem)}</ul>
            {deductionsSection}
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
              <p className="basis">{basisText(annual, [...doc.confirmedStubs, toValues(rows, deductions)], locale, t)}</p>
              {(() => {
                const source = referenceDateSource(annual, [...doc.confirmedStubs, toValues(rows, deductions)]);
                return source ? (
                  <p className="small" data-testid="basis-date" data-source={source}>
                    {t(source === 'periodEnd' ? 'review.basis.dateIsPeriodEnd' : 'review.basis.dateIsPayDate')}
                  </p>
                ) : null;
              })()}
              <p className="small muted">{t('review.stubsCount', { count: doc.confirmedStubs.length + 1 })}</p>
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
                setAnswer('income', { kind: 'exact', amount: annual.annualIncome });
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
                  update({ ...emptyDocument(doc.language, [...doc.confirmedStubs, toValues(rows, deductions)]) });
                  navigate({ name: 'doc' });
                }}
              >
                {t('review.addAnother')}
              </button>
            </div>
          </>
        ) : (
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
        )}
      </BlockActions>

    </div>
  );
}

/** Results that would change if this yearly income were used. */
function useChanges(amount: number) {
  const { steps, answers, results } = useApp();
  return useMemo(() => {
    const after = computeVerdicts(PACK, BANDS, steps, { ...answers, income: { kind: 'exact', amount } });
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
