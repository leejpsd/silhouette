// "For judges: try it in two minutes" (#/judges): three steps, one button each, with invented data
// only. It works in any browser: without an on-device model the sample's silhouette goes to the cloud
// (offline, the bundled answer key is used), and the page says which steps run on this device.
import { openRecordingNext, recordingLabel, recordingMachine, recordingPaths, RECORDINGS } from './DeviceCheck';
import { countedCases, isRunFile, summarize } from '../device-check/run';
import { useCallback, useEffect, useState } from 'react';
import { pointerDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { ModelStatus } from '../doc/ModelStatus';
import { openSamplePaystub, setAutoRun, startJudgesPath } from '../judges/next';
import { useApp } from '../context';
import { ScreenHeading } from '../Heading';
import { useDocument } from '../doc/state';
import { ChevronLeft, ChevronRight, DeviceIcon, Doc, Phone, Play } from '../design/icons';
import { useHeldoutDevices, useHeldoutLine } from '../evidence/HeldoutDevices';
import { BlockActions } from '../design/block';
import { ActionLabel } from '../design/parts';
import { navigate, routeHref } from '../router';
import { preparedHousehold } from '../judges/household';
import { OPEN_RECORD_EVENT } from '../Chrome';

export function JudgesScreen() {
  const { t, steps, answers, resetAnswers, setAnswer } = useApp();
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

  // Step 1: the invented household's answers are filled in and its paystub opens on its silhouette, so
  // the first results a judge sees already use the income the model read.
  const sample = () => {
    startJudgesPath();
    resetAnswers();
    for (const [id, value] of Object.entries(preparedHousehold(steps))) setAnswer(id, value);
    openSamplePaystub(update);
  };

  // Step 2: the results (the household's own range of income until the paystub has been read).
  const results = () => {
    startJudgesPath();
    if (Object.keys(answers).length === 0) for (const [id, value] of Object.entries(preparedHousehold(steps))) setAnswer(id, value);
    navigate({ name: 'results' });
  };

  const record = () => window.dispatchEvent(new Event(OPEN_RECORD_EVENT));

  // One press: step 1 and step 2 run on their own, on screen, as the person would press them.
  const runAll = () => {
    setAutoRun('read');
    sample();
  };

  const stepsList = [
    { title: t('judges.step1.title'), body: t('judges.step1.body'), button: t('judges.step1.button'), run: sample, id: 'sample' },
    { title: t('judges.step2.title'), body: t('judges.step2.body'), button: t('judges.step2.button'), run: results, id: 'results' },
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
      <div className="judges-run-all" data-testid="judges-run-all">
        <button type="button" className="action" onClick={runAll}>
          <ActionLabel>{t('judges.runAll.button')}</ActionLabel>
          <span className="action-arrow">
            <Play />
          </span>
        </button>
        <p className="small muted">{t('judges.runAll.body')}</p>
      </div>
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
      <RecordedRuns />
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
      {/* The dock (on a phone, the bottom bar) offers the same one press as the button at the top, so the
          page has a single primary action. */}
      <BlockActions>
        <button type="button" className="action" onClick={runAll} data-testid="judges-run-all-dock">
          <ActionLabel>{t('judges.runAll.button')}</ActionLabel>
          <span className="action-arrow">
            <Play />
          </span>
        </button>
      </BlockActions>
    </div>
  );
}

/**
 * The on-device half, for a judge whose device has no model: the latest run recorded on a real iPhone
 * and the latest recorded in Chrome, with their three numbers, each one press from the full recording.
 * Those runs use the five check paystubs the checks were changed against, so they are labelled so, and the
 * same two devices on never-seen paystubs stand under them.
 */
function RecordedRuns() {
  const { t, locale } = useApp();
  const [rows, setRows] = useState<{ path: string; label: string; machine: string; onDevice: number; total: number; wrong: number; readings: number }[]>([]);
  const heldout = useHeldoutDevices();
  const line = useHeldoutLine();
  useEffect(() => {
    let live = true;
    void (async () => {
      const paths = recordingPaths();
      const latest = [paths.find((p) => /ios/.test(p)), paths.find((p) => /chrome/.test(p))].filter((p): p is string => p !== undefined);
      const found = [];
      for (const path of latest) {
        const value = await RECORDINGS[path]?.();
        if (!isRunFile(value)) continue;
        const s = summarize(countedCases(value), value.version);
        if (s.wrongReachedPerson === null) continue;
        found.push({ path, label: recordingLabel(path, locale), machine: recordingMachine(path), onDevice: s.onDevice, total: s.total, wrong: s.wrongReachedPerson, readings: s.extractionCases });
      }
      if (live) setRows(found);
    })();
    return () => {
      live = false;
    };
  }, [locale]);
  if (rows.length === 0 && heldout === null) return null;
  return (
    <section className="recorded-runs" aria-labelledby="recorded-title" data-testid="recorded-runs">
      <h2 id="recorded-title" className="section-heading">
        {t('judges.recorded.title')}
      </h2>
      {heldout && (
        <div className="recorded-heldout" data-testid="judges-heldout">
          <h3 className="recorded-heldout-title">{t('judges.heldout.title', { total: heldout.chrome.documents })}</h3>
          <ul className="link-card">
            {(
              [
                ['chrome', 'Chrome 157 · Mac', t('judges.heldout.firstSet', { machine: 'Chrome 157 · Mac' }), heldout.chrome],
                ['iphone', 'iPhone 17 Pro', t('judges.heldout.thirdSet', { machine: 'iPhone 17 Pro' }), heldout.iphone],
              ] as const
            ).map(([id, machine, title, f]) => (
              <li key={id} data-testid={`judges-heldout-${id}`} data-first={f.firstWrong} data-stopped={f.stopped} data-wrong={f.incomeWrong}>
                <a href={routeHref({ name: 'tasks' })}>
                  <span className="source-icon" aria-hidden="true">
                    <DeviceIcon machine={machine} size={16} />
                  </span>
                  <span className="source-text">
                    <span className="source-title">{title}</span>
                    <span className="small muted">{line(f)}</span>
                  </span>
                  <ChevronRight />
                </a>
              </li>
            ))}
          </ul>
          <p className="small muted">{t('judges.heldout.note')}</p>
        </div>
      )}
      {rows.length > 0 && (
        <p className="small muted recorded-set" data-testid="recorded-tuned">
          {t('judges.heldout.tuned')}
        </p>
      )}
      <ul className="link-card">
        {rows.map((r) => (
          <li key={r.path}>
            <button
              type="button"
              className="recorded-row"
              onClick={() => {
                openRecordingNext(r.path);
                navigate({ name: 'device-check' });
              }}
            >
              <span className="source-icon" aria-hidden="true">
                <DeviceIcon machine={r.machine} size={16} />
              </span>
              <span className="source-text">
                <span className="source-title">{r.label}</span>
                <span className="small muted">{t('judges.recorded.row', { onDevice: r.onDevice, total: r.total, wrong: r.wrong, readings: r.readings })}</span>
              </span>
              <ChevronRight />
            </button>
          </li>
        ))}
      </ul>
      <p className="small muted">{t('judges.recorded.note')}</p>
    </section>
  );
}

