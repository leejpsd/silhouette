// "Where each task runs" (#/tasks): the routing table (shared/routing.json) as four cards: on this device
// only, device first with the cloud if needed, in the cloud, and no model at all.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { pointerDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { CONFIG_STORAGE_KEY, appConfig, subscribeConfig } from '../../data/remote-config';
import routing from '../../../../shared/routing.json';
// The cloud evaluation of the reading prompt (README, "Evidence"): its totals are read here, and
// "Recount from the file" recounts them from the file itself.
import { date as cloudDate, leakCheck, metrics } from '../../../eval/results/v15p4.json';
import { countedCases, finalRan, isRunFile, summarize, type RunFile } from '../device-check/run';
import { useApp } from '../context';
import { Recount } from '../evidence/Recount';
import { HeldoutRecount } from '../evidence/HeldoutRecount';
import { HELDOUT_RUN_DATES, useHeldoutDevices, useHeldoutLine, type HeldoutDevices } from '../evidence/HeldoutDevices';
import heldoutSummary from '../../../eval/results/heldout/summary.json';
import { dynamicKey, packDate } from '../i18n';
import { ScreenHeading } from '../Heading';
import { navigate, routeHref } from '../router';
import { Check, ChevronLeft, Lock } from '../design/icons';
import { openRecordingNext, recordingLabel, recordingMachine, recordingPaths, RECORDINGS } from './DeviceCheck';

type Mode = 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'PREFER_IN_CLOUD' | 'ONLY_IN_CLOUD' | 'NONE';
type Task = { readonly mode: string; readonly tools?: readonly string[]; readonly model?: string };

const GROUPS: readonly { id: 'device' | 'first' | 'cloud' | 'none'; modes: readonly Mode[] }[] = [
  { id: 'device', modes: ['ONLY_ON_DEVICE'] },
  { id: 'first', modes: ['PREFER_ON_DEVICE'] },
  { id: 'cloud', modes: ['PREFER_IN_CLOUD', 'ONLY_IN_CLOUD'] },
  { id: 'none', modes: ['NONE'] },
];

/** What one recorded run shows about the reading and about the tasks that use exact values. */
interface DeviceFigures {
  readonly path: string;
  readonly readings: number;
  readonly onDevice: number;
  readonly fallback: number;
  readonly wrong: number | null;
  readonly exact: number;
  readonly exactOnDevice: number;
}

const TASK_MODE = routing.tasks as Readonly<Record<string, Task>>;

function deviceFigures(path: string, file: RunFile): DeviceFigures {
  const cases = countedCases(file);
  const readings = cases.filter((c) => c.task === 'document.pointer.extract');
  const exact = cases.filter((c) => TASK_MODE[c.task]?.mode === 'ONLY_ON_DEVICE');
  return {
    path,
    readings: readings.length,
    onDevice: readings.filter((c) => finalRan(c, file.version) === 'ON_DEVICE').length,
    // Rejected by the device's own checks, then repeated once in the cloud with the same silhouette.
    fallback: readings.filter((c) => c.final?.retried === true && finalRan(c, file.version) === 'IN_CLOUD').length,
    wrong: summarize(cases, file.version).wrongReachedPerson,
    exact: exact.length,
    exactOnDevice: exact.filter((c) => finalRan(c, file.version) === 'ON_DEVICE').length,
  };
}

/** The latest recording of each kind of device (an iPhone, Chrome), worked out from the bundled run files. */
function useDeviceFigures(): readonly DeviceFigures[] {
  const [rows, setRows] = useState<readonly DeviceFigures[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const paths = recordingPaths();
      const latest = [paths.find((p) => /ios/.test(p)), paths.find((p) => /chrome/.test(p))].filter((p): p is string => p !== undefined);
      const found: DeviceFigures[] = [];
      for (const path of latest) {
        const value = await RECORDINGS[path]?.();
        if (isRunFile(value) && value.version >= 3) found.push(deviceFigures(path, value));
      }
      if (live) setRows(found);
    })();
    return () => {
      live = false;
    };
  }, []);
  return rows;
}

function Figure({ value, total, met, children, testId }: { value: number; total: number; met?: boolean; children: string; testId: string }) {
  return (
    <li data-testid={testId} data-met={met}>
      <span className="figure">
        {met && <Check size={22} />}
        {value} / {total}
      </span>
      <span className="small">{children}</span>
    </li>
  );
}

/**
 * The never-seen sets (eval/heldout/, eval/heldout-2/): documents written independently of the prompts, word
 * lists and tuning documents, committed before they were read. Figures from eval/results/heldout/summary.json,
 * which a test recomputes from the result files; the button recounts them here.
 */
function HeldOut({ devices }: { devices: HeldoutDevices | null }) {
  const { t, locale } = useApp();
  const f = heldoutSummary.figures;
  return (
    <div className="measured-block measured-heldout" data-testid="measured-heldout">
      <p className="measured-source">{t('tasks.heldout.title')}</p>
      <p className="small muted">{t('tasks.heldout.lead', { paystubs: f.paystubs.documents, w2s: f.w2.firstSet.documents + f.w2.secondSet.documents, date: packDate(locale, heldoutSummary.date) })}</p>
      <ul className="device-headline">
        <Figure value={f.paystubs.cloudWrong} total={f.paystubs.documents} met={f.paystubs.cloudWrong === 0} testId="heldout-paystub-cloud">
          {t('tasks.heldout.paystubCloud')}
        </Figure>
        <Figure value={f.paystubs.deviceWrong} total={f.paystubs.documents} met={f.paystubs.deviceWrong === 0} testId="heldout-paystub-device">
          {t('tasks.heldout.paystubDevice')}
        </Figure>
      </ul>
      <p className="small" data-testid="heldout-caught">
        {t('tasks.heldout.caught', { caught: f.paystubs.deviceFirstWrong, total: f.paystubs.documents, retried: f.paystubs.retried })}
      </p>
      <p className="small" data-testid="heldout-w2">
        {t('tasks.heldout.w2', {
          wrong: f.w2.firstSet.cloudWrong,
          total: f.w2.firstSet.documents,
          wrong2: f.w2.secondSet.cloudWrong,
          total2: f.w2.secondSet.documents,
          right: f.w2.afterChecks.right,
          left: f.w2.afterChecks.leftOut,
          after: f.w2.afterChecks.wrong,
          all: f.w2.afterChecks.documents,
        })}
      </p>
      <HeldoutRecount shown={f} />
      <IphoneHeldOut f={devices?.iphone ?? null} />
    </div>
  );
}

/** The iPhone 17 Pro on the third never-seen set, counted here from its run file and the set's answer keys. */
function IphoneHeldOut({ f }: { f: HeldoutDevices['iphone'] | null }) {
  const { t, locale } = useApp();
  const machine = 'iPhone 17 Pro';
  if (f === null) return <p className="small muted">{t('tasks.heldout.iphone.loading', { machine })}</p>;
  return (
    <div className="heldout-iphone" data-testid="heldout-iphone" data-first={f.firstWrong} data-stopped={f.stopped} data-on-device={f.onDevice} data-all-right={f.incomeAllRight} data-wrong={f.incomeWrong}>
      <p className="measured-source">{t('tasks.heldout.iphone.title', { machine, total: f.documents, date: packDate(locale, HELDOUT_RUN_DATES.iphone) })}</p>
      <ul className="device-headline">
        <Figure value={f.incomeWrong} total={f.documents} met={f.incomeWrong === 0} testId="heldout-iphone-wrong">
          {t('tasks.heldout.iphone.wrong', { machine })}
        </Figure>
      </ul>
      <p className="small" data-testid="heldout-iphone-caught">
        {t('tasks.heldout.iphone.caught', { first: f.firstWrong, total: f.documents, stopped: f.stopped, onDevice: f.onDevice, allRight: f.incomeAllRight })}
        {f.incomeWrong > 0 && ` ${t('tasks.heldout.iphone.fromCloud', { cloud: f.incomeWrongFromCloud, wrong: f.incomeWrong })}`}
      </p>
      <p className="small muted">{t('tasks.heldout.iphone.source', { machine })}</p>
    </div>
  );
}

/** Why the routing is what it is: the measured figures behind it, each traceable to a file. */
function Measured() {
  const { t, locale } = useApp();
  const devices = useDeviceFigures();
  const heldout = useHeldoutDevices();
  const line = useHeldoutLine();
  const cloud = metrics.enPaystub;
  const exact = devices.reduce((a, d) => a + d.exact, 0);
  const exactOnDevice = devices.reduce((a, d) => a + d.exactOnDevice, 0);
  return (
    <section className="measured" aria-labelledby="measured-title" data-testid="tasks-measured">
      <h2 id="measured-title" className="section-heading">
        {t('tasks.measured.title')}
      </h2>
      <p className="small muted">{t('tasks.measured.lead')}</p>
      {/* Documents it had never seen first: the figures the prompts and checks were not tuned on. */}
      <HeldOut devices={heldout} />
      <div className="measured-grid">
        {devices.map((d) => (
          <div key={d.path} className="measured-block" data-testid="measured-device">
            <button
              type="button"
              className="text-link measured-source"
              aria-label={recordingLabel(d.path, locale)}
              onClick={() => {
                openRecordingNext(d.path);
                navigate({ name: 'device-check' });
              }}
            >
              {recordingMachine(d.path)}
            </button>
            {/* These runs use the check paystubs; the same device on never-seen paystubs is under them. */}
            <p className="small muted" data-testid="measured-tuned">
              {t('tasks.measured.tuned')}
            </p>
            <ul className="device-headline">
              <Figure value={d.onDevice} total={d.readings} testId="measured-on-device">
                {t('tasks.measured.onDevice')}
              </Figure>
              <Figure value={d.fallback} total={d.readings} testId="measured-fallback">
                {t('tasks.measured.fallback')}
              </Figure>
              {d.wrong !== null && (
                <Figure value={d.wrong} total={d.readings} met={d.wrong === 0} testId="measured-wrong">
                  {t('tasks.measured.wrong')}
                </Figure>
              )}
            </ul>
            {heldout && (
              <p className="small measured-never-seen" data-testid="measured-never-seen">
                <strong>{t('tasks.measured.neverSeen', { total: (/ios/.test(d.path) ? heldout.iphone : heldout.chrome).documents })}: </strong>
                {line(/ios/.test(d.path) ? heldout.iphone : heldout.chrome)}
              </p>
            )}
          </div>
        ))}
        <div className="measured-block" data-testid="measured-cloud">
          <p className="measured-source">{t('tasks.measured.cloudTitle')}</p>
          <ul className="device-headline">
            <Figure value={Math.round(cloud.allFieldsCorrect * cloud.documents)} total={cloud.documents} testId="measured-cloud-right">
              {t('tasks.measured.cloudRight')}
            </Figure>
            <Figure value={leakCheck.leaks.length} total={leakCheck.requestBodies} met={leakCheck.leaks.length === 0} testId="measured-leaks">
              {t('tasks.measured.leaks')}
            </Figure>
          </ul>
          <p className="small muted">{t('tasks.measured.cloudSource', { date: packDate(locale, cloudDate.slice(0, 10)) })}</p>
          <Recount
            shownRight={Math.round(cloud.allFieldsCorrect * cloud.documents)}
            shownTotal={cloud.documents}
            shownLeaks={leakCheck.leaks.length}
            shownBodies={leakCheck.requestBodies}
          />
        </div>
      </div>
      {exact > 0 && (
        <ul className="device-headline">
          <Figure value={exactOnDevice} total={exact} met={exactOnDevice === exact} testId="measured-exact">
            {t('tasks.measured.exact')}
          </Figure>
        </ul>
      )}
      <p className="measured-why" data-testid="measured-why">
        {t('tasks.measured.why')}
      </p>
    </section>
  );
}

/**
 * How the routing is held to, as a reviewer asked: the guard before every ONLY_ON_DEVICE call (the SDK
 * would send such a request to the cloud in a browser without the model), this browser's model, the
 * network check, the Raw type; then the Remote Config values in use and where they came from.
 */
function Enforced() {
  const { t } = useApp();
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  useEffect(() => {
    let live = true;
    void pointerDeviceStatus('paystub', 'en').then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  const config = useSyncExternalStore(subscribeConfig, appConfig, appConfig);
  const fetched = (() => {
    try {
      return globalThis.localStorage?.getItem(CONFIG_STORAGE_KEY) !== null && globalThis.localStorage?.getItem(CONFIG_STORAGE_KEY) !== undefined;
    } catch {
      return false;
    }
  })();
  const onOff = (on: boolean) => t(on ? 'tasks.config.on' : 'tasks.config.off');
  const rows: [string, string, string][] = [
    ['route_short_text_max_words', t('tasks.config.route_short_text_max_words'), String(config.routeShortTextMaxWords)],
    ['route_ondevice_locales_web', t('tasks.config.route_ondevice_locales_web'), config.onDeviceLocales.join(', ')],
    ['prompt_pointer_extract_v', t('tasks.config.prompt_pointer_extract_v'), `v${config.promptPointerExtractV}`],
    ['prompt_explain_v', t('tasks.config.prompt_explain_v'), `v${config.promptExplainV}`],
    ['prompt_ask_v', t('tasks.config.prompt_ask_v'), `v${config.promptAskV}`],
    ['feature_grounding_search · feature_grounding_maps · feature_tts', t('tasks.config.features'), onOff(config.groundingSearch || config.groundingMaps || config.tts)],
  ];
  return (
    <>
      <section className="enforced" aria-labelledby="enforced-title" data-testid="tasks-enforced">
        <h2 id="enforced-title" className="section-heading">
          {t('tasks.enforce.title')}
        </h2>
        <ul className="enforced-list">
          <li>
            <p>{t('tasks.enforce.onlyOnDevice')}</p>
            {status !== null && (
              <p className="small strong" data-testid="enforced-browser" data-status={status}>
                {t('tasks.enforce.thisBrowser', { status: t(dynamicKey(`tasks.enforce.status.${status}`)) })}
              </p>
            )}
          </li>
          <li>
            <p>{t('tasks.enforce.monitor')}</p>
          </li>
          <li>
            <p>{t('tasks.enforce.types')}</p>
          </li>
          <li data-testid="enforced-appcheck">
            <p>{t('tasks.enforce.appCheck')}</p>
          </li>
        </ul>
      </section>
      <section className="config" aria-labelledby="config-title" data-testid="tasks-config" data-source={fetched ? 'fetched' : 'defaults'}>
        <h2 id="config-title" className="section-heading">
          {t('tasks.config.title')}
        </h2>
        <p className="small muted">{t('tasks.config.lead')}</p>
        <table className="config-table">
          <tbody>
            {rows.map(([key, label, value]) => (
              <tr key={key}>
                <th scope="row">
                  {label}
                  <code className="config-key">{key}</code>
                </th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" data-testid="config-source">
          {t(fetched ? 'tasks.config.source.fetched' : 'tasks.config.source.defaults')}
        </p>
      </section>
    </>
  );
}

export function TasksScreen() {
  const { t } = useApp();
  const tasks = Object.entries(routing.tasks as Readonly<Record<string, Task>>);
  return (
    <div className="screen tasks" data-testid="tasks">
      <a className="text-link back-link" href={routeHref({ name: 'judges' })}>
        <ChevronLeft />
        {t('rail.judges')}
      </a>
      <ScreenHeading size={40} wideSize={64} maxLines={3}>
        {t('tasks.title')}
      </ScreenHeading>
      <p className="small muted">{t('tasks.lead')}</p>
      <Measured />
      <ul className="task-groups">
        {GROUPS.map((group) => {
          const names = tasks.filter(([, task]) => group.modes.includes(task.mode as Mode));
          // Tasks that use a tool or a speech model are switched on remotely (Remote Config flags).
          const flagged = names.some(([, task]) => task.tools !== undefined || task.model !== undefined);
          return (
            <li key={group.id} className={`task-group task-${group.id}`} data-testid={`tasks-${group.id}`}>
              <p className="task-head">
                <span className={`task-mark task-mark-${group.id}`} aria-hidden="true" />
                <span className="task-title">{t(dynamicKey(`tasks.${group.id}`))}</span>
                {flagged && <span className="task-flag">{t('tasks.flags')}</span>}
                {group.id === 'device' && <Lock />}
              </p>
              <p className="task-names">{names.map(([id]) => t(dynamicKey(`tasks.task.${id}`))).join(' · ')}</p>
              <p className="task-note">{t(dynamicKey(`tasks.${group.id}.note`))}</p>
            </li>
          );
        })}
      </ul>
      <p className="card-note">{t('tasks.foot')}</p>
      <Enforced />
    </div>
  );
}
