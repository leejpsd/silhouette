// Start screen: the promise as a picture (what stays on this phone, what could leave), and the way in.
import { useApp } from '../context';
import { dynamicKey, formatMoney } from '../i18n';
import { firstOpenStep } from '../quickcheck';
import { navigate, routeHref } from '../router';
import { ScreenHeading } from '../Heading';
import { BlockActions } from '../design/block';
import { ArrowRight } from '../design/icons';
import { Bar, Paper, ActionLabel } from '../design/parts';

export function StartScreen({ notice }: { notice: string | null }) {
  const { t, locale, steps, answers, resetAnswers } = useApp();
  const started = Object.keys(answers).length > 0;
  const open = firstOpenStep(steps, answers);
  const firstStep = steps[0]?.id ?? 'income';

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
      <div className="stack-8">
        <ScreenHeading size={60} maxLines={4}>
          {t('start.title')}
        </ScreenHeading>
        <p className="lead">{t('start.lead')}</p>
      </div>
      {/* The promise as a picture: the same paystub, kept on the phone and as it could leave. */}
      <div className="start-cards" role="img" aria-label={`${t('promise.line1')} ${t('promise.line2')}`}>
        <div className="start-card tilt-left" aria-hidden="true">
          <span className="card-label">{t('preview.onPhone')}</span>
          <Paper>
            <Field label={t('field.paystub.employerName')} value="NORTHWIND STAFFING" />
            <Field label={t('field.paystub.grossPay')} value="1,271.88" />
            <Field label={t('review.annualTitle')} value={formatMoney(locale, 29183)} />
            <Field label={t(dynamicKey('variable.householdSize'))} value="3" />
          </Paper>
        </div>
        <div className="start-card tilt-right" aria-hidden="true">
          <span className="card-label leave-label">{t('preview.couldLeave')}</span>
          <Paper>
            <div className="paper-field">
              <span className="paper-label">{t('field.paystub.employerName')}</span>
              <span className="bars">
                <Bar id="W1" label={t('placeholder.word')} width={74} />
                <Bar id="W2" label={t('placeholder.word')} width={66} delay={100} />
              </span>
            </div>
            <div className="paper-field">
              <span className="paper-label">{t('field.paystub.grossPay')}</span>
              <span className="bars">
                <Bar id="N12" label={t('placeholder.number')} width={62} delay={200} />
              </span>
            </div>
            <Field label={t('review.annualTitle')} value={t('income.band.range', { min: formatMoney(locale, 15000), max: formatMoney(locale, 29999) })} />
            <Field label={t(dynamicKey('variable.householdSize'))} value="3" />
          </Paper>
        </div>
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
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper-field">
      <span className="paper-label">{label}</span>
      <span className="paper-value">{value}</span>
    </div>
  );
}
