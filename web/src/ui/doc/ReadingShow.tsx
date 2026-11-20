// The reading shown as it happens (contract v1.43, preview.stage.*): the silhouette's placeholders go to
// the model, on this device or in the cloud, labelled with where; the answer comes back as placeholder
// chips (N12…), which turn into the values here, on this device; then the review.
//
// The two ways differ at a glance. On this device the whole stage is one ink block: the document, the
// model and everything that moves stay inside it. To the cloud the ink block holds the document only;
// the chips leave it across a dashed orange edge to Firebase AI Logic, an orange box outside it.
// With reduced motion nothing moves: the same stages are shown as text, one after the other.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ReviewField } from '../../core/review';
import type { Skeleton } from '../../core/types';
import type { PointerStage } from '../../ai/tasks';
import { useApp } from '../context';
import { dynamicKey } from '../i18n';
import { Cloud, Phone } from '../design/icons';

export type ShowRoute = 'device' | 'cloud' | 'cloud-after-device' | 'recorded-device' | 'recorded-cloud';

/** A field the model answered with a placeholder, and the value this device put back. */
export interface ShowPair {
  readonly field: string;
  readonly ref: string;
  readonly value: string;
}

export interface ShowState {
  readonly route: ShowRoute;
  readonly phase: 'out' | 'back';
  readonly pairs: readonly ShowPair[];
  /** A recorded reading: the machine it was made on. */
  readonly machine?: string | undefined;
}

/**
 * The shortest time the silhouette is shown going out, and how long the placeholders take to come back
 * and turn into values: at most about 2.3 s added. A reading that takes longer than the first adds only
 * the second; an error is shown at once (the staging is cleared).
 */
export const SHOW_OUT_MS = 900;
export const SHOW_BACK_MS = 1400;

const isCloud = (route: ShowRoute) => route === 'cloud' || route === 'cloud-after-device' || route === 'recorded-cloud';

/** The fields that decide the yearly income first, then the others: at most four, each with one placeholder. */
const ORDER: Readonly<Record<string, readonly string[]>> = {
  paystub: ['grossPay', 'ytdGross', 'payDate', 'periodEnd', 'netPay', 'periodStart'],
  w2: ['wages', 'taxYear', 'federalIncomeTaxWithheld', 'medicareWages', 'socialSecurityWages', 'stateWages'],
};

export function showPairs(review: readonly ReviewField[], docType: string): ShowPair[] {
  const order = ORDER[docType] ?? [];
  const ranked = [...review].sort((a, b) => rank(order, a.name) - rank(order, b.name));
  const out: ShowPair[] = [];
  for (const field of ranked) {
    if (out.length >= 4 || field.kind === 'list' || field.refs.length !== 1) continue;
    const ref = field.refs[0] as string;
    const value = field.source.flat().find((seg) => seg.ref === ref)?.text;
    if (value) out.push({ field: field.name, ref, value });
  }
  return out;
}

const rank = (order: readonly string[], name: string) => {
  const i = order.indexOf(name);
  return i === -1 ? order.length : i;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The staging's state for a screen that reads a document: `begin` when the reading starts, `route` when
 * it changes way (this device could not read it, so it goes on to the cloud), `back` once the answer is in
 * (it resolves when the values have been put back), `clear` on an error or when leaving.
 */
export function useReadingShow() {
  const [show, setShow] = useState<ShowState | null>(null);
  const since = useRef(0);
  const begin = useCallback((route: ShowRoute, machine?: string) => {
    since.current = Date.now();
    setShow({ route, phase: 'out', pairs: [], machine });
  }, []);
  const route = useCallback((next: ShowRoute) => setShow((s) => (s && s.phase === 'out' ? { ...s, route: next } : s)), []);
  const clear = useCallback(() => setShow(null), []);
  const back = useCallback(async (pairs: readonly ShowPair[], finalRoute?: ShowRoute) => {
    const shown = Date.now() - since.current;
    if (shown < SHOW_OUT_MS) await wait(SHOW_OUT_MS - shown);
    let live = false;
    setShow((s) => {
      live = s !== null;
      return s ? { ...s, phase: 'back', pairs, route: finalRoute ?? s.route } : s;
    });
    if (live) await wait(SHOW_BACK_MS);
  }, []);
  return { show, begin, route, back, clear };
}

const PLACEHOLDER = /⟦([DNW][0-9]+)⟧/;
const ANY_PLACEHOLDER = /⟦[DNW][0-9]+⟧/;

/** Lines a reading is about: amounts and dates, the money lines first (gross, net, year to date). */
const KEY_LINE = /gross|net|ytd|year to date|pay date|bruto|neto|wages|salarios/i;

/**
 * The silhouette lines shown going out: lines of amounts or dates (no hidden words), the money lines
 * first, at most four, in the document's order. Falls back to any line with a placeholder.
 */
function shownLines(skeleton: Skeleton): string[] {
  const all = skeleton.split('\n').map((l, i) => ({ l: l.trim().replace(/\s{3,}/g, '  '), i }));
  const values = all.filter(({ l }) => /⟦[ND][0-9]+⟧/.test(l) && !/⟦W[0-9]+⟧/.test(l));
  const pool = values.length >= 2 ? values : all.filter(({ l }) => ANY_PLACEHOLDER.test(l));
  const picked = [...pool.filter(({ l }) => KEY_LINE.test(l)), ...pool.filter(({ l }) => !KEY_LINE.test(l))].slice(0, 4);
  return picked.sort((a, b) => a.i - b.i).map(({ l }) => l);
}

/** The placeholder ids that travel out: the ones in the lines shown, at most six. */
function outIds(lines: readonly string[]): string[] {
  return lines.flatMap((l) => [...l.matchAll(/⟦([DNW][0-9]+)⟧/g)].map((m) => m[1] as string)).slice(0, 6);
}

export function ReadingShow({ show, skeleton, docType, stage }: { show: ShowState; skeleton: Skeleton; docType: string; stage: PointerStage | null }) {
  const { t } = useApp();
  const cloud = isCloud(show.route);
  const recorded = show.route === 'recorded-device' || show.route === 'recorded-cloud';
  const lines = shownLines(skeleton);
  const travelling = show.phase === 'out' ? outIds(lines) : show.pairs.map((p) => p.ref);
  const panel = useRef<HTMLDivElement>(null);
  // Focus moves into the staging, so a screen reader hears each stage; it is given back by the review.
  useEffect(() => panel.current?.focus({ preventScroll: true }), []);

  const sentence =
    show.phase === 'back'
      ? t('preview.stage.pointersBack')
      : show.route === 'recorded-device'
        ? t('show.recordedDevice', { machine: show.machine ?? '' })
        : cloud
          ? t('preview.stage.toCloud')
          : t('preview.stage.toDevice');
  const badge = recorded ? (cloud ? t('badge.recordedCloud') : t('badge.recorded')) : cloud ? t('badge.cloud') : t('badge.onDevice');
  // What a device reading is doing right now, under the stage line (the same words as the status line).
  const detail = show.phase === 'out' && stage && stage !== 'sending-after-device' ? t(dynamicKey(`preview.stage.${STAGE_SUFFIX[stage]}`)) : show.route === 'cloud-after-device' && show.phase === 'out' ? t('preview.stage.sendingAfterDevice') : null;

  return (
    <div className="reading-show" data-testid="reading-show" data-route={show.route} data-way={cloud ? 'cloud' : 'device'} data-phase={show.phase}>
      <div className="rs-panel" ref={panel} tabIndex={-1} role="group" aria-label={t('preview.title')}>
        <p className="rs-head" role="status">
          <strong className={`badge ${cloud ? 'badge-cloud' : 'badge-device'}`} data-testid="reading-show-badge">
            {badge}
          </strong>
          <span key={`${show.phase}-${show.route}`} className="rs-sentence" data-testid="reading-show-stage">
            {sentence}
          </span>
        </p>
        <div className="rs-stage">
          {/* Where the model is: inside this device's block, or outside it in the cloud. */}
          <div className="rs-model" data-testid="reading-show-model">
            <span className="rs-model-icon" aria-hidden="true">
              {cloud ? <Cloud size={20} /> : <Phone size={20} />}
            </span>
            <span className="rs-model-text">
              <span className="rs-model-name">{cloud ? 'Firebase AI Logic' : recorded ? t('show.modelOn', { machine: show.machine ?? '' }) : t('show.deviceModel')}</span>
              <span className="rs-model-where">{cloud ? t('show.inCloud') : t('show.seesPlaceholders')}</span>
            </span>
          </div>
          <div className="rs-track" aria-hidden="true">
            {cloud && <span className="rs-edge" />}
            {travelling.map((id, i) => (
              <span key={`${show.phase}-${id}-${i}`} className={`rs-packet ph-${id[0]}`} style={{ '--i': i, '--n': travelling.length } as CSSProperties}>
                {id}
              </span>
            ))}
          </div>
          <div className="rs-device">
            <span className="rs-device-label">{t('show.thisDevice')}</span>
            {show.phase === 'out' ? (
              <pre className="rs-doc" data-testid="reading-show-lines">
                {lines.map((line, i) => (
                  <span key={i} className="rs-line">
                    {line.split(PLACEHOLDER).map((part, j) =>
                      j % 2 === 1 ? (
                        <span key={j} className="rs-chip">
                          {part}
                        </span>
                      ) : (
                        <span key={j}>{part}</span>
                      ),
                    )}
                  </span>
                ))}
              </pre>
            ) : (
              <ul className="rs-pairs" data-testid="reading-show-pairs">
                {show.pairs.map((p, i) => (
                  <li key={p.field} className="rs-pair" style={{ '--i': i } as CSSProperties} data-ref={p.ref}>
                    <span className="rs-pair-field">{t(dynamicKey(`field.${docType}.${p.field}`))}</span>
                    <span className="rs-pair-turn">
                      <span className="rs-chip">{p.ref}</span>
                      <span className="rs-arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="rs-value">{p.value}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="rs-foot">
          <span className="rs-reason" data-testid="reading-show-reason">
            {t(dynamicKey(`reason.${REASON[show.route]}`))}
          </span>
          {show.phase === 'back' ? t('show.putBack') : t('show.valuesStay')}
        </p>
        {detail && <p className="rs-detail">{detail}</p>}
      </div>
    </div>
  );
}

/** The routing reason shown with the badge (shared/routing.json). */
const REASON = {
  device: 'document-silhouette-only',
  cloud: 'document-silhouette-only',
  'cloud-after-device': 'on-device-failed',
  'recorded-device': 'recorded-on-device',
  'recorded-cloud': 'recorded-in-cloud',
} as const satisfies Record<ShowRoute, string>;

const STAGE_SUFFIX = {
  'device-reading': 'deviceReading',
  'device-gross': 'deviceGross',
  'device-deductions': 'deviceDeductions',
  checking: 'checking',
  'sending-after-device': 'sendingAfterDevice',
} as const satisfies Record<PointerStage, string>;
