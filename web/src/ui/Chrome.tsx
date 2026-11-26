// Persistent chrome: the header with the wordmark and the language control, the one-line draft-rules
// notice, the rail's steps (wide screens), the "Leaving your device" count row with its record, and
// "Delete everything".
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { leftDevice, outboundState, subscribeOutbound, type OutboundEntry } from '../data/outbound';
import { NO_APP_CHECK_TOKEN, REFUSED_BY_BROWSER } from '../data/net-monitor';
import { UI_LOCALES, LOCALE_NAMES, dynamicKey, lookup, packDate, type CopyKey, type Locale } from './i18n';
import { useApp } from './context';
import { PACK, SOURCES_READ_ON, isCheckedPack, isDemoPack, isDraftPack } from './pack';
import { routeHref, type Route } from './router';
import { firstOpenStep } from './quickcheck';
import { useDocument } from './doc/state';
import { Count, Paper, Sheet, ActionLabel } from './design/parts';
import { Caret, Check, Computer, CrossCircle, Phone, Trash } from './design/icons';
import { useWide } from './design/block';
import { useLastReading } from './doc/last-reading';
import { chipParts, whatLeft } from './what-left';

const SHORT_NAMES: Record<Locale, string> = { en: 'EN', es: 'ES', ko: '한국어' };

/** Opens the record of what left this device (the "Leaving your device" sheet) from anywhere. */
export const OPEN_RECORD_EVENT = 'silhouette:open-record';
/** Opens the draft-rules (or demo-rules) sheet from the rail. */
export const OPEN_RULES_EVENT = 'silhouette:open-rules';

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
          {UI_LOCALES.map((l) => (
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
  const checked = !isDemoPack(PACK) && isCheckedPack();
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_RULES_EVENT, show);
    return () => window.removeEventListener(OPEN_RULES_EVENT, show);
  }, []);
  const date = checked && PACK.verifiedOn ? packDate(locale, PACK.verifiedOn) : SOURCES_READ_ON ? packDate(locale, SOURCES_READ_ON) : '';
  const title = checked ? t('pack.checked.title') : draft ? t('pack.draft.title') : t('demo.title');
  return (
    <aside className="demo-line" aria-label={title} data-testid="demo-banner" data-pack={checked ? 'checked' : draft ? 'draft' : 'demo'} data-compact="true">
      <p>
        {checked ? t('pack.checked.short', { date }) : draft ? t('pack.draft.short', { date }) : t('demo.short')}{' '}
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
        {checked ? (
          <p className="sheet-text" data-testid="checked-body">
            {t('pack.checked.body', { date })}
          </p>
        ) : draft ? (
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
          <li>
            <a className="text-link" href={routeHref({ name: 'tasks' })} onClick={() => setOpen(false)}>
              {t('judges.tasks')}
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
      // The count stands once every question has been answered or skipped: before that it would change under the eye.
      note: steps.every((step) => answers[step.id] !== undefined) ? String(results.filter((r) => r.verdict !== 'unlikely').length) : '',
    },
    {
      key: 'paystub',
      label: t('results.addDocumentW2'),
      href: routeHref({ name: 'doc' }),
      current: route.name === 'doc' || route.name === 'doc-preview' || route.name === 'doc-review',
      done: doc.confirmedStubs.length + doc.confirmedW2s.length > 0,
      note: doc.confirmedStubs.length + doc.confirmedW2s.length > 0 ? t('rail.done') : '',
    },
  ];
  return (
    <div className="rail-nav">
      <p className="rail-links">
        <a className="text-link inline" href={routeHref({ name: 'judges' })}>
          {t('rail.judges')}
        </a>
        {(isDemoPack(PACK) || isDraftPack() || isCheckedPack()) && (
          <button type="button" className="text-link inline" aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(OPEN_RULES_EVENT))}>
            {isDemoPack(PACK) ? t('rail.demoRules') : isCheckedPack() ? t('rail.checkedRules') : t('rail.draftRules')}
          </button>
        )}
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

/** The time of a request, written the way the language writes times (the same as the date lines beside it). */
const time = (locale: Locale, at: number) => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(at);

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
  'kept:recorded': 'record.recorded.title',
  'kept:recorded-cloud': 'record.recordedCloud.title',
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
  const { entries, clearedAt, left, incomplete, kept } = useLedger();
  const [open, setOpen] = useState(false);
  const details = useRef<HTMLButtonElement>(null);
  const headline = useId();
  const fieldName = useFieldName();
  // Wide screens: the record fills the content area, with the open request beside the list.
  const wide = useWide();
  const [shown, setShown] = useState<string | null>(null);
  // Opening the record shows the latest request that carried a body (wide: beside the list; phone: open in it).
  useEffect(() => {
    if (!open) return;
    const latest = [...entries].reverse().find((e) => e.body !== undefined);
    setShown((current) => current ?? latest?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_RECORD_EVENT, show);
    return () => window.removeEventListener(OPEN_RECORD_EVENT, show);
  }, []);
  const summary = useSummary();
  const date = clearedAt === null ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(clearedAt);
  const shortDate = clearedAt === null ? '' : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(clearedAt);
  const carriesProfile = left.some((e) => e.fields.includes('profile-silhouette') || e.fields.includes('county-area'));
  // A request that carried a file (a photo) is not only a silhouette: the headline does not say it is.
  const onlySilhouettes = !left.some((e) => e.fields.includes('inline-file'));
  // Under the headline: answers written on this device, and recordings shown (nothing sent now).
  const recordings = entries.filter((e) => e.status === 'answered' && e.recording !== undefined).length;
  const subParts = [
    ...(kept - recordings > 0 ? [t('leaving.sub.kept', { count: kept - recordings })] : []),
    ...(recordings > 0 ? [t('leaving.sub.recorded', { count: recordings })] : []),
  ];
  const statusLine = (e: OutboundEntry) =>
    e.status === 'answered'
      ? e.recording
        ? t(e.recording.place === 'cloud' ? 'record.recordedCloud.status' : 'record.recorded.status')
        : t('outbound.status.answeredShort')
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
          {/* In plain words first: whether anything left, and that each request carried only a silhouette. */}
          <h2 className="record-headline" id={headline} data-testid="record-headline" data-left={left.length}>
            {left.length > 0 ? <span className="leave-mark">{t('leaving.headline.sent', { count: left.length })}</span> : t('leaving.headline.none')}
          </h2>
          {left.length > 0 && onlySilhouettes && (
            <p className="record-only" data-testid="record-only">
              {t('leaving.headline.only')}
            </p>
          )}
          {subParts.length > 0 && (
            <p className="record-sub" data-testid="record-sub">
              {subParts.join(' · ')}
            </p>
          )}
          {incomplete > 0 && (
            <p className="record-incomplete" data-testid="record-incomplete">
              {t('leaving.notCompleted', { count: incomplete })}
            </p>
          )}
          {entries.length === 0 && clearedAt !== null && <p className="record-deleted">{t('leaving.recordDeleted', { date: shortDate })}</p>}
          {entries.length > 0 ? <p>{t(left.length > 0 ? 'leaving.bodySent' : 'leaving.bodyKept')}</p> : clearedAt !== null ? <p>{t('leaving.cleared', { date })}</p> : <p>{t('leaving.body')}</p>}
          {entries.length > 0 && (
            <ol className="outbound-list" data-testid="outbound-list">
              {entries.map((e) => (
                <OutboundItem
                  key={e.id}
                  entry={e}
                  title={e.fields.map(fieldName).join(', ')}
                  status={statusLine(e)}
                  at={e.recording ? t('record.recordedOn', { date: e.recording.date }) : time(locale, e.at)}
                  open={shown === e.id}
                  onToggle={() => setShown((current) => (current === e.id && !wide ? null : e.id))}
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
          {left.length > 0 && !carriesProfile && !onlySilhouettes && <p className="record-note">{t('leaving.noValues')}</p>}
          {entries.length > 0 && clearedAt !== null && <p className="record-note">{t('leaving.cleared', { date })}</p>}
          <p className="record-note">{t('leaving.network')}</p>
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

/**
 * Where an answer that stayed was written: a recording shows the machine it was recorded on (a computer for
 * Chrome on a Mac, a phone for the iPhone), a recorded cloud answer shows no device, and an answer written
 * now shows this device (a phone on a touch screen, a computer otherwise).
 */
function answeredOn(e: OutboundEntry): 'phone' | 'computer' | null {
  if (e.recording) return e.recording.place === 'cloud' ? null : /iphone|ipad|android|pixel|galaxy|phone/i.test(e.recording.machine) ? 'phone' : 'computer';
  const touch = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  return touch ? 'phone' : 'computer';
}

/**
 * One row of the leaving label: the time, what it carried and its status; where it went, the model and
 * the exact request open under "Show exactly what was sent" (on wide screens, beside the list).
 */
function OutboundItem({ entry: e, title, status, at, open, onToggle }: { entry: OutboundEntry; title: string; status: string; at: string; open?: boolean; onToggle?: () => void }) {
  const { t } = useApp();
  const [own, setOwn] = useState(false);
  const show = open ?? own;
  const setShow = (next: boolean) => (onToggle ? onToggle() : setOwn(next));
  const body = useId();
  const reading = useLastReading();
  const [copied, setCopied] = useState(false);
  const isReading = e.fields.includes('document-silhouette') && e.status === 'sent';
  const recorded = e.recording !== undefined;
  const on = e.status === 'answered' ? answeredOn(e) : null;
  const plain = useMemo(() => (e.body === undefined ? null : whatLeft(e.body)), [e.body]);
  return (
    <li data-channel={e.channel} data-status={e.status} data-open={show} data-recorded={recorded} data-new={Date.now() - e.at < 5000 ? 'true' : undefined}>
      <span className="outbound-time">{at}</span>
      <span className="outbound-what">{title}</span>
      <span className={`outbound-status status-${e.status}`} data-testid="outbound-status" data-answered-on={e.status === 'answered' ? (on ?? 'none') : undefined}>
        {e.status === 'answered' ? on === 'phone' ? <Phone size={12} /> : on === 'computer' ? <Computer size={12} /> : null : e.status === 'attempted' ? <span className="spinner" aria-hidden="true" /> : e.status === 'sent' ? null : <CrossCircle />}
        <span>{status}</span>
      </span>
      {/* A recorded reading: whose answer it was and when, under the row. */}
      {e.recording && (
        <p className="outbound-note" data-testid="recorded-note">
          {e.recording.place === 'cloud' ? t('record.recordedCloud.note', { date: e.recording.date }) : t('record.recorded.note', { machine: e.recording.machine, date: e.recording.date })}
        </p>
      )}
      {(e.status !== 'answered' || e.body !== undefined) && (
        <div className="outbound-main">
          <button type="button" className="disclosure" aria-expanded={show} aria-controls={body} onClick={() => setShow(!show)}>
            <Caret open={show} />
            {/* What the row opens on: what left (or went, for a recording), in plain words; the exact request under it. */}
            {e.body !== undefined ? t(plain === null ? 'outbound.showPayload' : recorded ? 'record.whatWent' : 'record.whatLeft') : t('send.showRequest')}
          </button>
          {/* Where it went: with a body, the short line under what left says it. */}
          <div className="outbound-details" hidden={!show || e.body !== undefined}>
            <span className="outbound-where">{t('outbound.requestTo', { destination: e.destination, path: e.path })}</span>
            {e.model && <span className="outbound-where">{t('outbound.model', { model: e.model })}</span>}
          </div>
          {show && e.body !== undefined && (
            <Paper className="payload-slip" id={body}>
              {/* What left, as a person reads it: the silhouette with its placeholder chips, and what stayed here. */}
              {plain ? (
                <div className="what-left" data-testid="what-left">
                  <strong className="what-left-title">{t(recorded ? 'record.whatWent' : 'record.whatLeft')}</strong>
                  <pre className="what-left-doc" data-testid="what-left-doc" data-kind={plain.kept ? 'silhouette' : 'text'} tabIndex={0} aria-label={t(recorded ? 'record.whatWent' : 'record.whatLeft')}>
                    {chipParts(plain.text).map((part, i) =>
                      part.id ? (
                        <span key={i} className={`tok ph ph-${part.id[0]}`}>
                          {part.text}
                        </span>
                      ) : (
                        <span key={i}>{part.text}</span>
                      ),
                    )}
                  </pre>
                  {plain.kept && (
                    <p className="what-stayed" data-testid="what-stayed">
                      {t('record.whatStayed', { numbers: plain.kept.numbers, dates: plain.kept.dates, words: plain.kept.words })}
                    </p>
                  )}
                </div>
              ) : null}
              {/* The model, where it went, its status and when, in one short line. */}
              <p className="payload-meta" data-testid="payload-meta">
                {[e.model ? t('outbound.model', { model: e.model }) : null, `${e.destination}${e.path}`, status, at, t('record.bytes', { count: e.bytes })].filter(Boolean).join(' · ')}
              </p>
              {/* For developers: the request exactly as sent, and the answer, folded away. Open when there are no plain words for it. */}
              <details className="technical" data-testid="record-technical" open={plain === null}>
                <summary>
                  <Caret open={false} />
                  {t('record.technical')}
                </summary>
                <div className="payload-head">
                  <p>
                    <strong>{e.recording?.place === 'cloud' ? t('record.recordedCloud.exactly', { date: e.recording.date }) : t('record.exactlySent')}</strong>
                  </p>
                  {e.channel === 'ai-cloud' && <strong className="badge badge-cloud">{t('badge.cloud')}</strong>}
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(e.body ?? '').then(() => setCopied(true), () => undefined);
                    }}
                  >
                    {copied ? t('record.copied') : t('record.copy')}
                  </button>
                </div>
                <pre className="payload" data-testid="outbound-payload" tabIndex={0} aria-label={t('outbound.showPayload')}>
                  {e.body}
                </pre>
                {e.recordedAnswer !== undefined && (
                  <div className="answer-received" data-testid="answer-received">
                    <strong>{t('record.answerReceived')}</strong>
                    <code>{e.recordedAnswer}</code>
                    <span>{t('record.answerNote')}</span>
                  </div>
                )}
                {isReading && reading && (
                  <div className="answer-received" data-testid="answer-received">
                    <strong>{t('record.answerReceived')}</strong>
                    <code>{JSON.stringify(reading.ids)}</code>
                    <span>{t('record.answerNote')}</span>
                  </div>
                )}
              </details>
            </Paper>
          )}
        </div>
      )}
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
