// Persistent chrome: header with language switch, demo banner, "Leaving your device" bar,
// footer with "Delete everything".
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { outboundEntries, subscribeOutbound } from '../data/outbound';
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

export function DemoBanner() {
  const { t } = useApp();
  return (
    <aside className="demo" aria-labelledby="demo-title">
      <p id="demo-title" className="demo-title">
        {t('demo.title')}
      </p>
      <p>{t('demo.body')}</p>
    </aside>
  );
}

export function LeavingBar() {
  const { t } = useApp();
  const entries = useSyncExternalStore(subscribeOutbound, outboundEntries, outboundEntries);
  const [open, setOpen] = useState(false);
  const panel = useId();
  const fieldName = (f: string) => {
    const key = `outbound.field.${f}`;
    return lookup('en', key) === undefined ? f : t(dynamicKey(key));
  };
  const kinds = [...new Set(entries.flatMap((e) => e.fields))].map(fieldName);
  return (
    <section className="leaving" aria-labelledby="leaving-title" data-testid="leaving-bar" data-outbound-count={entries.length}>
      {open && (
        <div id={panel} className="leaving-panel">
          <p>{t('leaving.body')}</p>
          <p>{t('leaving.network')}</p>
          {entries.length > 0 && (
            <ol className="outbound-list" data-testid="outbound-list">
              {entries.map((e, i) => (
                <li key={i} data-channel={e.channel}>
                  <span className="outbound-what">{e.fields.map(fieldName).join(', ')}</span>{' '}
                  <span className="outbound-where">{t('outbound.sentTo', { destination: e.destination })}</span>
                  {e.payload !== undefined && (
                    <details>
                      <summary>{t('outbound.showPayload')}</summary>
                      <pre className="payload" data-testid="outbound-payload">
                        {e.payload}
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
          <span role="status">{entries.length === 0 ? t('leaving.none') : t('outbound.count', { count: entries.length, list: kinds.join(', ') })}</span>
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
