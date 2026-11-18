// "For judges: try it in two minutes" (#/judges): three steps, one button each, with invented data
// only. It works in any browser: without an on-device model the sample's silhouette goes to the cloud
// (offline, the bundled answer key is used), and the page says which steps run on this device.
import { useCallback, useEffect, useState } from 'react';
import { pointerDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { ModelStatus } from '../doc/ModelStatus';
import { openSamplePaystub, startJudgesPath } from '../judges/next';
import { useApp } from '../context';
import { ScreenHeading } from '../Heading';
import { useDocument } from '../doc/state';
import { ArrowRight, ChevronLeft, ChevronRight, Doc, Phone, Play } from '../design/icons';
import { BlockActions } from '../design/block';
import { ActionLabel } from '../design/parts';
import { navigate, routeHref } from '../router';
import { preparedHousehold } from '../judges/household';
import { OPEN_RECORD_EVENT } from '../Chrome';

export function JudgesScreen() {
  const { t, steps, resetAnswers, setAnswer } = useApp();
  const { update } = useDocument();
  // Three states matter to a judge: the model is here, it can be downloaded (then step 2 can run on this
  // device after one press), or this browser has none.
  const [device, setDevice] = useState<'checking' | 'available' | 'downloadable' | 'other'>('checking');
  const onStatus = useCallback((s: DeviceStatus) => setDevice(s === 'available' ? 'available' : s === 'downloadable' || s === 'downloading' ? 'downloadable' : 'other'), []);

  useEffect(() => {
    let live = true;
    void pointerDeviceStatus('paystub', 'en').then((s) => live && onStatus(s));
    return () => {
      live = false;
    };
  }, [onStatus]);

  const quickCheck = () => {
    startJudgesPath();
    resetAnswers();
    for (const [id, value] of Object.entries(preparedHousehold(steps))) setAnswer(id, value);
    navigate({ name: 'results' });
  };

  const sample = () => {
    startJudgesPath();
    openSamplePaystub(update);
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
      <p className="eyebrow">{t('rail.judges')}</p>
      <ScreenHeading size={58} wideSize={72} maxLines={3}>
        {t('judges.title')}
      </ScreenHeading>
      <p className="lead">{t('judges.lead')}</p>
      {/* Where step 2 runs, in one line; the full sentence is under the steps. */}
      {device !== 'checking' && (
        <p className="routing-line">
          <strong className={`badge ${device === 'available' ? 'badge-device' : 'badge-cloud'}`}>{device === 'available' ? t('badge.onDevice') : t('badge.cloud')}</strong>
          <span>{t('reason.document-silhouette-only')}</span>
        </p>
      )}
      <ol className="judge-steps">
        {stepsList.map((s, i) => (
          // The whole step is the control (the disc is its mark): a press on the title starts it too.
          <li key={s.id} className="judge-step" data-testid={`judge-${s.id}`} onClick={(e) => { if (!(e.target as Element).closest('button')) s.run(); }}>
            <span className="judge-number" aria-hidden="true">
              {i + 1}
            </span>
            <div className="judge-text">
              <h2 className="judge-title">{s.title}</h2>
              <p className="judge-body">{s.body}</p>
            </div>
            <button type="button" className="play-disc" aria-label={s.button} onClick={s.run}>
              <Play />
            </button>
          </li>
        ))}
      </ol>
      <p className="card-note" role="status" data-testid="judges-device" data-device={device}>
        {device === 'checking' ? t('judges.checking') : device === 'available' ? t('judges.withModel') : device === 'downloadable' ? t('judges.canDownload') : t('judges.withoutModel')}
      </p>
      {/* The model can be downloaded here, with its progress: then step 2 runs on this device. */}
      {device === 'downloadable' && <ModelStatus language="en" onStatus={onStatus} />}
      <ul className="link-card">
        <li>
          <a href={routeHref({ name: 'tasks' })}>
            <span className="source-icon" aria-hidden="true">
              <Phone size={16} />
            </span>
            <span className="source-text">
              <span className="source-title">{t('judges.tasks')}</span>
              <span className="small muted">{t('tasks.lead')}</span>
            </span>
            <ChevronRight />
          </a>
        </li>
        <li>
          <a href={routeHref({ name: 'device-check' })}>
            <span className="source-icon" aria-hidden="true">
              <Doc />
            </span>
            <span className="source-text">
              <span className="source-title">{t('demo.deviceCheck')}</span>
            </span>
            <ChevronRight />
          </a>
        </li>
      </ul>
      <BlockActions>
        <button type="button" className="action" onClick={quickCheck}>
          <ActionLabel>{t('judges.start')}</ActionLabel>
          <span className="action-arrow">
            <ArrowRight />
          </span>
        </button>
      </BlockActions>
    </div>
  );
}
