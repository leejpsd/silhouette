// Components of the design that every screen shares: verdict markers by fill, document cards, token
// chips, the counter, sheets, and the size-step rule for display text.
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { Verdict } from '../../core/rules';
import { Close } from './icons';
import { DISPLAY_SCALE_CAP, HEADLINE_FLOOR, WIDE_FROM } from '../tokens';

/**
 * Results are told apart by how full the circle is: filled = may qualify, half = possible, dashed ring =
 * depends on an answer, thin ring = probably not. The verdict word always stands next to it.
 */
export function Marker({ verdict }: { verdict: Verdict | 'unanswered' }) {
  return (
    <svg className={`marker marker-${verdict}`} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {verdict === 'likely' ? (
        <circle cx="10" cy="10" r="8" fill="currentColor" />
      ) : verdict === 'maybe' ? (
        <>
          <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 2.75a7.25 7.25 0 000 14.5z" fill="currentColor" />
        </>
      ) : verdict === 'depends' ? (
        <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.6 2.4" />
      ) : verdict === 'unlikely' ? (
        <circle className="marker-thin" cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
      ) : (
        <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="0.1 3.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** A small spinning ring: work in progress on this device (reading, writing an answer). */
export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/** A document or request on a white card (the person's data, or what would be sent). */
export function Paper({ children, size = 'normal', className, ...rest }: {
  children: ReactNode;
  size?: 'normal' | 'large' | 'small';
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>) {
  return (
    <div className={`paper paper-${size}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </div>
  );
}

/** A token chip over a hidden value, with its id. `mine`: a word the person hid. */
export function Bar({ id, label, mine = false }: { id: string; label: string; mine?: boolean }) {
  return (
    <span className={`bar${mine ? ' bar-mine' : ''}`} role="img" aria-label={label}>
      <span aria-hidden="true">{id}</span>
    </span>
  );
}

/** The count of what has left: an empty ring at 0, a solid redact disc (a pill from 10) once anything left. */
export function Count({ value }: { value: number }) {
  if (value === 0) return <span className="count">0</span>;
  return (
    <span className={`count count-sent${value >= 10 ? ' count-pill' : ''}`}>
      <span>{value}</span>
    </span>
  );
}

/**
 * A sheet: on narrow screens the dock grown into a bottom sheet over the dimmed page; on wide screens a
 * centred modal. Modal (`<dialog>`): focus moves in and returns to `returnFocus` when it closes.
 */
export function Sheet({
  open,
  label,
  labelledBy,
  onClose,
  closeLabel,
  children,
  footer,
  testId,
  returnFocus,
  count,
}: {
  open: boolean;
  /** The small title at the top of the sheet. */
  label: string;
  /** Id of the element that names the dialog (its headline); the small title when absent. */
  labelledBy?: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
  returnFocus?: RefObject<HTMLElement | null>;
  /** The "Leaving your device" count, kept in view at the foot of the sheet. */
  count?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      d.close();
      returnFocus?.current?.focus();
    }
  }, [open, returnFocus]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy ?? `${id}-label`}
      data-testid={testId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the dimmed glimpse above the sheet closes it.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-body">
        <span className="grab" aria-hidden="true" />
        <div className="sheet-head">
          <p className="sheet-label" id={`${id}-label`}>
            {label}
          </p>
          <button type="button" className="icon-button" aria-label={closeLabel} onClick={onClose}>
            <Close />
          </button>
        </div>
        <div className="sheet-content">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
        {count}
      </div>
    </dialog>
  );
}

/**
 * The size-step rule (tokens typography.sizeSteps): start at the design size and step down until no
 * word overflows and the text fits `maxLines`; never below `floor` of the design size. Runs again when
 * the width or the text changes, and when the web fonts arrive.
 */
export function useFit(
  ref: RefObject<HTMLElement | null>,
  design: number,
  { maxLines = 4, step = 4, floor = HEADLINE_FLOOR, wideDesign }: { maxLines?: number; step?: number; floor?: number; wideDesign?: number | undefined } = {},
  deps: readonly unknown[] = [],
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // Display type scales with the text size up to the cap (root font size relative to 16 px).
      // Headlines on wide screens start at their PC size (typography displayPc / titlePc).
      const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
      const scaled = Math.min(Math.max(root, 1), DISPLAY_SCALE_CAP);
      const start = wideDesign !== undefined && window.innerWidth >= WIDE_FROM ? wideDesign * scaled : design * scaled;
      const min = start * floor;
      let size = start;
      el.style.fontSize = `${size}px`;
      const fits = () => {
        const line = Number.parseFloat(getComputedStyle(el).lineHeight) || size;
        const lines = Math.round(el.scrollHeight / line);
        return el.scrollWidth <= el.clientWidth + 1 && lines <= maxLines;
      };
      while (!fits() && size - step >= min) {
        size -= step;
        el.style.fontSize = `${size}px`;
      }
    };
    // Until the display face has arrived, the step chosen with the fallback face could change a moment
    // later (a visible snap): the text waits, hidden, for the face (at most a second), then fits once.
    const style = getComputedStyle(el);
    const face = `${style.fontWeight} 16px ${style.fontFamily.split(',')[0]?.trim() ?? ''}`;
    const waiting = document.fonts !== undefined && !document.fonts.check(face);
    let live = true;
    if (waiting) {
      el.style.visibility = 'hidden';
      void Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1000))]).then(() => {
        if (!live) return;
        fit();
        el.style.visibility = '';
      });
    } else fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(el.parentElement ?? el);
    if (!waiting) void document.fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
      el.style.visibility = '';
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, maxLines, step, floor, wideDesign, ...deps]);
}

/** Display text that steps down to fit (for program names, amounts and similar). */
export function FitText({ as: Tag = 'span', size, maxLines = 2, step = 4, floor = HEADLINE_FLOOR, className, children, ...rest }: {
  as?: 'span' | 'h1' | 'h2' | 'p' | 'div';
  size: number;
  maxLines?: number;
  step?: number;
  floor?: number;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  const ref = useRef<HTMLElement>(null);
  useFit(ref, size, { maxLines, step, floor }, [children]);
  return (
    <Tag ref={ref as never} className={className} {...rest}>
      {children}
    </Tag>
  );
}

/** The label of a main action (text 17 / 700; it wraps rather than shrinking). */
export function ActionLabel({ children }: { children: ReactNode }) {
  return <span className="action-label">{children}</span>;
}
