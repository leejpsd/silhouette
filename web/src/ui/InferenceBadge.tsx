// Inference source badge and routing reason chip (CLAUDE.md rule 7): shown on every model result.
import type { InferenceSource, RoutingReason } from '../ai/tasks';
import { useApp } from './context';
import { dynamicKey } from './i18n';

export function InferenceBadge({ source, reason }: { source: InferenceSource; reason: RoutingReason }) {
  const { t } = useApp();
  return (
    <p className="provenance" data-testid="inference-badge" data-source={source} data-reason={reason}>
      <span className={`badge ${source === 'ON_DEVICE' ? 'badge-device' : 'badge-cloud'}`}>
        {source === 'ON_DEVICE' ? t('badge.onDevice') : t('badge.cloud')}
      </span>
      <span className="chip">{t(dynamicKey(`reason.${reason}`))}</span>
    </p>
  );
}
