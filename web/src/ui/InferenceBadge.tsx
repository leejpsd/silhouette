// Inference source badge and routing reason chip (CLAUDE.md rule 7): shown on every model result.
// For explanations the chip also says what decided the route: the length against the Remote Config
// limit, or a language the on-device model lacks.
import type { ExplainRoute } from '../core/explain';
import type { InferenceSource, RoutingReason } from '../ai/tasks';
import { useApp } from './context';
import { LOCALE_NAMES, dynamicKey, isLocale } from './i18n';

export function InferenceBadge({ source, reason, route }: { source: InferenceSource; reason: RoutingReason; route?: ExplainRoute | undefined }) {
  const { t } = useApp();
  let detail: string | null = null;
  if (route && reason !== 'on-device-failed') {
    detail =
      route.basis === 'locale'
        ? t('reason.detail.locale', { language: isLocale(route.locale) ? LOCALE_NAMES[route.locale] : route.locale })
        : t('reason.detail.words', { words: route.words, limit: route.maxShortWords });
  }
  return (
    <p className="provenance" data-testid="inference-badge" data-source={source} data-reason={reason}>
      <span className={`badge ${source === 'ON_DEVICE' ? 'badge-device' : 'badge-cloud'}`}>
        {source === 'ON_DEVICE' ? t('badge.onDevice') : t('badge.cloud')}
      </span>
      <span className="chip">
        {t(dynamicKey(`reason.${reason}`))}
        {detail && <span className="chip-detail"> · {detail}</span>}
      </span>
    </p>
  );
}
