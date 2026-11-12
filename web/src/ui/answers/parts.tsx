// Building blocks of the answer screens: the "Leaving your device" panel shown before a request,
// an answer with its provenance, read aloud, Google Search Suggestions, source lists, the rule
// pack's official information, and the hook that ties a request to consent and the session cache.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { pcm16ToFloat, pcmRate, type Source } from '../../core/explain';
import { classifyError, type TaskError } from '../../ai/errors';
import { planReadAloud, readAloud, requestPreview, type ModelAnswer, type PlannedCall, type TaskResult } from '../../ai/tasks';
import type { Program } from '../../core/rules';
import { useApp } from '../context';
import { InferenceBadge } from '../InferenceBadge';
import { useConfig } from './config';
import { answerKey, cachedAnswer, giveConsent, hasConsent, storeAnswer, useSession } from './session';

// ---------- Request lifecycle ----------

export type RequestState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'confirm'; readonly plan: PlannedCall }
  | { readonly status: 'loading' }
  | { readonly status: 'done'; readonly result: T }
  | { readonly status: 'error'; readonly error: TaskError }
  | { readonly status: 'skipped' };

/**
 * One request the person starts with a tap. The first request that carries a given content
 * (`consentKey`: a canonical silhouette, or a public request kind) shows the panel and waits for
 * Send; later ones in the session run directly and are still listed under "Leaving your device".
 * Results are cached for the session under `cacheKey`.
 */
export function useRequest<T>(cacheKey: string | null, consentKey: string) {
  useSession();
  const cached = cacheKey === null ? undefined : cachedAnswer<T>(cacheKey);
  const [state, setState] = useState<RequestState<T>>({ status: 'idle' });
  const pending = useRef<{ run: () => Promise<T>; key: string | null } | null>(null);

  const execute = useCallback(async (run: () => Promise<T>, key: string | null) => {
    setState({ status: 'loading' });
    try {
      const result = await run();
      if (key !== null) storeAnswer(key, result);
      setState({ status: 'done', result });
    } catch (error) {
      setState({ status: 'error', error: classifyError(error) });
    }
  }, []);

  const start = useCallback(
    (plan: PlannedCall, run: () => Promise<T>, key: string | null = cacheKey) => {
      const hit = key === null ? undefined : cachedAnswer<T>(key);
      if (hit !== undefined) return setState({ status: 'done', result: hit });
      if (!hasConsent(consentKey)) {
        pending.current = { run, key };
        return setState({ status: 'confirm', plan });
      }
      void execute(run, key);
    },
    [cacheKey, consentKey, execute],
  );

  const send = useCallback(() => {
    giveConsent(consentKey);
    const p = pending.current;
    pending.current = null;
    if (p) void execute(p.run, p.key);
  }, [consentKey, execute]);

  const skip = useCallback(() => {
    pending.current = null;
    setState({ status: 'skipped' });
  }, []);

  const shown: RequestState<T> = state.status === 'idle' && cached !== undefined ? { status: 'done', result: cached } : state;
  return { state: shown, start, send, skip };
}

// ---------- Leaving your device (before sending) ----------

export function SendPanel({ plan, lines, onSend, onSkip }: { plan: PlannedCall; lines: readonly string[]; onSend: () => void; onSkip: () => void }) {
  const { t } = useApp();
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => heading.current?.focus(), []);
  const cloudOnly = plan.mode === 'ONLY_IN_CLOUD' || plan.mode === 'PREFER_IN_CLOUD';
  return (
    <section className="send-panel" aria-labelledby={`${id}-title`} data-testid="send-panel" data-task={plan.taskId}>
      <h3 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {t('send.title')}
      </h3>
      <p>{cloudOnly ? t('send.leadCloud') : t('send.lead')}</p>
      <ul className="send-lines" data-testid="send-lines">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="meta">{t('send.notSent')}</p>
      <p className="meta">{t('leaving.network')}</p>
      <details>
        <summary>{t('send.showJson')}</summary>
        <pre className="payload" data-testid="send-payload">
          {JSON.stringify({ model: plan.model, ...requestPreview(plan) }, null, 2)}
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
      <InferenceBadge source={result.inferenceSource} reason={result.reason} route={result.route} />
      {readable && <ReadAloud answer={readable} />}
    </div>
  );
}

export function AnswerError({ error, onRetry }: { error: TaskError; onRetry?: () => void }) {
  const { t } = useApp();
  return (
    <div className="task-error" role="alert" data-testid="answer-error" data-kind={error.kind}>
      <p>{t('answers.error')}</p>
      <details>
        <summary>{t('error.detail')}</summary>
        <pre className="detail">{error.detail}</pre>
      </details>
      {onRetry && (
        <button type="button" className="button secondary" onClick={onRetry}>
          {t('answers.retry')}
        </button>
      )}
    </div>
  );
}

/** A live region that announces when an answer starts and arrives. */
export function RequestRegion<T>({
  state,
  render,
  lines,
  onSend,
  onSkip,
  onRetry,
  testId,
}: {
  state: RequestState<T>;
  render: (result: T) => React.ReactNode;
  lines: readonly string[];
  onSend: () => void;
  onSkip: () => void;
  onRetry?: () => void;
  testId?: string;
}) {
  const { t } = useApp();
  return (
    <div className="request" aria-live="polite" aria-busy={state.status === 'loading'} data-testid={testId} data-status={state.status}>
      {state.status === 'confirm' && <SendPanel plan={state.plan} lines={lines} onSend={onSend} onSkip={onSkip} />}
      {state.status === 'loading' && <p className="loading">{t('answers.loading')}</p>}
      {state.status === 'skipped' && <p className="meta">{t('send.skipped')}</p>}
      {state.status === 'error' && <AnswerError error={state.error} {...(onRetry ? { onRetry } : {})} />}
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
          disabled={state.status === 'loading'}
          onClick={() => {
            if (state.status === 'done') return play(state.result.value);
            wantPlay.current = true;
            setMessage(t('aloud.loading'));
            request.start(planReadAloud(answer, locale), () => readAloud(answer, locale));
          }}
        >
          {t('aloud.play')}
        </button>
      )}
      <span className="meta" role="status">
        {message}
      </span>
      {state.status === 'confirm' && <SendPanel plan={state.plan} lines={[t('send.line.answer')]} onSend={request.send} onSkip={request.skip} />}
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
