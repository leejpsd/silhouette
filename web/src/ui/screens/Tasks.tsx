// "Where each task runs" (#/tasks): the routing table (shared/routing.json) as four cards: on this device
// only, device first with the cloud if needed, in the cloud, and no model at all.
import routing from '../../../../shared/routing.json';
import { useApp } from '../context';
import { dynamicKey } from '../i18n';
import { ScreenHeading } from '../Heading';
import { routeHref } from '../router';
import { ChevronLeft, Lock } from '../design/icons';

type Mode = 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'PREFER_IN_CLOUD' | 'ONLY_IN_CLOUD' | 'NONE';
type Task = { readonly mode: string; readonly tools?: readonly string[]; readonly model?: string };

const GROUPS: readonly { id: 'device' | 'first' | 'cloud' | 'none'; modes: readonly Mode[] }[] = [
  { id: 'device', modes: ['ONLY_ON_DEVICE'] },
  { id: 'first', modes: ['PREFER_ON_DEVICE'] },
  { id: 'cloud', modes: ['PREFER_IN_CLOUD', 'ONLY_IN_CLOUD'] },
  { id: 'none', modes: ['NONE'] },
];

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
