// Inference source badge and routing reason chip: shown on every model result. The chip also says
// why a request ran where it ran: the length against the Remote Config limit, a language the
// on-device model lacks, or no model on this device. Screen readers hear badge and reason as one
// sentence; the visible text is unchanged.
import type { ExplainRoute } from '../core/explain';
import type { InferenceSource, RoutingReason } from '../ai/tasks';
import { useApp } from './context';
import { LOCALE_NAMES, dynamicKey, isLocale, type Translate } from './i18n';

export interface Provenance {
  readonly inferenceSource: InferenceSource;
  readonly reason: RoutingReason;
  readonly route?: ExplainRoute | undefined;
  readonly ranInCloudBecause?: 'no-device-model' | undefined;
}

/** The detail after the reason: what actually decided where the request ran. */
export function provenanceDetail(t: Translate, p: Provenance): string | null {
  if (p.ranInCloudBecause === 'no-device-model') return t('reason.detail.noDeviceModel');
  if (!p.route || p.reason === 'on-device-failed') return null;
  return p.route.basis === 'locale'
    ? t('reason.detail.locale', { language: isLocale(p.route.locale) ? LOCALE_NAMES[p.route.locale] : p.route.locale })
    : t('reason.detail.words', { words: p.route.words, limit: p.route.maxShortWords });
}

/** Badge and reason as one sentence, for screen readers and status lines. */
export function provenanceSentence(t: Translate, p: Provenance): string {
  const badge = p.inferenceSource === 'ON_DEVICE' ? t('badge.onDevice') : t('badge.cloud');
  const detail = provenanceDetail(t, p);
  return `${badge}: ${t(dynamicKey(`reason.${p.reason}`))}${detail ? `, ${detail}` : ''}.`;
}

export function InferenceBadge({
  source,
  reason,
  route,
  ranInCloudBecause,
}: {
  source: InferenceSource;
  reason: RoutingReason;
  route?: ExplainRoute | undefined;
  ranInCloudBecause?: 'no-device-model' | undefined;
}) {
  const { t } = useApp();
  const p: Provenance = { inferenceSource: source, reason, route, ranInCloudBecause };
  const detail = provenanceDetail(t, p);
  return (
    <p className="provenance" data-testid="inference-badge" data-source={source} data-reason={reason} data-detail={ranInCloudBecause ?? route?.basis ?? ''}>
      <span className="visually-hidden">{provenanceSentence(t, p)}</span>
      <span className={`badge ${source === 'ON_DEVICE' ? 'badge-device' : 'badge-cloud'}`} aria-hidden="true">
        {source === 'ON_DEVICE' ? t('badge.onDevice') : t('badge.cloud')}
      </span>
      <span className="chip" aria-hidden="true">
        {t(dynamicKey(`reason.${reason}`))}
        {detail && <span className="chip-detail"> · {detail}</span>}
      </span>
    </p>
  );
}
