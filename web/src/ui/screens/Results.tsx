// Results: the programs as one list card, each marked by how full its circle is, with its status, and
// linking to its detail. On wide screens the list also stands beside the program page.
import { useSyncExternalStore } from 'react';
import { leftDevice, outboundState, subscribeOutbound } from '../../data/outbound';
import type { ProgramVerdict } from '../../core/rules';
import { useApp } from '../context';
import { dynamicKey, formatMoney, programName } from '../i18n';
import { PACK } from '../pack';
import { groupByVerdict } from '../quickcheck';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { MoreHelpLinks } from '../answers/MoreHelpLinks';
import { programCopy } from '../answers/facts';
import { BlockActions } from '../design/block';
import { ArrowRight, ChevronRight, Doc } from '../design/icons';
import { Marker, ActionLabel } from '../design/parts';
import { useOnline } from '../design/online';

export function ResultsScreen() {
  const { t, locale, steps, answers } = useApp();
  // Once anything has left the device, the lead must not say that nothing was sent.
  const sentSomething = useSyncExternalStore(subscribeOutbound, () => leftDevice(outboundState().entries).length > 0, () => false);
  const online = useOnline();
  const answered = Object.keys(answers).length > 0;

  // The screen's main action, in the block: a paystub turns a possible result into a clearer one.
  const addPaystub = (
    <BlockActions>
      {/* Wide screens: the action stands in a card under the list, with why a paystub helps. */}
      <span className="sharpen-icon wide-only" aria-hidden="true">
        <Doc />
      </span>
      <p className="sharpen-text wide-only">
        <strong>{t('results.sharpen')}</strong>
        <span>{t('results.sharpenHelp')}</span>
      </p>
      <a className="action" href={routeHref({ name: 'doc' })}>
        <ActionLabel>{t('results.addDocument')}</ActionLabel>
        <span className="action-arrow">
          <ArrowRight />
        </span>
      </a>
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
          <div className="badge-line">
            <strong className="badge badge-none">{t('badge.noModel')}</strong>
            <p className="small muted" data-testid="results-lead">
              {sentSomething ? t('results.leadAfterSend') : t('results.lead')}
            </p>
          </div>
        </div>
        {!online && (
          <p className="dashed-note" role="status">
            {t('state.offline')}
          </p>
        )}
        <ResultGroups />
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
      <ul className="programs" aria-label={t('results.title')}>
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
              />
            );
          }),
        )}
      </ul>
    </>
  );
}

/** The results list beside a program on wide screens. */
export function ResultsAside({ current }: { current: string }) {
  const { t } = useApp();
  return (
    <aside className="results-aside" aria-label={t('results.title')}>
      <p className="aside-title">{t('results.title')}</p>
      <ResultGroups current={current} />
    </aside>
  );
}

function ProgramRow({ result: r, name, summary, current = false }: { result: ProgramVerdict; name: string; summary: string | undefined; current?: boolean }) {
  const { t, locale } = useApp();
  // The status line: what it depends on when an answer is missing, otherwise the verdict.
  const verdict =
    r.verdict === 'depends' && r.dependsOn.length > 0
      ? t('results.dependsOn', { list: r.dependsOn.map((v) => t(dynamicKey(`variable.${v}`))).join(', ') })
      : t(dynamicKey(`verdict.${r.verdict}`));
  // The rules' estimate, when there is one, joins the status on the same line.
  const status = r.estimatedAmount !== undefined && r.estimatedAmount > 0 ? `${verdict} · ${t('results.estimate', { amount: formatMoney(locale, r.estimatedAmount) })}` : verdict;
  return (
    <li data-testid={`program-${r.programId}`} data-verdict={r.verdict}>
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
        </span>
        <ChevronRight />
      </a>
    </li>
  );
}
