// Persistent chrome: the header with the wordmark and the language control, the one-line draft-rules
// notice, the rail's steps (wide screens), the "Leaving your device" count row with its record, and
// "Delete everything".
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { leftDevice, outboundState, subscribeOutbound, type OutboundEntry } from '../data/outbound';
import { NO_APP_CHECK_TOKEN, REFUSED_BY_BROWSER } from '../data/net-monitor';
import { LOCALES, LOCALE_NAMES, dynamicKey, lookup, packDate, type CopyKey, type Locale } from './i18n';
import { useApp } from './context';
import { PACK, SOURCES_READ_ON, isDemoPack, isDraftPack } from './pack';
import { routeHref, type Route } from './router';
import { firstOpenStep } from './quickcheck';
import { useDocument } from './doc/state';
import { Count, Paper, Sheet, ActionLabel } from './design/parts';
import { Caret, Check, CrossCircle, Phone, Trash } from './design/icons';
import { useWide } from './design/block';

const SHORT_NAMES: Record<Locale, string> = { en: 'EN', es: 'ES', ko: '한국어' };

/** Opens the record of what left this device (the "Leaving your device" sheet) from anywhere. */
export const OPEN_RECORD_EVENT = 'silhouette:open-record';

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
      <Sheet open={open} label={t('nav.language')} labelledBy={headline} onClose={() => setOpen(false)} closeLabel={t('nav.close')} returnFocus={button} testId="language-sheet" count={<SheetCount />}>
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
/**
 * The one-line notice under the header, with "More" opening its sheet: for a draft pack, that its
 * numbers were read from official sources on a date and are not yet all confirmed (rulepacks/SPEC.md
 * section 2); for the invented demo pack, that its programs are not real.
 */
export function DemoBanner({ onDelete }: { onDelete: () => Promise<void> }) {
  const { t, locale } = useApp();
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const headline = useId();
  const draft = !isDemoPack(PACK) && isDraftPack();
  const date = SOURCES_READ_ON ? packDate(locale, SOURCES_READ_ON) : '';
  const title = draft ? t('pack.draft.title') : t('demo.title');
  return (
    <aside className="demo-line" aria-label={title} data-testid="demo-banner" data-pack={draft ? 'draft' : 'demo'} data-compact="true">
      <p>
        {draft ? t('pack.draft.short', { date }) : t('demo.short')}{' '}
        <button ref={more} type="button" className="text-link inline" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          {t('demo.more')}
        </button>
      </p>
      <Sheet
        open={open}
        label={title}
        labelledBy={headline}
        onClose={() => setOpen(false)}
        closeLabel={t('nav.close')}
        returnFocus={more}
        testId="demo-sheet"
        count={<SheetCount />}
        footer={
          <button type="button" className="action" onClick={() => setOpen(false)}>
            <ActionLabel>{t('nav.close')}</ActionLabel>
          </button>
        }
      >
        <h2 id={headline} className="sheet-headline">
          {title}
        </h2>
        {draft ? (
          <>
            <p className="sheet-text" data-testid="draft-body">
              {t('pack.draft.body', { date })}
            </p>
            <p className="sheet-note">{t('pack.draft.notice', { date })}</p>
          </>
        ) : (
          <p className="sheet-text">{t('demo.body')}</p>
        )}
        <p className="sheet-note">{t('promise.line3')}</p>
        <ul className="sheet-links">
          <li>
            <a className="text-link" href={routeHref({ name: 'judges' })} onClick={() => setOpen(false)} data-testid="judges-link">
              {t('demo.judges')}
            </a>
          </li>
          <li>
            <a className="text-link" href={routeHref({ name: 'device-check' })} onClick={() => setOpen(false)}>
              {t('demo.deviceCheck')}
            </a>
          </li>
        </ul>
        <DeleteEverything onDelete={onDelete} onDone={() => setOpen(false)} />
      </Sheet>
    </aside>
  );
}

/**
 * The rail's steps (wide screens): Quick Check, Results, Add a paystub, each with its state (the current
 * one is marked; a finished one carries a check and "Done" or its count), and the link for judges.
 */
export function RailSteps({ route }: { route: Route }) {
  const { t, steps, answers, results } = useApp();
  const { doc } = useDocument();
  const wide = useWide();
  if (!wide) return null;
  const open = firstOpenStep(steps, answers);
  const checked = open >= steps.length;
  const index = route.name === 'question' ? steps.findIndex((s) => s.id === route.id) : -1;
  const items: { key: string; label: string; href: string; current: boolean; done: boolean; note: string }[] = [
    {
      key: 'check',
      label: t('rail.quickCheck'),
      href: routeHref(steps[checked ? 0 : open] ? { name: 'question', id: (steps[checked ? 0 : open] as { id: string }).id, then: null } : { name: 'start' }),
      current: route.name === 'start' || route.name === 'question',
      done: checked,
      note: index >= 0 ? `${index + 1}/${steps.length}` : checked ? t('rail.done') : '',
    },
    {
      key: 'results',
      label: t('rail.results'),
      href: routeHref({ name: 'results' }),
      current: route.name === 'results' || route.name === 'program' || route.name === 'discover' || route.name === 'nearby',
      done: checked && route.name !== 'results' && route.name !== 'program',
      note: Object.keys(answers).length > 0 ? String(results.filter((r) => r.verdict !== 'unlikely').length) : '',
    },
    {
      key: 'paystub',
      label: t('results.addDocument'),
      href: routeHref({ name: 'doc' }),
      current: route.name === 'doc' || route.name === 'doc-preview' || route.name === 'doc-review',
      done: doc.confirmedStubs.length > 0,
      note: doc.confirmedStubs.length > 0 ? t('rail.done') : '',
    },
  ];
  return (
    <div className="rail-nav">
      <p className="rail-links">
        <a className="text-link inline" href={routeHref({ name: 'judges' })}>
          {t('rail.judges')}
        </a>
      </p>
      <nav aria-label={t('rail.steps')}>
        <ol className="rail-steps">
          {items.map((item) => (
            <li key={item.key}>
              <a className="rail-step" href={item.href} aria-current={item.current ? 'step' : undefined} data-done={item.done}>
                <span className="rail-dot" aria-hidden="true">
                  {item.done && !item.current ? <Check size={12} /> : null}
                </span>
                <span className="rail-label">{item.label}</span>
                {item.note && <span className="rail-note">{item.note}</span>}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

const time = (locale: Locale, at: number) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(at);

/** What the record counts: requests that left and completed, those that did not complete, answers kept. */
function useLedger() {
  const { entries, clearedAt } = useSyncExternalStore(subscribeOutbound, outboundState, outboundState);
  const left = leftDevice(entries);
  return {
    entries,
    clearedAt,
    left,
    sent: left.filter((e) => e.status === 'sent').length,
    // Listed under "Not completed" (shared/RECORD.md section 2): failed requests; one still in progress is not.
    incomplete: left.filter((e) => e.status === 'failed').length,
    kept: entries.filter((e) => e.status === 'answered').length,
  };
}

/** The title of a record entry: what a request carried, or what an answer kept on this device was for. */
const KEPT_TITLES: Readonly<Record<string, CopyKey>> = {
  'kept:document': 'model.title',
  'kept:photo': 'model.title',
  'kept:about': 'about.title',
  'kept:ask': 'ask.title',
  'kept:why': 'why.title',
  'kept:own-question': 'ask.free.label',
};

/** What a request carries that comes from the person (a silhouette of their document or answers). */
const PERSONAL_FIELDS: ReadonlySet<string> = new Set(['document-silhouette', 'profile-silhouette', 'county-area', 'inline-file']);
/** Channels of requests that carry nothing of the person's: checks and settings (shared/RECORD.md section 4). */
const TECHNICAL_CHANNELS: ReadonlySet<string> = new Set(['app-check', 'recaptcha', 'remote-config', 'other']);

/**
 * The line under the count: the requests that carried something of the person's, apart from the
 * technical checks and general questions that carry nothing of theirs. The two add up to the count.
 */
export function summaryParts(left: readonly OutboundEntry[]): { personal: number; documentOnly: boolean; other: number; otherTechnicalOnly: boolean } {
  const personal = left.filter((e) => e.fields.some((f) => PERSONAL_FIELDS.has(f)));
  const other = left.filter((e) => !e.fields.some((f) => PERSONAL_FIELDS.has(f)));
  return {
    personal: personal.length,
    documentOnly: personal.every((e) => e.fields.every((f) => !PERSONAL_FIELDS.has(f) || f === 'document-silhouette')),
    other: other.length,
    otherTechnicalOnly: other.every((e) => TECHNICAL_CHANNELS.has(e.channel)),
  };
}

function useSummary() {
  const { t, locale } = useApp();
  const { left, clearedAt } = useLedger();
  const date = clearedAt === null ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(clearedAt);
  if (left.length === 0) return clearedAt !== null ? t('leaving.clearedShort', { date }) : t('leaving.none');
  const p = summaryParts(left);
  const parts = [
    p.personal > 0 ? t(p.documentOnly ? 'leaving.split.document' : 'leaving.split.personal', { count: p.personal }) : t('leaving.split.nothingOfYours'),
    ...(p.other > 0 ? [t(p.otherTechnicalOnly ? 'leaving.split.technical' : 'leaving.split.general', { count: p.other })] : []),
  ];
  return parts.join(' · ');
}

function useFieldName() {
  const { t } = useApp();
  return (f: string) => {
    const kept = KEPT_TITLES[f];
    if (kept) return t(kept);
    const key = `outbound.field.${f}`;
    return lookup('en', key) === undefined ? f : t(dynamicKey(key));
  };
}

/** The count inside every sheet, so what left this device stays in view while a sheet is open. */
export function SheetCount() {
  const { t } = useApp();
  const { left } = useLedger();
  const summary = useSummary();
  return (
    <div className="sheet-count" data-testid="sheet-count">
      <Count value={left.length} />
      <p className="count-text">
        <span className="count-title">{t('leaving.title')}</span>
        <span className="count-sub">{summary}</span>
      </p>
    </div>
  );
}

/** The count row of the bottom block; "Details" opens the record of everything that left this device. */
export function LeavingBar({ onDelete }: { onDelete: () => Promise<void> }) {
  const { t, locale } = useApp();
  const { entries, clearedAt, left, sent, incomplete, kept } = useLedger();
  const [open, setOpen] = useState(false);
  const details = useRef<HTMLButtonElement>(null);
  const headline = useId();
  const fieldName = useFieldName();
  // Wide screens: the record fills the content area, with the open request beside the list.
  const wide = useWide();
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_RECORD_EVENT, show);
    return () => window.removeEventListener(OPEN_RECORD_EVENT, show);
  }, []);
  const summary = useSummary();
  const date = clearedAt === null ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(clearedAt);
  const shortDate = clearedAt === null ? '' : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(clearedAt);
  const carriesProfile = left.some((e) => e.fields.includes('profile-silhouette') || e.fields.includes('county-area'));
  const statusLine = (e: OutboundEntry) =>
    e.status === 'answered'
      ? t('outbound.status.answeredShort')
      : e.status === 'attempted'
        ? t('outbound.status.attempted')
        : e.status === 'sent'
          ? e.httpStatus === 0
            ? t('outbound.status.loaded')
            : t('outbound.status.sent', { status: e.httpStatus ?? '' })
          : e.status === 'blocked'
            ? t(e.error === REFUSED_BY_BROWSER ? 'outbound.status.refusedByBrowser' : e.error === NO_APP_CHECK_TOKEN ? 'outbound.status.noAppCheck' : 'outbound.status.blocked')
            : t('outbound.status.failed', { reason: e.error ?? '' });

  return (
    <div
      className="leaving"
      data-testid="leaving-bar"
      data-outbound-count={left.length}
      data-kept-count={kept}
      data-cleared={clearedAt !== null ? 'true' : 'false'}
      data-open={open}
    >
      <Sheet open={open} label={t('leaving.title')} labelledBy={headline} onClose={() => setOpen(false)} closeLabel={t('leaving.hide')} returnFocus={details} testId="record-sheet">
        <div className="record">
          {entries.length > 0 ? (
            <h2 className="record-headline" id={headline} data-testid="record-headline">
              {/* Redact marks what left, so it starts at one. */}
              <span className={sent > 0 ? 'leave-mark' : 'zero-mark'}>{t('leaving.sentCount', { count: sent })}</span> <span className="kept-mark">{t('leaving.keptCount', { count: kept })}</span>
            </h2>
          ) : (
            <h2 className="record-zero" id={headline}>
              <span aria-hidden="true">0</span>
              <span className="visually-hidden">{summary}</span>
            </h2>
          )}
          {incomplete > 0 && (
            <p className="record-incomplete" data-testid="record-incomplete">
              {t('leaving.notCompleted', { count: incomplete })}
            </p>
          )}
          {entries.length === 0 && clearedAt !== null && <p className="record-deleted">{t('leaving.recordDeleted', { date: shortDate })}</p>}
          {entries.length > 0 ? <p>{t('leaving.bodySent')}</p> : clearedAt !== null ? <p>{t('leaving.cleared', { date })}</p> : <p>{t('leaving.body')}</p>}
          {left.length > 0 && !carriesProfile && <p>{t('leaving.noValues')}</p>}
          {entries.length > 0 && clearedAt !== null && <p className="record-note">{t('leaving.cleared', { date })}</p>}
          <p className="record-note">{t('leaving.network')}</p>
          {entries.length > 0 && (
            <ol className="outbound-list" data-testid="outbound-list">
              {entries.map((e) => (
                <OutboundItem
                  key={e.id}
                  entry={e}
                  title={e.fields.map(fieldName).join(', ')}
                  status={statusLine(e)}
                  at={time(locale, e.at)}
                  {...(wide ? { open: shown === e.id, onToggle: () => setShown(shown === e.id ? null : e.id) } : {})}
                />
              ))}
            </ol>
          )}
          {wide && entries.some((e) => e.body !== undefined) && (
            <p className="record-pick">
              <strong>{t('record.exactlySent')}</strong>
              <span>{t('record.pick')}</span>
            </p>
          )}
          {entries.some((e) => e.channel === 'recaptcha') && (
            <p className="record-note" data-testid="recaptcha-note">
              {t('leaving.recaptchaNote')}
            </p>
          )}
          <DeleteEverything onDelete={onDelete} />
        </div>
      </Sheet>
      <div className="count-row">
        <Count value={left.length} />
        <p className="count-text">
          <span id="leaving-title" className="count-title">
            {t('leaving.title')}
          </span>
          <span role="status" className="count-sub">
            {summary}
          </span>
        </p>
        <button ref={details} type="button" className="details-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          {t('leaving.details')}
        </button>
      </div>
    </div>
  );
}

function OutboundItem({ entry: e, title, status, at, open, onToggle }: { entry: OutboundEntry; title: string; status: string; at: string; open?: boolean; onToggle?: () => void }) {
  const { t } = useApp();
  const [own, setOwn] = useState(false);
  const show = open ?? own;
  const setShow = (next: boolean) => (onToggle ? onToggle() : setOwn(next));
  const body = useId();
  return (
    <li data-channel={e.channel} data-status={e.status}>
      <span className="outbound-time">{at}</span>
      <div className="outbound-main">
        <span className="outbound-what">{title}</span>
        {e.status !== 'answered' && <span className="outbound-where">{t('outbound.requestTo', { destination: e.destination, path: e.path })}</span>}
        {e.model && <span className="outbound-where">{t('outbound.model', { model: e.model })}</span>}
        {e.body !== undefined && (
          <>
            <button type="button" className="disclosure" aria-expanded={show} aria-controls={body} onClick={() => setShow(!show)}>
              <Caret open={show} />
              {t('outbound.showPayload')}
            </button>
            {show && (
              <Paper className="payload-slip" id={body}>
                <p className="payload-head" aria-hidden="true">
                  <strong>{t('record.exactlySent')}</strong>
                  <span>
                    {at} · {title}
                  </span>
                </p>
                <pre className="payload" data-testid="outbound-payload" tabIndex={0} aria-label={t('outbound.showPayload')}>
                  {e.body}
                </pre>
              </Paper>
            )}
          </>
        )}
      </div>
      <span className={`outbound-status status-${e.status}`} data-testid="outbound-status">
        {e.status === 'answered' ? <Phone /> : e.status === 'attempted' ? <span className="marker marker-loading" aria-hidden="true" /> : e.status === 'sent' ? <Check size={14} /> : <CrossCircle />}
        <span>{status}</span>
      </span>
    </li>
  );
}

/**
 * "Delete everything": an entry in the record of what left and in the demo-rules sheet, with its
 * confirmation sheet.
 */
export function DeleteEverything({ onDelete, onDone }: { onDelete: () => Promise<void>; onDone?: () => void }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const headline = useId();
  return (
    <div className="delete-entry">
      <button ref={button} type="button" className="outline-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
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
        count={<SheetCount />}
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
                  onDone?.();
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
    </div>
  );
}
