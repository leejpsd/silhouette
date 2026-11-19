// The on-device check (#/device-check): a person in a Chrome with the on-device model runs a fixed set
// of synthetic cases and downloads the results; a browser without the model can show a recording.
// A recording is always labelled as one, with its date and machine, and never shown as a live run.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { ScreenHeading } from '../Heading';
import { BlockActions } from '../design/block';
import { ArrowRight, Check, ChevronLeft } from '../design/icons';
import { ActionLabel, Spinner } from '../design/parts';
import { dynamicKey } from '../i18n';
import { routeHref } from '../router';
import {
  casesFor,
  RUN_FILE_KIND,
  RUN_FILE_VERSION,
  availabilityStates,
  browserVersion,
  finalRan,
  firstFields,
  firstRan,
  isRunFile,
  platformString,
  webRunDevice,
  summarize,
  runFileName,
  type CaseResult,
  type DeviceDiagnosis,
  type RunFile,
  countedCases,
} from '../device-check/run';
import { PACK } from '../pack';

/** Recordings kept with the app (eval/results/on-device/*.json), loaded only when asked for. */
export const RECORDINGS = {
  ...import.meta.glob<unknown>('../../../eval/results/on-device/*.json', { import: 'default' }),
  // The runs recorded on a real iPhone, in the same file format (shared/schemas/device-check-run).
  ...import.meta.glob<unknown>('../../../../ios/eval/on-device/*.json', { import: 'default' }),
};

/** A recording's label from its file name: the machine it was made on and the day, never the raw file name. */
export function recordingLabel(path: string, locale?: string): string {
  const name = (path.split('/').pop() ?? path).replace(/\.json$/, '');
  const day = /(\d{4})-(\d{2})-(\d{2})/.exec(name);
  const date = day ? new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))) : null;
  const when = date ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date) : name;
  const time = /T(\d{2})(\d{2})/.exec(name);
  const machine = /ios/.test(name) ? 'iPhone 17 Pro' : /chrome(\d+)/.test(name) ? `Chrome ${/chrome(\d+)/.exec(name)?.[1]} · Mac` : name;
  return `${machine} · ${when}${time ? ` ${time[1]}:${time[2]} UTC` : ''}`;
}

/** The machine a recording was made on ("iPhone 17 Pro", "Chrome 157 · Mac"): its label without the date. */
export function recordingMachine(path: string): string {
  return recordingLabel(path).split(' · ').filter((part) => !/\d{4}|\bUTC\b/.test(part)).join(' · ');
}

/** The newest recording of each machine first (file names start with the date). */
export const recordingPaths = (): string[] =>
  Object.keys(RECORDINGS).sort((a, b) => (b.split('/').pop() ?? '').localeCompare(a.split('/').pop() ?? ''));

/**
 * Each machine's first run is kept as its baseline (eval/results/on-device/README.md, ios/eval/on-device/README.md);
 * its newest run is its latest. A machine with one run has only a latest.
 */
export function recordingRole(path: string): 'latest' | 'baseline' | null {
  const machine = recordingMachine(path);
  const same = recordingPaths().filter((p) => recordingMachine(p) === machine);
  if (same[0] === path) return 'latest';
  if (same.length > 1 && same.at(-1) === path) return 'baseline';
  return null;
}

/** A recording to open when the page is reached from a link to it (the judges' page). */
const OPEN_KEY = 'silhouette.open-recording';
export function openRecordingNext(path: string): void {
  try {
    sessionStorage.setItem(OPEN_KEY, path);
  } catch {
    // Without storage the page opens on its list.
  }
}

type View = { kind: 'live'; file: RunFile; running: number | null } | { kind: 'recording'; file: RunFile; name: string; path: string | null } | null;

export function DeviceCheckScreen() {
  const { t, locale } = useApp();
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const [view, setView] = useState<View>(null);
  const [badFile, setBadFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Run the extraction cases three times, to show how stable the device's reading is (default: once).
  const [repeat, setRepeat] = useState(false);
  const [total, setTotal] = useState(casesFor(1).length);
  const status = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setHasModel(typeof (globalThis as { LanguageModel?: unknown }).LanguageModel !== 'undefined');
  }, []);

  const run = async () => {
    const repetitions = repeat ? 3 : 1;
    const cases = casesFor(repetitions);
    setTotal(cases.length);
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
      repetitions,
      device: webRunDevice(platformString()),
      cases: [],
    };
    setView({ kind: 'live', file, running: 1 });
    status.current?.focus();
    for (let i = 0; i < cases.length; i++) {
      const result: CaseResult = await (cases[i] as () => Promise<CaseResult>)();
      file = { ...file, cases: [...file.cases, result] };
      setView({ kind: 'live', file, running: i + 2 <= cases.length ? i + 2 : null });
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

  const showRecording = async (path: string, onlyIfEmpty = false) => {
    const loader = RECORDINGS[path];
    const value = loader ? await loader() : null;
    if (!isRunFile(value)) return;
    setView((v) => (onlyIfEmpty && v !== null ? v : { kind: 'recording', file: value, name: path.split('/').pop() ?? path, path }));
    // Chosen from the list under the figures: the page goes back up to them.
    if (!onlyIfEmpty) window.scrollTo({ top: 0, behavior: 'instant' });
  };
  // Reached from a link to one recording: it opens at once.
  useEffect(() => {
    try {
      const path = sessionStorage.getItem(OPEN_KEY);
      if (path) {
        sessionStorage.removeItem(OPEN_KEY);
        void showRecording(path);
      }
    } catch {
      // The list is there.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFile = async (file: File) => {
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!isRunFile(value)) throw new Error('not a run file');
      setBadFile(false);
      setView({ kind: 'recording', file: value, name: file.name, path: null });
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch {
      setBadFile(true);
    }
  };

  // Where the check cannot run here, the page opens on the latest recording (labelled as one), not on a
  // note that it cannot run; a recording asked for by a link, or a file opened, is shown instead.
  useEffect(() => {
    if (hasModel !== false || view !== null) return;
    const latest = recordingPaths()[0];
    if (latest) void showRecording(latest, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasModel]);

  const recording = view?.kind === 'recording' ? view.file : null;
  const recordingPath = view?.kind === 'recording' ? view.path : null;
  const day = (iso: string) => iso.slice(0, 10);
  return (
    <div className="screen device-check" data-testid="device-check" data-view={view?.kind ?? 'none'}>
      <a className="text-link back-link" href={routeHref({ name: 'start' })}>
        <ChevronLeft />
        {t('nav.home')}
      </a>
      <ScreenHeading size={50} wideSize={64} maxLines={3}>
        {recording ? t('deviceCheck.titleRecording') : t('deviceCheck.title')}
      </ScreenHeading>
      {recording && (
        <p className="recording-meta strong" data-testid="recording-meta">
          {t('deviceCheck.recordingMeta', { date: day(recording.date), browser: recording.browser, platform: recording.platform })}
        </p>
      )}
      {view && <Headline file={view.file} recording={view.kind === 'recording'} />}
      {recording && (
        <p className="dashed-note" data-testid="recording-note">
          {t('deviceCheck.recordingNote')}
        </p>
      )}
      {/* The first run is kept as the baseline: said where its figures are shown. */}
      {recordingPath && recordingRole(recordingPath) === 'baseline' && (
        <p className="small strong" data-testid="baseline-note">
          {t('deviceCheck.baselineNote')}
        </p>
      )}
      <p className="lead">{t('deviceCheck.lead')}</p>
      <p className="small">{t('deviceCheck.cloudNote')}</p>
      {/* Over a recording the page does not say this browser cannot run the check: the recording was made where it could. */}
      {hasModel === false && view === null && (
        <p className="dashed-note" data-testid="no-model">
          {t('deviceCheck.noModel')}
        </p>
      )}

      {view && <Results view={view} />}
      <p ref={status} tabIndex={-1} className="status-line" role="status" data-testid="device-check-status">
        {view?.kind === 'live' ? (view.running !== null ? t('deviceCheck.running', { n: view.running, total }) : t('deviceCheck.done')) : ''}
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
            {recordingPaths().map((path) => {
              const role = recordingRole(path);
              const shown = recordingPath === path;
              return (
                <li key={path}>
                  <button
                    type="button"
                    className="chip-button recording-chip"
                    data-recording={(path.split('/').pop() ?? path).replace(/\.json$/, '')}
                    data-role={role ?? 'earlier'}
                    aria-pressed={shown}
                    onClick={() => void showRecording(path)}
                  >
                    {shown && <Check size={14} />}
                    {role && <span className="recording-role">{t(role === 'latest' ? 'deviceCheck.recordingLatest' : 'deviceCheck.recordingBaseline')}</span>}
                    {recordingLabel(path, locale)}
                  </button>
                </li>
              );
            })}
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
        <label className="check-option" data-testid="device-check-repeat">
          <input type="checkbox" className="checkbox" checked={repeat} disabled={view?.kind === 'live' && view.running !== null} onChange={(e) => setRepeat(e.target.checked)} />
          <span>{t('deviceCheck.repeat')}</span>
        </label>
      )}
      {hasModel && (
        <BlockActions>
          {/* While it runs, the button that started it says which case it is on and cannot be pressed again. */}
          <button type="button" className="action" disabled={view?.kind === 'live' && view.running !== null} onClick={() => void run()} data-testid="run-device-check">
            <ActionLabel>{view?.kind === 'live' && view.running !== null ? t('deviceCheck.running', { n: view.running, total }) : t('deviceCheck.run')}</ActionLabel>
            <span className="action-arrow">{view?.kind === 'live' && view.running !== null ? <Spinner /> : <ArrowRight />}</span>
          </button>
        </BlockActions>
      )}
    </div>
  );
}

/**
 * The three numbers that matter, first, readable without the table: cases answered on this device,
 * readings with every yearly-income input right, and readings in which a wrong value reached the person.
 * A number a file does not record is left out, never guessed.
 */
function Headline({ file, recording = false }: { file: RunFile; recording?: boolean }) {
  const { t } = useApp();
  const s = summarize(countedCases(file), file.version);
  const incomeRight = s.income?.allRight ?? s.incomeInputsCorrect;
  const wrong = s.wrongReachedPerson;
  return (
    <ul className="device-headline" data-testid="device-headline">
      <li data-testid="headline-on-device">
        <span className="figure">
          {s.onDevice} / {s.total}
        </span>
        {/* A recording was made on another machine: it does not say "this device". */}
        <span className="small">{t(recording ? 'deviceCheck.headline.onRecordingDevice' : 'deviceCheck.headline.onDevice')}</span>
      </li>
      {incomeRight !== null && (
        <li data-testid="headline-income-right">
          <span className="figure">
            {incomeRight} / {s.extractionCases}
          </span>
          <span className="small">
            {t('deviceCheck.headline.incomeRight')}
            {s.income && s.income.notFound > 0 && (
              <span className="headline-aside" data-testid="headline-not-found">
                {' '}
                {t('deviceCheck.headline.notFound', { count: s.income.notFound })}
              </span>
            )}
          </span>
        </li>
      )}
      {wrong !== null && (
        // The number that must be zero: when it is, it is shown as met, with a check mark.
        <li data-testid="headline-wrong" data-met={wrong === 0}>
          <span className="figure">
            {wrong === 0 && <Check size={22} />}
            {wrong} / {s.extractionCases}
          </span>
          <span className="small">{wrong === 0 ? t('deviceCheck.headline.wrongNone') : t('deviceCheck.headline.wrong')}</span>
        </li>
      )}
    </ul>
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
      {s.income !== null ? (
        <>
          <p className="strong" data-testid="device-summary-income">
            {t('deviceCheck.summaryIncomeSplit', { total: s.extractionCases, right: s.income.allRight, notFound: s.income.notFound, wrong: s.income.wrong })}
          </p>
          <p className="strong" data-testid="device-summary-wrong" data-wrong={s.wrongReachedPerson ?? 0}>
            {t('deviceCheck.summaryWrong', { wrong: s.wrongReachedPerson ?? 0, total: s.extractionCases })}
          </p>
          <p className="small">{t('deviceCheck.wrongMustBeZero')}</p>
        </>
      ) : (
        s.incomeInputsCorrect !== null && (
          <p className="strong" data-testid="device-summary-income">
            {t('deviceCheck.summaryIncome', { correct: s.incomeInputsCorrect, total: s.extractionCases })}
          </p>
        )
      )}
      {(file.repetitions ?? 1) > 1 && (
        <p className="small" data-testid="device-summary-repetitions">
          {t('deviceCheck.summaryRepetitions', { repetitions: file.repetitions ?? 1 })}
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
                <tr key={`${c.id}#${c.repetition ?? 1}`} data-ran={ran} data-first-ran={firstRan(c, file.version)}>
                  <th scope="row">
                    {c.id}
                    {c.repetition !== undefined && <span className="small muted"> · {t('deviceCheck.repetition', { n: c.repetition, of: file.repetitions ?? c.repetition })}</span>}
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
