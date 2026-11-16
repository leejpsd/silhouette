// The on-device check (#/device-check): a person in a Chrome with the on-device model runs a fixed set
// of synthetic cases and downloads the results; a browser without the model can show a recording.
// A recording is always labelled as one, with its date and machine, and never shown as a live run.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { ScreenHeading } from '../Heading';
import { BlockActions } from '../design/block';
import { ArrowRight, ChevronLeft } from '../design/icons';
import { ActionLabel } from '../design/parts';
import { dynamicKey } from '../i18n';
import { routeHref } from '../router';
import {
  CASES,
  RUN_FILE_KIND,
  RUN_FILE_VERSION,
  availabilityStates,
  browserVersion,
  finalRan,
  firstFields,
  firstRan,
  isRunFile,
  platformString,
  summarize,
  runFileName,
  type CaseResult,
  type DeviceDiagnosis,
  type RunFile,
} from '../device-check/run';
import { PACK } from '../pack';

/** Recordings kept with the app (eval/results/on-device/*.json), loaded only when asked for. */
const RECORDINGS = import.meta.glob<unknown>('../../../eval/results/on-device/*.json', { import: 'default' });

type View = { kind: 'live'; file: RunFile; running: number | null } | { kind: 'recording'; file: RunFile; name: string } | null;

export function DeviceCheckScreen() {
  const { t } = useApp();
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const [view, setView] = useState<View>(null);
  const [badFile, setBadFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setHasModel(typeof (globalThis as { LanguageModel?: unknown }).LanguageModel !== 'undefined');
  }, []);

  const run = async () => {
    const availability = await availabilityStates();
    let file: RunFile = {
      kind: RUN_FILE_KIND,
      version: RUN_FILE_VERSION,
      date: new Date().toISOString(),
      browser: browserVersion(navigator.userAgent),
      platform: platformString(),
      userAgent: navigator.userAgent,
      availability,
      jurisdiction: PACK.jurisdiction,
      cases: [],
    };
    setView({ kind: 'live', file, running: 1 });
    status.current?.focus();
    for (let i = 0; i < CASES.length; i++) {
      const result: CaseResult = await (CASES[i] as () => Promise<CaseResult>)();
      file = { ...file, cases: [...file.cases, result] };
      setView({ kind: 'live', file, running: i + 2 <= CASES.length ? i + 2 : null });
    }
  };

  const download = (file: RunFile) => {
    const blob = new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = runFileName(file);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const showRecording = async (path: string) => {
    const loader = RECORDINGS[path];
    const value = loader ? await loader() : null;
    if (isRunFile(value)) setView({ kind: 'recording', file: value, name: path.split('/').pop() ?? path });
  };

  const openFile = async (file: File) => {
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!isRunFile(value)) throw new Error('not a run file');
      setBadFile(false);
      setView({ kind: 'recording', file: value, name: file.name });
    } catch {
      setBadFile(true);
    }
  };

  const recording = view?.kind === 'recording' ? view.file : null;
  const day = (iso: string) => iso.slice(0, 10);
  return (
    <div className="screen device-check" data-testid="device-check" data-view={view?.kind ?? 'none'}>
      <a className="text-link back-link" href={routeHref({ name: 'start' })}>
        <ChevronLeft />
        {t('nav.home')}
      </a>
      <ScreenHeading size={50} maxLines={3}>
        {recording ? t('deviceCheck.titleRecording') : t('deviceCheck.title')}
      </ScreenHeading>
      {recording && (
        <p className="recording-meta strong" data-testid="recording-meta">
          {t('deviceCheck.recordingMeta', { date: day(recording.date), browser: recording.browser, platform: recording.platform })}
        </p>
      )}
      {recording && (
        <p className="dashed-note" data-testid="recording-note">
          {t('deviceCheck.recordingNote')}
        </p>
      )}
      <p className="lead">{t('deviceCheck.lead')}</p>
      <p className="small">{t('deviceCheck.cloudNote')}</p>
      {hasModel === false && view?.kind !== 'live' && (
        <p className="dashed-note" data-testid="no-model">
          {t('deviceCheck.noModel')}
        </p>
      )}

      {view && <Results view={view} />}
      <p ref={status} tabIndex={-1} className="status-line" role="status" data-testid="device-check-status">
        {view?.kind === 'live' ? (view.running !== null ? t('deviceCheck.running', { n: view.running, total: CASES.length }) : t('deviceCheck.done')) : ''}
      </p>
      {view && (view.kind === 'recording' || view.running === null) && (
        <button type="button" className="outline-button" onClick={() => download(view.file)}>
          {t('deviceCheck.download')}
        </button>
      )}

      <section className="recordings" aria-labelledby="recordings-title">
        <h2 id="recordings-title" className="section-heading">
          {t('deviceCheck.recordings')}
        </h2>
        {Object.keys(RECORDINGS).length === 0 ? (
          <p className="small muted">{t('deviceCheck.noRecording')}</p>
        ) : (
          <ul className="chip-list">
            {Object.keys(RECORDINGS)
              .sort()
              .map((path) => (
                <li key={path}>
                  <button type="button" className="chip-button" onClick={() => void showRecording(path)}>
                    {t('deviceCheck.showRecording', { date: (path.split('/').pop() ?? path).replace(/\.json$/, '') })}
                  </button>
                </li>
              ))}
          </ul>
        )}
        <label className="outline-button file-button">
          {t('deviceCheck.open')}
          <input ref={fileInput} type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => e.target.files?.[0] && void openFile(e.target.files[0])} />
        </label>
        {badFile && (
          <p className="error" role="alert">
            {t('deviceCheck.badFile')}
          </p>
        )}
      </section>

      {hasModel && (
        <BlockActions>
          <button type="button" className="action" disabled={view?.kind === 'live' && view.running !== null} onClick={() => void run()} data-testid="run-device-check">
            <ActionLabel>{t('deviceCheck.run')}</ActionLabel>
            <span className="action-arrow">
              <ArrowRight />
            </span>
          </button>
        </BlockActions>
      )}
    </div>
  );
}

/** The device's answer, field by field, behind a disclosure: placeholder ids and field names only. */
function FieldDetail({ device }: { device: DeviceDiagnosis }) {
  const { t } = useApp();
  return (
    <details className="field-detail" data-testid="field-detail">
      <summary>{t('deviceCheck.fieldDetail')}</summary>
      <p className="small">
        {t('deviceCheck.parsed', { parsed: device.parsed ? '✓' : '✗', passed: device.passed ? '✓' : '✗' })}
        {device.problems.length > 0 && ` ${device.problems.join(', ')}`}
      </p>
      {device.core && (
        <p className="small" data-testid="device-parts">
          {t('deviceCheck.parts', {
            core: `${device.core.correct} / ${device.core.total}`,
            deductions: device.deductions ?? '—',
          })}
          {device.deductionsNotRead && ` ${t('deviceCheck.deductionsNotRead')}`}
        </p>
      )}
      <p className="small muted">{t('deviceCheck.scoredByValue')}</p>
      <ul className="field-list">
        {device.fields.map((f) => (
          <li key={f.field} data-status={f.status}>
            <span className="strong">{f.field}</span> <span className={`field-status status-${f.status}`}>{f.status}</span>
            <span className="small muted">
              {' '}
              {t('deviceCheck.goldIds', { ids: f.gold.join(' ') || '—' })} · {t('deviceCheck.answeredIds', { ids: f.answered.join(' ') || '—' })}
            </span>
          </li>
        ))}
      </ul>
      {device.passes ? (
        device.passes.map((p) => (
          <div key={p.part} data-testid={`device-pass-${p.part}`}>
            <p className="small strong">
              {t('deviceCheck.pass', { part: p.part, time: (p.latencyMs / 1000).toFixed(1) })}
              {p.problems.length > 0 && ` ${p.problems.join(', ')}`}
              {p.marked && p.marked.length > 0 && ` · ${t('deviceCheck.marked', { problems: p.marked.join(', ') })}`}
              {p.extraKeys.length > 0 && ` · ${t('deviceCheck.extraKeys', { keys: p.extraKeys.join(' ') })}`}
            </p>
            <pre className="payload">{p.rawText}</pre>
          </div>
        ))
      ) : (
        <pre className="payload">{device.rawText}</pre>
      )}
    </details>
  );
}

function Results({ view }: { view: Exclude<View, null> }) {
  const { t } = useApp();
  const { file } = view;
  const s = summarize(file.cases, file.version);
  return (
    <section className="device-results" aria-label={view.kind === 'live' ? t('deviceCheck.live') : t('deviceCheck.recordings')} data-testid="device-results">
      <p className="small" data-testid="device-environment">
        {t('deviceCheck.environment', { browser: file.browser, platform: file.platform, date: file.date.replace('T', ' ').slice(0, 16) })}
      </p>
      <p className="small muted">
        {t('deviceCheck.availability', {
          states: Object.entries(file.availability)
            .map(([k, v]) => `${k}: ${v}`)
            .join('; '),
        })}
      </p>
      <p className="strong" data-testid="device-summary">
        {t('deviceCheck.summary', { onDevice: s.onDevice, total: s.total, afterDevice: s.inCloudAfterDevice, inCloud: s.inCloud, notRun: s.notRun })}
      </p>
      {s.finalCorrect !== null && (
        <p className="strong" data-testid="device-summary-final">
          {t('deviceCheck.summaryFinal', { correct: s.finalCorrect, fields: s.fieldsTotal, retried: s.retriedInCloud })}
          {file.version >= 3 && ` ${t('deviceCheck.summaryNotRead', { count: s.deductionsNotRead })}`}
        </p>
      )}
      {s.incomeInputsCorrect !== null && (
        <p className="strong" data-testid="device-summary-income">
          {t('deviceCheck.summaryIncome', { correct: s.incomeInputsCorrect, total: s.extractionCases })}
        </p>
      )}
      <p className="small" data-testid="device-summary-first">
        {t('deviceCheck.summaryFirst', { firstOnDevice: s.firstOnDevice, total: s.total, correct: s.fieldsCorrect, fields: s.fieldsTotal })}
      </p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={t('deviceCheck.title')}>
        <table className="device-table">
          <thead>
            <tr>
              <th scope="col">{t('deviceCheck.col.case')}</th>
              <th scope="col">{t('deviceCheck.col.mode')}</th>
              <th scope="col">{t('deviceCheck.col.ran')}</th>
              <th scope="col">{t('deviceCheck.col.time')}</th>
              <th scope="col">{t('deviceCheck.col.check')}</th>
              <th scope="col">{t('deviceCheck.col.fields')}</th>
              <th scope="col">{t('deviceCheck.col.note')}</th>
            </tr>
          </thead>
          <tbody>
            {file.cases.map((c) => {
              const ran = finalRan(c, file.version);
              const afterDevice = ran === 'IN_CLOUD' && firstRan(c, file.version) === 'ON_DEVICE';
              const first = firstFields(c, file.version);
              return (
                <tr key={c.id} data-ran={ran} data-first-ran={firstRan(c, file.version)}>
                  <th scope="row">
                    {c.id}
                    <span className="small muted"> · {c.task}</span>
                  </th>
                  <td data-label={t('deviceCheck.col.mode')}>{c.mode.replace(/_/g, '_\u200b')}</td>
                  <td data-label={t('deviceCheck.col.ran')} className={`ran ran-${ran}`}>
                    {afterDevice ? t('deviceCheck.ran.afterDevice') : t(dynamicKey(`deviceCheck.ran.${ran}`))}
                  </td>
                  <td data-label={t('deviceCheck.col.time')}>{c.latencyMs === null ? '—' : `${(c.latencyMs / 1000).toFixed(1)} s`}</td>
                  <td data-label={t('deviceCheck.col.check')}>{c.outputCheck ?? '—'}</td>
                  <td data-label={t('deviceCheck.col.fields')}>
                    {first ? `${first.correct} / ${first.total}` : '—'}
                    {c.final && (
                      <span className="small muted">
                        {' '}
                        → {c.final.fields.correct} / {c.final.fields.total}
                        {c.final.deductionsNotRead ? ` (${t('deviceCheck.deductionsNotReadShort')})` : ''}
                      </span>
                    )}
                  </td>
                  <td data-label={t('deviceCheck.col.note')} className="note">
                    {c.error ?? c.note ?? ''}
                    {c.device && <FieldDetail device={c.device} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
