// Quick Check question: one question per screen. Every question can be skipped; sensitive ones say
// that the answer never leaves the device.
import { useId, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { dynamicKey, formatAmount, formatNumber, lookup, type CopyKey, type Translate, type Locale } from '../i18n';
import { isIncomeAnswer, validateAnswer, type AnswerValue, type IncomeAnswer, type Step } from '../quickcheck';
import { parseTypedAmount, readTypedAmount } from '../../core/skeleton';
import { navigate, type Route } from '../router';
import { ScreenHeading } from '../Heading';
import type { IncomeBand } from '../../core/generalize';

type QuestionRoute = Extract<Route, { name: 'question' }>;

export function bandLabel(t: Translate, locale: Locale, band: IncomeBand): string {
  const n = (v: number) => formatNumber(locale, v);
  if (band.max === null) return t('income.band.top', { amount: n(band.min) });
  if (band.min === 0) return t('income.band.under', { amount: n(band.max + 1) });
  return t('income.band.range', { min: n(band.min), max: n(band.max) });
}

/** Draft state of the form, before validation. `picked` holds multi-select values. */
type Draft = { text: string; choice: string; picked: readonly string[] };

const EMPTY: Draft = { text: '', choice: '', picked: [] };

function initialDraft(step: Step, value: AnswerValue | null | undefined): Draft {
  if (value === undefined || value === null) return EMPTY;
  if (step.kind === 'income' && isIncomeAnswer(value)) {
    return value.kind === 'band'
      ? { ...EMPTY, choice: value.bandId }
      : { ...EMPTY, text: String(value.amount), choice: 'exact' };
  }
  if (step.kind === 'multi' && Array.isArray(value)) return { ...EMPTY, picked: value as readonly string[] };
  if (step.kind === 'int') return { ...EMPTY, text: String(value) };
  return { ...EMPTY, choice: String(value) };
}

function draftToValue(step: Step, draft: Draft): AnswerValue | undefined {
  const integer = (s: string) => (/^\s*\d+\s*$/.test(s) ? Number(s.trim()) : Number.NaN);
  switch (step.kind) {
    case 'int':
      return draft.text.trim() === '' ? undefined : integer(draft.text);
    case 'enum':
      return draft.choice === '' ? undefined : draft.choice;
    case 'multi':
      // Submitting with nothing ticked is the answer "none of these" ([]), not a skip.
      return step.values.filter((v) => draft.picked.includes(v));
    case 'bool':
      return draft.choice === '' ? undefined : draft.choice === 'true';
    case 'income': {
      if (draft.choice === '') return undefined;
      if (draft.choice !== 'exact') return { kind: 'band', bandId: draft.choice } satisfies IncomeAnswer;
      return { kind: 'exact', amount: parseTypedAmount(draft.text) ?? Number.NaN } satisfies IncomeAnswer;
    }
  }
}

export function QuestionScreen({ route }: { route: QuestionRoute }) {
  const { t, locale, steps, answers, setAnswer } = useApp();
  const index = steps.findIndex((s) => s.id === route.id);
  const step = steps[index];
  const [draft, setDraft] = useState<Draft>(() => (step ? initialDraft(step, answers[step.id]) : EMPTY));
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();
  const helpId = useId();
  const errorId = useId();
  const privateId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  if (!step) {
    return (
      <div className="screen">
        <ScreenHeading>{t('results.empty')}</ScreenHeading>
      </div>
    );
  }

  const goNext = () => {
    if (route.then) return navigate(route.then.name === 'results' ? { name: 'results' } : { name: 'program', id: route.then.id });
    const next = steps[index + 1];
    navigate(next ? { name: 'question', id: next.id, then: null } : { name: 'results' });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = draftToValue(step, draft);
    const problem = value === undefined ? 'q.error.choose' : validateAnswer(step, value);
    if (problem !== null || value === undefined) {
      let key: CopyKey = step.kind === 'int' && value === undefined ? 'q.error.integer' : (problem ?? 'q.error.choose');
      // Section 5.1 rule 4: "60.000" is refused with a message that shows the accepted form.
      if (key === 'q.error.amount' && step.kind === 'income' && draft.choice === 'exact') {
        const read = readTypedAmount(draft.text);
        if (!read.ok && read.reason === 'decimals') key = 'q.error.amountDecimals';
      }
      setError(
        step.kind === 'int' ? t(key, { min: step.min, max: step.max }) : t(key),
      );
      inputRef.current?.focus();
      return;
    }
    setAnswer(step.id, value);
    goNext();
  };

  const skip = () => {
    setAnswer(step.id, null);
    goNext();
  };

  const back = () => {
    if (route.then) return goNext();
    const prev = steps[index - 1];
    navigate(prev ? { name: 'question', id: prev.id, then: null } : { name: 'start' });
  };

  const helpKey = `question.${step.id}.help`;
  const hasHelp = lookup(locale, helpKey) !== undefined;
  const showPrivate = step.sensitive || (step.kind === 'income' && draft.choice === 'exact');
  const describedBy = [hasHelp ? helpId : '', showPrivate ? privateId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  const isLast = index === steps.length - 1 && !route.then;
  const choose = (choice: string) => {
    setDraft((d) => ({ ...d, choice }));
    setError(null);
  };

  return (
    <form className="screen question" onSubmit={submit} noValidate aria-labelledby={headingId}>
      <p className="progress">
        {t('q.progress', { n: index + 1, total: steps.length })}
        <span className="progress-track" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.id} className={i <= index ? 'on' : ''} />
          ))}
        </span>
      </p>
      <ScreenHeading id={headingId}>{t(dynamicKey(`question.${step.id}.label`))}</ScreenHeading>
      {hasHelp && (
        <p id={helpId} className="help">
          {t(dynamicKey(helpKey))}
        </p>
      )}
      {step.sensitive && (
        <p id={privateId} className="private">
          <LockIcon />
          <span>{t('sensitive.note')}</span>
        </p>
      )}

      {step.kind === 'int' && (
        <div className="stepper">
          <button
            type="button"
            className="button step"
            aria-label={t('q.decrease')}
            onClick={() => {
              const n = Number.parseInt(draft.text, 10);
              setDraft({ ...draft, text: String(Number.isNaN(n) ? step.min : Math.max(step.min, n - 1)) });
              setError(null);
            }}
          >
            −
          </button>
          <input
            ref={inputRef}
            className="input number"
            inputMode="numeric"
            autoComplete="off"
            aria-labelledby={headingId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            value={draft.text}
            onChange={(e) => {
              setDraft({ ...draft, text: e.target.value });
              setError(null);
            }}
          />
          <button
            type="button"
            className="button step"
            aria-label={t('q.increase')}
            onClick={() => {
              const n = Number.parseInt(draft.text, 10);
              setDraft({ ...draft, text: String(Number.isNaN(n) ? step.min : Math.min(step.max, n + 1)) });
              setError(null);
            }}
          >
            +
          </button>
        </div>
      )}

      {(step.kind === 'enum' || step.kind === 'bool' || step.kind === 'income') && (
        <fieldset className="choices" aria-labelledby={headingId} aria-describedby={describedBy}>
          {choicesFor(step, t, locale).map((c, i) => (
            <label key={c.value} className={`choice${draft.choice === c.value ? ' selected' : ''}`}>
              <input
                ref={i === 0 ? inputRef : undefined}
                type="radio"
                name={step.id}
                value={c.value}
                checked={draft.choice === c.value}
                onChange={() => choose(c.value)}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      {step.kind === 'multi' && (
        <fieldset className="choices" aria-labelledby={headingId} aria-describedby={describedBy}>
          {step.values.map((value, i) => {
            const checked = draft.picked.includes(value);
            return (
              <label key={value} className={`choice${checked ? ' selected' : ''}`}>
                <input
                  ref={i === 0 ? inputRef : undefined}
                  type="checkbox"
                  name={step.id}
                  value={value}
                  checked={checked}
                  onChange={() => {
                    setDraft((d) => ({ ...d, picked: checked ? d.picked.filter((p) => p !== value) : [...d.picked, value] }));
                    setError(null);
                  }}
                />
                <span>{t(dynamicKey(`option.${step.id}.${value}`))}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {step.kind === 'income' && draft.choice === 'exact' && (
        <div className="field">
          <label htmlFor={`${step.id}-exact`}>{t('income.exact.label')}</label>
          <input
            id={`${step.id}-exact`}
            className="input"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby={[`${step.id}-understood`, privateId, error ? errorId : ''].filter(Boolean).join(' ')}
            aria-invalid={error ? true : undefined}
            value={draft.text}
            onChange={(e) => {
              setDraft({ ...draft, text: e.target.value });
              setError(null);
            }}
          />
          <p id={`${step.id}-understood`} className="understood" aria-live="polite" data-testid="amount-understood">
            {(() => {
              const amount = parseTypedAmount(draft.text);
              return draft.text.trim() === '' || amount === undefined
                ? ''
                : t('q.amountUnderstood', { amount: formatAmount(locale, amount) });
            })()}
          </p>
          <p id={privateId} className="private">
            <LockIcon />
            <span>{t('q.private')}</span>
          </p>
        </div>
      )}

      <p id={errorId} className="error" role="alert">
        {error}
      </p>

      <div className="actions">
        <button type="submit" className="button primary">
          {isLast ? t('q.finish') : t('q.next')}
        </button>
        <button type="button" className="button secondary" onClick={skip}>
          {t('q.skip')}
        </button>
      </div>
      <button type="button" className="button quiet back" onClick={back}>
        {t('q.back')}
      </button>
    </form>
  );
}

function choicesFor(step: Step, t: Translate, locale: Locale): { value: string; label: string }[] {
  if (step.kind === 'enum') return step.values.map((v) => ({ value: v, label: t(dynamicKey(`option.${step.id}.${v}`)) }));
  if (step.kind === 'bool') {
    return [
      { value: 'true', label: t(dynamicKey(`option.${step.id}.true`)) },
      { value: 'false', label: t(dynamicKey(`option.${step.id}.false`)) },
    ];
  }
  if (step.kind === 'income') {
    return [
      ...step.bands.map((b) => ({ value: b.id, label: bandLabel(t, locale, b) })),
      { value: 'exact', label: t('income.exact.option') },
    ];
  }
  return [];
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="4" y="9" width="12" height="8.5" rx="2" fill="currentColor" />
      <path d="M6.75 9V6.5a3.25 3.25 0 0 1 6.5 0V9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
