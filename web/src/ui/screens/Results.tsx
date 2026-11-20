// Results: the programs as one list card, each marked by how full its circle is, with its status, and
// linking to its detail. On wide screens the results are two panes: the list (with the paystub card)
// beside a program page, the first program's when none is chosen yet.
import { JudgeNext, onJudgesPath, openSamplePaystub } from '../judges/next';
import { isSampleHousehold } from '../judges/household';
import { useDocument } from '../doc/state';
import { usePaystubReadOnDevice } from '../doc/reads-on-device';
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { leftDevice, outboundState, subscribeOutbound } from '../../data/outbound';
import type { ProgramVerdict } from '../../core/rules';
import { useApp } from '../context';
import { dynamicKey, formatMoney, programName } from '../i18n';
import { BANDS, PACK } from '../pack';
import { payoff } from '../doc-payoff';
import { answersWithoutDocument, computeVerdicts, groupByVerdict, isIncomeAnswer, type IncomeAnswer } from '../quickcheck';
import { incomeBasisLine } from '../income-basis';
import { OPEN_RECORD_EVENT } from '../Chrome';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { MoreHelpLinks } from '../answers/MoreHelpLinks';
import { programCopy } from '../answers/facts';
import { BlockActions, useTwoColumns } from '../design/block';
import { ProgramScreen } from './Program';
import { ArrowRight, ChevronRight, Doc } from '../design/icons';
import { Marker, ActionLabel } from '../design/parts';
import { useOnline } from '../design/online';

/** The results arrive once (markers and rows, one after another); coming back to them later is quiet. */
let arrived = false;
/** The verdict each program was last shown with, so a result that a paystub changed can show the change. */
const lastShown = new Map<string, ProgramVerdict['verdict']>();

/** For tests and "Delete everything": the next results are a first arrival again. */
export function forgetResultsShown(): void {
  arrived = false;
  lastShown.clear();
}

/**
 * #/results. Wide (two columns) and answered: the list beside the first program in the list, as on a
 * program's own page; otherwise the list alone.
 */
export function ResultsRoute() {
  const { answers, results } = useApp();
  const twoColumns = useTwoColumns();
  const first = groupByVerdict(results)[0]?.programs[0]?.programId;
  if (twoColumns && Object.keys(answers).length > 0 && first) {
    return (
      <div className="split" data-testid="results-split">
        <ResultsAside current={first} isPage />
        <ProgramScreen key={first} id={first} inPane />
      </div>
    );
  }
  return <ResultsScreen />;
}

/** How the yearly income in the answers was read from a paystub, when it was (not typed, not a range). */
function useIncomeFrom(): 'ON_DEVICE' | 'IN_CLOUD' | 'RECORDED' | 'RECORDED_CLOUD' | 'SAMPLE_KEY' | undefined {
  const { answers } = useApp();
  const income = answers['income'];
  return isIncomeAnswer(income) && income.kind === 'exact' ? income.from?.paystub : undefined;
}

/**
 * Where the results come from: the rules on this device, and, when the yearly income was read from a
 * paystub, how it was read (on this device, in the cloud from the silhouette, or a recorded reading).
 */
function ResultsSource() {
  const { t, answers, steps } = useApp();
  const sample = isSampleHousehold(steps, answers);
  const income = answers['income'];
  const exact = isIncomeAnswer(income) && income.kind === 'exact' ? (income as Extract<IncomeAnswer, { kind: 'exact' }>) : null;
  const basis = exact?.from?.basis;
  const sentSomething = useSyncExternalStore(subscribeOutbound, () => leftDevice(outboundState().entries).length > 0, () => false);
  const from = useIncomeFrom();
  // Read from a W-2: the wages of a past tax year, said so with the year.
  const w2 = basis?.method === 'w2' ? basis : null;
  return (
    <div className="badge-line" data-testid="results-source" data-income-from={from ?? ''}>
      <strong className={`badge ${from ? 'badge-paystub' : 'badge-none'}`}>{t(from ? (w2 ? 'badge.rulesAndW2' : 'badge.rulesAndPaystub') : 'badge.rulesOnly')}</strong>
      <p className="small muted" data-testid="results-lead">
        {sentSomething ? t('results.leadAfterSend') : t('results.lead')}
      </p>
      {sample && <SampleHousehold />}
      {from && exact && <DocumentEffect amount={exact.amount} from={from} />}
    </div>
  );
}

/**
 * The results are for the prepared, invented household (judges' path, "Try with a sample paystub"): said
 * first, with a way to see and change its answers and a way to start with one's own.
 */
function SampleHousehold() {
  const { t, steps, resetAnswers } = useApp();
  return (
    <section className="sample-household" data-testid="sample-household" aria-labelledby="sample-household-title">
      <h2 className="doc-effect-title" id="sample-household-title">
        {t('results.sample.title')}
      </h2>
      <p className="small">{t('results.sample.lead')}</p>
      <div className="sample-household-actions">
        <button type="button" className="text-link" onClick={() => navigate({ name: 'question', id: steps[0]?.id ?? 'income', then: { name: 'results' } })}>
          {t('results.sample.see')}
        </button>
        <button
          type="button"
          className="text-link"
          onClick={() => {
            resetAnswers();
            navigate({ name: 'question', id: steps[0]?.id ?? 'income', then: null });
          }}
        >
          {t('results.sample.own')}
        </button>
      </div>
    </section>
  );
}

/**
 * What the paystub or W-2 changed, first on the results: how it was read, the yearly income, the questions it
 * answered and the results it changed; how the income was worked out behind a disclosure; and who decided.
 */
function DocumentEffect({ amount, from }: { amount: number; from: NonNullable<ReturnType<typeof useIncomeFrom>> }) {
  const { t, locale, steps, answers } = useApp();
  const income = answers['income'] as Extract<IncomeAnswer, { kind: 'exact' }>;
  const basis = income.from?.basis;
  const w2 = basis?.method === 'w2' ? basis : null;
  const filled = income.from?.filled ?? ['annualIncome'];
  const changed = income.from?.changed;
  return (
    <section className="doc-effect" data-testid="doc-effect" aria-labelledby="doc-effect-title">
      <h2 className="doc-effect-title" id="doc-effect-title">
        {t(w2 ? 'results.docEffect.titleW2' : 'results.docEffect.titlePaystub')}
      </h2>
      <p className="small income-from" data-testid="income-from">
        {t(w2 ? 'results.incomeFromW2.lead' : 'results.incomeFrom.lead', { how: t(dynamicKey(`results.incomeFrom.${from}`)) })}
      </p>
      <p className="doc-effect-amount" data-testid="doc-effect-amount">
        {formatMoney(locale, amount)} <span className="small">{t('results.docEffect.year')}</span>
      </p>
      <DocumentPayoff filled={filled} />
      <p className="small" data-testid="doc-filled">
        {t('results.docEffect.filled', { count: filled.length, list: filled.map((v) => t(dynamicKey(`variable.${v}`))).join(', ') })}
      </p>
      {changed && changed.length > 0 && (
        <p className="small strong" data-testid="doc-changes" data-count={changed.length}>
          {t('results.docEffect.changed', { count: changed.length })}
        </p>
      )}
      {changed && changed.length === 0 && (
        <p className="small muted" data-testid="doc-no-change">
          {t('results.docEffect.none')}
        </p>
      )}
      {basis && (
        <details className="income-basis" data-testid="income-basis" data-method={basis.method}>
          <summary className="small strong">{t('results.docEffect.how')}</summary>
          <p className="small">{incomeBasisLine(t, locale, amount, basis)}</p>
          <p className="small muted" data-testid="income-basis-note">
            {w2 ? (w2.taxYear === null ? t('results.incomeBasis.w2NoteNoYear') : t('results.incomeBasis.w2Note', { year: String(w2.taxYear) })) : t('results.incomeBasis.note')}{' '}
            <button
              type="button"
              className="text-link inline"
              onClick={() => navigate({ name: 'question', id: steps.find((s) => s.kind === 'income')?.id ?? 'income', then: { name: 'results' } })}
            >
              {t('results.incomeBasis.change')}
            </button>
          </p>
        </details>
      )}
      <p className="small muted who-decided" data-testid="who-decided">
        {t(w2 ? 'results.whoDecided.w2' : 'results.whoDecided.paystub')}
      </p>
    </section>
  );
}

/**
 * What the document changed, as amounts (contract v1.44): the results without and with it, both worked out
 * by the rules on this device (without: the answers it replaced put back), then the yearly sums now. Shown
 * only when the answers it replaced were kept with it; nothing is assumed about a "without" not computed.
 */
function DocumentPayoff({ filled }: { filled: readonly string[] }) {
  const { t, locale, steps, answers, results } = useApp();
  const income = answers['income'] as Extract<IncomeAnswer, { kind: 'exact' }>;
  const before = income.from?.before;
  if (!before) return null;
  const without = payoff(computeVerdicts(PACK, BANDS, steps, answersWithoutDocument(answers, filled, before)), PACK);
  const now = payoff(results, PACK);
  return (
    <div className="doc-payoff" data-testid="doc-payoff">
      <div className="doc-compare" role="table" aria-label={t('results.docEffect.titlePaystub')}>
        <div className="doc-compare-row doc-compare-head" role="row">
          <span role="columnheader" />
          <span role="columnheader">{t('results.docEffect.withoutLabel')}</span>
          <span role="columnheader">{t('results.docEffect.withLabel')}</span>
        </div>
        {(
          [
            ['may', 'results.docEffect.rowMay', without.may, now.may],
            ['amount', 'results.docEffect.rowAmount', without.withAmount, now.withAmount],
          ] as const
        ).map(([id, key, a, b]) => (
          <div key={id} className="doc-compare-row" role="row" data-testid={`doc-compare-${id}`} data-without={a} data-with={b}>
            <span role="rowheader">{t(key)}</span>
            <span role="cell" className="doc-compare-was">
              {a}
            </span>
            <span role="cell" className="doc-compare-now" data-up={b > a}>
              {b}
            </span>
          </div>
        ))}
      </div>
      {now.total > 0 && (
        <>
          <p className="doc-total" data-testid="doc-total" data-total={now.total} data-up-to={now.upTo}>
            {now.upTo > 0
              ? t('results.docEffect.totalUpTo', { amount: formatMoney(locale, now.total), upTo: formatMoney(locale, now.upTo) })
              : t('results.docEffect.total', { amount: formatMoney(locale, now.total) })}
          </p>
          <p className="small muted">{t('results.docEffect.totalNote')}</p>
        </>
      )}
    </div>
  );
}

export function ResultsScreen() {
  const { t, locale, steps, answers } = useApp();
  const online = useOnline();
  const answered = Object.keys(answers).length > 0;
  const [judges] = useState(onJudgesPath);
  const { update } = useDocument();
  const incomeFrom = useIncomeFrom();

  // The screen's main action, in the block: a paystub turns a possible result into a clearer one.
  const addPaystub = (
    <BlockActions>
      {/* Wide screens: the action stands in a card under the list, with why a paystub helps. */}
      <span className="sharpen-icon wide-only" aria-hidden="true">
        <Doc />
      </span>
      <p className="sharpen-text wide-only">
        <strong>{t('results.sharpen')}</strong>
        <SharpenHelp />
      </p>
      {judges ? (
        // On the judges' path the next step is the main action: the sample paystub read by a model, or,
        // once its income is in the results, what left the device.
        <button
          type="button"
          className="action"
          onClick={() => (incomeFrom ? window.dispatchEvent(new Event(OPEN_RECORD_EVENT)) : openSamplePaystub(update))}
          data-testid="judge-primary"
        >
          <ActionLabel>{t(incomeFrom ? 'judges.step3.button' : 'judges.step1.button')}</ActionLabel>
          <span className="action-arrow">
            <ArrowRight />
          </span>
        </button>
      ) : (
        <a className="action" href={routeHref({ name: 'doc' })}>
          <ActionLabel>{t('results.addDocumentW2')}</ActionLabel>
          <span className="action-arrow">
            <ArrowRight />
          </span>
        </a>
      )}
    </BlockActions>
  );
  const editAnswers = (
    <button type="button" className="text-link" onClick={() => navigate({ name: 'question', id: steps[0]?.id ?? 'income', then: null })}>
      {t('results.edit')}
    </button>
  );

  if (!answered) {
    return (
      <div className="screen results">
        <ScreenHeading size={54} wideSize={64} maxLines={2}>
          {t('results.title')}
        </ScreenHeading>
        <p className="marker-line">
          <Marker verdict="unanswered" />
          {t('results.notAnswered')}
        </p>
        <p className="big-note">{t('results.empty')}</p>
        <ul className="program-rows faded">
          {PACK.programs.map((p) => (
            <li key={p.id}>
              <Marker verdict="unanswered" />
              <span>{programName(locale, p)}</span>
            </li>
          ))}
        </ul>
        <BlockActions>
          <button type="button" className="action" onClick={() => navigate({ name: 'question', id: steps[0]?.id ?? 'income', then: null })}>
            <ActionLabel>{t('start.begin')}</ActionLabel>
            <span className="action-arrow">
              <ArrowRight />
            </span>
          </button>
        </BlockActions>
      </div>
    );
  }

  return (
    <div className="screen results">
      <div className="results-main">
        <div className="stack-8">
          <ScreenHeading size={54} wideSize={64} maxLines={2} leading="tight">
            {t('results.title')}
          </ScreenHeading>
          <ResultsSource />
        </div>
        {!online && (
          <p className="dashed-note" role="status">
            {t('state.offline')}
          </p>
        )}
        <ResultGroups />
        <JudgeNext step={incomeFrom ? 3 : 1} />
        {addPaystub}
        <div className="results-actions">{editAnswers}</div>
      </div>
      <MoreHelpLinks />
    </div>
  );
}

/**
 * The programs as one list card, in verdict order: each row has its marker, the program's name, its
 * status as the subline (on wide screens the program's summary, with the status at the right) and a
 * chevron. `current`: the program shown beside the list (wide screens).
 */
export function ResultGroups({ current }: { current?: string }) {
  const { t, locale, steps, answers, results } = useApp();
  const groups = groupByVerdict(results);
  const answered = Object.keys(answers).length > 0;
  const nothingFits = answered && results.length > 0 && results.every((r) => r.verdict === 'unlikely');
  const [arriving] = useState(() => answered && !arrived && current === undefined);
  useEffect(() => {
    if (answered) arrived = true;
  }, [answered]);
  let order = 0;
  return (
    <>
      {nothingFits && (
        <section className="notice-card" aria-label={t('results.none')}>
          <p className="card-headline">{t('results.none')}</p>
          <p className="small">{t('results.noneHelp')}</p>
          <div className="card-actions">
            <button type="button" className="text-link" onClick={() => navigate({ name: 'question', id: steps[0]?.id ?? 'income', then: null })}>
              {t('results.edit')}
            </button>
          </div>
        </section>
      )}
      <ul className="programs" aria-label={t('results.title')} data-arrive={arriving ? 'true' : undefined}>
        {groups.flatMap((group) =>
          group.programs.map((r) => {
            const program = PACK.programs.find((p) => p.id === r.programId);
            return (
              <ProgramRow
                key={r.programId}
                result={r}
                name={program ? programName(locale, program) : r.programId}
                summary={program ? programCopy(locale, program).summary : undefined}
                current={current === r.programId}
                order={order++}
              />
            );
          }),
        )}
      </ul>
    </>
  );
}

/**
 * The results pane beside a program on wide screens: the title, where the results come from, the list,
 * one paystub card (the judges' next step on their path, otherwise why a paystub helps) and the way back
 * to the answers.
 */
export function ResultsAside({ current, isPage = false }: { current: string; /** On #/results: its title is the page's h1. */ isPage?: boolean }) {
  const { t, steps } = useApp();
  const [judges] = useState(onJudgesPath);
  const incomeFromAside = useIncomeFrom();
  return (
    <aside className="results-aside" aria-label={t('results.title')}>
      {isPage ? (
        <ScreenHeading size={54} wideSize={64} maxLines={2} leading="tight">
          {t('results.title')}
        </ScreenHeading>
      ) : (
        <p className="aside-title">{t('results.title')}</p>
      )}
      <ResultsSource />
      <ResultGroups current={current} />
      {judges ? (
        <JudgeNext step={incomeFromAside ? 3 : 1} />
      ) : (
        <a className="sharpen-card" href={routeHref({ name: 'doc' })} data-testid="sharpen-card">
          <span className="sharpen-icon" aria-hidden="true">
            <Doc />
          </span>
          <span className="sharpen-text">
            <strong>{t('results.sharpen')}</strong>
            <SharpenHelp />
          </span>
          <span className="sharpen-button">{t('results.addDocumentW2')}</span>
        </a>
      )}
      <div className="results-actions">
        <button type="button" className="text-link" onClick={() => navigate({ name: 'question', id: steps[0]?.id ?? 'income', then: null })}>
          {t('results.edit')}
        </button>
      </div>
    </aside>
  );
}

/** Where a paystub would be read: "on this device" only when the model here reads it. */
function SharpenHelp() {
  const { t } = useApp();
  const { doc } = useDocument();
  const { onDevice } = usePaystubReadOnDevice(doc.language);
  return (
    <span data-testid="sharpen-help" data-on-device={onDevice}>
      {t(onDevice ? 'results.sharpenHelp' : 'results.sharpenHelpCloud')}
    </span>
  );
}

function ProgramRow({ result: r, name, summary, current = false, order = 0 }: { result: ProgramVerdict; name: string; summary: string | undefined; current?: boolean; order?: number }) {
  const { t, locale, answers } = useApp();
  // A result the paystub or W-2 changed (kept with the income answer): the row says what it was before.
  const income = answers['income'];
  const docChange = isIncomeAnswer(income) && income.kind === 'exact' ? income.from?.changed?.find((c) => c.programId === r.programId && c.after === r.verdict) : undefined;
  // Shown with another verdict before (the paystub changed it): the row says so once, by its marker.
  const [changed] = useState(() => lastShown.has(r.programId) && lastShown.get(r.programId) !== r.verdict);
  useEffect(() => {
    lastShown.set(r.programId, r.verdict);
  }, [r.programId, r.verdict]);
  // The status line: what it depends on when an answer is missing, otherwise the verdict.
  const verdict =
    r.verdict === 'depends' && r.dependsOn.length > 0
      ? t('results.dependsOn', { list: r.dependsOn.map((v) => t(dynamicKey(`variable.${v}`))).join(', ') })
      : t(dynamicKey(`verdict.${r.verdict}`));
  // The rules' estimate, when there is one, joins the status on the same line.
  // A program whose exact amount exists only as an agency table gives its published maximum, said as "Up to".
  const upTo = (r.estimatedAmount === undefined || r.estimatedAmount <= 0) && r.upToAmount !== undefined && r.upToAmount > 0 ? t('results.upTo', { amount: formatMoney(locale, r.upToAmount) }) : null;
  const withAmount =
    r.estimatedAmount !== undefined && r.estimatedAmount > 0
      ? `${verdict} · ${t('results.estimate', { amount: formatMoney(locale, r.estimatedAmount) })}`
      : upTo
        ? `${verdict} · ${upTo}`
        : verdict;
  const was = docChange ? t('results.docEffect.was', { before: t(dynamicKey(`verdict.short.${docChange.before}`)) }) : null;
  const status = was ? `${withAmount} · ${was}` : withAmount;
  return (
    <li data-testid={`program-${r.programId}`} data-verdict={r.verdict} data-changed={changed ? 'true' : undefined} data-document-changed={docChange ? 'true' : undefined} style={{ '--i': order } as CSSProperties}>
      <a href={routeHref({ name: 'program', id: r.programId })} className="program-link" aria-current={current ? 'page' : undefined}>
        <Marker verdict={r.verdict} />
        <span className="program-text">
          <span className="program-name">{name}</span>
          <span className="program-note program-status-line">{status}</span>
          {summary && (
            <span className="program-note program-summary" aria-hidden="true">
              {summary}
            </span>
          )}
        </span>
        <span className="program-status" aria-hidden="true">
          {t(dynamicKey(`verdict.short.${r.verdict}`))}
          {/* The amount is the point of the result: wide rows show it too. */}
          {r.estimatedAmount !== undefined && r.estimatedAmount > 0 && <span className="program-amount program-money">{t('results.estimate', { amount: formatMoney(locale, r.estimatedAmount) })}</span>}
          {upTo && (
            <span className="program-amount program-money program-upto" data-testid="up-to">
              {upTo}
            </span>
          )}
          {/* Not a decision: wide rows show only the short word, so the way on is said under it. */}
          {r.verdict === 'unlikely' && <span className="program-amount" data-testid="still-apply">{t('results.stillApply')}</span>}
          {was && (
            <span className="program-amount program-was" data-testid="was">
              {was}
            </span>
          )}
        </span>
        <ChevronRight />
      </a>
    </li>
  );
}
