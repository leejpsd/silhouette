// Extraction review: every field next to its highlighted source, confirm or change each one,
// type what was not found, then deterministic checks and annualization (core/validate.ts).
// Confirmed values feed an exact annualIncome into the verdict engine.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Raw } from '../../core/types';
import { parseNumber, readTypedAmount, type PointerSchema } from '../../core/skeleton';
import type { ReviewField, SourceSegment } from '../../core/review';
import { validatePaystubs, type Annualization, type PayFrequency, type PaystubValues, type ValidationResult } from '../../core/validate';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import { useApp } from '../context';
import { dynamicKey, formatMoney, programName, type Locale, type Translate } from '../i18n';
import { PACK } from '../pack';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { InferenceBadge } from '../InferenceBadge';
import { emptyDocument, useDocument } from '../doc/state';
import { BlockActions } from '../design/block';
import { Alert, ArrowRight, Caret, Check, ChevronLeft } from '../design/icons';
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
function Source({ lines, t, tilt = 'small-left' }: { lines: readonly (readonly SourceSegment[])[]; t: Translate; tilt?: 'small-left' | 'small-right' }) {
  if (lines.length === 0) return null;
  return (
    <Paper size="small" tilt={tilt} className="source">
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

/** What decides the yearly income: shown first. The date is the pay date, or the period end without one. */
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
    const months = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number(exact.toFixed(digits)));
    return t('review.basis.ytd', { ytd: money(locale, annual.basis.ytdCents ?? 0), date: annual.basis.referenceDate ?? '', months, amount });
  }
  const used = annual.basis.stubsUsed.map((i) => Math.round((stubs[i]?.grossPay ?? 0) * 100));
  const periods = annual.basis.periodsPerYear ?? 0;
  if (used.length > 1) {
    return t('review.basis.averageMany', { sum: money(locale, used.reduce((a, b) => a + b, 0)), count: used.length, periods, amount });
  }
  return t('review.basis.average', { average: money(locale, used[0] ?? annual.basis.averageGrossCents ?? 0), periods, amount });
}

export function DocumentReviewScreen() {
  const { t, locale, setAnswer } = useApp();
  const { doc, update, reset } = useDocument();
  const initial = useMemo(() => initialRows(doc.extraction?.review ?? null), [doc.extraction]);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [deductions, setDeductions] = useState<DeductionRow[]>(initial.deductions);
  const [editing, setEditing] = useState<string | null>(null);
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

  const check = () => {
    const current = toValues(rows, deductions);
    setResult(validatePaystubs(Raw.of([...doc.confirmedStubs, current]), PACK.jurisdiction));
  };

  const currentIndex = doc.confirmedStubs.length;
  const annual = result?.annualization ?? null;

  // What decides the result first; everything else behind "More values", opened when it needs attention.
  const flagged = new Set((result?.checks[currentIndex] ?? []).filter((c) => c.status === 'warn').flatMap((c) => CHECK_FIELDS[c.id] ?? []));
  const dateField = rows.find((r) => r.name === 'payDate')?.text === '' ? 'periodEnd' : 'payDate';
  const leadOrder = [...LEAD_FIELDS.map((n) => (n === 'payDate' ? dateField : n)), ...rows.map((r) => r.name).filter((n) => flagged.has(n))];
  const leadNames = new Set<string>(leadOrder);
  const leadRows = [...new Set(leadOrder)].flatMap((n) => rows.filter((r) => r.name === n));
  const restRows = rows.filter((r) => !leadNames.has(r.name));
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSeen, setMoreSeen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreId = useId();
  const pendingId = useId();
  const restPending = restRows.some((r) => r.status === 'pending') || deductions.some((d) => d.status === 'pending');
  const moreUnseen = restPending && !moreSeen;
  const needsAttention = deductionProblem !== null || flagged.has('deductions') || (editing !== null && restRows.some((r) => r.name === editing));
  useEffect(() => {
    if (needsAttention) {
      setMoreOpen(true);
      setMoreSeen(true);
    }
  }, [needsAttention]);

  const fieldItem = (row: Row, index: number) => {
    const isEditing = editing === row.name;
    const inputId = `field-${row.name}`;
    const shownValue = () => {
      if (row.text === '') return <span className="not-found">{t('review.notFound')}</span>;
      if (row.kind === 'enum') return t(dynamicKey(`option.payFrequency.${row.text}`));
      // A found value is shown as the document writes it (its currency is the document's).
      return row.text;
    };
    return (
      <li key={row.name} className={`field-row status-${row.status}`} data-testid={`field-${row.name}`} data-status={row.status}>
        <div className="field-head">
          <span className="field-label" id={`${inputId}-label`}>
            {label(row.name)}
          </span>
          {row.status === 'confirmed' && <span className="confirmed">{t('review.confirmed')}</span>}
        </div>
        {isEditing ? (
          <div className="field-edit">
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
                  setDraft(e.target.value);
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
          <>
            <div className="field-body">
              <Source lines={row.source} t={t} tilt={index % 2 === 0 ? 'small-left' : 'small-right'} />
              <p className="field-value" data-testid={`value-${row.name}`}>
                {shownValue()}
                {row.status === 'confirmed' && <Check size={20} />}
              </p>
            </div>
            <div className="button-row compact">
              {row.status === 'pending' && (
                <button
                  type="button"
                  className="outline-button small"
                  aria-label={`${t('review.confirm')}: ${label(row.name)}`}
                  onClick={() => setRow(row.name, { status: 'confirmed' })}
                >
                  {t('review.confirm')}
                </button>
              )}
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
          </>
        )}
      </li>
    );
  };

  const deductionsSection = (
    <section className="deductions" aria-labelledby="deductions-title">
      <h2 id="deductions-title" className="section-heading">
        {label('deductions')}
      </h2>
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
                    const amount = e.target.value;
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
        <ScreenHeading size={50} maxLines={4}>
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
        <ScreenHeading size={50} maxLines={3}>
          {t('review.title')}
        </ScreenHeading>
        {doc.extraction && (
          <InferenceBadge source={doc.extraction.inferenceSource} reason={doc.extraction.reason} ranInCloudBecause={doc.extraction.ranInCloudBecause} />
        )}
      </div>
      <p className="small">{manual ? t('review.manualLead') : t('review.lead')}</p>

      {!manual && pending > 0 && (
        <div className="confirm-all">
          <button
            type="button"
            className="outline-button"
            aria-describedby={pendingId}
            onClick={() => {
              // Nothing is confirmed unseen: the first press shows the values that were folded away.
              if (!moreOpen && moreUnseen) {
                setMoreOpen(true);
                setMoreSeen(true);
                requestAnimationFrame(() => moreButton.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
                return;
              }
              setRows((rs) => rs.map((r) => (r.status === 'pending' ? { ...r, status: 'confirmed' } : r)));
              setDeductions((ds) => ds.map((d) => (d.status === 'pending' ? { ...d, status: 'confirmed' } : d)));
              setResult(null);
            }}
          >
            {t('review.confirmAllCount', { count: pending })}
          </button>
          <p className="small" id={pendingId} role="status">
            {t('review.pending', { count: pending })}
          </p>
        </div>
      )}

      <ul className="fields" data-testid="lead-fields">
        {leadRows.map(fieldItem)}
      </ul>

      {result && (
        <section className="validation" aria-labelledby="checks-title" data-testid="validation">
          <h2 className="section-heading" id="annual-title">
            {t('review.annualTitle')}
          </h2>
          {annual ? (
            <>
              <p className="annual" data-testid="annual-income" data-amount={annual.annualIncome}>
                {formatMoney(locale, annual.annualIncome)}
              </p>
              <p className="basis">{basisText(annual, [...doc.confirmedStubs, toValues(rows, deductions)], locale, t)}</p>
              <p className="small muted">{t('review.stubsCount', { count: doc.confirmedStubs.length + 1 })}</p>
              <Changes amount={annual.annualIncome} />
            </>
          ) : (
            <p className="error" role="alert">
              <Alert />
              {t(dynamicKey(`review.failure.${result.failure ?? 'no-gross'}`))}
            </p>
          )}
          <h2 id="checks-title" className="section-heading">
            {t('review.checksTitle')}
          </h2>
          <ul className="checks">
            {(result.checks[currentIndex] ?? [])
              .filter((c) => c.status !== 'skipped')
              .map((c) => (
                <li key={c.id} className={`check check-${c.status}`} data-check={c.id} data-status={c.status}>
                  {c.status === 'ok' ? <Check size={16} /> : <Alert />}
                  <span>{t(dynamicKey(`check.${c.id}`))}</span>
                  <span className="check-status">{t(c.status === 'ok' ? 'check.status.ok' : 'check.status.warn')}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

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
          <Caret open={moreOpen} />
          {t('review.moreValues', { count: restRows.length + deductions.length })}
        </button>
        <div id={moreId} hidden={!moreOpen}>
          <ul className="fields">{restRows.map(fieldItem)}</ul>
          {deductionsSection}
        </div>
      </div>

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
          <button type="button" className="action" disabled={pending > 0} onClick={check}>
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
      {change.amount !== undefined && change.amount > 0 && <p className="amount pop">{formatMoney(locale, change.amount)}</p>}
    </div>
  );
}
