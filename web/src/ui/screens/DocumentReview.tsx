// Extraction review: every field next to its highlighted source, confirm or change each one,
// type what was not found, then deterministic checks and annualization (core/validate.ts).
// Confirmed values feed an exact annualIncome into the verdict engine.
import { useMemo, useState } from 'react';
import { Raw } from '../../core/types';
import { parseTypedAmount, type PointerSchema } from '../../core/skeleton';
import type { ReviewField, SourceSegment } from '../../core/review';
import { validatePaystubs, type Annualization, type PayFrequency, type PaystubValues, type ValidationResult } from '../../core/validate';
import { POINTER_SCHEMAS } from '../../ai/tasks';
import { useApp } from '../context';
import { dynamicKey, formatNumber, type Locale, type Translate } from '../i18n';
import { PACK } from '../pack';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { InferenceBadge } from '../InferenceBadge';
import { emptyDocument, useDocument } from '../doc/state';

type Kind = ReviewField['kind'];
type Status = 'pending' | 'confirmed' | 'empty';

interface Row {
  readonly name: string;
  readonly kind: Kind;
  readonly options: readonly string[];
  readonly text: string;
  readonly status: Status;
  readonly source: readonly (readonly SourceSegment[])[];
}

interface DeductionRow {
  readonly amount: string;
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

const toNumber = (text: string): number | undefined => parseTypedAmount(text);

function toValues(rows: readonly Row[], deductions: readonly DeductionRow[]): PaystubValues {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.status !== 'confirmed' || row.text === '') continue;
    if (row.kind === 'number') out[row.name] = toNumber(row.text);
    else out[row.name] = row.text;
  }
  const confirmed = deductions.filter((d) => d.status === 'confirmed' && toNumber(d.amount) !== undefined);
  if (confirmed.length > 0) {
    out['deductions'] = confirmed.map((d) => ({ amount: toNumber(d.amount) as number, ...(d.kind ? { kind: d.kind } : {}) }));
  }
  if (out['payFrequency'] !== undefined) out['payFrequency'] = out['payFrequency'] as PayFrequency;
  return out as PaystubValues;
}

function Source({ lines, t }: { lines: readonly (readonly SourceSegment[])[]; t: Translate }) {
  if (lines.length === 0) return null;
  return (
    <div className="source">
      <span className="source-label">{t('review.source')}</span>
      {lines.map((line, i) => (
        <pre key={i} className="source-line">
          {line.map((s, j) => (s.highlight ? <mark key={j}>{s.text}</mark> : <span key={j}>{s.text}</span>))}
        </pre>
      ))}
    </div>
  );
}

const money = (locale: Locale, cents: number) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

/**
 * The "how this was worked out" line. Its figures reproduce the shown result: elapsed months get
 * as many decimals as needed (2 to 6), and several paystubs show their actual sum and count.
 */
export function basisText(annual: Annualization, stubs: readonly PaystubValues[], locale: Locale, t: Translate): string {
  const amount = formatNumber(locale, annual.annualIncome);
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
  const [invalid, setInvalid] = useState(false);
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
    if (row.kind === 'number' && text !== '' && toNumber(text) === undefined) {
      setInvalid(true);
      return;
    }
    setRow(row.name, { text, status: text === '' ? 'empty' : 'confirmed' });
    setEditing(null);
    setInvalid(false);
  };

  const check = () => {
    const current = toValues(rows, deductions);
    setResult(validatePaystubs(Raw.of([...doc.confirmedStubs, current]), PACK.jurisdiction));
  };

  const currentIndex = doc.confirmedStubs.length;
  const annual = result?.annualization ?? null;

  if (nothingFound && !typeAnyway && doc.extraction) {
    return (
      <div className="screen doc-review" data-testid="not-a-document">
        <ScreenHeading>{t('review.notDocument.title')}</ScreenHeading>
        <InferenceBadge source={doc.extraction.inferenceSource} reason={doc.extraction.reason} />
        <p className="lead">{t('review.notDocument.body')}</p>
        <div className="actions">
          <button type="button" className="button primary" onClick={() => setTypeAnyway(true)}>
            {t('review.notDocument.typeIn')}
          </button>
          <a className="button secondary" href={routeHref({ name: 'doc' })}>
            {t('review.notDocument.another')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="screen doc-review">
      <ScreenHeading>{t('review.title')}</ScreenHeading>
      {doc.extraction && <InferenceBadge source={doc.extraction.inferenceSource} reason={doc.extraction.reason} />}
      <p className="lead">{manual ? t('review.manualLead') : t('review.lead')}</p>

      {!manual && pending > 0 && (
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setRows((rs) => rs.map((r) => (r.status === 'pending' ? { ...r, status: 'confirmed' } : r)));
            setDeductions((ds) => ds.map((d) => (d.status === 'pending' ? { ...d, status: 'confirmed' } : d)));
            setResult(null);
          }}
        >
          {t('review.confirmAll')}
        </button>
      )}

      <ul className="fields">
        {rows.map((row) => {
          const isEditing = editing === row.name;
          const inputId = `field-${row.name}`;
          return (
            <li key={row.name} className={`field-row status-${row.status}`} data-testid={`field-${row.name}`} data-status={row.status}>
              <div className="field-head">
                <span className="field-label" id={`${inputId}-label`}>
                  {label(row.name)}
                </span>
                {row.status === 'confirmed' && <span className="confirmed">✓ {t('review.confirmed')}</span>}
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
                        setInvalid(false);
                      }}
                    />
                  )}
                  {invalid && (
                    <p className="error" role="alert">
                      {t('review.invalidNumber')}
                    </p>
                  )}
                  <div className="actions">
                    <button type="button" className="button primary" onClick={() => save(row)}>
                      {t('review.save')}
                    </button>
                    <button type="button" className="button secondary" onClick={() => setEditing(null)}>
                      {t('review.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="field-value" data-testid={`value-${row.name}`}>
                    {row.text === '' ? (
                      <span className="not-found">{t('review.notFound')}</span>
                    ) : row.kind === 'enum' ? (
                      t(dynamicKey(`option.payFrequency.${row.text}`))
                    ) : (
                      row.text
                    )}
                  </p>
                  <Source lines={row.source} t={t} />
                  <div className="actions compact">
                    {row.status === 'pending' && (
                      <button
                        type="button"
                        className="button secondary"
                        aria-label={`${t('review.confirm')}: ${label(row.name)}`}
                        onClick={() => setRow(row.name, { status: 'confirmed' })}
                      >
                        {t('review.confirm')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="button quiet"
                      aria-label={`${t('review.edit')}: ${label(row.name)}`}
                      onClick={() => {
                        setEditing(row.name);
                        setDraft(row.text);
                        setInvalid(false);
                      }}
                    >
                      {t('review.edit')}
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <section className="deductions" aria-labelledby="deductions-title">
        <h2 id="deductions-title">{label('deductions')}</h2>
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
                      setDeductions((ds) => ds.map((x, j) => (j === i ? { ...x, amount, status: 'pending' } : x)));
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
              <Source lines={d.source} t={t} />
              <div className="actions compact">
                {d.status === 'pending' && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      if (toNumber(d.amount) === undefined) return;
                      setDeductions((ds) => ds.map((x, j) => (j === i ? { ...x, status: 'confirmed' } : x)));
                      setResult(null);
                    }}
                  >
                    {t('review.confirm')}
                  </button>
                )}
                {d.status === 'confirmed' && <span className="confirmed">✓ {t('review.confirmed')}</span>}
                <button
                  type="button"
                  className="button quiet"
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
        <button
          type="button"
          className="button quiet"
          onClick={() => setDeductions((ds) => [...ds, { amount: '', kind: '', status: 'pending', source: [] }])}
        >
          {t('review.addDeduction')}
        </button>
      </section>

      {pending > 0 && <p className="meta" role="status">{t('review.pending', { count: pending })}</p>}
      <div className="actions">
        <button type="button" className="button primary" disabled={pending > 0} onClick={check}>
          {t('review.continue')}
        </button>
      </div>

      {result && (
        <section className="validation" aria-labelledby="checks-title" data-testid="validation">
          <h2 id="checks-title">{t('review.checksTitle')}</h2>
          <ul className="checks">
            {(result.checks[currentIndex] ?? [])
              .filter((c) => c.status !== 'skipped')
              .map((c) => (
                <li key={c.id} className={`check check-${c.status}`} data-check={c.id} data-status={c.status}>
                  <span className="check-status">{t(c.status === 'ok' ? 'check.status.ok' : 'check.status.warn')}</span>
                  <span>{t(dynamicKey(`check.${c.id}`))}</span>
                </li>
              ))}
          </ul>
          <h2>{t('review.annualTitle')}</h2>
          {annual ? (
            <>
              <p className="annual" data-testid="annual-income" data-amount={annual.annualIncome}>
                {formatNumber(locale, annual.annualIncome)}
              </p>
              <p className="meta">
                {basisText(annual, [...doc.confirmedStubs, toValues(rows, deductions)], locale, t)}
              </p>
              <p className="meta">{t('review.stubsCount', { count: doc.confirmedStubs.length + 1 })}</p>
              <div className="actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setAnswer('income', { kind: 'exact', amount: annual.annualIncome });
                    reset(false);
                    navigate({ name: 'results' });
                  }}
                >
                  {t('review.useIncome', { amount: formatNumber(locale, annual.annualIncome) })}
                </button>
                <button
                  type="button"
                  className="button secondary"
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
            <p className="error" role="alert">
              {t(dynamicKey(`review.failure.${result.failure ?? 'no-gross'}`))}
            </p>
          )}
        </section>
      )}

      <a className="button quiet back" href={routeHref({ name: doc.skeleton ? 'doc-preview' : 'doc' })}>
        {t('q.back')}
      </a>
    </div>
  );
}
