// The model-written parts of a program's page: an explanation on request, prepared questions, a
// typed question answered on this device only, and current information found by search. The rules
// result above them stays the answer; nothing here is requested until the person taps.

import { useEffect, useId, useState } from 'react';
import './answers.css';
import { Raw, asPublic } from '../../core/types';
import type { Program, Verdict } from '../../core/rules';
import { askDeviceStatus, type DeviceStatus } from '../../ai/device-model';
import { askFreeText } from '../../ai/on-device';
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
import { InferenceBadge } from '../InferenceBadge';
import { programName, type CopyKey } from '../i18n';
import { PACK } from '../pack';
import { useConfig } from './config';
import { AnswerError, AnswerText, RequestRegion, SearchSuggestions, SourceList, useRequest } from './parts';
import { answerKey } from './session';
import { allProgramNames, explainInput, programFacts, silhouetteLines, useSilhouette, type Silhouette } from './silhouette';

const CHIPS: readonly { id: string; key: CopyKey }[] = [
  { id: 'apply', key: 'ask.chip.apply' },
  { id: 'documents', key: 'ask.chip.documents' },
  { id: 'change', key: 'ask.chip.change' },
  { id: 'offer', key: 'ask.chip.offer' },
];

export function ProgramAnswers({ program, verdict }: { program: Program; verdict: Verdict }) {
  const { t, locale } = useApp();
  const silhouette = useSilhouette();
  const config = useConfig();
  const input = silhouette ? explainInput(silhouette, programFacts(t, locale, program), locale) : null;
  return (
    <>
      {silhouette && input && (
        <>
          <ExplainSection silhouette={silhouette} input={input} programName={programName(locale, program)} shownVerdict={verdict} />
          <AskSection silhouette={silhouette} input={input} programName={programName(locale, program)} />
        </>
      )}
      {config.groundingSearch && <CurrentStatusSection programId={program.id} />}
    </>
  );
}

type Answer = TaskResult<ModelAnswer>;

function ExplainSection({ silhouette, input, programName: name, shownVerdict }: { silhouette: Silhouette; input: ExplainInput; programName: string; shownVerdict: Verdict }) {
  const { t, locale } = useApp();
  const id = useId();
  const base = [locale, silhouette.canonical, input.program.programId];
  const short = useRequest<Answer>(answerKey('explain-short', ...base), silhouette.canonical);
  const long = useRequest<Answer>(answerKey('explain-long', ...base), silhouette.canonical);
  const lines = [...silhouetteLines(t, silhouette.profile), t('send.line.program', { value: name })];
  const ask = (which: 'short' | 'long') => {
    const request = which === 'short' ? short : long;
    const plan = planExplain(input, which);
    request.start(plan, () => explainProgram(plan));
  };
  return (
    <section className="answers" aria-labelledby={`${id}-title`} data-testid="explain-section">
      <h2 id={`${id}-title`}>{t('answers.title')}</h2>
      <p className="meta">{t('answers.lead')}</p>
      {short.state.status === 'idle' && (
        <button type="button" className="button secondary" onClick={() => ask('short')}>
          {t('answers.explain')}
        </button>
      )}
      <RequestRegion
        state={short.state}
        lines={lines}
        onSend={short.send}
        onSkip={short.skip}
        onRetry={() => ask('short')}
        testId="explain-short"
        render={(result) => (
          <>
            {input.verdict.verdict !== shownVerdict && <p className="note" data-testid="silhouette-note">{t('answers.silhouetteNote')}</p>}
            <AnswerText result={result} readable={result.value} />
            {long.state.status === 'idle' && (
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
          onSend={long.send}
          onSkip={long.skip}
          onRetry={() => ask('long')}
          testId="explain-long"
          render={(result) => <AnswerText result={result} readable={result.value} />}
        />
      )}
    </section>
  );
}

function AskSection({ silhouette, input, programName: name }: { silhouette: Silhouette; input: ExplainInput; programName: string }) {
  const { t } = useApp();
  const id = useId();
  return (
    <section className="ask" aria-labelledby={`${id}-title`} data-testid="ask-section">
      <h2 id={`${id}-title`}>{t('ask.title')}</h2>
      <h3>{t('ask.chips')}</h3>
      <ul className="chips">
        {CHIPS.map((chip) => (
          <ChipQuestion key={chip.id} chipId={chip.id} question={t(chip.key)} silhouette={silhouette} input={input} programName={name} />
        ))}
      </ul>
      <FreeTextQuestion input={input} />
    </section>
  );
}

function ChipQuestion({ chipId, question, silhouette, input, programName: name }: { chipId: string; question: string; silhouette: Silhouette; input: ExplainInput; programName: string }) {
  const { t, locale } = useApp();
  const request = useRequest<Answer>(answerKey('ask-chip', locale, silhouette.canonical, input.program.programId, chipId), silhouette.canonical);
  const lines = [...silhouetteLines(t, silhouette.profile), t('send.line.program', { value: name }), t('send.line.question', { value: question })];
  const ask = () => {
    const plan = planAskChip(input, asPublic({ id: chipId, question }));
    request.start(plan, () => askChip(plan));
  };
  return (
    <li className="chip-question" data-testid={`chip-${chipId}`}>
      <button type="button" className="button chip-button" aria-expanded={request.state.status !== 'idle'} onClick={ask} disabled={request.state.status === 'loading'}>
        {question}
      </button>
      {request.state.status !== 'idle' && (
        <RequestRegion
          state={request.state}
          lines={lines}
          onSend={request.send}
          onSkip={request.skip}
          onRetry={ask}
          render={(result) => <AnswerText result={result} readable={result.value} />}
        />
      )}
    </li>
  );
}

/** ask.freeText: offered only when the model runs on this device; otherwise the UI says why. */
function FreeTextQuestion({ input }: { input: ExplainInput }) {
  const { t, locale } = useApp();
  const fieldId = useId();
  const [status, setStatus] = useState<DeviceStatus | 'checking'>('checking');
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<{ id: number; question: string; result?: TaskResult<string>; error?: TaskError }[]>([]);

  useEffect(() => {
    let live = true;
    void askDeviceStatus(locale).then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, [locale]);

  if (status === 'checking') return null;
  if (status !== 'available') {
    return (
      <p className="meta" data-testid="free-text-unavailable">
        {t('ask.free.unavailable')}
      </p>
    );
  }
  const submit = async () => {
    const question = text.trim();
    if (question === '') return setEmpty(true);
    setEmpty(false);
    setBusy(true);
    const entry = { id: answers.length, question };
    try {
      const result = await askFreeText(Raw.of(question), input);
      setAnswers((a) => [...a, { ...entry, result }]);
      setText('');
    } catch (error) {
      setAnswers((a) => [...a, { ...entry, error: classifyError(error) }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="free-text" data-testid="free-text">
      <label htmlFor={fieldId}>{t('ask.free.label')}</label>
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
      <button type="button" className="button secondary" disabled={busy} onClick={() => void submit()}>
        {t('ask.free.send')}
      </button>
      <div aria-live="polite" aria-busy={busy}>
        {busy && <p className="loading">{t('answers.loading')}</p>}
        {answers.map((a) => (
          <div key={a.id} className="free-answer">
            <p className="question">{a.question}</p>
            {a.result && <AnswerText result={a.result} />}
            {a.error && <AnswerError error={a.error} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** program.currentStatus: one search for every program of the pack, shared by every program page. */
function CurrentStatusSection({ programId }: { programId: string }) {
  const { t, locale } = useApp();
  const id = useId();
  const request = useRequest<TaskResult<CurrentStatus>>(answerKey('current-status', locale), 'public:program-names');
  const names = allProgramNames(locale);
  const statusInput = {
    programs: names,
    jurisdiction: asPublic(PACK.jurisdiction),
    year: asPublic(new Date().getFullYear()),
    checkedOn: asPublic(PACK.verifiedOn ?? `the start of ${new Date().getFullYear()}`),
    locale,
  };
  const check = () => request.start(planCurrentStatus(statusInput), () => programCurrentStatus(statusInput));
  const lines = [
    t('send.line.jurisdiction', { value: PACK.jurisdiction }),
    t('send.line.programs', { count: names.length, value: names.map((n) => n.name).join(', ') }),
  ];
  return (
    <section className="current" aria-labelledby={`${id}-title`} data-testid="current-section">
      <h2 id={`${id}-title`}>{t('current.title')}</h2>
      <p className="meta">{t('current.lead')}</p>
      {request.state.status === 'idle' && (
        <button type="button" className="button secondary" onClick={check}>
          {t('current.check', { count: names.length })}
        </button>
      )}
      <RequestRegion
        state={request.state}
        lines={lines}
        onSend={request.send}
        onSkip={request.skip}
        onRetry={check}
        testId="current-status"
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
