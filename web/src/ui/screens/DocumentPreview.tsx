// Skeleton preview: exactly what could leave the device, before anything is sent.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { placeholderCounts, buildReview, type SourceSegment } from '../../core/review';
import { cancelPreparedReading, extractPointers, ON_DEVICE_LANGUAGES, POINTER_SCHEMAS, prepareDeviceReading, type PointerStage } from '../../ai/tasks';
import { TOKEN_FLAGS, TOKEN_SOURCE, skeletonize } from '../../core/skeleton';
import { tidyNamePointers } from '../../core/tidy';
import { corePointerProblems, deductionsProblems, notReadFields, pointerProblems, unconfirmedFields, ytdMissingWithCandidate } from '../../core/pointer-check';
import { PACK } from '../pack';
import type { Raw, Skeleton } from '../../core/types';
import type { PlaceholderMap } from '../../core/skeleton';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { pointerDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { classifyError } from '../../ai/errors';
import { resetModelInstances } from '../../ai/model-port';
import { useApp } from '../context';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { InferenceBadge } from '../InferenceBadge';
import { ModelStatus } from '../doc/ModelStatus';
import { useDocument } from '../doc/state';
import { TaskErrorNotice } from '../doc/TaskErrorNotice';
import { OFFLINE_SAMPLE_REASON, sampleAnswerKey } from '../doc/offline-sample';
import { phoneLines } from '../doc/phone-view';
import { rememberReading } from '../doc/last-reading';
import { BlockActions, useWide } from '../design/block';
import { ChevronLeft, ChevronRight, LeaveGlyph } from '../design/icons';
import { useOnline } from '../design/online';
import { ActionLabel, Spinner } from '../design/parts';
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

/**
 * The deterministic checks of a paystub reading of this silhouette (core/pointer-check.ts): a core that
 * fails is a failed attempt; deductions, names, hours or rate that fail are left out as not read.
 */
function readingChecks(skeleton: Skeleton, map: Raw<PlaceholderMap>, language: string) {
  const schema = POINTER_SCHEMAS.paystub;
  return {
    validate: (pointers: Record<string, unknown>) => pointerProblems(schema, pointers, skeleton, map, PACK.jurisdiction),
    checkParts: {
      core: (pointers: Record<string, unknown>) => corePointerProblems(schema, pointers, map, PACK.jurisdiction, skeleton),
      deductions: (pointers: Record<string, unknown>) => deductionsProblems(schema, pointers, map, PACK.jurisdiction),
      notRead: (pointers: Record<string, unknown>) => notReadFields(pointers, skeleton),
      ytdMissing: (pointers: Record<string, unknown>) => ytdMissingWithCandidate(schema, pointers, skeleton, map, PACK.jurisdiction),
      confirm: (pointers: Record<string, unknown>) => unconfirmedFields(schema, pointers, skeleton, map, PACK.jurisdiction, language),
    },
  };
}

export function DocumentPreviewScreen() {
  const { t } = useApp();
  const { doc, update } = useDocument();
  const wide = useWide();
  const [sending, setSending] = useState(false);
  // Where a reading is: on this device (main values, then deductions), checking, or sending after the device.
  const [stage, setStage] = useState<PointerStage | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const online = useOnline();
  // With a ready on-device model, the first part of the reading starts on this device while the person
  // looks at the silhouette (nothing is sent or stored; src/ai/tasks.ts prepareDeviceReading).
  const [readingAhead, setReadingAhead] = useState(false);
  const aheadSkeleton = doc.skeleton;
  const aheadMap = doc.map;
  const aheadLanguage = doc.language;
  useEffect(() => {
    if (!aheadSkeleton || !aheadMap || deviceStatus !== 'available' || !ON_DEVICE_LANGUAGES.has(aheadLanguage)) return;
    let live = true;
    // After a short pause, so hiding several words in a row starts one reading, not one per word.
    const timer = setTimeout(() => {
      setReadingAhead(true);
      void prepareDeviceReading(aheadSkeleton, 'paystub', aheadLanguage, readingChecks(aheadSkeleton, aheadMap, aheadLanguage)).finally(() => {
        if (live) setReadingAhead(false);
      });
    }, 1200);
    return () => {
      live = false;
      clearTimeout(timer);
      setReadingAhead(false);
      // A changed silhouette or leaving the screen (typing the numbers instead, going back) stops it,
      // unless "Send" or "Keep" has already taken it over.
      cancelPreparedReading();
    };
  }, [aheadSkeleton, aheadMap, aheadLanguage, deviceStatus]);
  // The preview opens on what could leave (the screen's heading). The first silhouette of a session is
  // shown being made: the bars wipe in once. Later changes animate only the bars that are new.
  const [mode, setMode] = useState<'phone' | 'leave'>('leave');
  const [firstReveal] = useState(() => {
    const show = firstPreview && !reducedMotion();
    firstPreview = false;
    return show;
  });
  const docRef = useRef<HTMLPreElement>(null);
  // The texts of the bars last shown, to tell which bars are new after a word is hidden.
  const shownTexts = useRef<readonly string[] | null>(null);
  // After hiding a word with the keyboard, focus goes to the word that took its place.
  const focusWord = useRef<number | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const tall = useTallPaper(docRef);
  const freshRef = useRef<{ skeleton: string; quiet: boolean; set: ReadonlySet<number> } | null>(null);
  const [quiet, setQuiet] = useState(false);
  // Switching views: the values turn into chips (or back) with one short wipe, then the flag is dropped
  // so that hiding a word afterwards does not replay it.
  const [wipe, setWipe] = useState(false);
  const wipeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = (next: 'phone' | 'leave') => {
    if (next === mode) return;
    setQuiet(true);
    setMode(next);
    setWipe(true);
    clearTimeout(wipeTimer.current);
    wipeTimer.current = setTimeout(() => setWipe(false), 700);
  };
  useEffect(() => () => clearTimeout(wipeTimer.current), []);
  const [freshFor, setFreshFor] = useState(doc.skeleton);
  if (freshFor !== doc.skeleton) {
    setFreshFor(doc.skeleton);
    setQuiet(false);
  }

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
  // The deterministic check of a pointer answer: one that fails it is a failed attempt, never values to confirm.
  const { validate: checkAnswer, checkParts } = readingChecks(skeleton, map, doc.language);
  const counts = placeholderCounts(skeleton);
  const rawText = doc.text;

  /** Re-skeletonizes the document with the user's hidden words (they and their phrases masked). */
  const setHidden = (hiddenWords: readonly string[]) => {
    if (!rawText) return;
    const next = skeletonize(rawText, allowlistFor(doc.language), introducersFor(doc.language), new Set(hiddenWords));
    update({ skeleton: next.skeleton, map: next.map, hiddenWords, extraction: null, error: null });
  };
  const hide = (word: string, button?: HTMLButtonElement) => {
    const words = [...(docRef.current?.querySelectorAll('button.word') ?? [])];
    focusWord.current = button && button === document.activeElement ? words.indexOf(button) : null;
    setHidden([...new Set([...doc.hiddenWords, word.toLowerCase()])]);
  };
  const unhide = (word: string) => setHidden(doc.hiddenWords.filter((w) => w !== word));
  const onDeviceFirst = ON_DEVICE_LANGUAGES.has(doc.language) && deviceStatus === 'available';

  const send = async () => {
    setSending(true);
    setStage(null);
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
      const result = await extractPointers(skeleton, doc.docType, doc.language, { validate: checkAnswer, checkParts, onProgress: setStage });
      // Ids only (the model never sees a value): shown in the record beside the exact request.
      if (result.inferenceSource === 'IN_CLOUD') rememberReading(result.value as Readonly<Record<string, unknown>>);
      const pointers = tidyNamePointers(POINTER_SCHEMAS[doc.docType], result.value, map, introducersFor(doc.language));
      const review = buildReview(POINTER_SCHEMAS[doc.docType], pointers, skeleton, map);
      update({ extraction: { review, inferenceSource: result.inferenceSource, reason: result.reason, ranInCloudBecause: result.ranInCloudBecause, deductionsNotRead: result.deductionsNotRead, notRead: result.notRead } });
      navigate({ name: 'doc-review' });
    } catch (error) {
      update({ error: classifyError(error) });
    } finally {
      setSending(false);
    }
  };

  /**
   * "Try again". After an App Check failure Firebase starts again first: the SDK keeps a failed
   * provider throttled (from a second up to a day), so trying again with it would fail at once.
   */
  const retry = async () => {
    if (doc.error?.kind === 'app-check') {
      const { restartForAppCheck } = await import('../../ai/firebase');
      await restartForAppCheck();
      resetModelInstances();
    }
    await send();
  };

  /**
   * "Keep everything on this device" with an on-device model: the device reads the silhouette and
   * nothing is sent. A reading that fails the checks is not repeated anywhere; the person is told the
   * device could not read it reliably and can send the silhouette or type the numbers.
   */
  const keepOnDevice = async () => {
    setSending(true);
    setStage(null);
    update({ error: null });
    try {
      const result = await extractPointers(skeleton, doc.docType, doc.language, { deviceOnly: true, validate: checkAnswer, checkParts, onProgress: setStage });
      const pointers = tidyNamePointers(POINTER_SCHEMAS[doc.docType], result.value, map, introducersFor(doc.language));
      const review = buildReview(POINTER_SCHEMAS[doc.docType], pointers, skeleton, map);
      update({ extraction: { review, inferenceSource: result.inferenceSource, reason: result.reason, deductionsNotRead: result.deductionsNotRead, notRead: result.notRead } });
      navigate({ name: 'doc-review' });
    } catch (error) {
      update({ error: classifyError(error) });
    } finally {
      setSending(false);
    }
  };

  const offlineSample = doc.sourceKind === 'sample' && doc.hiddenWords.length === 0 && !online && deviceStatus !== 'available';
  const lines = phoneLines(skeleton, map);
  // The longest line, in characters: wide screens size the mono type so no line breaks.
  const docCols = Math.max(20, ...lines.map((l) => l.reduce((n, seg) => n + seg.text.length, 0)));
  // Placeholder id → the original text's length (for bar widths) and whether the person hid it.
  const original = new Map(lines.flatMap((l) => l.filter((seg) => seg.ref).map((seg) => [seg.ref as string, seg.text] as const)));
  const lastHidden = doc.hiddenWords[doc.hiddenWords.length - 1];
  const tokenTexts = [...skeleton.matchAll(/⟦([DNW][0-9]+)⟧/g)].map((m) => original.get(m[1] as string) ?? (m[1] as string));
  // Bars that animate: all of them on the first silhouette of a session, then only the new ones after a
  // word is hidden; none after switching views.
  // Worked out once per silhouette (and view switch), so other re-renders do not cut an animation short.
  if (freshRef.current?.skeleton !== skeleton || freshRef.current.quiet !== quiet) {
    const set = quiet ? NONE : newTokens(tokenTexts, firstReveal && shownTexts.current === null ? [] : (shownTexts.current ?? tokenTexts));
    freshRef.current = { skeleton, quiet, set };
  }
  const fresh = freshRef.current.set;

  return (
    <div className="screen doc-preview">
      <div className="preview-head">
        <ScreenHeading size={46} wideSize={72} maxLines={4}>
          {t('preview.title')}
        </ScreenHeading>
        {wide && <p className="small muted">{t('preview.leadShort')}</p>}
      </div>
      {doc.photoSource && <InferenceBadge source={doc.photoSource.inferenceSource} reason={doc.photoSource.reason} />}
      {/* Where the reading will run, in one line; the full sentence is under the document. */}
      <p className="routing-line">
        <strong className={`badge ${offlineSample ? 'badge-sample' : onDeviceFirst ? 'badge-device' : 'badge-cloud'}`}>
          {offlineSample ? t('badge.sampleKey') : onDeviceFirst ? t('badge.onDevice') : t('badge.cloud')}
        </strong>
        <span>{t(offlineSample ? 'reason.sample-answer-key' : 'reason.document-silhouette-only')}</span>
      </p>
      <div className="preview-pair" data-wide={wide} style={{ '--doc-cols': docCols, '--hide-hint': JSON.stringify(t('preview.hideToo')) } as CSSProperties}>
      <div className="toggle" role="group" aria-label={t('preview.title')}>
        <button type="button" aria-pressed={mode === 'phone'} onClick={() => show('phone')}>
          {t('preview.onPhone')}
        </button>
        <button type="button" aria-pressed={mode === 'leave'} className="toggle-leave" onClick={() => show('leave')}>
          {t('preview.couldLeave')}
        </button>
      </div>
      <TokenMemory texts={tokenTexts} memory={shownTexts} />
      <FocusAfterHide skeleton={skeleton} docRef={docRef} focusWord={focusWord} undoRef={undoRef} />
      <pre
        ref={docRef}
        key={mode}
        className="doc paper paper-large"
        data-mode={mode}
        data-wipe={wipe}
        data-tall={tall}
        data-testid="skeleton-preview"
        tabIndex={0}
        aria-label={mode === 'leave' ? t('preview.couldLeave') : t('preview.onPhone')}
      >
        {mode === 'leave'
          ? renderSkeleton(skeleton, original, doc.hiddenWords, fresh, (word) => t('preview.hideWord', { word }), hide, sending, t)
          : renderPhone(lines, (word) => t('preview.hideWord', { word }), hide, sending)}
      </pre>
      {/* Wide screens: the other view beside it, for reading only (the chosen one is the one you work in). */}
      {wide && (
        <pre key={`${mode}-companion`} className="doc paper paper-large companion" data-mode={mode === 'leave' ? 'phone' : 'leave'} aria-hidden="true" inert>
          {mode === 'leave'
            ? renderPhone(lines, (word) => t('preview.hideWord', { word }), hide, true)
            : renderSkeleton(skeleton, original, doc.hiddenWords, NONE, (word) => t('preview.hideWord', { word }), hide, true, t)}
        </pre>
      )}
      </div>
      {/* The legend of the chips (wide screens show it under the two documents). */}
      <p className="chip-legend" aria-hidden="true">
        <span className="bar">W</span> {t('preview.legend.word')} <span className="bar">D</span> {t('preview.legend.date')} <span className="bar">N</span>{' '}
        {t('preview.legend.number')} <span className="legend-note">{t('preview.labelsStay')}</span>
      </p>
      {!wide && <p className="small muted">{t('preview.leadShort')}</p>}
      {lastHidden !== undefined && (
        <div className="hide-row">
          <p className="small">{t('preview.youHid', { word: lastHidden })}</p>
          <button ref={undoRef} type="button" className="text-link" disabled={sending} onClick={() => unhide(lastHidden)}>
            {t('preview.undo')}
          </button>
        </div>
      )}
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
      {/* What the board does not show on the first screen: the full explanation, behind one row. */}
      <details className="more-about" data-testid="preview-more">
        <summary>
          {t('preview.more')}
          <ChevronRight />
        </summary>
        <p className="small muted">{t('preview.lead')}</p>
        <p className="small muted">{offlineSample ? t('preview.sample') : onDeviceFirst ? t('preview.onDevice') : t('preview.cloud')}</p>
        <p className="small muted">{t('preview.hideHelp')}</p>
        <ModelStatus language={doc.language} onStatus={setDeviceStatus} />
        <p className="small muted">{t('leaving.network')}</p>
      </details>
      {sending && <Loading />}
      <div role="status" className="status-line">
        {(sending || readingAhead) && <Spinner />}
        {/* Keyed by the stage: each stage's sentence fades in in place of the last one. */}
        <span key={sending ? (stage ?? 'sending') : readingAhead ? 'ahead' : 'idle'} data-stage>
          {sending ? (stage ? t(STAGE_COPY[stage]) : t('preview.sending')) : readingAhead ? t('preview.readingAhead') : ''}
        </span>
      </div>
      {doc.error && (
        <>
          <TaskErrorNotice error={doc.error} />
          <div className="button-row">
            {/* A daily limit does not recover by trying again now. */}
            {doc.error.kind === 'on-device-unreliable' ? (
              <button type="button" className="outline-button" onClick={() => void send()}>
                {t('preview.sendSilhouette')}
              </button>
            ) : (
              doc.error.kind !== 'quota-daily' && (
                <button type="button" className="outline-button" onClick={() => void retry()} data-testid="retry">
                  {t('error.retry')}
                </button>
              )
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
        <p className="preview-counts">{t('preview.counts', { numbers: counts.N, dates: counts.D, words: counts.W })}</p>
        <div className="decision decision-send">
          <button
            type="button"
            className="text-link keep-link"
            disabled={sending}
            onClick={() => {
              // With a model on this device, keeping everything here still reads the silhouette, on the device.
              if (onDeviceFirst && !offlineSample) return void keepOnDevice();
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
              <ActionLabel>{t('leaving.send')}</ActionLabel>
              <span className="action-arrow">
                <LeaveGlyph />
              </span>
            </button>
          )}
        </div>
      </BlockActions>
    </div>
  );
}

/** The status line for each stage of a reading. */
const STAGE_COPY = {
  'device-reading': 'preview.stage.deviceReading',
  'device-gross': 'preview.stage.deviceGross',
  'device-deductions': 'preview.stage.deviceDeductions',
  checking: 'preview.stage.checking',
  'sending-after-device': 'preview.stage.sendingAfterDevice',
} as const satisfies Record<PointerStage, string>;

type T = (key: 'placeholder.word' | 'placeholder.number' | 'placeholder.date') => string;

/** "What could leave": the skeleton with each placeholder as a bar with its id, visible words as buttons to hide. */
/**
 * A placeholder takes the same width in both views (the longer of its text and its id, in characters
 * of the document font), so the two views wrap into the same lines and the cross-fade lines up.
 */


function renderSkeleton(
  skeleton: Skeleton,
  original: ReadonlyMap<string, string>,
  hidden: readonly string[],
  fresh: ReadonlySet<number>,
  label: (word: string) => string,
  hide: (word: string, button?: HTMLButtonElement) => void,
  disabled: boolean,
  t: T,
) {
  let n = 0;
  let order = 0;
  return skeleton.split(PLACEHOLDER).map((part, i) => {
    if (PLACEHOLDER.test(part)) {
      const id = part.slice(1, -1);
      const text = original.get(id) ?? id;
      const mine = id.startsWith('W') && hidden.includes(text.toLowerCase());
      const kind = id[0] === 'N' ? 'placeholder.number' : id[0] === 'D' ? 'placeholder.date' : 'placeholder.word';
      const isNew = fresh.has(order++);
      return (
        <span
          key={`p${i}`}
          className={`tok ph${mine ? ' tok-mine' : ''}${isNew ? ' tok-new' : ''}`}
          style={{ '--i': order - 1, ...(isNew ? { animationDelay: `${Math.min(n++, 20) * 60}ms` } : {}) } as CSSProperties}
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
        <button key={`${i}-${j}`} type="button" className="word" aria-label={label(piece.word)} disabled={disabled} onClick={(e) => hide(piece.word as string, e.currentTarget)}>
          {piece.text}
        </button>
      ),
    );
  });
}

const NONE: ReadonlySet<number> = new Set();

/** Which bars are new: in order, the ones whose text was not among the bars shown before. */
function newTokens(texts: readonly string[], before: readonly string[]): ReadonlySet<number> {
  const left = new Map<string, number>();
  for (const x of before) left.set(x, (left.get(x) ?? 0) + 1);
  const out = new Set<number>();
  texts.forEach((x, i) => {
    const n = left.get(x) ?? 0;
    if (n > 0) left.set(x, n - 1);
    else out.add(i);
  });
  return out;
}

/** Remembers the bars shown, after they are shown. */
function TokenMemory({ texts, memory }: { texts: readonly string[]; memory: { current: readonly string[] | null } }) {
  useEffect(() => {
    memory.current = texts;
  });
  return null;
}

/** After a word was hidden from the keyboard, focus the word that now stands where it was (or Undo). */
function FocusAfterHide({ skeleton, docRef, focusWord, undoRef }: { skeleton: string; docRef: RefObject<HTMLPreElement | null>; focusWord: { current: number | null }; undoRef: RefObject<HTMLButtonElement | null> }) {
  useEffect(() => {
    const index = focusWord.current;
    if (index === null) return;
    focusWord.current = null;
    const words = [...(docRef.current?.querySelectorAll<HTMLButtonElement>('button.word') ?? [])];
    (words[Math.min(index, words.length - 1)] ?? undoRef.current)?.focus();
  }, [skeleton, docRef, focusWord, undoRef]);
  return null;
}

/** A paper taller than the screen is not turned: turned, its corners would leave the screen. */
function useTallPaper(ref: RefObject<HTMLElement | null>): boolean {
  const [tall, setTall] = useState(false);
  // Measured before paint, so a tall paper is never shown turned first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setTall(el.offsetHeight > window.innerHeight * 0.8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  });
  return tall;
}

/** "On this phone": the document as it is here; hidden values shown with a mark that they stay. */
function renderPhone(lines: readonly (readonly SourceSegment[])[], label: (word: string) => string, hide: (word: string, button?: HTMLButtonElement) => void, disabled: boolean) {
  return lines.map((line, i) => (
    <span key={i}>
      {line.map((seg, j) =>
        seg.ref ? (
          <span key={j} className="tok tok-phone">
            {seg.text}
          </span>
        ) : (
          splitWords(seg.text).map((piece, k) =>
            piece.word === undefined ? (
              <span key={`${j}-${k}`}>{piece.text}</span>
            ) : (
              <button key={`${j}-${k}`} type="button" className="word" aria-label={label(piece.word)} disabled={disabled} onClick={(e) => hide(piece.word as string, e.currentTarget)}>
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
