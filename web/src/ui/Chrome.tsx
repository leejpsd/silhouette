// Persistent chrome: header with language switch, demo banner, "Leaving your device" bar,
// footer with "Delete everything".
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { outboundState, subscribeOutbound, type OutboundEntry } from '../data/outbound';
import { LOCALES, LOCALE_NAMES, dynamicKey, isLocale, lookup, type Locale } from './i18n';
import { useApp } from './context';
import { SilhouetteMark } from './SilhouetteMark';

export function Header({ onLocale }: { onLocale: (locale: Locale) => void }) {
  const { t, locale } = useApp();
  const id = useId();
  return (
    <header className="header">
      <a className="wordmark" href="#/" aria-label={t('nav.home')}>
        <SilhouetteMark verdict="brand" size={28} />
        <span>Silhouette</span>
      </a>
      <div className="lang">
        <label htmlFor={id}>{t('nav.language')}</label>
        <select id={id} value={locale} onChange={(e) => isLocale(e.target.value) && onLocale(e.target.value)}>
          {LOCALES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}

/** Full banner on the start screen; a one-line notice that can be expanded everywhere else. */
export function DemoBanner({ compact }: { compact: boolean }) {
  const { t } = useApp();
  if (compact) {
    return (
      <aside className="demo compact" aria-label={t('demo.title')} data-testid="demo-banner" data-compact="true">
        <details>
          <summary className="demo-title">{t('demo.title')}</summary>
          <p>{t('demo.body')}</p>
        </details>
      </aside>
    );
  }
  return (
    <aside className="demo" aria-labelledby="demo-title" data-testid="demo-banner" data-compact="false">
      <p id="demo-title" className="demo-title">
        {t('demo.title')}
      </p>
      <p>{t('demo.body')}</p>
    </aside>
  );
}

export function LeavingBar() {
  const { t, locale } = useApp();
  const { entries, clearedAt } = useSyncExternalStore(subscribeOutbound, outboundState, outboundState);
  const [open, setOpen] = useState(false);
  const panel = useId();
  const fieldName = (f: string) => {
    const key = `outbound.field.${f}`;
    return lookup('en', key) === undefined ? f : t(dynamicKey(key));
  };
  const kinds = [...new Set(entries.flatMap((e) => e.fields))].map(fieldName);
  const date = clearedAt === null ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(clearedAt);
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
  return (
    <section
      className="leaving"
      aria-labelledby="leaving-title"
      data-testid="leaving-bar"
      data-outbound-count={entries.length}
      data-cleared={clearedAt !== null ? 'true' : 'false'}
    >
      {open && (
        <div id={panel} className="leaving-panel">
          {entries.length > 0 ? (
            <p>{t('leaving.bodySent')}</p>
          ) : clearedAt !== null ? (
            <p>{t('leaving.cleared', { date })}</p>
          ) : (
            <p>{t('leaving.body')}</p>
          )}
          {entries.length > 0 && clearedAt !== null && <p>{t('leaving.cleared', { date })}</p>}
          <p>{t('leaving.network')}</p>
          {entries.length > 0 && (
            <ol className="outbound-list" data-testid="outbound-list">
              {entries.map((e) => (
                <li key={e.id} data-channel={e.channel} data-status={e.status}>
                  <span className="outbound-what">{e.fields.map(fieldName).join(', ')}</span>
                  <span className="outbound-where">{t('outbound.requestTo', { destination: e.destination, path: e.path })}</span>
                  {e.model && <span className="outbound-where">{t('outbound.model', { model: e.model })}</span>}
                  <span className={`outbound-status status-${e.status}`} data-testid="outbound-status">
                    {statusLine(e)}
                  </span>
                  {e.body !== undefined && (
                    <details>
                      <summary>{t('outbound.showPayload')}</summary>
                      <pre className="payload" data-testid="outbound-payload" tabIndex={0} aria-label={t('outbound.showPayload')}>
                        {e.body}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <div className="leaving-row">
        <p className="leaving-status">
          <span id="leaving-title" className="leaving-title">
            {t('leaving.title')}
          </span>
          <span role="status">{summary}</span>
        </p>
        <button type="button" className="button quiet" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
          {open ? t('leaving.hide') : t('leaving.details')}
        </button>
      </div>
    </section>
  );
}

export function Footer({ onDelete }: { onDelete: () => Promise<void> }) {
  const { t } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <footer className="footer">
      <p>{t('promise.line3')}</p>
      <button type="button" className="button danger-quiet" onClick={() => dialog.current?.showModal()}>
        {t('delete.all')}
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby="delete-title" aria-describedby="delete-body">
        <h2 id="delete-title">{t('delete.title')}</h2>
        <p id="delete-body">{t('delete.body')}</p>
        <div className="actions">
          <button
            type="button"
            className="button danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete();
              } finally {
                setBusy(false);
                dialog.current?.close();
              }
            }}
          >
            {t('delete.confirm')}
          </button>
          <button type="button" className="button secondary" autoFocus onClick={() => dialog.current?.close()}>
            {t('delete.cancel')}
          </button>
        </div>
      </dialog>
    </footer>
  );
}
