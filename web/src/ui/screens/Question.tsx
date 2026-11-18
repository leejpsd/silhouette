// Quick Check question: one question per screen. Every question can be skipped; sensitive ones say
// that the answer never leaves the device.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { bringIntoView, pressKey, reducedMotion, Reveal, useTravel } from '../design/motion';
import { digitsOnly, moneyOnly } from '../design/inputs';
import { useApp } from '../context';
import { dynamicKey, formatMoney, lookup, type CopyKey, type Translate, type Locale } from '../i18n';
import { isIncomeAnswer, isMoneyVariable, MAX_EXACT_INCOME, validateAnswer, type AnswerValue, type IncomeAnswer, type Step } from '../quickcheck';
import { parseTypedAmount, readTypedAmount } from '../../core/skeleton';
import { navigate, type Route } from '../router';
import { ScreenHeading } from '../Heading';
import type { IncomeBand } from '../../core/generalize';
import { BlockActions, useWide } from '../design/block';
import { ActionLabel } from '../design/parts';
import { Alert, ArrowRight, Check, ChevronLeft, Lock } from '../design/icons';

type QuestionRoute = Extract<Route, { name: 'question' }>;

export function bandLabel(t: Translate, locale: Locale, band: IncomeBand): string {
  const n = (v: number) => formatMoney(locale, v);
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
      if (draft.text.trim() === '') return undefined;
      // An amount of money is typed as money (skeleton/SPEC.md section 5.1) and kept in whole dollars.
      if (isMoneyVariable(step.id)) {
        const amount = parseTypedAmount(draft.text);
        return amount === undefined ? Number.NaN : Math.round(amount);
      }
      return integer(draft.text);
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
  // Each refused Next counts: the hint is brought back into view and answers the press, every time.
  const [refused, setRefused] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const travel = useTravel(index);
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

  // A second press that lands just after the question changed (a double press on Next) belongs to the
  // question before: it neither answers this one ("none of these") nor is told to choose an answer.
  const arrivedAt = useRef(performance.now());
  const touched = useRef(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Only when this question was reached from another one and nothing has been done on it yet: someone
    // who answers and continues at once is never held up.
    if (travel !== 'none' && !touched.current && performance.now() - arrivedAt.current < 300) return;
    const value = draftToValue(step, draft);
    const problem = value === undefined ? 'q.error.choose' : validateAnswer(step, value);
    if (problem !== null || value === undefined) {
      let key: CopyKey = step.kind === 'int' && value === undefined ? 'q.error.integer' : (problem ?? 'q.error.choose');
      // Section 5.1 rule 4: "60.000" is refused with a message that shows the accepted form.
      if ((key === 'q.error.amount' && step.kind === 'income' && draft.choice === 'exact') || (step.kind === 'int' && isMoneyVariable(step.id))) {
        const read = readTypedAmount(draft.text);
        if (!read.ok && read.reason === 'decimals') key = 'q.error.amountDecimals';
      }
      setError(
        step.kind === 'int'
          ? isMoneyVariable(step.id)
            ? t(key === 'q.error.integer' ? 'q.error.money' : key, { min: formatMoney(locale, step.min), max: formatMoney(locale, step.max) })
            : t(key, { min: step.min, max: step.max })
          : t(key),
      );
      inputRef.current?.focus({ preventScroll: true });
      setRefused((n) => n + 1);
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
    // Back keeps what was chosen here, when it is a complete answer: nobody chooses an answer to have it
    // forgotten. (Saved by this press, never from an effect, so "Delete everything" is never followed by
    // a write.)
    const chosen = draftToValue(step, draft);
    if (touched.current && chosen !== undefined && validateAnswer(step, chosen) === null) setAnswer(step.id, chosen);
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
    touched.current = true;
    setDraft((d) => ({ ...d, choice }));
    setError(null);
  };

  // The exact amount opens under its choice (Reveal: it grows, comes into view above the dock and takes
  // focus). While typing, the block above the keyboard changes size: the understood amount stays in view.
  const exactField = useRef<HTMLDivElement>(null);
  const exactChosen = step.kind === 'income' && draft.choice === 'exact';

  // The hint after a refused Next: in view above the dock, and it answers every press.
  useEffect(() => {
    if (refused === 0) return;
    const el = errorRef.current;
    bringIntoView(el);
    if (!reducedMotion()) el?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
  }, [refused]);

  // The currency sign of the rule pack, shown in front of a money field (it is not typed).
  const moneySign = formatMoney(locale, 0).replace(/[\d\s.,]/g, '');
  // On a short screen the question's own control must be on the first screen: the headline starts
  // smaller there, and if the control still falls under the dock the page is brought to it.
  const short = window.innerHeight < 700;
  const answerArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => bringIntoView(answerArea.current?.nextElementSibling, { instant: true }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const formId = `${headingId}-form`;
  const formRef = useRef(formId);
  formRef.current = formId;
  const choices = choicesFor(step, t, locale);
  // Two short answers are tiles; longer lists are rows; income ranges are a two-column grid.
  const asTiles = (step.kind === 'bool' || step.kind === 'enum') && choices.length === 2;
  const amountText = (() => {
    const amount = parseTypedAmount(draft.text);
    // Never read back an amount that Next would refuse.
    return draft.text.trim() === '' || amount === undefined || amount > MAX_EXACT_INCOME ? '' : t('q.amountUnderstood', { amount: formatMoney(locale, amount) });
  })();
  // While typing, the block above the keyboard changes size: keep the understood amount in view.
  useEffect(() => {
    if (exactChosen && document.activeElement?.id === `${step.id}-exact`) bringIntoView(exactField.current, { instant: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountText]);

  // Whether Next has something to take: the action looks ready only then (it can still be pressed, and
  // then says what is missing).
  const current = draftToValue(step, draft);
  const ready = current !== undefined && validateAnswer(step, current) === null;
  const noneTicked = step.kind === 'multi' && draft.picked.length === 0;
  // A whole number outside its range is said at once, in the place of the range hint.
  const typedInteger = (text: string): string | null => {
    if (step.kind !== 'int' || isMoneyVariable(step.id) || text === '') return null;
    const n = Number(text);
    return n < step.min || n > step.max ? t('q.error.integer', { min: step.min, max: step.max }) : null;
  };
  const errorLine = (
    <p ref={errorRef} id={errorId} className="error" role="alert" data-held={refused > 0 ? 'true' : undefined}>
      {error && <Alert />}
      {error}
    </p>
  );
  const [noteLead, noteRest] = splitFirstSentence(t('sensitive.note'));

  // Wide screens with a keyboard: Y and N answer a yes / no question, S skips, Enter continues (the form).
  const wide = useWide();
  const keys = wide && !(window.matchMedia?.('(pointer: coarse)').matches ?? false);
  // A yes / no question: a bool, or an enum whose two values are yes and no.
  const yesValue = step.kind === 'bool' ? 'true' : 'yes';
  const noValue = step.kind === 'bool' ? 'false' : 'no';
  const yesNo = step.kind === 'bool' || (step.kind === 'enum' && step.values.length === 2 && step.values.includes('yes') && step.values.includes('no'));
  const keyRef = useRef({ choose, skip });
  keyRef.current = { choose, skip };
  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && !['radio', 'checkbox'].includes(target.type)))) return;
      if (document.querySelector('dialog[open]')) return;
      const key = e.key.toLowerCase();
      // A number typed anywhere on a counter question goes into the counter: the field takes focus and
      // the digit lands in it.
      if (/^\d$/.test(key) && inputRef.current?.classList.contains('counter-value')) {
        inputRef.current.focus({ preventScroll: true });
        return;
      }
      if (yesNo && (key === 'y' || key === 'n')) {
        e.preventDefault();
        pressKey(key.toUpperCase());
        keyRef.current.choose(key === 'y' ? yesValue : noValue);
      } else if (key === 's') {
        e.preventDefault();
        pressKey('S');
        keyRef.current.skip();
      } else if (key === 'enter') {
        pressKey('Enter');
        // "Enter to continue" holds wherever the focus is: from the heading or the page as well as from a
        // field. On a button or a link, Enter keeps its own meaning.
        if (!target?.closest('button, a, input, select, textarea, summary')) {
          e.preventDefault();
          (document.getElementById(formRef.current) as HTMLFormElement | null)?.requestSubmit();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keys, yesNo, yesValue, noValue]);

  return (
    <form id={formId} className="screen question" data-enter={travel} onSubmit={submit} onInput={() => (touched.current = true)} onClick={(e) => { if ((e.target as Element).closest('.counter-button')) touched.current = true; }} noValidate aria-labelledby={headingId}>
      <div className="question-top">
        <button type="button" className="text-link back-link" onClick={back}>
          <ChevronLeft />
          {t('q.back')}
        </button>
        <p className="progress">{t('q.progress', { n: index + 1, total: steps.length })}</p>
      </div>
      <div className="progress-track" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <span key={s.id} className={i <= index ? (i === index && travel === 'forward' ? 'on filling' : 'on') : i === index + 1 && travel === 'back' ? 'emptying' : ''} />
        ))}
      </div>
      <div className="stack-10" ref={answerArea}>
        <ScreenHeading id={headingId} size={short ? 38 : 50} wideSize={84} maxLines={4}>
          {t(dynamicKey(`question.${step.id}.label`))}
        </ScreenHeading>
        {hasHelp && (
          <p id={helpId} className="help">
            {t(dynamicKey(helpKey))}
          </p>
        )}
      </div>

      {step.kind === 'int' && isMoneyVariable(step.id) && (
        <div className="field amount-field" data-error={error ? 'true' : undefined}>
          <span className="money-input">
            <span className="money-sign" aria-hidden="true">
              {moneySign}
            </span>
            <input
              ref={inputRef}
              className="input mono"
              inputMode="decimal"
              autoComplete="off"
              maxLength={16}
              enterKeyHint={isLast ? 'done' : 'next'}
              aria-labelledby={headingId}
              aria-describedby={[describedBy, `${headingId}-understood`].filter(Boolean).join(' ')}
              aria-invalid={error ? true : undefined}
              value={draft.text}
              onChange={(e) => {
                const text = moneyOnly(e.target.value);
                setDraft({ ...draft, text });
                // An amount outside what the rules take is said at once, and never read back as understood.
                const amount = parseTypedAmount(text);
                setError(amount !== undefined && (amount > step.max || amount < step.min) ? t('q.error.money', { min: formatMoney(locale, step.min), max: formatMoney(locale, step.max) }) : null);
              }}
            />
          </span>
          <p id={`${headingId}-understood`} className="understood" aria-live="polite" data-testid="amount-understood">
            {(() => {
              const amount = parseTypedAmount(draft.text);
              const shown = draft.text.trim() !== '' && amount !== undefined && amount >= step.min && amount <= step.max;
              return shown ? (
                <>
                  <Check size={14} />
                  {t('review.understood', { amount: formatMoney(locale, Math.round(amount)) })}
                </>
              ) : (
                ''
              );
            })()}
          </p>
        </div>
      )}

      {step.kind === 'int' && !isMoneyVariable(step.id) && (
        <div className="counter" data-error={error ? 'true' : undefined}>
          <button
            type="button"
            className="counter-button"
            aria-label={t('q.decrease')}
            disabled={draft.text !== '' && Number(draft.text) <= step.min}
            onClick={() => {
              const n = Number.parseInt(draft.text, 10);
              setDraft({ ...draft, text: String(Number.isNaN(n) ? step.min : Math.min(step.max, Math.max(step.min, n - 1))) });
              setError(null);
            }}
          >
            −
          </button>
          <input
            ref={inputRef}
            className="counter-value"
            inputMode="numeric"
            autoComplete="off"
            aria-labelledby={headingId}
            aria-describedby={[describedBy, `${headingId}-range`].filter(Boolean).join(' ')}
            aria-invalid={error ? true : undefined}
            value={draft.text}
            placeholder="–"
            pattern="[0-9]*"
            enterKeyHint={isLast ? 'done' : 'next'}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const text = digitsOnly(e.target.value, step.max);
              setDraft({ ...draft, text });
              setError(typedInteger(text));
            }}
          />
          <button
            type="button"
            className="counter-button"
            aria-label={t('q.increase')}
            disabled={draft.text !== '' && Number(draft.text) >= step.max}
            onClick={() => {
              const n = Number.parseInt(draft.text, 10);
              setDraft({ ...draft, text: String(Number.isNaN(n) ? step.min : Math.max(step.min, Math.min(step.max, n + 1))) });
              setError(null);
            }}
          >
            +
          </button>
          {/* The range, and in its place the same sentence as the message when the number is missing or outside it. */}
          <p id={`${headingId}-range`} className="counter-hint" hidden={error !== null}>
            {t('q.error.integer', { min: step.min, max: step.max })}
          </p>
          {errorLine}
        </div>
      )}

      {(step.kind === 'enum' || step.kind === 'bool' || step.kind === 'income') && (
        <fieldset
          className={asTiles ? 'tiles' : step.kind === 'income' ? 'ranges' : 'option-rows'}
          aria-labelledby={headingId}
          aria-describedby={describedBy}
          data-error={error ? 'true' : undefined}
        >
          {choices.map((c, i) => {
            if (c.value === 'exact') return null;
            const choice = (
              <label key={c.value} className={`${asTiles ? 'tile' : step.kind === 'income' ? 'range' : 'option-row'}${draft.choice === c.value ? ' selected' : ''}`}>
                <input
                  ref={i === 0 ? inputRef : undefined}
                  type="radio"
                  className="radio"
                  name={step.id}
                  value={c.value}
                  checked={draft.choice === c.value}
                  onChange={() => choose(c.value)}
                />
                {asTiles || step.kind === 'income' ? (
                  <span className={asTiles ? 'tile-word' : 'range-label'}>{c.label}</span>
                ) : (
                  <span className="option-word">{c.label}</span>
                )}
              </label>
            );
            // The keycap sits on the tile, outside its label, so it is not part of the answer's name.
            return keys && yesNo && asTiles ? (
              <div key={c.value} className="tile-cell">
                {choice}
                <kbd className="key key-corner" aria-hidden="true" data-key={c.value === yesValue ? 'Y' : 'N'}>
                  {c.value === yesValue ? 'Y' : 'N'}
                </kbd>
              </div>
            ) : (
              choice
            );
          })}
          {step.kind === 'income' && (
            <div className={`exact-row${draft.choice === 'exact' ? ' selected' : ''}`}>
              <label className="exact-option">
                <span className="option-word">{t('income.exact.option')}</span>
                <input type="radio" className="radio" name={step.id} value="exact" checked={draft.choice === 'exact'} onChange={() => choose('exact')} />
              </label>
              {draft.choice === 'exact' && (
                <Reveal focus>
                <div className="field exact-field" ref={exactField} data-testid="exact-field">
                  <div className="field-label-row">
                    <label htmlFor={`${step.id}-exact`}>{t('income.exact.label')}</label>
                    <span id={privateId} className="private-inline">
                      <Lock />
                      {t('q.private')}
                    </span>
                  </div>
                  <span className="money-input">
                  <span className="money-sign" aria-hidden="true">
                    {moneySign}
                  </span>
                  <input
                    id={`${step.id}-exact`}
                    className="input mono"
                    inputMode="decimal"
                    autoComplete="off"
                    maxLength={16}
                    aria-describedby={[`${step.id}-understood`, privateId, error ? errorId : ''].filter(Boolean).join(' ')}
                    aria-invalid={error ? true : undefined}
                    value={draft.text}
                    enterKeyHint={isLast ? 'done' : 'next'}
                    onChange={(e) => {
                      setDraft({ ...draft, text: moneyOnly(e.target.value) });
                      setError(null);
                    }}
                  />
                  </span>
                  <p id={`${step.id}-understood`} className="understood" aria-live="polite" data-testid="amount-understood">
                    {amountText !== '' && <Check size={14} />}
                    {amountText}
                  </p>
                </div>
                </Reveal>
              )}
            </div>
          )}
        </fieldset>
      )}

      {step.kind === 'multi' && (
        <fieldset className="option-rows" aria-labelledby={headingId} aria-describedby={describedBy} data-error={error ? 'true' : undefined}>
          {step.values.map((value, i) => {
            const checked = draft.picked.includes(value);
            return (
              <label key={value} className={`option-row${checked ? ' selected' : ''}`}>
                <span className="option-word">{t(dynamicKey(`option.${step.id}.${value}`))}</span>
                <input
                  ref={i === 0 ? inputRef : undefined}
                  type="checkbox"
                  className="checkbox"
                  name={step.id}
                  value={value}
                  checked={checked}
                  onChange={() => {
                    setDraft((d) => ({ ...d, picked: checked ? d.picked.filter((p) => p !== value) : [...d.picked, value] }));
                    setError(null);
                  }}
                />
              </label>
            );
          })}
        </fieldset>
      )}

      {/* The message stands right under what it is about, before the note about privacy. */}
      {!(step.kind === 'int' && !isMoneyVariable(step.id)) && errorLine}

      {step.sensitive && (
        <p id={privateId} className="private">
          <Lock />
          <span>
            <strong>{noteLead}</strong>
            {noteRest ? ` ${noteRest}` : ''}
          </span>
        </p>
      )}

      <BlockActions>
        {/* The action first; beside it the skip link, or under it when the label needs the width. */}
        <div className="action-row">
          <button type="submit" form={formId} className="action grow" data-ready={ready}>
            <ActionLabel>{noneTicked ? t('q.noneOfThese') : isLast ? t('q.finish') : t('q.next')}</ActionLabel>
            <span className="action-arrow">
              <ArrowRight />
            </span>
          </button>
          {keys && (
            <span className="key-hint" aria-hidden="true">
              <kbd className="key" data-key="Enter">Enter</kbd> {t('keys.continue')}
            </span>
          )}
          <button type="button" className="text-link on-block" onClick={skip} aria-keyshortcuts={keys ? 'S' : undefined}>
            {t('q.skip')}
          </button>
          {keys && (
            <kbd className="key key-skip" aria-hidden="true" data-key="S">
              S
            </kbd>
          )}
        </div>
      </BlockActions>
    </form>
  );
}

/** "This answer never leaves your device." and the rest, so the first sentence can be set in bold. */
function splitFirstSentence(text: string): [string, string] {
  const m = /^(.+?[.。!?])\s+(.+)$/s.exec(text);
  return m ? [m[1] as string, m[2] as string] : [text, ''];
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
