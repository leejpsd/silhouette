// Skeleton preview: exactly what could leave the device, before anything is sent.
import { useState } from 'react';
import { placeholderCounts, buildReview } from '../../core/review';
import { extractPointers, ON_DEVICE_LANGUAGES, POINTER_SCHEMAS } from '../../ai/tasks';
import { pointerDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { classifyError } from '../../ai/errors';
import { useApp } from '../context';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { InferenceBadge } from '../InferenceBadge';
import { ModelStatus } from '../doc/ModelStatus';
import { useDocument } from '../doc/state';
import { TaskErrorNotice } from '../doc/TaskErrorNotice';

const PLACEHOLDER = /(⟦[DNW][0-9]+⟧)/;

export function DocumentPreviewScreen() {
  const { t } = useApp();
  const { doc, update } = useDocument();
  const [sending, setSending] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);

  if (!doc.skeleton || !doc.map) {
    return (
      <div className="screen">
        <ScreenHeading>{t('preview.missing')}</ScreenHeading>
        <a className="button secondary" href={routeHref({ name: 'doc' })}>
          {t('doc.title')}
        </a>
      </div>
    );
  }
  const { skeleton, map } = doc;
  const counts = placeholderCounts(skeleton);
  const onDeviceFirst = ON_DEVICE_LANGUAGES.has(doc.language) && deviceStatus === 'available';

  const send = async () => {
    setSending(true);
    update({ error: null });
    try {
      // Re-check right before sending, so the sentence above matched what happens.
      setDeviceStatus(await pointerDeviceStatus('paystub', doc.language));
      const result = await extractPointers(skeleton, doc.docType, doc.language);
      const review = buildReview(POINTER_SCHEMAS[doc.docType], result.value, skeleton, map);
      update({ extraction: { review, inferenceSource: result.inferenceSource, reason: result.reason } });
      navigate({ name: 'doc-review' });
    } catch (error) {
      update({ error: classifyError(error) });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="screen doc-preview">
      <ScreenHeading>{t('preview.title')}</ScreenHeading>
      <p className="lead">{t('preview.lead')}</p>
      {doc.photoSource && <InferenceBadge source={doc.photoSource.inferenceSource} reason={doc.photoSource.reason} />}
      <p className="meta">{t('preview.counts', { numbers: counts.N, dates: counts.D, words: counts.W })}</p>
      <pre className="skeleton" data-testid="skeleton-preview" tabIndex={0} aria-label={t('preview.title')}>
        {skeleton.split(PLACEHOLDER).map((part, i) =>
          PLACEHOLDER.test(part) ? (
            <span key={i} className="ph">
              {part.slice(1, -1)}
            </span>
          ) : (
            part
          ),
        )}
      </pre>
      <ModelStatus language={doc.language} onStatus={setDeviceStatus} />
      <p className="private">{onDeviceFirst ? t('preview.onDevice') : t('preview.cloud')}</p>
      <p className="meta">{t('leaving.network')}</p>
      <div role="status" className="busy">
        {sending ? t('preview.sending') : ''}
      </div>
      {doc.error && (
        <>
          <TaskErrorNotice error={doc.error} />
          <div className="actions">
            <button type="button" className="button secondary" onClick={() => void send()}>
              {t('error.retry')}
            </button>
            <button type="button" className="button secondary" onClick={() => navigate({ name: 'doc-review' })}>
              {t('error.typeInstead')}
            </button>
          </div>
        </>
      )}
      <div className="actions">
        <button type="button" className="button primary" disabled={sending} onClick={() => void send()}>
          {t('leaving.send')}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={sending}
          onClick={() => {
            update({ extraction: null, error: null });
            navigate({ name: 'doc-review' });
          }}
        >
          {t('leaving.skip')}
        </button>
      </div>
      <a className="button quiet back" href={routeHref({ name: 'doc' })}>
        {t('q.back')}
      </a>
    </div>
  );
}
