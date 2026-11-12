// Results: programs grouped by verdict, each linking to its verdict card.
import { useApp } from '../context';
import { dynamicKey, formatNumber, programName } from '../i18n';
import { PACK } from '../pack';
import { groupByVerdict } from '../quickcheck';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { SilhouetteMark } from '../SilhouetteMark';

export function ResultsScreen() {
  const { t, locale, steps, results } = useApp();
  const groups = groupByVerdict(results);
  const hasMaybe = results.some((r) => r.verdict === 'maybe');
  const nameOf = (id: string) => {
    const program = PACK.programs.find((p) => p.id === id);
    return program ? programName(locale, program) : id;
  };

  return (
    <div className="screen results">
      <ScreenHeading>{t('results.title')}</ScreenHeading>
      <p className="lead">{t('results.lead')}</p>
      {groups.map((group) => (
        <section key={group.verdict} className={`group verdict-${group.verdict}`} aria-labelledby={`group-${group.verdict}`}>
          <h2 id={`group-${group.verdict}`} className="group-title">
            <SilhouetteMark verdict={group.verdict} size={36} />
            <span>{t(dynamicKey(`verdict.${group.verdict}`))}</span>
          </h2>
          <ul className="programs">
            {group.programs.map((r) => (
              <li key={r.programId} data-testid={`program-${r.programId}`} data-verdict={r.verdict}>
                <a href={routeHref({ name: 'program', id: r.programId })} className="program-link">
                  <span className="program-name">{nameOf(r.programId)}</span>
                  {r.dependsOn.length > 0 && (
                    <span className="program-note">
                      {t('results.dependsOn', {
                        list: r.dependsOn.map((v) => t(dynamicKey(`variable.${v}`))).join(', '),
                      })}
                    </span>
                  )}
                  {r.estimatedAmount !== undefined && r.estimatedAmount > 0 && (
                    <span className="program-note">{t('results.estimate', { amount: formatNumber(locale, r.estimatedAmount) })}</span>
                  )}
                  <span className="program-open">{t('results.open')}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="hint">{hasMaybe ? t('results.docHint') : ''}</p>
      <div className="actions">
        <a className="button primary" href={routeHref({ name: 'doc' })}>
          {t('results.addDocument')}
        </a>
        <button type="button" className="button secondary" onClick={() => navigate({ name: 'question', id: steps[0]?.id ?? 'income', then: null })}>
          {t('results.edit')}
        </button>
      </div>
    </div>
  );
}
