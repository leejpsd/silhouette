// Skeleton preview: exactly what could leave the device, before anything is sent.
import { useEffect, useState, type CSSProperties } from 'react';
import { placeholderCounts, buildReview, type SourceSegment } from '../../core/review';
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
import { OFFLINE_SAMPLE_REASON, sampleAnswerKey } from '../doc/offline-sample';
import { phoneLines } from '../doc/phone-view';
import { BlockActions } from '../design/block';
import { ArrowUp, ChevronLeft, Cloud, Doc, Phone } from '../design/icons';
import { useOnline } from '../design/online';
import { ActionLabel } from '../design/parts';
import { Loading } from '../answers/parts';

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

let firstPreview = true;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function DocumentPreviewScreen() {
  const { t } = useApp();
  const { doc, update } = useDocument();
  const [sending, setSending] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const online = useOnline();
  // The first silhouette of a session is shown being made: the document as it is, then the bars.
  const [mode, setMode] = useState<'phone' | 'leave'>(() => {
    const show = firstPreview && !reducedMotion();
    firstPreview = false;
    return show ? 'phone' : 'leave';
  });
  const [transforming, setTransforming] = useState(mode === 'phone');
  useEffect(() => {
    if (!transforming) return;
    const timer = setTimeout(() => {
      setMode('leave');
      setTransforming(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [transforming]);

  if (!doc.skeleton || !doc.map) {
    return (
      <div className="screen">
        <ScreenHeading>{t('preview.missing')}</ScreenHeading>
        <a className="outline-button" href={routeHref({ name: 'doc' })}>
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
      const status = await pointerDeviceStatus('paystub', doc.language);
      setDeviceStatus(status);
      // A bundled sample with no network and no device model: its answer key, on this device.
      const key = doc.sourceKind === 'sample' && doc.hiddenWords.length === 0 && !navigator.onLine && status !== 'available' ? sampleAnswerKey(skeleton) : null;
      if (key !== null) {
        const review = buildReview(POINTER_SCHEMAS[doc.docType], key, skeleton, map);
        update({ extraction: { review, inferenceSource: 'SAMPLE_KEY', reason: OFFLINE_SAMPLE_REASON } });
        navigate({ name: 'doc-review' });
        return;
      }
      const result = await extractPointers(skeleton, doc.docType, doc.language);
      const pointers = tidyNamePointers(POINTER_SCHEMAS[doc.docType], result.value, map, introducersFor(doc.language));
      const review = buildReview(POINTER_SCHEMAS[doc.docType], pointers, skeleton, map);
      update({ extraction: { review, inferenceSource: result.inferenceSource, reason: result.reason, ranInCloudBecause: result.ranInCloudBecause } });
      navigate({ name: 'doc-review' });
    } catch (error) {
      update({ error: classifyError(error) });
    } finally {
      setSending(false);
    }
  };

  const offlineSample = doc.sourceKind === 'sample' && doc.hiddenWords.length === 0 && !online && deviceStatus !== 'available';
  const lines = phoneLines(skeleton, map);
  // Placeholder id → the original text's length (for bar widths) and whether the person hid it.
  const original = new Map(lines.flatMap((l) => l.filter((seg) => seg.ref).map((seg) => [seg.ref as string, seg.text] as const)));
  const lastHidden = doc.hiddenWords[doc.hiddenWords.length - 1];

  return (
    <div className="screen doc-preview">
      <ScreenHeading size={58} maxLines={4}>
        {t('preview.title')}
      </ScreenHeading>
      <p className="small muted">{t('preview.lead')}</p>
      {doc.photoSource && <InferenceBadge source={doc.photoSource.inferenceSource} reason={doc.photoSource.reason} />}
      <div className="toggle" role="group" aria-label={t('preview.title')}>
        <button type="button" aria-pressed={mode === 'phone'} onClick={() => { setTransforming(false); setMode('phone'); }}>
          {t('preview.onPhone')}
        </button>
        <button type="button" aria-pressed={mode === 'leave'} className="toggle-leave" onClick={() => { setTransforming(false); setMode('leave'); }}>
          {t('preview.couldLeave')}
        </button>
      </div>
      <pre className="doc paper paper-large" data-mode={mode} data-testid="skeleton-preview" tabIndex={0} aria-label={mode === 'leave' ? t('preview.couldLeave') : t('preview.onPhone')}>
        {mode === 'leave'
          ? renderSkeleton(skeleton, original, doc.hiddenWords, (word) => t('preview.hideWord', { word }), hide, sending, t)
          : renderPhone(lines, (word) => t('preview.hideWord', { word }), hide, sending)}
      </pre>
      <p className="small muted">{t('preview.counts', { numbers: counts.N, dates: counts.D, words: counts.W })}</p>
      <div className="hide-row">
        <p className="small">
          {t('preview.hideHelp')}
          {lastHidden !== undefined && ` ${t('preview.youHid', { word: lastHidden })}`}
        </p>
        {lastHidden !== undefined && (
          <button type="button" className="text-link" disabled={sending} onClick={() => unhide(lastHidden)}>
            {t('preview.undo')}
          </button>
        )}
      </div>
      {doc.hiddenWords.length > 0 && (
        <section className="hidden-words" aria-labelledby="hidden-words-title" data-testid="hidden-words">
          <h2 id="hidden-words-title" className="small strong">
            {t('preview.hidden')}
          </h2>
          <ul className="chip-list">
            {doc.hiddenWords.map((w) => (
              <li key={w}>
                <button type="button" className="chip-button" disabled={sending} onClick={() => unhide(w)}>
                  {t('preview.unhide', { word: w })}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ModelStatus language={doc.language} onStatus={setDeviceStatus} />
      <p className="small muted">{t('leaving.network')}</p>
      {sending && <Loading />}
      <div role="status" className="status-line">
        {sending ? t('preview.sending') : ''}
      </div>
      {doc.error && (
        <>
          <TaskErrorNotice error={doc.error} />
          <div className="button-row">
            {/* A daily limit does not recover by trying again now. */}
            {doc.error.kind !== 'quota-daily' && (
              <button type="button" className="outline-button" onClick={() => void send()}>
                {t('error.retry')}
              </button>
            )}
            <button type="button" className="outline-button" onClick={() => navigate({ name: 'doc-review' })}>
              {t('error.typeInstead')}
            </button>
          </div>
        </>
      )}
      <a className="text-link back-link" href={routeHref({ name: 'doc' })}>
        <ChevronLeft />
        {t('q.back')}
      </a>
      <BlockActions mode="decision">
        <p className="routing-line">
          {offlineSample ? <Doc /> : onDeviceFirst ? <Phone size={22} /> : <Cloud size={22} />}
          <span>
            <strong>{offlineSample ? t('badge.sampleKey') : onDeviceFirst ? t('badge.onDevice') : t('badge.cloud')}.</strong>{' '}
            {offlineSample ? t('preview.sample') : onDeviceFirst ? t('preview.onDevice') : t('preview.cloud')}
          </span>
        </p>
        <div className="decision">
          <button
            type="button"
            className="outline-button tall"
            disabled={sending}
            onClick={() => {
              update({ extraction: null, error: null });
              navigate({ name: 'doc-review' });
            }}
          >
            {t('leaving.skip')}
          </button>
          {offlineSample ? (
            <button type="button" className="action centered" disabled={sending} onClick={() => void send()}>
              <span className="action-label small-label">{t('preview.sampleButton')}</span>
            </button>
          ) : (
            <button type="button" className="send-button" disabled={sending} onClick={() => void send()}>
              <ArrowUp />
              <ActionLabel>{t('leaving.send')}</ActionLabel>
            </button>
          )}
        </div>
      </BlockActions>
    </div>
  );
}

type T = (key: 'placeholder.word' | 'placeholder.number' | 'placeholder.date') => string;

/** "What could leave": the skeleton with each placeholder as a bar with its id, visible words as buttons to hide. */
/**
 * A placeholder takes the same width in both views (the longer of its text and its id, in characters
 * of the document font), so the two views wrap into the same lines and the cross-fade lines up.
 */
function tokenStyle(text: string, id: string, extra: CSSProperties = {}): CSSProperties {
  return { '--chars': Math.max(text.length, id.length), ...extra } as CSSProperties;
}

function renderSkeleton(
  skeleton: Skeleton,
  original: ReadonlyMap<string, string>,
  hidden: readonly string[],
  label: (word: string) => string,
  hide: (word: string) => void,
  disabled: boolean,
  t: T,
) {
  let n = 0;
  return skeleton.split(PLACEHOLDER).map((part, i) => {
    if (PLACEHOLDER.test(part)) {
      const id = part.slice(1, -1);
      const text = original.get(id) ?? id;
      const mine = id.startsWith('W') && hidden.includes(text.toLowerCase());
      const kind = id[0] === 'N' ? 'placeholder.number' : id[0] === 'D' ? 'placeholder.date' : 'placeholder.word';
      return (
        <span
          key={i}
          className={`tok ph${mine ? ' tok-mine' : ''}`}
          style={tokenStyle(text, id, { animationDelay: `${Math.min(n++, 20) * 60}ms` })}
          aria-label={`${t(kind)} ${id}`}
        >
          {id}
        </span>
      );
    }
    return splitWords(part).map((piece, j) =>
      piece.word === undefined ? (
        <span key={`${i}-${j}`}>{piece.text}</span>
      ) : (
        <button key={`${i}-${j}`} type="button" className="word" aria-label={label(piece.word)} disabled={disabled} onClick={() => hide(piece.word as string)}>
          {piece.text}
        </button>
      ),
    );
  });
}

/** "On this phone": the document as it is here; hidden values shown with a mark that they stay. */
function renderPhone(lines: readonly (readonly SourceSegment[])[], label: (word: string) => string, hide: (word: string) => void, disabled: boolean) {
  return lines.map((line, i) => (
    <span key={i}>
      {line.map((seg, j) =>
        seg.ref ? (
          <span key={j} className="tok tok-phone" style={tokenStyle(seg.text, seg.ref)}>
            {seg.text}
          </span>
        ) : (
          splitWords(seg.text).map((piece, k) =>
            piece.word === undefined ? (
              <span key={`${j}-${k}`}>{piece.text}</span>
            ) : (
              <button key={`${j}-${k}`} type="button" className="word" aria-label={label(piece.word)} disabled={disabled} onClick={() => hide(piece.word as string)}>
                {piece.text}
              </button>
            ),
          )
        ),
      )}
      {i < lines.length - 1 ? '\n' : ''}
    </span>
  ));
}
