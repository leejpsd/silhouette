// Verdict card: criteria with their state, what the result depends on, estimated amount,
// and the rule pack's verification status.
import { useApp } from '../context';
import { dynamicKey, formatNumber, programName } from '../i18n';
import { PACK } from '../pack';
import { stepForVariable } from '../quickcheck';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { SilhouetteMark } from '../SilhouetteMark';
import { ProgramAnswers } from '../answers/ProgramAnswers';
import { OfficialInfo } from '../answers/parts';
import { MoreHelpLinks } from '../answers/MoreHelp';

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

      <h2>{t('detail.criteria')}</h2>
      <ul className="criteria">
        {result.criteria.map((c) => (
          <li key={c.id} className={`criterion state-${c.state}`} data-state={c.state}>
            <StateIcon state={c.state} />
            <span className="criterion-text">{t(dynamicKey(`criterion.${program.id}.${c.id}`))}</span>
            <span className="criterion-state">{t(dynamicKey(`state.${c.state}`))}</span>
          </li>
        ))}
      </ul>

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

      <ProgramAnswers program={program} verdict={result.verdict} />
      <OfficialInfo programs={[program]} />
      <MoreHelpLinks />
      <a className="button quiet back" href={routeHref({ name: 'results' })}>
        {t('detail.back')}
      </a>
    </article>
  );
}

function StateIcon({ state }: { state: string }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;
  if (state === 'pass')
    return (
      <svg {...common} className="state-icon">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--color-surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === 'fail')
    return (
      <svg {...common} className="state-icon">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (state === 'mixed')
    return (
      <svg {...common} className="state-icon">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2.5a9.5 9.5 0 0 0 0 19z" fill="currentColor" />
      </svg>
    );
  return (
    <svg {...common} className="state-icon">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3.2 2.6" />
    </svg>
  );
}
