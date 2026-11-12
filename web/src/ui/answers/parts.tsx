// Building blocks of the answer screens: the "Leaving your device" step shown before a request,
// an answer with its provenance, read aloud, Google Search Suggestions, source lists, the rule
// pack's official information, and the hook that ties a request to consent and the session cache.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { pcm16ToFloat, pcmRate, type Source } from '../../core/explain';
import { classifyError, TaskError } from '../../ai/errors';
import { planReadAloud, readAloud, requestBody, type ModelAnswer, type PlannedCall, type TaskResult } from '../../ai/tasks';
import type { Program } from '../../core/rules';
import { useApp } from '../context';
import { InferenceBadge } from '../InferenceBadge';
import type { CopyKey } from '../i18n';
import { useConfig } from './config';
import { answerKey, cachedAnswer, giveConsent, markSent, needsConsent, storeAnswer, useSession, wasSent, type Destination } from './session';

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
      void execute(run, key, wasSent(content));
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

export function SendPanel({
  plan,
  lines,
  notListed,
  onSend,
  onSkip,
}: {
  plan: PlannedCall;
  lines: readonly string[];
  /** The body also carries something the lines do not name (the silhouette's criterion states). */
  notListed?: boolean;
  onSend: () => void;
  onSkip: () => void;
}) {
  const { t } = useApp();
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => heading.current?.focus(), []);
  return (
    <section className="send-panel" aria-labelledby={`${id}-title`} data-testid="send-panel" data-task={plan.taskId} data-destination={destinationOf(plan)}>
      <h3 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {t('send.title')}
      </h3>
      <p>{destinationOf(plan) === 'cloud' ? t('send.leadCloud') : t('send.lead')}</p>
      <ul className="send-lines" data-testid="send-lines">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {notListed && <li>{t('send.notListed')}</li>}
        <li>{t('outbound.model', { model: plan.model })}</li>
      </ul>
      <p className="meta">{t('send.notSent')}</p>
      <p className="meta">{t('leaving.network')}</p>
      <details>
        <summary>{t('send.showJson')}</summary>
        <pre className="payload" data-testid="send-payload" tabIndex={0} aria-label={t('send.showJson')}>
          {requestBody(plan)}
        </pre>
      </details>
      <div className="actions">
        <button type="button" className="button primary" onClick={onSend}>
          {t('send.send')}
        </button>
        <button type="button" className="button secondary" onClick={onSkip}>
          {t('send.skip')}
        </button>
      </div>
    </section>
  );
}

// ---------- Answers ----------

export function AnswerText({ result, readable }: { result: TaskResult<ModelAnswer | string>; readable?: ModelAnswer | undefined }) {
  const text = typeof result.value === 'string' ? result.value : result.value.text;
  return (
    <div className="answer" data-testid="answer">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>{para}</p>
      ))}
      <InferenceBadge source={result.inferenceSource} reason={result.reason} route={result.route} ranInCloudBecause={result.ranInCloudBecause} />
      {readable && <ReadAloud answer={readable} />}
    </div>
  );
}

/** The message for a failed request, by kind. */
export function errorCopy(error: TaskError): CopyKey {
  if (error.kind === 'quota-daily') return 'error.quotaDaily';
  if (error.kind === 'quota') return 'error.quota';
  if (error.kind === 'blocked') return 'answers.blocked';
  if (error.kind === 'network') return 'error.network';
  if (error.kind === 'app-check') return 'error.app-check';
  return 'answers.error';
}

export function AnswerError({ error, onRetry }: { error: TaskError; onRetry?: (() => void) | undefined }) {
  const { t } = useApp();
  // A daily limit does not recover in a minute, and a blocked answer is not shown again: no retry.
  const retry = onRetry && error.kind !== 'quota-daily' && error.kind !== 'blocked' ? onRetry : undefined;
  return (
    <div className="task-error" data-testid="answer-error" data-kind={error.kind}>
      <p>{t(errorCopy(error))}</p>
      {error.kind !== 'blocked' && (
        <details>
          <summary>{t('error.detail')}</summary>
          <pre className="detail">{error.detail}</pre>
        </details>
      )}
      {retry && (
        <button type="button" className="button secondary" onClick={retry}>
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
  notListed,
  onSend,
  onSkip,
  onCancel,
  onRetry,
  testId,
  doneStatus,
}: {
  state: RequestState<T>;
  render: (result: T) => ReactNode;
  /** What the status line says when the answer has arrived. */
  doneStatus?: (result: T) => string;
  lines: readonly string[];
  notListed?: boolean;
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
  else if (state.status === 'done') status = doneStatus ? doneStatus(state.result) : '';
  return (
    <div className="request" data-testid={testId} data-status={state.status} aria-busy={state.status === 'loading'}>
      {state.status === 'confirm' && <SendPanel plan={state.plan} lines={lines} notListed={notListed ?? false} onSend={onSend} onSkip={onSkip} />}
      <p className={state.status === 'done' || state.status === 'error' ? 'visually-hidden' : 'status-line'} role="status" data-testid="request-status">
        {status}
      </p>
      {state.status === 'loading' && (
        <button type="button" className="button quiet" onClick={onCancel}>
          {t('answers.cancel')}
        </button>
      )}
      {state.status === 'error' && <AnswerError error={state.error} onRetry={onRetry} />}
      {state.status === 'done' && state.sentBefore && (
        <p className="meta" data-testid="send-once">
          {t('send.once')}
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
        <button type="button" className="button secondary" onClick={() => { stop(); setMessage(t('aloud.stopped')); }}>
          {t('aloud.stop')}
        </button>
      ) : (
        <button
          type="button"
          className="button secondary"
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
      <span className="meta" role="status">
        {message}
      </span>
      {state.status === 'confirm' && <SendPanel plan={state.plan} lines={[t('send.line.answer')]} onSend={request.send} onSkip={request.skip} />}
      {state.status === 'loading' && (
        <button type="button" className="button quiet" onClick={request.cancel}>
          {t('answers.cancel')}
        </button>
      )}
      {state.status === 'error' && <p className="meta" role="alert">{t('aloud.error')}</p>}
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

export function OfficialInfo({ programs, headingLevel = 2 }: { programs: readonly Program[]; headingLevel?: 2 | 3 }) {
  const { t } = useApp();
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const items = programs.map((p) => ({ program: p, sources: packSources(p), apply: p.applyUrl && /^https:\/\//.test(p.applyUrl) ? p.applyUrl : null }));
  const any = items.some((i) => i.sources.length > 0 || i.apply !== null || (i.program.docsRequired ?? []).length > 0);
  return (
    <section className="official" aria-label={t('official.title')} data-testid="official-info">
      <H>{t('official.title')}</H>
      {!any && <p className="meta">{t('official.none')}</p>}
      {items.map(({ program, sources, apply }) =>
        sources.length === 0 && apply === null && (program.docsRequired ?? []).length === 0 ? null : (
          <div key={program.id} className="official-program">
            {programs.length > 1 && <p className="official-name">{program.name}</p>}
            {apply && (
              <p>
                <a className="button secondary" href={apply} target="_blank" rel="noopener noreferrer">
                  {t('official.apply')}
                </a>
              </p>
            )}
            {sources.length > 0 && (
              <ul>
                {sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                    </a>
                    {s.checkedAt && <span className="meta"> · {t('official.checked', { date: s.checkedAt })}</span>}
                  </li>
                ))}
              </ul>
            )}
            {(program.docsRequired ?? []).length > 0 && (
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
