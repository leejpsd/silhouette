// Start screen: the promise, the rules in use, and the way in.
import { useApp } from '../context';
import { dynamicKey } from '../i18n';
import { PACK } from '../pack';
import { firstOpenStep } from '../quickcheck';
import { navigate } from '../router';
import { ScreenHeading } from '../Heading';
import { SilhouetteMark } from '../SilhouetteMark';

export function StartScreen({ notice }: { notice: string | null }) {
  const { t, steps, answers, resetAnswers } = useApp();
  const started = Object.keys(answers).length > 0;
  const open = firstOpenStep(steps, answers);
  const firstStep = steps[0]?.id ?? 'income';

  const begin = () => {
    if (!started) return navigate({ name: 'question', id: firstStep, then: null });
    const next = steps[open];
    if (next) navigate({ name: 'question', id: next.id, then: null });
    else navigate({ name: 'results' });
  };

  return (
    <div className="screen start">
      <div role="status" className="notice-slot">
        {notice && <p className="notice">{notice}</p>}
      </div>
      <SilhouetteMark verdict="brand" size={88} />
      <ScreenHeading>{t('start.title')}</ScreenHeading>
      <p className="lead">{t('start.lead')}</p>
      <ul className="promise">
        <li>{t('promise.line1')}</li>
        <li>{t('promise.line2')}</li>
      </ul>
      <p className="meta">{t('start.rules', { name: t(dynamicKey(`pack.${PACK.jurisdiction}.name`)) })}</p>
      <div className="actions">
        <button type="button" className="button primary" onClick={begin}>
          {!started ? t('start.begin') : open < steps.length ? t('start.resume') : t('start.continue')}
        </button>
        <a className="button secondary" href="#/doc">
          {t('start.sample')}
        </a>
        {started && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              resetAnswers();
              navigate({ name: 'question', id: firstStep, then: null });
            }}
          >
            {t('start.restart')}
          </button>
        )}
      </div>
    </div>
  );
}
