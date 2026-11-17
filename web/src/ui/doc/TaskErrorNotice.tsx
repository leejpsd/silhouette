// Explains a failed model task in plain language and keeps the exact SDK message available.
import type { TaskError } from '../../ai/errors';
import { useApp } from '../context';
import { dynamicKey, type CopyKey } from '../i18n';

/** The message for a failed task, by kind (the daily limit and cancelled or refused answers have their own wording). */
function messageKey(error: TaskError): CopyKey {
  if (error.kind === 'quota-daily') return 'error.quotaDaily';
  if (error.kind === 'cancelled') return 'answers.cancelled';
  if (error.kind === 'blocked') return 'answers.blocked';
  // Not the person's doing: said plainly, with what to do next.
  if (error.kind === 'app-check') return 'error.appCheckTryAgain';
  return dynamicKey(`error.${error.kind}`);
}

export function TaskErrorNotice({ error }: { error: TaskError }) {
  const { t } = useApp();
  return (
    <div className="task-error" role="alert" data-testid="task-error" data-kind={error.kind}>
      <p>{t(messageKey(error))}</p>
      <details>
        <summary>{t('error.detail')}</summary>
        <pre className="detail">{error.detail}</pre>
      </details>
    </div>
  );
}
