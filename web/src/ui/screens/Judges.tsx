// "For judges: try it in two minutes" (#/judges): three steps, one button each, with invented data
// only. It works in any browser: without an on-device model the sample's silhouette goes to the cloud
// (offline, the bundled answer key is used), and the page says which steps run on this device.
import { useEffect, useState } from 'react';
import { Raw } from '../../core/types';
import { skeletonize } from '../../core/skeleton';
import { pointerDeviceStatus } from '../../ai/device-model';
import { useApp } from '../context';
import { ScreenHeading } from '../Heading';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { useDocument } from '../doc/state';
import { ArrowRight, ChevronLeft } from '../design/icons';
import { navigate, routeHref } from '../router';
import { preparedHousehold } from '../judges/household';
import { OPEN_RECORD_EVENT } from '../Chrome';
import sampleText from '../../../../shared/samples/paystub-en-01.txt?raw';

export function JudgesScreen() {
  const { t, steps, resetAnswers, setAnswer } = useApp();
  const { update } = useDocument();
  const [device, setDevice] = useState<'checking' | 'available' | 'other'>('checking');

  useEffect(() => {
    let live = true;
    void pointerDeviceStatus('paystub', 'en').then((s) => live && setDevice(s === 'available' ? 'available' : 'other'));
    return () => {
      live = false;
    };
  }, []);

  const quickCheck = () => {
    resetAnswers();
    for (const [id, value] of Object.entries(preparedHousehold(steps))) setAnswer(id, value);
    navigate({ name: 'results' });
  };

  const sample = () => {
    const text = Raw.of(sampleText);
    const { skeleton, map } = skeletonize(text, allowlistFor('en'), introducersFor('en'));
    update({ text, skeleton, map, sourceKind: 'sample', language: 'en', extraction: null, error: null, hiddenWords: [], photoSource: null });
    navigate({ name: 'doc-preview' });
  };

  const record = () => window.dispatchEvent(new Event(OPEN_RECORD_EVENT));

  const stepsList = [
    { title: t('judges.step1.title'), body: t('judges.step1.body'), button: t('judges.step1.button'), run: quickCheck, id: 'quick-check' },
    { title: t('judges.step2.title'), body: t('judges.step2.body'), button: t('judges.step2.button'), run: sample, id: 'sample' },
    { title: t('judges.step3.title'), body: t('judges.step3.body'), button: t('judges.step3.button'), run: record, id: 'record' },
  ];

  return (
    <div className="screen judges" data-testid="judges">
      <a className="text-link back-link" href={routeHref({ name: 'start' })}>
        <ChevronLeft />
        {t('nav.home')}
      </a>
      <ScreenHeading size={56} maxLines={3}>
        {t('judges.title')}
      </ScreenHeading>
      <p className="lead">{t('judges.lead')}</p>
      <p className="dashed-note" role="status" data-testid="judges-device" data-device={device}>
        {device === 'checking' ? t('judges.checking') : device === 'available' ? t('judges.withModel') : t('judges.withoutModel')}
      </p>
      <ol className="judge-steps">
        {stepsList.map((s, i) => (
          <li key={s.id} className="judge-step" data-testid={`judge-${s.id}`}>
            <span className="judge-number" aria-hidden="true">
              {i + 1}
            </span>
            <div className="judge-text">
              <h2 className="section-heading">{s.title}</h2>
              <p className="small">{s.body}</p>
              <button type="button" className="outline-button" onClick={s.run}>
                {s.button}
                <ArrowRight />
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
