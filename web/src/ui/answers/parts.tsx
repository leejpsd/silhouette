// Building blocks of the answer screens: the "Leaving your device" step shown before a request,
// an answer with its provenance, read aloud, Google Search Suggestions, source lists, the rule
// pack's official information, and the hook that ties a request to consent and the session cache.

import { bringIntoView } from '../design/motion';
import { leftDevice, outboundState, subscribeOutbound } from '../../data/outbound';
import { askDeviceStatus } from '../../ai/device-model';
import { useOnline } from '../design/online';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { pcm16ToFloat, pcmRate, type Source } from '../../core/explain';
import { appCheckCause, classifyError, TaskError } from '../../ai/errors';
import { planReadAloud, readAloud, requestBody, type ModelAnswer, type PlannedCall, type TaskResult } from '../../ai/tasks';
import type { Program } from '../../core/rules';
import { useApp } from '../context';
import { InferenceBadge } from '../InferenceBadge';
import { dynamicKey, type CopyKey } from '../i18n';
import { Alert, Caret, Check, ChevronRight, Close, External, LeaveGlyph, Lock, Retry } from '../design/icons';
import { Paper, ActionLabel } from '../design/parts';
import { BlockActions, useWide } from '../design/block';
import { useConfig } from './config';
import { programCopy } from './facts';
import { SOURCES_READ_ON } from '../pack';
import { packDate, programName } from '../i18n';
import { answerKey, cachedAnswer, giveConsent, markSent, needsConsent, storeAnswer, useSession, type Destination } from './session';

// ---------- Request lifecycle ----------

/** After this long, the status line says the answer is taking longer than usual. */
export const SLOW_AFTER_MS = 15_000;

export type RequestState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'confirm'; readonly plan: PlannedCall }
  | { readonly status: 'loading'; readonly slow: boolean }
  | { readonly status: 'done'; readonly result: T; readonly sentBefore: boolean }
  | { readonly status: 'error'; readonly error: TaskError }
  | { readonly status: 'skipped' }
  | { readonly status: 'cancelled' };

export const destinationOf = (plan: PlannedCall): Destination => (plan.mode === 'PREFER_ON_DEVICE' || plan.mode === 'ONLY_ON_DEVICE' ? 'device-first' : 'cloud');

const reachedCloud = (value: unknown): boolean => (value as { inferenceSource?: unknown } | null)?.inferenceSource === 'IN_CLOUD';

/**
 * One request the person starts with a tap.
 * - The step before sending is shown unless this content (`content`: a canonical silhouette, or a
 *   public request kind) was already agreed to for the same destination, or has already been sent in
 *   this session (then the answer says so with `send.once`).
 * - Results are cached for the session under `cacheKey`; a new key (another language) starts idle.
 * - Loading can be cancelled; after 15 seconds the status says it is slow.
 * - After Send, focus moves to `focusAfterSend` (a persistent heading).
 */
export function useRequest<T>(cacheKey: string | null, content: string, focusAfterSend?: RefObject<HTMLElement | null>) {
  useSession();
  const cached = cacheKey === null ? undefined : cachedAnswer<T>(cacheKey);
  const [state, setState] = useState<RequestState<T>>({ status: 'idle' });
  const [stateKey, setStateKey] = useState(cacheKey);
  const pending = useRef<{ run: (signal: AbortSignal) => Promise<T>; key: string | null; plan: PlannedCall } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A different key (for example another language) never shows the previous answer.
  if (stateKey !== cacheKey) {
    setStateKey(cacheKey);
    setState({ status: 'idle' });
  }
  useEffect(
    () => () => {
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const execute = useCallback(
    async (run: (signal: AbortSignal) => Promise<T>, key: string | null, sentBefore: boolean) => {
      const abort = new AbortController();
      controller.current = abort;
      setState({ status: 'loading', slow: false });
      timer.current = setTimeout(() => setState((s) => (s.status === 'loading' ? { status: 'loading', slow: true } : s)), SLOW_AFTER_MS);
      try {
        const result = await run(abort.signal);
        if (abort.signal.aborted) return;
        if (reachedCloud(result)) markSent(content);
        if (key !== null) storeAnswer(key, result);
        setState({ status: 'done', result, sentBefore });
      } catch (error) {
        if (abort.signal.aborted) return;
        const e = classifyError(error);
        if (e.status !== undefined) markSent(content);
        setState({ status: 'error', error: e });
      } finally {
        if (timer.current) clearTimeout(timer.current);
        if (controller.current === abort) controller.current = null;
      }
    },
    [content],
  );

  const start = useCallback(
    (plan: PlannedCall, run: (signal: AbortSignal) => Promise<T>, key: string | null = cacheKey) => {
      const hit = key === null ? undefined : cachedAnswer<T>(key);
      if (hit !== undefined) return setState({ status: 'done', result: hit, sentBefore: false });
      if (needsConsent(content, destinationOf(plan))) {
        pending.current = { run, key, plan };
        return setState({ status: 'confirm', plan });
      }
      // The step is skipped (agreed or sent before in this session): the answer says so.
      void execute(run, key, true);
    },
    [cacheKey, content, execute],
  );

  const send = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    giveConsent(content, destinationOf(p.plan));
    focusAfterSend?.current?.focus();
    void execute(p.run, p.key, false);
  }, [content, execute, focusAfterSend]);

  const skip = useCallback(() => {
    pending.current = null;
    setState({ status: 'skipped' });
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    if (timer.current) clearTimeout(timer.current);
    setState({ status: 'cancelled' });
  }, []);

  const shown: RequestState<T> = state.status === 'idle' && cached !== undefined ? { status: 'done', result: cached, sentBefore: false } : state;
  return { state: shown, start, send, skip, cancel };
}

// ---------- Leaving your device (before sending) ----------

/** "Income range: 30,000 to 44,999 (C)" → label and value, for the paper slip. */
function splitLine(line: string): [string, string] {
  const i = line.indexOf(': ');
  return i === -1 ? ['', line] : [line.slice(0, i), line.slice(i + 2)];
}

/**
 * The step before a request leaves: a bottom sheet over the page (narrow) or a modal (wide), with what
 * the request carries, the exact body on demand, and the decision. Esc or the close button keeps the
 * request on this device. `publicOnly`: the request carries nothing about the person, so the modal can
 * show what stays here.
 */
export function SendPanel({
  plan,
  lines,
  onSend,
  onSkip,
  publicOnly = false,
}: {
  plan: PlannedCall;
  lines: readonly string[];
  onSend: () => void;
  onSkip: () => void;
  publicOnly?: boolean;
}) {
  const { t, locale } = useApp();
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const [showBody, setShowBody] = useState(false);
  const wide = useWide();
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => heading.current?.focus(), [wide]);
  // The sheet closes before the page acts on the decision, so focus can move back into the page.
  const decide = (then: () => void) => () => {
    if (dialog.current?.open) dialog.current.close();
    then();
  };
  // Device first only means the device when it has a model for this. Without one the request can only go
  // to the cloud, and the step says so (never "On this device" over a Send that leaves).
  const [deviceReady, setDeviceReady] = useState<boolean | null>(destinationOf(plan) === 'cloud' ? false : null);
  // Not downloaded yet is not "no model": the line says which.
  const [notDownloaded, setNotDownloaded] = useState(false);
  useEffect(() => {
    if (destinationOf(plan) === 'cloud') return;
    let live = true;
    void askDeviceStatus(locale).then(
      (status) => {
        if (!live) return;
        setDeviceReady(status === 'available');
        setNotDownloaded(status === 'downloadable' || status === 'downloading');
      },
      () => live && setDeviceReady(false),
    );
    return () => {
      live = false;
    };
  }, [plan, locale]);
  const cloud = destinationOf(plan) === 'cloud' || deviceReady === false;
  const online = useOnline();
  // Nothing has gone to the cloud yet in this session: the first request brings two technical ones with it.
  const firstRequest = useSyncExternalStore(subscribeOutbound, () => leftDevice(outboundState().entries).length === 0, () => true);
  return (
    <dialog
      ref={dialog}
      className={`sheet send-sheet${wide ? ' send-modal' : ''}`}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        decide(onSkip)();
      }}
    >
      <div className="send-panel" role="group" aria-labelledby={`${id}-title`} data-testid="send-panel" data-task={plan.taskId} data-destination={destinationOf(plan)}>
        <span className="grab" aria-hidden="true" />
        <div className="send-head">
          <h3 id={`${id}-title`} ref={heading} tabIndex={-1} className="send-title">
            {wide ? t('send.beforeLeaves') : t('send.title')}
          </h3>
          <button type="button" className="icon-button" aria-label={t('nav.close')} onClick={decide(onSkip)}>
            <Close />
          </button>
        </div>
        <p className="send-lead">{cloud ? t('send.leadCloud') : t('send.lead')}</p>
        <div className="send-slip">
          <p className="leave-tab">
            <span>{wide && cloud ? t('send.goesCloud') : t('preview.couldLeave')}</span>
          </p>
          <Paper>
            <ul className="send-lines" data-testid="send-lines">
              {lines.map((line) => {
                const [label, value] = splitLine(line);
                return (
                  <li key={line}>
                    {label && <span className="paper-label">{label}: </span>}
                    <span className="paper-value">{value}</span>
                  </li>
                );
              })}
              <li>
                <span className="paper-label">{t('outbound.model', { model: '' }).replace(/[:\s]+$/, '')}: </span>
                <span className="paper-value">{plan.model}</span>
              </li>
            </ul>
          </Paper>
          <p className="slip-foot">
            <Check size={14} />
            {t('send.notSent')}
          </p>
        </div>
        {/* Wide: what stays here, as masked bars (no values), for a request that carries nothing of the person's. */}
        {wide && publicOnly && (
          <div className="stays-card" data-testid="stays-card">
            <p className="stays-head">
              <span className="dot-ring" aria-hidden="true" />
              {t('send.staysHere')}
              <Lock />
            </p>
            <ul className="stays-rows">
              {(['send.stays.answers', 'send.stays.income', 'send.stays.household'] as const).map((key, i) => (
                <li key={key}>
                  <span>{t(key)}</span>
                  <span className="masked" style={{ inlineSize: `${[70, 40, 26][i]}px` }} aria-hidden="true" />
                </li>
              ))}
            </ul>
          </div>
        )}
        <button type="button" className="disclosure" aria-expanded={showBody} aria-controls={`${id}-body`} onClick={() => setShowBody(!showBody)}>
          <Caret open={showBody} />
          {t('send.showJson')}
        </button>
        {showBody && (
          <Paper className="payload-slip" id={`${id}-body`}>
            <pre className="payload" data-testid="send-payload" tabIndex={0} aria-label={t('send.showJson')}>
              {requestBody(plan)}
            </pre>
          </Paper>
        )}
        <BlockActions mode="decision" inline>
          {deviceReady !== null && (
            <p className="routing-line">
              <strong className={`badge ${cloud ? 'badge-cloud' : 'badge-device'}`}>{cloud ? t('badge.cloud') : t('badge.onDevice')}</strong>
              <span>{cloud && destinationOf(plan) !== 'cloud' ? `${t(dynamicKey(`reason.${plan.reason}`))} (${t(notDownloaded ? 'reason.detail.notDownloaded' : 'reason.detail.noDeviceModel')})` : cloud ? t(dynamicKey(`reason.${plan.reason}`)) : t('tasks.first')}</span>
            </p>
          )}
          {deviceReady !== null && (
            <p className="small destination-line" data-testid="send-destination" data-destination={cloud ? 'cloud' : 'device'}>
              {t(cloud ? 'send.destination.cloudGeneral' : 'send.destination.deviceGeneral')}
            </p>
          )}
          {!online && (
            <p className="dashed-note" role="status" data-testid="send-offline">
              {t('state.offlineSend')}
            </p>
          )}
          <div className="decision" data-testid="send-decision">
            <button type="button" className="outline-button tall" onClick={decide(onSkip)}>
              {t('send.keepShort')}
            </button>
            {/* Offline, Send cannot act: it is drawn so, and the line above says why. */}
            <button type="button" className="send-button" aria-disabled={online ? undefined : true} onClick={online ? decide(onSend) : undefined}>
              <ActionLabel>{t('send.send')}</ActionLabel>
              <span className="action-arrow">
                <LeaveGlyph />
              </span>
            </button>
          </div>
          {wide ? (
            <p className="key-hint" aria-hidden="true">
              <kbd className="key">Esc</kbd> {t('keys.keep')}
            </p>
          ) : (
            <p className="send-note">{t('send.byteForByte')}</p>
          )}
          {/* What saying yes covers beyond this one request, said before it is given. */}
          {firstRequest && <p className="send-note">{t('send.firstAlso')}</p>}
          {!publicOnly && <p className="send-note">{t('send.sessionNote')}</p>}
          <p className="send-note">{t('leaving.network')}</p>
        </BlockActions>
      </div>
    </dialog>
  );
}

// ---------- Answers ----------

/** "Not yet": three marching dotted lines while an answer is written. */
export function Loading() {
  return (
    <div className="loading-lines" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function AnswerText({ result, readable }: { result: TaskResult<ModelAnswer | string>; readable?: ModelAnswer | undefined }) {
  const text = typeof result.value === 'string' ? result.value : result.value.text;
  return (
    <div className="answer" data-testid="answer">
      <InferenceBadge source={result.inferenceSource} reason={result.reason} route={result.route} ranInCloudBecause={result.ranInCloudBecause} />
      {result.reason === 'on-device-failed' && <Retried />}
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="answer-text">
          {para}
        </p>
      ))}
      {readable && <ReadAloud answer={readable} />}
    </div>
  );
}

function Retried() {
  const { t } = useApp();
  return <p className="small">{t('answers.retried')}</p>;
}

/** The message for a failed request on a program or help page, by kind (typing numbers does not apply here). */
export function errorCopy(error: TaskError): CopyKey {
  if (error.kind === 'quota-daily') return 'error.quotaDailyAnswers';
  if (error.kind === 'quota') return 'error.quota';
  if (error.kind === 'blocked') return 'answers.blocked';
  if (error.kind === 'network') return 'error.network';
  if (error.kind === 'server') return 'error.server';
  if (error.kind === 'app-check') return `error.appCheck.${appCheckCause(error)}`;
  return 'answers.error';
}

export function AnswerError({ error, onRetry }: { error: TaskError; onRetry?: (() => void) | undefined }) {
  const { t } = useApp();
  // A daily limit does not recover in a minute, and a blocked answer is not shown again: no retry.
  const retry = onRetry && error.kind !== 'quota-daily' && error.kind !== 'blocked' ? onRetry : undefined;
  return (
    <div className="task-error" data-testid="answer-error" data-kind={error.kind}>
      <p className="alert-line">
        <Alert />
        <span>{t(errorCopy(error))}</span>
      </p>
      {error.kind !== 'blocked' && (
        <details className="error-detail">
          <summary>{t('error.detail')}</summary>
          <pre className="detail">{error.detail}</pre>
        </details>
      )}
      {retry && (
        <button type="button" className="outline-button" onClick={retry}>
          <Retry />
          {t('answers.retry')}
        </button>
      )}
    </div>
  );
}

/**
 * Where a request lives on the page: the step before sending, then a status line (the only live
 * region: started, slow, cancelled, failed, ready), a Cancel button while it runs, and the answer.
 */
export function RequestRegion<T>({
  state,
  render,
  lines,
  publicOnly,
  onSend,
  onSkip,
  onCancel,
  onRetry,
  testId,
}: {
  state: RequestState<T>;
  render: (result: T) => ReactNode;
  lines: readonly string[];
  /** The request carries only public information: the "sent before" notice says so. */
  publicOnly?: boolean;
  onSend: () => void;
  onSkip: () => void;
  onCancel: () => void;
  onRetry?: () => void;
  testId?: string;
}) {
  const { t } = useApp();
  let status = '';
  if (state.status === 'loading') status = state.slow ? `${t('answers.loading')} ${t('answers.slow')}` : t('answers.loading');
  else if (state.status === 'cancelled') status = t('answers.cancelled');
  else if (state.status === 'skipped') status = t('send.skipped');
  else if (state.status === 'error') status = t(errorCopy(state.error));
  else if (state.status === 'done') status = t('answers.ready');
  // What a press started is seen: the stage while it runs, then the answer or what went wrong, in view
  // above the dock.
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === 'loading' || state.status === 'done' || state.status === 'error') bringIntoView(region.current);
  }, [state.status]);
  return (
    <div ref={region} className="request" data-testid={testId} data-status={state.status} aria-busy={state.status === 'loading'}>
      {state.status === 'confirm' && <SendPanel plan={state.plan} lines={lines} onSend={onSend} onSkip={onSkip} publicOnly={publicOnly === true} />}
      {state.status === 'loading' && <Loading />}
      <p className={state.status === 'done' || state.status === 'error' ? 'visually-hidden' : 'status-line'} role="status" data-testid="request-status">
        {status}
      </p>
      {state.status === 'loading' && (
        <button type="button" className="text-link" onClick={onCancel}>
          {t('answers.cancel')}
        </button>
      )}
      {state.status === 'error' && <AnswerError error={state.error} onRetry={onRetry} />}
      {state.status === 'done' && state.sentBefore && (
        <p className="small muted" data-testid="send-once">
          {publicOnly ? t('send.linePublic') : t('send.once')}
        </p>
      )}
      {state.status === 'done' && render(state.result)}
    </div>
  );
}

// ---------- Read aloud ----------

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Read aloud (feature_tts). Sends the answer text, nothing else; shown only for cloud-safe answers. */
export function ReadAloud({ answer }: { answer: ModelAnswer }) {
  const { t, locale } = useApp();
  const config = useConfig();
  const request = useRequest<TaskResult<{ data: string; mimeType: string }>>(answerKey('speech', locale, answer.text), 'speech');
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState('');
  const audio = useRef<{ ctx: AudioContext; source: AudioBufferSourceNode } | null>(null);

  const stop = useCallback(() => {
    audio.current?.source.stop();
    void audio.current?.ctx.close();
    audio.current = null;
    setPlaying(false);
  }, []);
  useEffect(() => stop, [stop]);

  const play = useCallback(
    (speech: { data: string; mimeType: string }) => {
      const samples = pcm16ToFloat(decodeBase64(speech.data));
      const ctx = new AudioContext();
      const buffer = ctx.createBuffer(1, Math.max(samples.length, 1), pcmRate(speech.mimeType));
      buffer.copyToChannel(samples, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setPlaying(false);
        setMessage(t('aloud.stopped'));
      };
      source.start();
      audio.current = { ctx, source };
      setPlaying(true);
      setMessage(t('aloud.playing'));
    },
    [t],
  );

  const { state } = request;
  // Plays once when audio the person asked for arrives (after Send, or straight away).
  const wantPlay = useRef(false);
  useEffect(() => {
    if (state.status === 'done' && wantPlay.current) {
      wantPlay.current = false;
      play(state.result.value);
    }
    if (state.status === 'error' || state.status === 'skipped') wantPlay.current = false;
  }, [state, play]);

  if (!config.tts) return null;
  return (
    <div className="read-aloud">
      {playing ? (
        <button type="button" className="outline-button" onClick={() => { stop(); setMessage(t('aloud.stopped')); }}>
          {t('aloud.stop')}
        </button>
      ) : (
        <button
          type="button"
          className="outline-button"
          aria-disabled={state.status === 'loading'}
          onClick={() => {
            if (state.status === 'loading') return;
            if (state.status === 'done') return play(state.result.value);
            wantPlay.current = true;
            setMessage(t('aloud.loading'));
            request.start(planReadAloud(answer, locale), (signal) => readAloud(answer, locale, { signal }));
          }}
        >
          {t('aloud.play')}
        </button>
      )}
      <span className="small muted" role="status">
        {message}
      </span>
      {state.status === 'confirm' && <SendPanel plan={state.plan} lines={[t('send.line.answer')]} onSend={request.send} onSkip={request.skip} />}
      {state.status === 'loading' && (
        <button type="button" className="text-link" onClick={request.cancel}>
          {t('answers.cancel')}
        </button>
      )}
      {state.status === 'error' && <p className="small muted" role="alert">{t('aloud.error')}</p>}
      {state.status === 'done' && <InferenceBadge source={state.result.inferenceSource} reason={state.result.reason} />}
    </div>
  );
}

// ---------- Grounding display ----------

/**
 * Google Search Suggestions, rendered exactly as given in a shadow root (as the SDK documents) so the
 * page's CSS and the snippet's CSS do not mix. Links open in a new tab so the app keeps its state.
 */
export function SearchSuggestions({ html }: { html: string }) {
  const { t } = useApp();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
    root.innerHTML = html;
    for (const script of root.querySelectorAll('script')) script.remove();
    for (const a of root.querySelectorAll('a')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  }, [html]);
  return <div className="search-suggestions" ref={host} role="group" aria-label={t('current.suggestions')} data-testid="search-suggestions" />;
}

export function SourceList({ sources }: { sources: readonly Source[] }) {
  const { t } = useApp();
  if (sources.length === 0) return null;
  return (
    <div className="sources" data-testid="sources">
      <h4>{t('current.sources')}</h4>
      <ul>
        {sources.map((s) => (
          <li key={s.uri}>
            <a href={s.uri} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Official information from the rule pack ----------

interface PackSource {
  readonly url: string;
  readonly title: string;
  readonly checkedAt?: string;
}

function packSources(program: Program): PackSource[] {
  return (program.sources ?? []).flatMap((s) => {
    if (s === null || typeof s !== 'object' || Array.isArray(s)) return [];
    const r = s as Record<string, unknown>;
    if (typeof r['url'] !== 'string' || !/^https:\/\//.test(r['url'])) return [];
    const title = typeof r['title'] === 'string' ? r['title'] : r['url'];
    return [{ url: r['url'], title, ...(typeof r['checkedAt'] === 'string' ? { checkedAt: r['checkedAt'] } : {}) }];
  });
}

export function OfficialInfo({ programs, headingLevel = 2, withCopy = false }: { programs: readonly Program[]; headingLevel?: 2 | 3; withCopy?: boolean }) {
  const { t, locale } = useApp();
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const items = programs.map((p) => ({ program: p, sources: packSources(p), apply: p.applyUrl && /^https:\/\//.test(p.applyUrl) ? p.applyUrl : null }));
  const any = items.some((i) => i.sources.length > 0 || i.apply !== null || (i.program.docsRequired ?? []).length > 0);
  // On a program's own screen: how to apply, the usual papers and the office, from the pack's copy.
  const copy = withCopy && programs.length === 1 && programs[0] ? programCopy(locale, programs[0]) : {};
  return (
    <section className="official" aria-label={t('official.title')} data-testid="official-info">
      <H>{t('official.title')}</H>
      {/* On a program's page: how to apply, papers and the office as rows that open the pack's text. */}
      {(copy.apply || copy.documents || copy.office) && (
        <div className="program-copy info-rows" data-testid="program-copy-official">
          {copy.apply && (
            <details className="info-row">
              <summary>
                {t('official.howToApply')}
                <ChevronRight />
              </summary>
              <p>{copy.apply}</p>
            </details>
          )}
          {copy.documents && (
            <details className="info-row">
              <summary>
                {t('official.docs')}
                <ChevronRight />
              </summary>
              <p>{copy.documents}</p>
            </details>
          )}
          {copy.office && (
            <details className="info-row">
              <summary>
                {t('official.office')}
                <ChevronRight />
              </summary>
              <p>{copy.office}</p>
            </details>
          )}
        </div>
      )}
      {!any && <p className="small muted">{t('official.none')}</p>}
      {items.map(({ program, sources, apply }) =>
        sources.length === 0 && apply === null && (program.docsRequired ?? []).length === 0 ? null : (
          <div key={program.id} className="official-program">
            {programs.length > 1 && <p className="official-name">{programName(locale, program)}</p>}
            {apply && (
              <p>
                <a className="outline-button" href={apply} target="_blank" rel="noopener noreferrer">
                  {t('official.apply')}
                  <External />
                </a>
              </p>
            )}
            {sources.length > 0 && (
              <>
                <p className="small strong">{t('official.source')}</p>
                <ul className="official-sources" data-testid="official-sources">
                  {sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title}
                        <External />
                      </a>
                      {/* A draft pack's numbers were read on a date; a confirmed source says when it was compared. */}
                      {s.checkedAt ? (
                        <span className="small muted source-date">{t('official.confirmedOn', { date: packDate(locale, s.checkedAt) })}</span>
                      ) : SOURCES_READ_ON ? (
                        <span className="small muted source-date" data-testid="source-read-on">{t('official.readOn', { date: packDate(locale, SOURCES_READ_ON) })}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {/* The pack's list is in one language; its program copy says the same in the reader's. */}
            {!(withCopy && copy.documents) && (program.docsRequired ?? []).length > 0 && (
              <>
                <p>{t('official.docs')}</p>
                <ul>
                  {(program.docsRequired ?? []).map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ),
      )}
    </section>
  );
}
