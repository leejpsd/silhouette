// The parts of a program's page below the result:
// - "Why this result": the rule engine's reasons with limits and the person's values (no model), and,
//   with a device model, an explanation of the person's own result written on this device only;
// - "About this program": a general explanation and prepared questions from a model that only knows
//   the silhouette and never states a result;
// - a typed question, answered on this device only;
// - current information found by search (behind a flag).
// Nothing here is requested until the person taps.

import { useEffect, useId, useRef, useState } from 'react';
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
import { InferenceBadge } from '../InferenceBadge';
import { ArrowRight, Check, CrossCircle, Minus, Phone } from '../design/icons';
import { BlockActions } from '../design/block';
import { ActionLabel } from '../design/parts';
import { routeHref } from '../router';
import { dynamicKey, programName, type CopyKey } from '../i18n';
import { PACK } from '../pack';
import { useConfig } from './config';
import { AnswerError, AnswerText, Loading, RequestRegion, SearchSuggestions, SourceList, useRequest } from './parts';
import { personalResult, useReasons, whyRows } from './personal';
import { answerKey } from './session';
import { allProgramNames, explainInput, programFacts } from './silhouette';
import { programCopy } from './facts';

/** Consent and "sent before" are kept for this kind of content: a program's public information. */
const PUBLIC_PROGRAM_INFO = 'public:program-info';

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

/** "Why this result", from the rules on this device (first on the page, under the result). */
export function ProgramWhy({ program, verdict }: { program: Program; verdict: Verdict }) {
  const device = useDeviceStatus();
  return <WhySection program={program} verdict={verdict} device={device} />;
}

/** The model-written parts: about the program, prepared and typed questions, current information. */
export function ProgramAnswers({ program, verdict }: { program: Program; verdict: Verdict }) {
  const { t, locale } = useApp();
  const config = useConfig();
  const device = useDeviceStatus();
  const input = explainInput(programFacts(t, locale, program), locale);
  return (
    <>
      <AboutSection input={input} program={program} programName={programName(locale, program)} />
      <FreeTextQuestion program={program} verdict={verdict} device={device} />
      {config.groundingSearch && <CurrentStatusSection programId={program.id} />}
    </>
  );
}

/** The state of a criterion as an icon next to its text: check, cross, minus (depends) or a dotted ring. */
const StateIcon = ({ state }: { state: CriterionState }) => {
  if (state === 'pass') return <Check size={16} />;
  if (state === 'fail') return <CrossCircle />;
  if (state === 'mixed') return <Minus />;
  return <span className="marker marker-loading-static" aria-hidden="true" />;
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
    // The button goes away while the answer is written: focus stays in this section.
    heading.current?.focus();
    setPersonal({ status: 'loading' });
    try {
      setPersonal({ status: 'done', result: await explainPersonal(personalResult(t, locale, program, verdict, reasons)) });
    } catch (error) {
      setPersonal({ status: 'error', error: classifyError(error) });
    }
  };
  return (
    <section className="why" aria-labelledby={`${id}-title`} data-testid="why-section">
      <div className="section-head">
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="section-heading">
          {t('why.title')}
        </h2>
        <strong className="badge badge-none">{t('badge.noModel')}</strong>
      </div>
      <p className="small muted">{t('why.lead')}</p>
      <ul className="criteria">
        {rows.map((row) => (
          <li key={row.id} className={`criterion state-${row.state}`} data-state={row.state} data-testid={`why-${row.id}`}>
            <p className="criterion-label">{row.label}</p>
            {row.limits.length > 0 ? (
              row.limits.map((l) => (
                <dl key={l.limit} className="limit-rows" data-testid="why-limit">
                  <div>
                    <dt>{t('detail.limit')}</dt>
                    <dd>{l.limit}</dd>
                  </div>
                  <div>
                    <dt>{t('detail.you')}</dt>
                    <dd>
                      {l.yours}
                      <StateIcon state={row.state} />
                    </dd>
                  </div>
                </dl>
              ))
            ) : (
              <p className="criterion-state">
                <span>{row.stateText}</span>
                <StateIcon state={row.state} />
              </p>
            )}
            {row.limits.length > 0 &&
              (row.stateText === t(dynamicKey(`state.${row.state}`)) ? (
                <p className="visually-hidden">{row.stateText}</p>
              ) : (
                <p className="criterion-state">{row.stateText}</p>
              ))}
            {row.notes.map((note) => (
              <p key={note} className="criterion-note" data-testid="why-note">
                {note}
              </p>
            ))}
          </li>
        ))}
      </ul>
      {device === 'available' ? (
        <>
          {(personal.status === 'idle' || personal.status === 'error') && (
            <button type="button" className="outline-button" onClick={() => void explain()}>
              <Phone />
              {t('why.explain')}
            </button>
          )}
          <p className="status-line" role="status" data-testid="why-status">
            {personal.status === 'loading' ? t('answers.loading') : personal.status === 'done' ? t('answers.ready') : ''}
          </p>
          {personal.status === 'loading' && <Loading />}
          {personal.status === 'error' && <AnswerError error={personal.error} />}
          {personal.status === 'done' && (
            <div data-testid="why-answer">
              <AnswerText result={personal.result} />
            </div>
          )}
        </>
      ) : device === 'checking' ? null : (
        <p className="dashed-note" data-testid="why-unavailable">
          {t('why.unavailable')}
        </p>
      )}
    </section>
  );
}

type Answer = TaskResult<ModelAnswer>;

/** "About this program": the general explanation and prepared questions (cloud-capable, no result). */
function AboutSection({ input, program, programName: name }: { input: ExplainInput; program: Program; programName: string }) {
  const { t, locale } = useApp();
  const copy = programCopy(locale, program);
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const base = [locale, input.program.programId];
  const short = useRequest<Answer>(answerKey('explain-short', ...base), PUBLIC_PROGRAM_INFO, heading);
  const long = useRequest<Answer>(answerKey('explain-long', ...base), PUBLIC_PROGRAM_INFO, heading);
  const lines = [t('send.linePublic'), t('send.line.program', { value: name })];
  const ask = (which: 'short' | 'long') => {
    const request = which === 'short' ? short : long;
    const plan = planExplain(input, which);
    request.start(plan, (signal) => explainProgram(plan, { signal }));
  };
  const again = (status: string) => status === 'idle' || status === 'skipped' || status === 'cancelled';
  return (
    <section className="answers" aria-labelledby={`${id}-title`} data-testid="explain-section">
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="section-heading">
        {t('about.title')}
      </h2>
      {(copy.summary || copy.renewal) && (
        <div className="program-copy" data-testid="program-copy">
          {copy.summary && <p>{copy.summary}</p>}
          {copy.renewal && <p className="small">{copy.renewal}</p>}
        </div>
      )}
      <p className="small muted" data-testid="about-lead">
        {t('about.leadPublic')}
      </p>
      {/* The page's main action, in the block: explain the program; once asked, back to the results. */}
      <BlockActions>
        {again(short.state.status) ? (
          <button type="button" className="action" onClick={() => ask('short')}>
            <ActionLabel>{t('about.explain')}</ActionLabel>
            <span className="action-arrow">
              <ArrowRight />
            </span>
          </button>
        ) : (
          <a className="action" href={routeHref({ name: 'results' })}>
            <ActionLabel>{t('detail.back')}</ActionLabel>
            <span className="action-arrow">
              <ArrowRight />
            </span>
          </a>
        )}
      </BlockActions>
      <RequestRegion
        state={short.state}
        lines={lines}
        publicOnly
        onSend={short.send}
        onSkip={short.skip}
        onCancel={short.cancel}
        onRetry={() => ask('short')}
        testId="explain-short"
        render={(result) => (
          <>
            <AnswerText result={result} readable={result.value} />
            {again(long.state.status) && (
              <button type="button" className="text-link" onClick={() => ask('long')}>
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
          publicOnly
          onSend={long.send}
          onSkip={long.skip}
          onCancel={long.cancel}
          onRetry={() => ask('long')}
          testId="explain-long"
          render={(result) => <AnswerText result={result} readable={result.value} />}
        />
      )}
      <h3 className="small strong">{t('ask.chips')}</h3>
      <ul className="chips">
        {CHIPS.map((chip) => (
          <ChipQuestion key={chip.id} chipId={chip.id} question={t(chip.key)} input={input} programName={name} />
        ))}
      </ul>
    </section>
  );
}

function ChipQuestion({ chipId, question, input, programName: name }: { chipId: string; question: string; input: ExplainInput; programName: string }) {
  const { t, locale } = useApp();
  const button = useRef<HTMLButtonElement>(null);
  const request = useRequest<Answer>(answerKey('ask-chip', locale, input.program.programId, chipId), PUBLIC_PROGRAM_INFO, button);
  const lines = [t('send.linePublic'), t('send.line.program', { value: name }), t('send.line.question', { value: question })];
  const busy = request.state.status === 'loading';
  const ask = () => {
    if (busy) return;
    const plan = planAskChip(input, asPublic({ id: chipId, question }));
    request.start(plan, (signal) => askChip(plan, { signal }));
  };
  return (
    <li className="chip-question" data-testid={`chip-${chipId}`}>
      {/* Never disabled while loading, so focus stays on it; a second press does nothing. */}
      <button ref={button} type="button" className="chip-button" aria-expanded={request.state.status !== 'idle'} aria-disabled={busy} onClick={ask}>
        {question}
      </button>
      {request.state.status !== 'idle' && (
        <RequestRegion
          state={request.state}
          lines={lines}
          publicOnly
          onSend={request.send}
          onSkip={request.skip}
          onCancel={request.cancel}
          onRetry={ask}
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
        <p className="dashed-note" data-testid="free-text-unavailable">
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
      <button type="button" className="outline-button" aria-disabled={busy} onClick={() => !busy && void submit()}>
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
      <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="section-heading">
        {t('current.title')}
      </h2>
      <p className="small muted">{t('current.lead')}</p>
      {again && (
        <button type="button" className="outline-button" onClick={check}>
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
        render={(result) => {
          const line = result.value.statuses.get(programId);
          return (
            <div className="answer">
              <p data-testid="current-line">{line ?? t('current.none')}</p>
              <p className="small muted">{t('current.notVerified')}</p>
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
