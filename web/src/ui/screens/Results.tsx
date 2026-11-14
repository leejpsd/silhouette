// Results: programs grouped by verdict, each marked by shape and linking to its detail. The
// "possible" group sits in the inverted card with what would make it clearer.
import { useMemo, useSyncExternalStore } from 'react';
import { leftDevice, outboundState, subscribeOutbound } from '../../data/outbound';
import { criterionReasons, type ProgramVerdict } from '../../core/rules';
import { Raw } from '../../core/types';
import { useApp } from '../context';
import { dynamicKey, formatMoney, programName } from '../i18n';
import { shownValue } from '../answers/personal';
import { BANDS, PACK } from '../pack';
import { groupByVerdict, toEngineAnswers } from '../quickcheck';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { MoreHelpLinks } from '../answers/MoreHelpLinks';
import { BlockActions } from '../design/block';
import { ArrowRight, ChevronRight, Minus } from '../design/icons';
import { LABEL_FLOOR } from '../tokens';
import { FitText, Marker, ActionLabel } from '../design/parts';
import { useOnline } from '../design/online';

export function ResultsScreen() {
  const { t, locale, steps, answers, results } = useApp();
  const groups = groupByVerdict(results);
  // Once anything has left the device, the lead must not say that nothing was sent.
  const sentSomething = useSyncExternalStore(subscribeOutbound, () => leftDevice(outboundState().entries).length > 0, () => false);
  const online = useOnline();
  const answered = Object.keys(answers).length > 0;
  const nothingFits = answered && results.length > 0 && results.every((r) => r.verdict === 'unlikely');
  const nameOf = (id: string) => {
    const program = PACK.programs.find((p) => p.id === id);
    return program ? programName(locale, program) : id;
  };
  const engine = useMemo(() => Raw.of(toEngineAnswers(steps, answers)), [steps, answers]);

  // The screen's main action, in the block: a paystub turns a possible result into a clearer one.
  const addPaystub = (
    <BlockActions>
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
        <ScreenHeading size={62} maxLines={2}>
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
      <div className="stack-8 inset">
        <ScreenHeading size={62} maxLines={2} leading="tight">
          {t('results.title')}
        </ScreenHeading>
        <p className="small muted" data-testid="results-lead">
          {sentSomething ? t('results.leadAfterSend') : t('results.lead')}
        </p>
      </div>
      {!online && (
        <p className="dashed-note" role="status">
          {t('state.offline')}
        </p>
      )}
      {nothingFits && (
        <section className="inverted-card" aria-label={t('results.none')}>
          <p className="card-headline">{t('results.none')}</p>
          <p className="small">{t('results.noneHelp')}</p>
          <div className="card-actions">{editAnswers}</div>
        </section>
      )}
      {groups.map((group) =>
        group.verdict === 'maybe' && !nothingFits ? (
          <section key={group.verdict} className="inverted-card group verdict-maybe" aria-labelledby="group-maybe">
            <h2 id="group-maybe" className="marker-line">
              <Marker verdict="maybe" />
              <span>{t('verdict.maybe')}</span>
            </h2>
            <ul className="programs">
              {group.programs.map((r, i) =>
                i === 0 ? (
                  <Featured key={r.programId} result={r} name={nameOf(r.programId)} reasons={criterionReasons(PACK, BANDS, engine, r.programId)} />
                ) : (
                  <ProgramRow key={r.programId} result={r} name={nameOf(r.programId)} />
                ),
              )}
            </ul>
            <div className="card-actions">
              <p className="small">{t('results.maybeHint')}</p>
            </div>
          </section>
        ) : (
          <section key={group.verdict} className={`group verdict-${group.verdict}`} aria-labelledby={`group-${group.verdict}`}>
            <h2 id={`group-${group.verdict}`} className={`marker-line${group.verdict === 'depends' || group.verdict === 'unlikely' ? ' muted' : ''}`}>
              <Marker verdict={group.verdict} />
              <span>{t(dynamicKey(`verdict.${group.verdict}`))}</span>
            </h2>
            <ul className="programs">
              {group.programs.map((r) => (
                <ProgramRow key={r.programId} result={r} name={nameOf(r.programId)} />
              ))}
            </ul>
          </section>
        ),
      )}
      {addPaystub}
      <div className="results-actions">{editAnswers}</div>
      <MoreHelpLinks />
    </div>
  );
}

function ProgramRow({ result: r, name }: { result: ProgramVerdict; name: string }) {
  const { t, locale } = useApp();
  return (
    <li data-testid={`program-${r.programId}`} data-verdict={r.verdict}>
      <a href={routeHref({ name: 'program', id: r.programId })} className="program-link">
        <span className="program-text">
          <FitText className="program-name" size={32} maxLines={2} step={2} floor={LABEL_FLOOR}>
            {name}
          </FitText>
          {r.dependsOn.length > 0 && (
            <span className="program-note">{t('results.dependsOn', { list: r.dependsOn.map((v) => t(dynamicKey(`variable.${v}`))).join(', ') })}</span>
          )}
          {r.estimatedAmount !== undefined && r.estimatedAmount > 0 && (
            <span className="program-note">{t('results.estimate', { amount: formatMoney(locale, r.estimatedAmount) })}</span>
          )}
        </span>
        <ChevronRight />
      </a>
    </li>
  );
}

/** The first "possible" program, with the limit and the person's answer that keep it open. */
function Featured({ result: r, name, reasons }: { result: ProgramVerdict; name: string; reasons: ReturnType<typeof criterionReasons> }) {
  const { t, locale } = useApp();
  const comparison = reasons.flatMap((c) => c.comparisons).find((c) => c.variable === 'annualIncome' && c.limit !== null);
  const yours = comparison?.yours === null || comparison?.yours === undefined ? null : shownValue(locale, comparison.yours, '', true);
  const mixed = r.criteria.some((c) => c.state === 'mixed');
  return (
    <li className="featured" data-testid={`program-${r.programId}`} data-verdict={r.verdict}>
      <a href={routeHref({ name: 'program', id: r.programId })} className="featured-link">
        <FitText className="featured-name" size={32} maxLines={2} step={2} floor={LABEL_FLOOR}>
          {name}
        </FitText>
      </a>
      {comparison && (
        <dl className="limit-rows">
          <div>
            <dt>{t('detail.limitFamily')}</dt>
            <dd>{formatMoney(locale, comparison.limit as number)}</dd>
          </div>
          {yours && (
            <div>
              <dt>{t('detail.yourAnswer')}</dt>
              <dd>{yours}</dd>
            </div>
          )}
        </dl>
      )}
      {mixed && (
        <p className="mixed-line">
          <Minus />
          {t('state.mixed')}
        </p>
      )}
      {r.dependsOn.length > 0 && (
        <span className="program-note">{t('results.dependsOn', { list: r.dependsOn.map((v) => t(dynamicKey(`variable.${v}`))).join(', ') })}</span>
      )}
    </li>
  );
}
