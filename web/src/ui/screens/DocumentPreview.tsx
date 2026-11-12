// Skeleton preview: exactly what could leave the device, before anything is sent.
import { useState } from 'react';
import { placeholderCounts, buildReview } from '../../core/review';
import { extractPointers, ON_DEVICE_LANGUAGES, POINTER_SCHEMAS } from '../../ai/tasks';
import { TOKEN_FLAGS, TOKEN_SOURCE, skeletonize } from '../../core/skeleton';
import { tidyNamePointers } from '../../core/tidy';
import type { Skeleton } from '../../core/types';
import { allowlistFor, introducersFor } from '../doc/allowlists';
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

/** Splits skeleton text between placeholders into visible words and everything else. */
function splitWords(text: string): { word?: string; text: string }[] {
  const out: { word?: string; text: string }[] = [];
  for (const m of text.matchAll(new RegExp(TOKEN_SOURCE, TOKEN_FLAGS))) {
    if (m[3] !== undefined) out.push({ word: m[3], text: m[3] });
    else out.push({ text: m[0] });
  }
  return out;
}

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
  const rawText = doc.text;

  /** Re-skeletonizes the document with the user's hidden words (they and their phrases masked). */
  const setHidden = (hiddenWords: readonly string[]) => {
    if (!rawText) return;
    const next = skeletonize(rawText, allowlistFor(doc.language), introducersFor(doc.language), new Set(hiddenWords));
    update({ skeleton: next.skeleton, map: next.map, hiddenWords, extraction: null, error: null });
  };
  const hide = (word: string) => setHidden([...new Set([...doc.hiddenWords, word.toLowerCase()])]);
  const unhide = (word: string) => setHidden(doc.hiddenWords.filter((w) => w !== word));
  const onDeviceFirst = ON_DEVICE_LANGUAGES.has(doc.language) && deviceStatus === 'available';

  const send = async () => {
    setSending(true);
    update({ error: null });
    try {
      // Re-check right before sending, so the sentence above matched what happens.
      setDeviceStatus(await pointerDeviceStatus('paystub', doc.language));
      const result = await extractPointers(skeleton, doc.docType, doc.language);
      const pointers = tidyNamePointers(POINTER_SCHEMAS[doc.docType], result.value, map, introducersFor(doc.language));
      const review = buildReview(POINTER_SCHEMAS[doc.docType], pointers, skeleton, map);
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
      <p className="help">{t('preview.hideHelp')}</p>
      <pre className="skeleton" data-testid="skeleton-preview" tabIndex={0} aria-label={t('preview.title')}>
        {renderSkeleton(skeleton, (word) => t('preview.hideWord', { word }), hide, sending)}
      </pre>
      {doc.hiddenWords.length > 0 && (
        <section className="hidden-words" aria-labelledby="hidden-words-title" data-testid="hidden-words">
          <h2 id="hidden-words-title">{t('preview.hidden')}</h2>
          <ul>
            {doc.hiddenWords.map((w) => (
              <li key={w}>
                <button type="button" className="button secondary" disabled={sending} onClick={() => unhide(w)}>
                  {t('preview.unhide', { word: w })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
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

function renderSkeleton(skeleton: Skeleton, label: (word: string) => string, hide: (word: string) => void, disabled: boolean) {
  return skeleton.split(PLACEHOLDER).map((part, i) =>
    PLACEHOLDER.test(part) ? (
      <span key={i} className="ph">
        {part.slice(1, -1)}
      </span>
    ) : (
      splitWords(part).map((piece, j) =>
        piece.word === undefined ? (
          <span key={`${i}-${j}`}>{piece.text}</span>
        ) : (
          <button
            key={`${i}-${j}`}
            type="button"
            className="word"
            aria-label={label(piece.word)}
            disabled={disabled}
            onClick={() => hide(piece.word as string)}
          >
            {piece.text}
          </button>
        ),
      )
    ),
  );
}
