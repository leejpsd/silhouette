// Persistent chrome: the header with the wordmark and the language control, the one-line demo
// notice, the "Leaving your device" count row with its record, and "Delete everything".
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { outboundState, subscribeOutbound, type OutboundEntry } from '../data/outbound';
import { LOCALES, LOCALE_NAMES, dynamicKey, lookup, type Locale } from './i18n';
import { useApp } from './context';
import { Count, Paper, Sheet, ActionLabel } from './design/parts';
import { Caret, Check, Close, CrossCircle, Trash } from './design/icons';

const SHORT_NAMES: Record<Locale, string> = { en: 'EN', es: 'ES', ko: '한국어' };

export function Header({ onLocale }: { onLocale: (locale: Locale) => void }) {
  const { t, locale } = useApp();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const headline = useId();
  return (
    <header className="header">
      <a className="wordmark" href="#/" aria-label={t('nav.home')}>
        Silhouette
      </a>
      <button
        ref={button}
        type="button"
        className="lang-button"
        data-testid="language-button"
        aria-label={`${SHORT_NAMES[locale]}, ${t('nav.language')}: ${LOCALE_NAMES[locale]}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {SHORT_NAMES[locale]}
      </button>
      <Sheet open={open} label={t('nav.language')} labelledBy={headline} onClose={() => setOpen(false)} closeLabel={t('nav.close')} returnFocus={button} testId="language-sheet">
        <h2 id={headline} className="visually-hidden">
          {t('nav.language')}
        </h2>
        <div role="radiogroup" aria-labelledby={headline} className="option-rows">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={l === locale}
              lang={l}
              className="option-row"
              onClick={() => {
                onLocale(l);
                setOpen(false);
              }}
            >
              <span className="option-word">{LOCALE_NAMES[l]}</span>
              <span className="radio" aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="sheet-note">{t('nav.languageNote')}</p>
      </Sheet>
    </header>
  );
}

/** The one-line demo notice, with "More" opening the demo-rules sheet. */
export function DemoBanner() {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const headline = useId();
  return (
    <aside className="demo-line" aria-label={t('demo.title')} data-testid="demo-banner" data-compact="true">
      <p>
        {t('demo.short')}{' '}
        <button ref={more} type="button" className="text-link inline" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {t('demo.more')}
        </button>
      </p>
      <Sheet
        open={open}
        label={t('demo.title')}
        labelledBy={headline}
        onClose={() => setOpen(false)}
        closeLabel={t('nav.close')}
        returnFocus={more}
        testId="demo-sheet"
        footer={
          <button type="button" className="action" onClick={() => setOpen(false)}>
            <ActionLabel>{t('nav.close')}</ActionLabel>
          </button>
        }
      >
        <h2 id={headline} className="sheet-headline">
          {t('demo.title')}
        </h2>
        <p className="sheet-text">{t('demo.body')}</p>
        <p className="sheet-note">{t('promise.line3')}</p>
      </Sheet>
    </aside>
  );
}

const time = (locale: Locale, at: number) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(at);

/** The count row of the bottom block; "Details" opens the record of everything that left this device. */
export function LeavingBar() {
  const { t, locale } = useApp();
  const { entries, clearedAt } = useSyncExternalStore(subscribeOutbound, outboundState, outboundState);
  const [open, setOpen] = useState(false);
  const panel = useId();
  const details = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const fieldName = (f: string) => {
    const key = `outbound.field.${f}`;
    return lookup('en', key) === undefined ? f : t(dynamicKey(key));
  };
  const kinds = [...new Set(entries.flatMap((e) => e.fields))].map(fieldName);
  const date = clearedAt === null ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(clearedAt);
  const shortDate = clearedAt === null ? '' : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(clearedAt);
  const sent = entries.filter((e) => e.status === 'sent').length;
  const carriesProfile = entries.some((e) => e.fields.includes('profile-silhouette') || e.fields.includes('county-area'));
  const statusLine = (e: OutboundEntry) =>
    e.status === 'attempted'
      ? t('outbound.status.attempted')
      : e.status === 'sent'
        ? t('outbound.status.sent', { status: e.httpStatus ?? '' })
        : t('outbound.status.failed', { reason: e.error ?? '' });
  const summary =
    entries.length > 0
      ? t('outbound.count', { count: entries.length, list: kinds.join(', ') })
      : clearedAt !== null
        ? t('leaving.clearedShort', { date })
        : t('leaving.none');

  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => details.current?.focus());
  };

  return (
    <section
      className="leaving"
      aria-labelledby="leaving-title"
      data-testid="leaving-bar"
      data-outbound-count={entries.length}
      data-cleared={clearedAt !== null ? 'true' : 'false'}
      data-open={open}
    >
      {open && (
        <>
          <div className="sheet-glimpse" aria-hidden="true" onClick={close} />
          <div id={panel} className="leaving-panel record-sheet" role="region" aria-labelledby={`${panel}-title`}>
            <div className="sheet-head">
              <h2 id={`${panel}-title`} ref={heading} tabIndex={-1} className="sheet-label">
                {t('leaving.title')}
              </h2>
              <button type="button" className="icon-button" aria-expanded="true" aria-controls={panel} aria-label={t('leaving.hide')} onClick={close}>
                <Close />
              </button>
            </div>
            {entries.length > 0 ? (
              <p className="record-headline">
                <span className="leave-mark">{t('leaving.sentCount', { count: sent || entries.length })}</span>
              </p>
            ) : (
              <p className="record-zero" aria-hidden="true">
                0
              </p>
            )}
            {entries.length === 0 && clearedAt !== null && <p className="record-deleted">{t('leaving.recordDeleted', { date: shortDate })}</p>}
            {entries.length > 0 ? <p>{t('leaving.bodySent')}</p> : clearedAt !== null ? <p>{t('leaving.cleared', { date })}</p> : <p>{t('leaving.body')}</p>}
            {entries.length > 0 && !carriesProfile && <p>{t('leaving.noValues')}</p>}
            {entries.length > 0 && clearedAt !== null && <p className="record-note">{t('leaving.cleared', { date })}</p>}
            <p className="record-note">{t('leaving.network')}</p>
            {entries.length > 0 && (
              <ol className="outbound-list" data-testid="outbound-list">
                {entries.map((e) => (
                  <OutboundItem key={e.id} entry={e} title={e.fields.map(fieldName).join(', ')} status={statusLine(e)} at={time(locale, e.at)} />
                ))}
              </ol>
            )}
          </div>
        </>
      )}
      <div className="count-row">
        <Count value={entries.length} />
        <p className="count-text">
          <span id="leaving-title" className="count-title">
            {t('leaving.title')}
          </span>
          <span role="status" className="count-sub">
            {summary}
          </span>
        </p>
        <button ref={details} type="button" className="details-button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(true)} hidden={open}>
          {t('leaving.details')}
        </button>
      </div>
    </section>
  );
}

function OutboundItem({ entry: e, title, status, at }: { entry: OutboundEntry; title: string; status: string; at: string }) {
  const { t } = useApp();
  const [show, setShow] = useState(false);
  const body = useId();
  return (
    <li data-channel={e.channel} data-status={e.status}>
      <span className="outbound-time">{at}</span>
      <div className="outbound-main">
        <span className="outbound-what">{title}</span>
        <span className="outbound-where">{t('outbound.requestTo', { destination: e.destination, path: e.path })}</span>
        {e.model && <span className="outbound-where">{t('outbound.model', { model: e.model })}</span>}
        {e.body !== undefined && (
          <>
            <button type="button" className="disclosure" aria-expanded={show} aria-controls={body} onClick={() => setShow(!show)}>
              <Caret open={show} />
              {t('outbound.showPayload')}
            </button>
            {show && (
              <Paper tilt="small-left" className="payload-slip" id={body}>
                <pre className="payload" data-testid="outbound-payload" tabIndex={0} aria-label={t('outbound.showPayload')}>
                  {e.body}
                </pre>
              </Paper>
            )}
          </>
        )}
      </div>
      <span className={`outbound-status status-${e.status}`} data-testid="outbound-status">
        {e.status === 'attempted' ? <span className="marker marker-loading" aria-hidden="true" /> : e.status === 'sent' ? <Check size={14} /> : <CrossCircle />}
        <span>{status}</span>
      </span>
    </li>
  );
}

export function Footer({ onDelete }: { onDelete: () => Promise<void> }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const headline = useId();
  return (
    <footer className="footer">
      <button ref={button} type="button" className="outline-button small" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Trash />
        {t('delete.all')}
      </button>
      <Sheet
        open={open}
        label={t('delete.all')}
        labelledBy={headline}
        onClose={() => setOpen(false)}
        closeLabel={t('nav.close')}
        returnFocus={button}
        testId="delete-sheet"
        footer={
          <>
            <button
              type="button"
              className="outline-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete();
                } finally {
                  setBusy(false);
                  setOpen(false);
                }
              }}
            >
              <Trash />
              {t('delete.confirm')}
            </button>
            <button type="button" className="action centered" autoFocus onClick={() => setOpen(false)}>
              <ActionLabel>{t('delete.cancel')}</ActionLabel>
            </button>
          </>
        }
      >
        <h2 id={headline} className="sheet-headline">
          {t('delete.title')}
        </h2>
        <p className="sheet-text" id={`${headline}-body`}>
          {t('delete.body')}
        </p>
      </Sheet>
    </footer>
  );
}
