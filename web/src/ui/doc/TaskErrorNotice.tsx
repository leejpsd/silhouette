// Explains a failed model task in plain language and keeps the exact SDK message available.
import { appCheckCause, type TaskError } from '../../ai/errors';
import { useApp } from '../context';
import { dynamicKey, type CopyKey } from '../i18n';

/** The message for a failed task, by kind (the daily limit and cancelled or refused answers have their own wording). */
function messageKey(error: TaskError): CopyKey {
  if (error.kind === 'quota-daily') return 'error.quotaDaily';
  if (error.kind === 'cancelled') return 'answers.cancelled';
  if (error.kind === 'blocked') return 'answers.blocked';
  if (error.kind === 'app-check') return `error.appCheck.${appCheckCause(error)}`;
  return dynamicKey(`error.${error.kind}`);
}

export function TaskErrorNotice({ error }: { error: TaskError }) {
  const { t } = useApp();
  return (
    <div className="task-error" role="alert" data-testid="task-error" data-kind={error.kind}>
      {/* A refused security check: which cause it was, then what to do next (never the person's fault). */}
      <p>{error.kind === 'app-check' ? `${t(messageKey(error))} ${t('error.appCheck.typeInstead')}` : t(messageKey(error))}</p>
      <details>
        <summary>{t('error.detail')}</summary>
        <pre className="detail">{error.detail}</pre>
      </details>
    </div>
  );
}
