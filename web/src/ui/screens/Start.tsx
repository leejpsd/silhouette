// Start screen: the promise as a picture (what stays on this device, what could leave), and the way in.
import { useApp } from '../context';
import { dynamicKey, formatMoney } from '../i18n';
import { BANDS } from '../pack';
import { bandLabel } from './Question';
import { firstOpenStep } from '../quickcheck';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import type { ReactNode } from 'react';
import { BlockActions } from '../design/block';
import { ArrowRight } from '../design/icons';
import { Bar, ActionLabel } from '../design/parts';

/** The example paystub's yearly income (invented). */
const EXAMPLE_INCOME = 29183;

export function StartScreen({ notice }: { notice: string | null }) {
  const { t, locale, steps, answers, resetAnswers } = useApp();
  const started = Object.keys(answers).length > 0;
  const open = firstOpenStep(steps, answers);
  const firstStep = steps[0]?.id ?? 'income';

  // The example's yearly income as it could leave: the pack's own range around it.
  const band = BANDS.annualIncome.find((b) => b.min <= EXAMPLE_INCOME && (b.max === null || EXAMPLE_INCOME <= b.max));
  const exampleBand = band ? bandLabel(t, locale, band) : formatMoney(locale, EXAMPLE_INCOME);
  // The silhouette as a picture: each field as it stays on this device, and what could leave instead.
  const example = (
    <figure className="start-example" data-testid="start-example">
      <div className="example-table" aria-hidden="true">
        <div className="example-head">
          <span className="example-side">
            <span className="dot dot-ink" />
            {t('preview.onPhone')}
          </span>
          <span className="example-side">
            <span className="dot dot-leave" />
            {t('preview.couldLeave')}
          </span>
        </div>
        <Row label={t('field.paystub.employerName')} value="NORTHWIND STAFFING">
          <span className="bars">
            <Bar id="W1" label={t('placeholder.word')} />
            <Bar id="W2" label={t('placeholder.word')} />
          </span>
        </Row>
        <Row label={t('field.paystub.grossPay')} value="1,271.88">
          <span className="bars">
            <Bar id="N12" label={t('placeholder.number')} />
          </span>
        </Row>
        <Row label={t('review.annualTitle')} value={formatMoney(locale, EXAMPLE_INCOME)}>
          <span className="paper-value">{exampleBand}</span>
        </Row>
        <Row label={t(dynamicKey('variable.householdSize'))} value="3">
          <span className="paper-value">3</span>
        </Row>
      </div>
      <figcaption className="example-note">
        <span className="example-tag">{t('start.example')}</span>
      </figcaption>
    </figure>
  );

  const begin = () => {
    if (!started) return navigate({ name: 'question', id: firstStep, then: null });
    const next = steps[open];
    if (next) navigate({ name: 'question', id: next.id, then: null });
    else navigate({ name: 'results' });
  };

  return (
    <div className="screen start">
      <div role="status" className="notice-slot">
        {notice && <p className="notice">{notice}</p>}
      </div>
      <div className="start-main">
        <div className="stack-8">
          <ScreenHeading size={54} wideSize={104} maxLines={4}>
            {t('start.title')}
          </ScreenHeading>
          <p className="lead">{t('start.lead')}</p>
          <p className="start-promise" data-testid="start-promise">
            {t('start.promise')}
          </p>
        </div>
        <BlockActions>
        <button type="button" className="action" onClick={begin}>
          <ActionLabel>{!started ? t('start.begin') : open < steps.length ? t('start.resume') : t('start.continue')}</ActionLabel>
          <span className="action-arrow">
            <ArrowRight />
          </span>
        </button>
        <div className="block-links">
          <a className="text-link" href={routeHref({ name: 'doc' })}>
            {t('sample.try')}
          </a>
          {started && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                resetAnswers();
                navigate({ name: 'question', id: firstStep, then: null });
              }}
            >
              {t('start.restart')}
            </button>
          )}
        </div>
        <p className="block-note">{t('promise.line3')}</p>
        </BlockActions>
      </div>
      {example}
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="example-row">
      <span className="example-cell paper-field">
        <span className="paper-label">{label}</span>
        <span className="paper-value">{value}</span>
      </span>
      <span className="example-cell">{children}</span>
    </div>
  );
}
