// "Where each task runs" (#/tasks): the routing table (shared/routing.json) as four cards: on this device
// only, device first with the cloud if needed, in the cloud, and no model at all.
import { useEffect, useState } from 'react';
import routing from '../../../../shared/routing.json';
// The cloud evaluation of the reading prompt (README, "Evidence"): only its totals are read here.
import { date as cloudDate, leakCheck, metrics } from '../../../eval/results/v15p4.json';
import { countedCases, finalRan, isRunFile, summarize, type RunFile } from '../device-check/run';
import { useApp } from '../context';
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

/** Why the routing is what it is: the measured figures behind it, each traceable to a file. */
function Measured() {
  const { t, locale } = useApp();
  const devices = useDeviceFigures();
  const cloud = metrics.enPaystub;
  const exact = devices.reduce((a, d) => a + d.exact, 0);
  const exactOnDevice = devices.reduce((a, d) => a + d.exactOnDevice, 0);
  return (
    <section className="measured" aria-labelledby="measured-title" data-testid="tasks-measured">
      <h2 id="measured-title" className="section-heading">
        {t('tasks.measured.title')}
      </h2>
      <p className="small muted">{t('tasks.measured.lead')}</p>
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
    </div>
  );
}
