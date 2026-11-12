// Verdict card: criteria with their state, what the result depends on, estimated amount,
// and the rule pack's verification status.
import { useApp } from '../context';
import { dynamicKey, formatNumber, programName } from '../i18n';
import { PACK } from '../pack';
import { stepForVariable } from '../quickcheck';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { SilhouetteMark } from '../SilhouetteMark';
import { lazy, Suspense } from 'react';

// Loaded on demand (and kept in the offline cache): the answer sections are not needed for the result.
const ProgramAnswers = lazy(() => import('../answers/ProgramAnswers').then((m) => ({ default: m.ProgramAnswers })));
import { OfficialInfo } from '../answers/parts';
import { MoreHelpLinks } from '../answers/MoreHelpLinks';

export function ProgramScreen({ id }: { id: string }) {
  const { t, locale, results } = useApp();
  const program = PACK.programs.find((p) => p.id === id);
  const result = results.find((r) => r.programId === id);

  if (!program || !result) {
    return (
      <div className="screen">
        <ScreenHeading>{t('results.title')}</ScreenHeading>
        <a className="button secondary" href={routeHref({ name: 'results' })}>
          {t('detail.back')}
        </a>
      </div>
    );
  }

  return (
    <article className={`screen program verdict-${result.verdict}`} data-testid="verdict-card" data-verdict={result.verdict}>
      <ScreenHeading>{programName(locale, program)}</ScreenHeading>
      <p className="verdict-line">
        <SilhouetteMark verdict={result.verdict} size={48} />
        <span>{t(dynamicKey(`verdict.${result.verdict}`))}</span>
      </p>

      {result.estimatedAmount !== undefined && result.estimatedAmount > 0 && (
        <p className="amount">{t('detail.amount', { amount: formatNumber(locale, result.estimatedAmount) })}</p>
      )}

      {program.period && <p className="meta">{t('detail.period', { period: program.period })}</p>}

      {program.caveats && program.caveats.length > 0 && (
        <ul className="caveats" aria-label={t('detail.caveats')}>
          {program.caveats.map((key) => (
            <li key={key}>{t(dynamicKey(`caveat.${key}`))}</li>
          ))}
        </ul>
      )}

      {result.dependsOn.length > 0 && (
        <section className="depends" aria-labelledby="depends-title">
          <h2 id="depends-title">{t('detail.dependsOn')}</h2>
          <ul>
            {result.dependsOn.map((variable) => (
              <li key={variable}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    navigate({ name: 'question', id: stepForVariable(variable), then: { name: 'program', id: program.id } })
                  }
                >
                  {t('detail.answer', { question: t(dynamicKey(`variable.${variable}`)) })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="meta">
        {PACK.verifiedOn ? t('rules.verifiedOn', { date: PACK.verifiedOn }) : t('detail.unverified')}
      </p>

      <Suspense fallback={null}>
        <ProgramAnswers program={program} verdict={result.verdict} />
      </Suspense>
      <OfficialInfo programs={[program]} />
      <MoreHelpLinks />
      <a className="button quiet back" href={routeHref({ name: 'results' })}>
        {t('detail.back')}
      </a>
    </article>
  );
}
