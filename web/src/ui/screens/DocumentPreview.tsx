// Skeleton preview: exactly what could leave the device, before anything is sent.
import { bringIntoView } from '../design/motion';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { placeholderCounts, buildReview, type SourceSegment } from '../../core/review';
import { cancelPreparedReading, extractPointers, ON_DEVICE_LANGUAGES, POINTER_SCHEMAS, pointerRequest, prepareDeviceReading, type PointerStage } from '../../ai/tasks';
import { TOKEN_FLAGS, TOKEN_SOURCE, skeletonize } from '../../core/skeleton';
import { tidyNamePointers } from '../../core/tidy';
import { leaveOutBoxes, readingChecks } from '../doc/reading-checks';
import type { Skeleton } from '../../core/types';
import { allowlistFor, introducersFor } from '../doc/allowlists';
import { pointerDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { classifyError } from '../../ai/errors';
import { resetModelInstances } from '../../ai/model-port';
import { useApp } from '../context';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { InferenceBadge } from '../InferenceBadge';
import { ModelStatus } from '../doc/ModelStatus';
import { useDocument, type Extraction } from '../doc/state';
import type { BothReadings } from '../doc/both';
import { TaskErrorNotice } from '../doc/TaskErrorNotice';
import { OFFLINE_SAMPLE_REASON, sampleAnswerKey } from '../doc/offline-sample';
import { recordedReading, type RecordedReading } from '../doc/recorded-reading';
import { recordedCloudReading } from '../doc/recorded-cloud';
import { phoneLines } from '../doc/phone-view';
import { rememberReading } from '../doc/last-reading';
import { recordRecordedReading } from '../../data/outbound';
import { BlockActions, useTwoColumns } from '../design/block';
import { ArrowRight, Caret, ChevronLeft, ChevronRight, LeaveGlyph } from '../design/icons';
import { useOnline } from '../design/online';
import { ActionLabel, Paper, Spinner } from '../design/parts';
import { Loading } from '../answers/parts';
import { ReadingShow, showPairs, useReadingShow, type ShowRoute } from '../doc/ReadingShow';
import { setAutoRun, takeAutoRun } from '../judges/next';

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
  const { t, locale } = useApp();
  const { doc, update } = useDocument();
  // The two documents stand side by side only where there is room for both (two columns).
  const wide = useTwoColumns();
  const [sending, setSending] = useState(false);
  // The reading shown as it happens: the silhouette going to the model, the values coming back.
  const reading = useReadingShow();
  // Where a reading is: on this device (main values, then deductions), checking, or sending after the device.
  const [stage, setStage] = useState<PointerStage | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  // No model here: the bundled sample can still be read, from the on-device model's recorded answer.
  // Undefined while it is not yet known whether there is one (the one-press path waits for it).
  const [recorded, setRecorded] = useState<RecordedReading | null | undefined>(undefined);
  const online = useOnline();
  // With a ready on-device model, the first part of the reading starts on this device while the person
  // looks at the silhouette (nothing is sent or stored; src/ai/tasks.ts prepareDeviceReading).
  const [readingAhead, setReadingAhead] = useState(false);
  // Set once a reading has started here (Send, Keep, a recording): the screen now stays up while the reading
  // is shown, and a reading ahead must not start behind it.
  const readingStarted = useRef(false);
  const recordedLabelId = useId();
  const aheadSkeleton = doc.skeleton;
  const aheadMap = doc.map;
  const aheadLanguage = doc.language;
  const aheadType = doc.docType;
  useEffect(() => {
    // Only a document read in parts (a paystub) is prepared ahead; a W-2 is one request.
    if (!aheadSkeleton || !aheadMap || aheadType !== 'paystub' || deviceStatus !== 'available' || !ON_DEVICE_LANGUAGES.has(aheadLanguage)) return;
    let live = true;
    // After a short pause, so hiding several words in a row starts one reading, not one per word.
    const timer = setTimeout(() => {
      if (readingStarted.current) return;
      setReadingAhead(true);
      void prepareDeviceReading(aheadSkeleton, aheadType, aheadLanguage, readingChecks(aheadSkeleton, aheadMap, aheadLanguage, aheadType)).finally(() => {
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
  }, [aheadSkeleton, aheadMap, aheadLanguage, aheadType, deviceStatus]);
  // routing.json recordedSample: the bundled paystub only (the recordings are of its reading), never a W-2.
  const recordedSkeleton = doc.sourceKind === 'sample' && doc.docType === 'paystub' && doc.hiddenWords.length === 0 ? doc.skeleton : null;
  useEffect(() => {
    if (!recordedSkeleton || deviceStatus === 'available') {
      setRecorded(null);
      return;
    }
    if (deviceStatus === null) return;
    let live = true;
    void recordedReading(recordedSkeleton, locale).then((r) => live && setRecorded(r));
    return () => {
      live = false;
    };
  }, [recordedSkeleton, deviceStatus, locale]);
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
  // What happens after Send is seen: the stage line comes into view above the dock when the reading
  // starts, and what went wrong, with the ways on, when it fails.
  const statusLine = useRef<HTMLDivElement>(null);
  const errorTop = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (sending) bringIntoView(statusLine.current);
  }, [sending]);
  const failed = doc.error !== null && doc.error !== undefined;
  useEffect(() => {
    if (!failed) return;
    requestAnimationFrame(() => {
      // Wide screens: the decision row stands at the foot of the content and would cover the ways on.
      const actions = wide ? document.querySelector('.doc-preview .screen-actions') : null;
      bringIntoView(errorTop.current?.parentElement?.querySelector('.button-row') ?? errorTop.current, { margin: 16 + (actions?.getBoundingClientRect().height ?? 0) });
    });
  }, [failed, wide]);
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

  // "Run all three steps" (judges.runAll): once it is known whether this device has the model, the sample
  // is read on this device or from a recording; never sent without Send.
  const autoRead = useRef<(() => void) | null>(null);
  useEffect(() => {
    autoRead.current?.();
  }, [deviceStatus, recorded]);

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
  const { validate: checkAnswer, checkParts } = readingChecks(skeleton, map, doc.language, doc.docType);
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
    shownAs.current.set(word.toLowerCase(), word);
    setHidden([...new Set([...doc.hiddenWords, word.toLowerCase()])]);
  };
  // A hidden word is matched without regard to case, but it is named as it stands in the document.
  const shownAs = useRef(new Map<string, string>());
  const asShown = (word: string) => shownAs.current.get(word) ?? word;
  const unhide = (word: string) => setHidden(doc.hiddenWords.filter((w) => w !== word));
  const onDeviceFirst = ON_DEVICE_LANGUAGES.has(doc.language) && deviceStatus === 'available';

  const send = async () => {
    readingStarted.current = true;
    setSending(true);
    setStage(null);
    update({ error: null });
    try {
      // Re-check right before sending, so the sentence above matched what happens.
      const status = await pointerDeviceStatus(doc.docType, doc.language);
      setDeviceStatus(status);
      // A bundled sample with no network and no device model: its answer key, on this device.
      const key = doc.sourceKind === 'sample' && doc.hiddenWords.length === 0 && !navigator.onLine && status !== 'available' ? sampleAnswerKey(skeleton) : null;
      if (key !== null) {
        const review = buildReview(POINTER_SCHEMAS[doc.docType], key, skeleton, map);
        update({ extraction: { review, inferenceSource: 'SAMPLE_KEY', reason: OFFLINE_SAMPLE_REASON } });
        navigate({ name: 'doc-review' });
        return;
      }
      // The model on this device first when it has one (the routing line says so), otherwise the cloud.
      const first: ShowRoute = status === 'available' && ON_DEVICE_LANGUAGES.has(doc.language) ? 'device' : 'cloud';
      reading.begin(first);
      const result = await extractPointers(skeleton, doc.docType, doc.language, {
        validate: checkAnswer,
        checkParts,
        onProgress: (s) => {
          setStage(s);
          // This device could not read it reliably: the silhouette now goes on to the cloud.
          if (s === 'sending-after-device') reading.route('cloud-after-device');
        },
      });
      // Ids only (the model never sees a value): shown in the record beside the exact request.
      if (result.inferenceSource === 'IN_CLOUD') rememberReading(result.value as Readonly<Record<string, unknown>>);
      const { pointers, leftOut } = leaveOutBoxes(doc.docType, tidyNamePointers(POINTER_SCHEMAS[doc.docType], result.value, map, introducersFor(doc.language)), map);
      const review = buildReview(POINTER_SCHEMAS[doc.docType], pointers, skeleton, map);
      // The way it really went decides what comes back (a reading sent on to the cloud after the device).
      // The document changes only after it, so nothing on this screen starts again meanwhile (the reading ahead).
      await reading.back(showPairs(review, doc.docType), result.inferenceSource === 'IN_CLOUD' ? (first === 'device' ? 'cloud-after-device' : 'cloud') : 'device');
      update({ extraction: { review, inferenceSource: result.inferenceSource, reason: result.reason, ranInCloudBecause: result.ranInCloudBecause, deductionsNotRead: result.deductionsNotRead, notRead: result.notRead, leftOut } });
      navigate({ name: 'doc-review' });
    } catch (error) {
      // An error is never delayed by the staging.
      reading.clear();
      // A failed reading leaves the screen up: a changed silhouette may be read ahead again.
      readingStarted.current = false;
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

  /** routing.json recordedSample: the on-device model's recorded answer, put back on this device now; nothing is sent. */
  /** routing.json recordedCloud: a recorded cloud reading of this silhouette, put back on this device now; nothing is sent. */
  const recordedCloud = recordedCloudReading(skeleton);
  const useRecordedCloud = async () => {
    if (!recordedCloud) return;
    readingStarted.current = true;
    setSending(true);
    reading.begin('recorded-cloud');
    const pointers = tidyNamePointers(POINTER_SCHEMAS[doc.docType], recordedCloud.pointers, map, introducersFor(doc.language));
    const review = buildReview(POINTER_SCHEMAS[doc.docType], pointers, skeleton, map);
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(recordedCloud.date));
    await reading.back(showPairs(review, doc.docType));
    update({ error: null, extraction: { review, inferenceSource: 'RECORDED_CLOUD', reason: 'recorded-in-cloud', recording: { machine: 'Firebase AI Logic', date, path: recordedCloud.path } } });
    // The record lists it with the exact request as it was sent when it was recorded; nothing is sent now.
    recordRecordedReading({ machine: 'Firebase AI Logic', date }, Date.now(), recordedCloud);
    setSending(false);
    navigate({ name: 'doc-review' });
  };

  const useRecorded = async () => {
    if (!recorded) return;
    readingStarted.current = true;
    setSending(true);
    reading.begin('recorded-device', recorded.machine);
    const pointers = tidyNamePointers(POINTER_SCHEMAS[doc.docType], recorded.pointers, map, introducersFor(doc.language));
    const review = buildReview(POINTER_SCHEMAS[doc.docType], pointers, skeleton, map);
    // The device reads the deductions in a second part; a recorded answer without them says so, like a live one.
    const deductionsNotRead = !Object.hasOwn(recorded.pointers, 'deductions');
    await reading.back(showPairs(review, doc.docType));
    update({ error: null, extraction: { review, inferenceSource: 'RECORDED', reason: 'recorded-on-device', deductionsNotRead, recording: { machine: recorded.machine, date: recorded.date, path: recorded.path } } });
    // The record says what happened: a recorded reading, values put back here, nothing sent.
    recordRecordedReading({ machine: recorded.machine, date: recorded.date });
    setSending(false);
    navigate({ name: 'doc-review' });
  };

  /**
   * "Run all three steps" (contract v1.44, judges.runAll): both halves of the hybrid, back to back. The
   * device's half first: read now on this device when it has the model (`live`), otherwise the recorded
   * on-device reading; then the cloud's half, the recorded cloud reading of the same silhouette. Nothing is
   * sent. The review shows the two answers side by side; the values used are the device's.
   */
  const readBothWays = async (live: boolean) => {
    if (!recordedCloud || (!live && !recorded)) return;
    readingStarted.current = true;
    setSending(true);
    setStage(null);
    update({ error: null });
    try {
      let extraction: Extraction;
      let device: BothReadings['device'];
      if (live) {
        reading.begin('device');
        const result = await extractPointers(skeleton, doc.docType, doc.language, { deviceOnly: true, validate: checkAnswer, checkParts, onProgress: setStage });
        const { pointers, leftOut } = leaveOutBoxes(doc.docType, tidyNamePointers(POINTER_SCHEMAS[doc.docType], result.value, map, introducersFor(doc.language)), map);
        const review = buildReview(POINTER_SCHEMAS[doc.docType], pointers, skeleton, map);
        await reading.back(showPairs(review, doc.docType), 'device');
        extraction = { review, inferenceSource: result.inferenceSource, reason: result.reason, deductionsNotRead: result.deductionsNotRead, notRead: result.notRead, leftOut };
        device = { live: true, review, notRead: [...(result.notRead ?? []), ...(result.deductionsNotRead ? ['deductions'] : [])] };
      } else {
        const rec = recorded as RecordedReading;
        reading.begin('recorded-device', rec.machine);
        const review = buildReview(POINTER_SCHEMAS[doc.docType], tidyNamePointers(POINTER_SCHEMAS[doc.docType], rec.pointers, map, introducersFor(doc.language)), skeleton, map);
        const deductionsNotRead = !Object.hasOwn(rec.pointers, 'deductions');
        await reading.back(showPairs(review, doc.docType));
        recordRecordedReading({ machine: rec.machine, date: rec.date });
        extraction = { review, inferenceSource: 'RECORDED', reason: 'recorded-on-device', deductionsNotRead, recording: { machine: rec.machine, date: rec.date, path: rec.path } };
        device = { live: false, machine: rec.machine, date: rec.date, review, notRead: deductionsNotRead ? ['deductions'] : [] };
      }
      // The second half: the same silhouette, as the cloud read it when it was recorded.
      setStage(null);
      reading.begin('recorded-cloud');
      const cloudReview = buildReview(POINTER_SCHEMAS[doc.docType], tidyNamePointers(POINTER_SCHEMAS[doc.docType], recordedCloud.pointers, map, introducersFor(doc.language)), skeleton, map);
      const cloudDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(recordedCloud.date));
      await reading.back(showPairs(cloudReview, doc.docType));
      recordRecordedReading({ machine: 'Firebase AI Logic', date: cloudDate }, Date.now(), recordedCloud);
      update({ extraction: { ...extraction, both: { device, cloud: { model: recordedCloud.model, date: cloudDate, review: cloudReview } } } });
      navigate({ name: 'doc-review' });
    } catch (error) {
      // The device could not read it: the error is shown, and no comparison is made for a reading that did not happen.
      reading.clear();
      readingStarted.current = false;
      update({ error: classifyError(error) });
    } finally {
      setSending(false);
    }
  };

  /**
   * "Keep everything on this device" with an on-device model: the device reads the silhouette and
   * nothing is sent. A reading that fails the checks is not repeated anywhere; the person is told the
   * device could not read it reliably and can send the silhouette or type the numbers.
   */
  const keepOnDevice = async () => {
    readingStarted.current = true;
    setSending(true);
    setStage(null);
    update({ error: null });
    try {
      reading.begin('device');
      const result = await extractPointers(skeleton, doc.docType, doc.language, { deviceOnly: true, validate: checkAnswer, checkParts, onProgress: setStage });
      const { pointers, leftOut } = leaveOutBoxes(doc.docType, tidyNamePointers(POINTER_SCHEMAS[doc.docType], result.value, map, introducersFor(doc.language)), map);
      const review = buildReview(POINTER_SCHEMAS[doc.docType], pointers, skeleton, map);
      await reading.back(showPairs(review, doc.docType), 'device');
      update({ extraction: { review, inferenceSource: result.inferenceSource, reason: result.reason, deductionsNotRead: result.deductionsNotRead, notRead: result.notRead, leftOut } });
      navigate({ name: 'doc-review' });
    } catch (error) {
      reading.clear();
      // A failed reading leaves the screen up: a changed silhouette may be read ahead again.
      readingStarted.current = false;
      update({ error: classifyError(error) });
    } finally {
      setSending(false);
    }
  };

  const offlineSample = doc.sourceKind === 'sample' && doc.hiddenWords.length === 0 && !online && deviceStatus !== 'available';
  // Chrome can download the model here but has not yet: said so (never "no model"), with the download
  // beside the other ways on. Once downloaded, the reading starts on this device.
  const notDownloaded = (deviceStatus === 'downloadable' || deviceStatus === 'downloading') && ON_DEVICE_LANGUAGES.has(doc.language);
  const downloadHere = notDownloaded && !offlineSample;
  // One status card on the screen: beside the ways on while the model can be downloaded, otherwise under "More about this".
  const modelStatus = <ModelStatus language={doc.language} onStatus={setDeviceStatus} />;
  // After a failed Send, the dock's action is "Try again" (a daily limit does not recover now, and a
  // reading this device could not do offers sending the silhouette in its own row).
  const retryInDock = failed && !onDeviceFirst && !offlineSample && doc.error?.kind !== 'quota-daily' && doc.error?.kind !== 'on-device-unreliable';
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

  // No model here: this paystub as the on-device model read it (a recording). On a wide screen it stands
  // under the documents; on a phone above the document, where the dock does not cover it.
  // "Run all three steps" (judges.runAll): the sample is read as the person would read it (set below).
  autoRead.current = () => {
    if (deviceStatus === null || sending) return;
    // Without a model here, wait until it is known whether the sample has a recorded on-device reading.
    if (deviceStatus !== 'available' && recorded === undefined && recordedSkeleton) return;
    if (deviceStatus !== 'available' && !recorded && !recordedCloud) return;
    if (!takeAutoRun('read')) return;
    setAutoRun('use');
    // Both halves of the hybrid: the device's (now, or its recording), then the cloud's recording.
    if (onDeviceFirst) void (recordedCloud ? readBothWays(true) : keepOnDevice());
    else if (recorded && recordedCloud) void readBothWays(false);
    else if (recordedCloud) void useRecordedCloud();
    else if (recorded) void useRecorded();
  };

  const recordedChoice =
    !onDeviceFirst && deviceStatus !== null && !offlineSample && recorded ? (
      <div className="recorded-choice" data-testid="use-recorded-card">
        <button type="button" className="text-link recorded-link" onClick={() => void useRecorded()} disabled={sending} data-testid="use-recorded">
          {t(notDownloaded ? 'preview.useRecorded.notDownloaded' : 'preview.useRecorded', { machine: recorded.machine })}
          <ChevronRight />
        </button>
        <p className="small muted">{t('preview.useRecordedNote', { date: recorded.date })}</p>
        {recordedCloud && (
          <button type="button" className="text-link recorded-link" onClick={() => void useRecordedCloud()} disabled={sending} data-testid="use-recorded-cloud">
            {t('preview.useRecordedCloud')}
            <ChevronRight />
          </button>
        )}
      </div>
    ) : null;

  // On a phone the recordings are one short line above the document, so the silhouette keeps the
  // first screen (a card there pushed it under the dock, and the dock has no room for another line).
  const recordedRow =
    !onDeviceFirst && deviceStatus !== null && !offlineSample && recorded ? (
      <p className="recorded-row" data-testid="use-recorded-card">
        <span className="recorded-row-label" id={recordedLabelId}>
          {t(notDownloaded ? 'preview.recorded.label.notDownloaded' : 'preview.recorded.label')}
        </span>
        <button type="button" className="text-link recorded-link" onClick={() => void useRecorded()} disabled={sending} aria-describedby={recordedLabelId} data-testid="use-recorded">
          {t('preview.recorded.device')}
          <ChevronRight />
        </button>
        {recordedCloud && (
          <button type="button" className="text-link recorded-link" onClick={() => void useRecordedCloud()} disabled={sending} aria-describedby={recordedLabelId} data-testid="use-recorded-cloud">
            {t('preview.recorded.cloud')}
            <ChevronRight />
          </button>
        )}
      </p>
    ) : null;

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
      {/* A W-2 is known by its title, by code: it is read as one. */}
      {doc.docType === 'w2' && (
        <p className="small detected-type" data-testid="detected-w2">
          <strong>{t('doc.detected.w2')}</strong> <span className="muted">{t('doc.type.w2.help')}</span>
        </p>
      )}
      {!wide && recordedRow}
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
      {/* Without a model here, the on-device half of the story is one press away: the recorded run. */}
      {wide && recordedChoice}
      {/* The download, beside the recording on a wide screen; on a phone under the document, so the
          silhouette stays in the first screen. */}
      {downloadHere && modelStatus}
      {/* The recordings are of the paystub's reading: a W-2 does not point at them. */}
      {!onDeviceFirst && deviceStatus !== null && !offlineSample && !recorded && doc.docType === 'paystub' && (
        <a className="text-link recorded-link" href={routeHref({ name: 'device-check' })} data-testid="see-recorded">
          {t(notDownloaded ? 'preview.seeRecorded.notDownloaded' : 'preview.seeRecorded')}
          <ChevronRight />
        </a>
      )}
      {lastHidden !== undefined && (
        <div className="hide-row">
          <p className="small">{t('preview.youHid', { word: asShown(lastHidden) })}</p>
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
                  {t('preview.unhide', { word: asShown(w) })}
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
        <p className="small muted">{offlineSample ? t('preview.sample') : onDeviceFirst ? t('preview.onDevice') : t(notDownloaded ? 'preview.cloud.notDownloaded' : 'preview.cloud')}</p>
        <p className="small muted">{t('preview.hideHelp')}</p>
        {!downloadHere && modelStatus}
        <p className="small muted">{t('leaving.network')}</p>
      </details>
      {sending && !reading.show && <Loading />}
      {reading.show && <ReadingShow show={reading.show} skeleton={skeleton} docType={doc.docType} stage={stage} />}
      <div role="status" className="status-line" ref={statusLine}>
        {(sending || readingAhead) && <Spinner />}
        {/* Keyed by the stage: each stage's sentence fades in in place of the last one. */}
        <span key={sending ? (stage ?? 'sending') : readingAhead ? 'ahead' : 'idle'} data-stage>
          {sending ? (stage ? t(STAGE_COPY[stage]) : t('preview.sending')) : readingAhead ? t('preview.readingAhead') : ''}
        </span>
      </div>
      {doc.error && (
        <>
          <span ref={errorTop} />
          <TaskErrorNotice error={doc.error} />
          <div className="button-row">
            {/* A daily limit does not recover by trying again now. */}
            {doc.error.kind === 'on-device-unreliable' ? (
              <button type="button" className="outline-button" onClick={() => void send()}>
                {t('preview.sendSilhouette')}
              </button>
            ) : (
              doc.error.kind !== 'quota-daily' &&
              !retryInDock && (
                <button type="button" className="outline-button" onClick={() => void retry()} data-testid="retry">
                  {t('error.retry')}
                </button>
              )
            )}
            {/* The way on that sends nothing: this paystub as the on-device model read it (a recording). */}
            {recorded && !onDeviceFirst && (
              <button type="button" className="outline-button" onClick={() => void useRecorded()} data-testid="error-use-recorded">
                {t('preview.error.useRecorded')}
              </button>
            )}
            <button type="button" className="outline-button" onClick={() => navigate({ name: 'doc-review' })}>
              {t('error.typeInstead')}
            </button>
          </div>
        </>
      )}
      {!offlineSample && <ExactRequest skeleton={skeleton} docType={doc.docType} />}
      <a className="text-link back-link" href={routeHref({ name: 'doc' })}>
        <ChevronLeft />
        {t('q.back')}
      </a>
      <BlockActions mode="decision">
        <p className="preview-counts">{t('preview.counts', { numbers: counts.N, dates: counts.D, words: counts.W })}</p>
        {/* Where the reading goes, beside the button that starts it. */}
        {!offlineSample && deviceStatus !== null && (
          <p className="routing-line preview-destination" data-testid="preview-destination" data-destination={onDeviceFirst ? 'device' : 'cloud'}>
            <strong className={`badge ${onDeviceFirst ? 'badge-device' : 'badge-cloud'}`}>{onDeviceFirst ? t('badge.onDevice') : t('badge.cloud')}</strong>
            <span>{t(onDeviceFirst ? 'send.destination.device' : 'send.destination.cloud')}</span>
          </p>
        )}
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
          ) : onDeviceFirst ? (
            // The model is on this device: the reading starts here, and the action says so. It leaves only
            // if this device cannot read it (the line above the document says that), never as a first step.
            <button type="button" className="action" disabled={sending} onClick={() => void send()} data-testid="read-here">
              <ActionLabel>{sending ? (stage ? t(STAGE_COPY[stage]) : t('preview.sending')) : t('preview.readHere')}</ActionLabel>
              <span className="action-arrow">{sending ? <Spinner /> : <ArrowRight />}</span>
            </button>
          ) : retryInDock ? (
            // After a failed Send: the same request again, not a fresh orange "Send".
            <button type="button" className="action" disabled={sending} onClick={() => void retry()} data-testid="retry">
              <ActionLabel>{sending ? (stage ? t(STAGE_COPY[stage]) : t('preview.sending')) : t('error.retry')}</ActionLabel>
              <span className="action-arrow">{sending ? <Spinner /> : <ArrowRight />}</span>
            </button>
          ) : (
            <button type="button" className="send-button" disabled={sending} onClick={() => void send()}>
              <ActionLabel>{sending ? (stage ? t(STAGE_COPY[stage]) : t('preview.sending')) : t('leaving.send')}</ActionLabel>
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

/**
 * "Show the exact request" before anything is sent: the reading request as it would go to the cloud
 * (on a device with a model, only if this device cannot read it). Its only document content is the silhouette.
 */
function ExactRequest({ skeleton, docType }: { skeleton: Skeleton; docType: Parameters<typeof pointerRequest>[1] }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const id = useId();
  const request = open ? pointerRequest(skeleton, docType) : null;
  return (
    <div className="exact-request" data-testid="preview-exact-request">
      <button type="button" className="disclosure" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <Caret open={open} />
        {t('send.showJson')}
      </button>
      {request && (
        <Paper className="payload-slip" id={id}>
          <p className="small muted">{t('outbound.model', { model: request.model })}</p>
          <pre className="payload" data-testid="preview-payload" tabIndex={0} aria-label={t('send.showJson')}>
            {request.body}
          </pre>
        </Paper>
      )}
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
