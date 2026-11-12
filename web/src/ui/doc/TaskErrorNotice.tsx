// Explains a failed model task in plain language and keeps the exact SDK message available.
import type { TaskError } from '../../ai/errors';
import { useApp } from '../context';
import { dynamicKey } from '../i18n';

export function TaskErrorNotice({ error }: { error: TaskError }) {
  const { t } = useApp();
  return (
    <div className="task-error" role="alert" data-testid="task-error" data-kind={error.kind}>
      <p>{t(dynamicKey(`error.${error.kind}`))}</p>
      <details>
        <summary>{t('error.detail')}</summary>
        <pre className="detail">{error.detail}</pre>
      </details>
    </div>
  );
}
