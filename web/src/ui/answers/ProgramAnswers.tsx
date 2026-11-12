// The parts of a program's page below the result:
// - "Why this result": the rule engine's reasons with limits and the person's values (no model), and,
//   with a device model, an explanation of the person's own result written on this device only;
// - "About this program": a general explanation and prepared questions from a model that only knows
//   the silhouette and never states a result;
// - a typed question, answered on this device only;
// - current information found by search (behind a flag).
// Nothing here is requested until the person taps.

import { useEffect, useId, useRef, useState } from 'react';
import './answers.css';
import { Raw, asPublic } from '../../core/types';
import type { CriterionState, Program, Verdict } from '../../core/rules';
import { askDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { askFreeText, explainPersonal } from '../../ai/on-device';
import { classifyError, type TaskError } from '../../ai/errors';
import {
  askChip,
  explainProgram,
  planAskChip,
  planCurrentStatus,
  planExplain,
  programCurrentStatus,
  type CurrentStatus,
  type ExplainInput,
  type ModelAnswer,
  type TaskResult,
} from '../../ai/tasks';
import { useApp } from '../context';
import { InferenceBadge, provenanceSentence } from '../InferenceBadge';
import { dynamicKey, programName, type CopyKey } from '../i18n';
import { PACK } from '../pack';
import { useConfig } from './config';
import { AnswerError, AnswerText, RequestRegion, SearchSuggestions, SourceList, useRequest } from './parts';
import { personalResult, useReasons, whyRows } from './personal';
import { answerKey } from './session';
import { allProgramNames, explainInput, programFacts, silhouetteLines, useSilhouette, type Silhouette } from './silhouette';

const CHIPS: readonly { id: string; key: CopyKey }[] = [
  { id: 'apply', key: 'ask.chip.apply' },
  { id: 'documents', key: 'ask.chip.documents' },
  { id: 'change', key: 'ask.chip.change' },
  { id: 'offer', key: 'ask.chip.offer' },
];

/** Whether the on-device model can answer in this language (typed questions, the person's own result). */
function useDeviceStatus(): DeviceStatus | 'checking' {
  const { locale } = useApp();
  const [status, setStatus] = useState<DeviceStatus | 'checking'>('checking');
  useEffect(() => {
    let live = true;
    setStatus('checking');
    void askDeviceStatus(locale).then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, [locale]);
  return status;
}

export function ProgramAnswers({ program, verdict }: { program: Program; verdict: Verdict }) {
  const { t, locale } = useApp();
  const silhouette = useSilhouette();
  const config = useConfig();
  const device = useDeviceStatus();
  const input = silhouette ? explainInput(silhouette, programFacts(t, locale, program), locale) : null;
  return (
    <>
      <WhySection program={program} verdict={verdict} device={device} />
      {silhouette && input && <AboutSection silhouette={silhouette} input={input} programName={programName(locale, program)} />}
      <FreeTextQuestion program={program} verdict={verdict} device={device} />
      {config.groundingSearch && <CurrentStatusSection programId={program.id} />}
    </>
  );
}

const StateIcon = ({ state }: { state: CriterionState }) => {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false } as const;
  if (state === 'pass')
    return (
      <svg {...common} className="state-icon">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="var(--color-surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (state === 'fail')
    return (
      <svg {...common} className="state-icon">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  if (state === 'mixed')
    return (
      <svg {...common} className="state-icon">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2.5a9.5 9.5 0 0 0 0 19z" fill="currentColor" />
      </svg>
    );
  return (
    <svg {...common} className="state-icon">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3.2 2.6" />
    </svg>
  );
};

/** "Why this result": always there, from the rules on this device. */
function WhySection({ program, verdict, device }: { program: Program; verdict: Verdict; device: DeviceStatus | 'checking' }) {
  const { t, locale } = useApp();
  const id = useId();
  const reasons = useReasons(program.id);
  const rows = whyRows(t, locale, program, reasons);
  const heading = useRef<HTMLHeadingElement>(null);
  const [personal, setPersonal] = useState<
    { status: 'idle' } | { status: 'loading' } | { status: 'done'; result: TaskResult<string> } | { status: 'error'; error: TaskError }
  >({ status: 'idle' });
  // An answer written in another language is not shown under these headings.
  const [forLocale, setForLocale] = useState(locale);
  if (forLocale !== locale) {
    setForLocale(locale);
    setPersonal({ status: 'idle' });
  }
  const explain = async () => {
    setPersonal({ status: 'loading' });
    try {
      setPersonal({ status: 'done', result: await explainPersonal(personalResult(t, locale, program, verdict, reasons)) });
    } catch (error) {
      setPersonal({ status: 'error', error: classifyError(error) });
    }
  };
  return (
    <section className="why" aria-labelledby={`${id}-title`} data-testid="why-section">
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {t('why.title')}
      </h2>
      <p className="meta">{t('why.lead')}</p>
      <ul className="criteria">
        {rows.map((row) => (
          <li key={row.id} className={`criterion state-${row.state}`} data-state={row.state} data-testid={`why-${row.id}`}>
            <StateIcon state={row.state} />
            <span className="criterion-text">
              {row.label}
              {row.limits.map((l) => (
                <span key={l.limit} className="criterion-limit" data-testid="why-limit">
                  {t('why.limitYours', { limit: l.limit, value: l.yours })}
                </span>
              ))}
            </span>
            <span className="criterion-state">{t(dynamicKey(`state.${row.state}`))}</span>
          </li>
        ))}
      </ul>
      {device === 'available' ? (
        <>
          {(personal.status === 'idle' || personal.status === 'error') && (
            <button type="button" className="button secondary" onClick={() => void explain()}>
              {t('why.explain')}
            </button>
          )}
          <p className="status-line" role="status" data-testid="why-status">
            {personal.status === 'loading' ? t('answers.loading') : personal.status === 'done' ? provenanceSentence(t, personal.result) : ''}
          </p>
          {personal.status === 'error' && <AnswerError error={personal.error} />}
          {personal.status === 'done' && (
            <div data-testid="why-answer">
              <AnswerText result={personal.result} />
            </div>
          )}
        </>
      ) : device === 'checking' ? null : (
        <p className="meta" data-testid="why-unavailable">
          {t('why.unavailable')}
        </p>
      )}
    </section>
  );
}

type Answer = TaskResult<ModelAnswer>;

/** "About this program": the general explanation and prepared questions (cloud-capable, no result). */
function AboutSection({ silhouette, input, programName: name }: { silhouette: Silhouette; input: ExplainInput; programName: string }) {
  const { t, locale } = useApp();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const base = [locale, silhouette.canonical, input.program.programId];
  const short = useRequest<Answer>(answerKey('explain-short', ...base), silhouette.canonical, heading);
  const long = useRequest<Answer>(answerKey('explain-long', ...base), silhouette.canonical, heading);
  const lines = [...silhouetteLines(t, locale, silhouette.profile), t('send.line.program', { value: name })];
  const ask = (which: 'short' | 'long') => {
    const request = which === 'short' ? short : long;
    const plan = planExplain(input, which);
    request.start(plan, (signal) => explainProgram(plan, { signal }));
  };
  const again = (status: string) => status === 'idle' || status === 'skipped' || status === 'cancelled';
  return (
    <section className="answers" aria-labelledby={`${id}-title`} data-testid="explain-section">
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {t('about.title')}
      </h2>
      <p className="meta" data-testid="about-lead">
        {t('about.lead')}
      </p>
      {again(short.state.status) && (
        <button type="button" className="button secondary" onClick={() => ask('short')}>
          {t('about.explain')}
        </button>
      )}
      <RequestRegion
        state={short.state}
        lines={lines}
        notListed
        onSend={short.send}
        onSkip={short.skip}
        onCancel={short.cancel}
        onRetry={() => ask('short')}
        testId="explain-short"
        doneStatus={(r) => provenanceSentence(t, r)}
        render={(result) => (
          <>
            <AnswerText result={result} readable={result.value} />
            {again(long.state.status) && (
              <button type="button" className="button quiet" onClick={() => ask('long')}>
                {t('answers.explainLong')}
              </button>
            )}
          </>
        )}
      />
      {long.state.status !== 'idle' && (
        <RequestRegion
          state={long.state}
          lines={lines}
          notListed
          onSend={long.send}
          onSkip={long.skip}
          onCancel={long.cancel}
          onRetry={() => ask('long')}
          testId="explain-long"
          doneStatus={(r) => provenanceSentence(t, r)}
          render={(result) => <AnswerText result={result} readable={result.value} />}
        />
      )}
      <h3>{t('ask.chips')}</h3>
      <ul className="chips">
        {CHIPS.map((chip) => (
          <ChipQuestion key={chip.id} chipId={chip.id} question={t(chip.key)} silhouette={silhouette} input={input} programName={name} />
        ))}
      </ul>
    </section>
  );
}

function ChipQuestion({ chipId, question, silhouette, input, programName: name }: { chipId: string; question: string; silhouette: Silhouette; input: ExplainInput; programName: string }) {
  const { t, locale } = useApp();
  const button = useRef<HTMLButtonElement>(null);
  const request = useRequest<Answer>(answerKey('ask-chip', locale, silhouette.canonical, input.program.programId, chipId), silhouette.canonical, button);
  const lines = [...silhouetteLines(t, locale, silhouette.profile), t('send.line.program', { value: name }), t('send.line.question', { value: question })];
  const busy = request.state.status === 'loading';
  const ask = () => {
    if (busy) return;
    const plan = planAskChip(input, asPublic({ id: chipId, question }));
    request.start(plan, (signal) => askChip(plan, { signal }));
  };
  return (
    <li className="chip-question" data-testid={`chip-${chipId}`}>
      {/* Never disabled while loading, so focus stays on it; a second press does nothing. */}
      <button ref={button} type="button" className="button chip-button" aria-expanded={request.state.status !== 'idle'} aria-disabled={busy} onClick={ask}>
        {question}
      </button>
      {request.state.status !== 'idle' && (
        <RequestRegion
          state={request.state}
          lines={lines}
          notListed
          onSend={request.send}
          onSkip={request.skip}
          onCancel={request.cancel}
          onRetry={ask}
          doneStatus={(r) => provenanceSentence(t, r)}
          render={(result) => <AnswerText result={result} readable={result.value} />}
        />
      )}
    </li>
  );
}

/** ask.freeText: offered only when the model runs on this device; otherwise the UI says why. */
function FreeTextQuestion({ program, verdict, device }: { program: Program; verdict: Verdict; device: DeviceStatus | 'checking' }) {
  const { t, locale } = useApp();
  const fieldId = useId();
  const reasons = useReasons(program.id);
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<{ id: number; locale: string; question: string; result?: TaskResult<string>; error?: TaskError }[]>([]);

  if (device === 'checking') return null;
  if (device !== 'available') {
    return (
      <section className="ask" aria-label={t('ask.free.label')}>
        <p className="meta" data-testid="free-text-unavailable">
          {t('ask.free.unavailable')}
        </p>
      </section>
    );
  }
  const submit = async () => {
    const question = text.trim();
    if (question === '') return setEmpty(true);
    setEmpty(false);
    setBusy(true);
    const entry = { id: answers.length, locale, question };
    try {
      const result = await askFreeText(Raw.of(question), personalResult(t, locale, program, verdict, reasons));
      setAnswers((a) => [...a, { ...entry, result }]);
      setText('');
    } catch (error) {
      setAnswers((a) => [...a, { ...entry, error: classifyError(error) }]);
    } finally {
      setBusy(false);
    }
  };
  // Answers in another language are not shown under these headings.
  const shown = answers.filter((a) => a.locale === locale);
  return (
    <section className="ask free-text" aria-labelledby={`${fieldId}-label`} data-testid="free-text">
      <label id={`${fieldId}-label`} htmlFor={fieldId}>
        {t('ask.free.label')}
      </label>
      <p className="help" id={`${fieldId}-help`}>
        {t('ask.free.help')}
      </p>
      <textarea
        id={fieldId}
        className="input textarea"
        rows={3}
        value={text}
        aria-describedby={`${fieldId}-help`}
        aria-invalid={empty}
        onChange={(e) => setText(e.target.value)}
      />
      {empty && (
        <p className="error" role="alert">
          {t('ask.free.empty')}
        </p>
      )}
      <button type="button" className="button secondary" aria-disabled={busy} onClick={() => !busy && void submit()}>
        {t('ask.free.send')}
      </button>
      <p className="status-line" role="status">
        {busy ? t('answers.loading') : ''}
      </p>
      {shown.map((a) => (
        <div key={a.id} className="free-answer">
          <p className="question">{a.question}</p>
          {a.result && <AnswerText result={a.result} />}
          {a.error && <AnswerError error={a.error} />}
        </div>
      ))}
    </section>
  );
}

/** program.currentStatus: one search for every program of the pack, shared by every program page. */
function CurrentStatusSection({ programId }: { programId: string }) {
  const { t, locale } = useApp();
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRequest<TaskResult<CurrentStatus>>(answerKey('current-status', locale), 'public:program-names', heading);
  const names = allProgramNames(locale);
  const statusInput = {
    programs: names,
    jurisdiction: asPublic(PACK.jurisdiction),
    year: asPublic(new Date().getFullYear()),
    checkedOn: asPublic(PACK.verifiedOn ?? `the start of ${new Date().getFullYear()}`),
    locale,
  };
  const check = () => request.start(planCurrentStatus(statusInput), (signal) => programCurrentStatus(statusInput, { signal }));
  const lines = [
    t('send.line.jurisdiction', { value: PACK.jurisdiction }),
    t('send.line.programs', { count: names.length, value: names.map((n) => n.name).join(', ') }),
  ];
  const again = ['idle', 'skipped', 'cancelled'].includes(request.state.status);
  return (
    <section className="current" aria-labelledby={`${id}-title`} data-testid="current-section">
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
        {t('current.title')}
      </h2>
      <p className="meta">{t('current.lead')}</p>
      {again && (
        <button type="button" className="button secondary" onClick={check}>
          {t('current.check', { count: names.length })}
        </button>
      )}
      <RequestRegion
        state={request.state}
        lines={lines}
        onSend={request.send}
        onSkip={request.skip}
        onCancel={request.cancel}
        onRetry={check}
        testId="current-status"
        doneStatus={(r) => provenanceSentence(t, r)}
        render={(result) => {
          const line = result.value.statuses.get(programId);
          return (
            <div className="answer">
              <p data-testid="current-line">{line ?? t('current.none')}</p>
              <p className="meta">{t('current.notVerified')}</p>
              <InferenceBadge source={result.inferenceSource} reason={result.reason} />
              <SourceList sources={result.value.grounding.sources} />
              {result.value.grounding.searchEntryPoint && <SearchSuggestions html={result.value.grounding.searchEntryPoint} />}
            </div>
          );
        }}
      />
    </section>
  );
}
