// Program detail: the result by shape, the program's name and estimated amount, why (from the rules),
// things to know and official information, then the model-written parts. The count block is compact.
import { lazy, Suspense } from 'react';
import { useApp } from '../context';
import { dynamicKey, formatMoney, packDate, packPeriod, programName } from '../i18n';
import { PACK, SOURCES_READ_ON, isDraftPack } from '../pack';
import { stepForVariable } from '../quickcheck';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { OfficialInfo } from '../answers/parts';
import { MoreHelpLinks } from '../answers/MoreHelpLinks';
import { ChevronLeft } from '../design/icons';
import { LABEL_FLOOR } from '../tokens';
import { FitText, Marker } from '../design/parts';

// Loaded on demand (and kept in the offline cache): the reasons and answer sections.
const ProgramWhy = lazy(() => import('../answers/ProgramAnswers').then((m) => ({ default: m.ProgramWhy })));
const ProgramAnswers = lazy(() => import('../answers/ProgramAnswers').then((m) => ({ default: m.ProgramAnswers })));

export function ProgramScreen({ id }: { id: string }) {
  const { t, locale, results } = useApp();
  const program = PACK.programs.find((p) => p.id === id);
  const result = results.find((r) => r.programId === id);

  if (!program || !result) {
    return (
      <div className="screen">
        <ScreenHeading>{t('results.title')}</ScreenHeading>
        <a className="text-link back-link" href={routeHref({ name: 'results' })}>
          <ChevronLeft />
          {t('detail.back')}
        </a>
      </div>
    );
  }

  return (
    <article className={`screen program verdict-${result.verdict}`} data-testid="verdict-card" data-verdict={result.verdict}>
      <a className="text-link back-link" href={routeHref({ name: 'results' })}>
        <ChevronLeft />
        {t('detail.back')}
      </a>
      <p className="verdict-line">{t(dynamicKey(`verdict.${result.verdict}`))}</p>
      <div className="program-title">
        <Marker verdict={result.verdict} />
        <ScreenHeading size={50} wideSize={64} maxLines={2}>
          {programName(locale, program)}
        </ScreenHeading>
      </div>

      <Suspense fallback={null}>
        <ProgramWhy program={program} verdict={result.verdict} />
      </Suspense>
      {result.estimatedAmount !== undefined && result.estimatedAmount > 0 && (
        <div className="amount-block">
          <FitText className="amount" size={44} maxLines={1} step={2} floor={LABEL_FLOOR} aria-hidden="true">
            {formatMoney(locale, result.estimatedAmount)}
          </FitText>
          <p className="small">{t('detail.amount', { amount: formatMoney(locale, result.estimatedAmount) })}</p>
        </div>
      )}


      {result.dependsOn.length > 0 && (
        <section className="depends" aria-labelledby="depends-title">
          <h2 id="depends-title" className="small strong">
            {t('detail.dependsOn')}
          </h2>
          <ul className="chip-list">
            {result.dependsOn.map((variable) => (
              <li key={variable}>
                <button
                  type="button"
                  className="chip-button"
                  onClick={() => navigate({ name: 'question', id: stepForVariable(variable), then: { name: 'program', id: program.id } })}
                >
                  {t('detail.answer', { question: t(dynamicKey(`variable.${variable}`)) })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <OfficialInfo programs={[program]} withCopy />

      <Suspense fallback={null}>
        <ProgramAnswers program={program} verdict={result.verdict} />
      </Suspense>
      {program.period && <p className="small" data-testid="program-period">{t('detail.period', { period: packPeriod(locale, program.period, t) })}</p>}

      <section className="things" aria-labelledby="things-title">
        <h2 id="things-title" className="section-heading">
          {t('detail.caveats')}
        </h2>
        {program.caveats && program.caveats.length > 0 && (
          <ul className="caveats">
            {program.caveats.map((key) => (
              <li key={key}>{t(dynamicKey(`caveat.${key}`))}</li>
            ))}
          </ul>
        )}
        <p className="small" data-testid="rules-status">
          {PACK.verifiedOn
            ? t('rules.verifiedOn', { date: PACK.verifiedOn })
            : isDraftPack() && SOURCES_READ_ON
              ? t('pack.draft.notice', { date: packDate(locale, SOURCES_READ_ON) })
              : t('detail.unverified')}
        </p>
      </section>

      <MoreHelpLinks />
    </article>
  );
}
