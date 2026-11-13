// Components of the design that every screen shares: verdict markers by shape, paper slips, placeholder
// bars, the stamped count, sheets, and the size-step rule for display text.
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { Verdict } from '../../core/rules';
import { Close } from './icons';

/** Results are told apart by shape: solid = may qualify, dotted = possible, dashed = depends, hollow = probably not. */
export function Marker({ verdict }: { verdict: Verdict | 'unanswered' }) {
  return <span className={`marker marker-${verdict}`} aria-hidden="true" />;
}

/** A paper slip: the person's data or what would be sent. Always green ink on paper, slightly turned. */
export function Paper({ children, tilt = 'none', size = 'normal', className, ...rest }: {
  children: ReactNode;
  tilt?: 'left' | 'right' | 'small-left' | 'small-right' | 'none';
  size?: 'normal' | 'large' | 'small';
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className'>) {
  return (
    <div className={`paper paper-${size} tilt-${tilt}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </div>
  );
}

/** A placeholder bar over a hidden value, with its id. `mine`: a word the person hid. */
export function Bar({ id, label, mine = false, width, delay = 0 }: { id: string; label: string; mine?: boolean; width?: number; delay?: number }) {
  return (
    <span
      className={`bar${mine ? ' bar-mine' : ''}`}
      style={{ ...(width ? { inlineSize: `${width}px` } : {}), animationDelay: `${delay}ms` }}
      role="img"
      aria-label={label}
    >
      <span aria-hidden="true">{id}</span>
    </span>
  );
}

/** The count of what has left: plain at 0, a pink stamp (a pill from 10) that stamps in when it goes up. */
export function Count({ value }: { value: number }) {
  if (value === 0) return <span className="count">0</span>;
  return (
    <span key={value} className={`stamp${value >= 10 ? ' stamp-pill' : ''}`}>
      <span>{value}</span>
    </span>
  );
}

/**
 * A sheet: the block grown over the lower screen, with a dimmed glimpse of the page above. Modal
 * (`<dialog>`): focus moves in and returns to `returnFocus` when it closes.
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
      </div>
    </dialog>
  );
}

/**
 * The size-step rule (tokens typography.sizeSteps): start at the design size and step down until no
 * word overflows and the text fits `maxLines`; never below `floor` of the design size. Runs again when
 * the width or the text changes, and when the web fonts arrive.
 */
export function useFit(ref: RefObject<HTMLElement | null>, design: number, { maxLines = 4, step = 4, floor = 0.6 }: { maxLines?: number; step?: number; floor?: number } = {}, deps: readonly unknown[] = []) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // Display type scales with the text size up to 1.3x (root font size relative to 16 px).
      const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
      const start = design * Math.min(Math.max(root, 1), 1.3);
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
    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(el.parentElement ?? el);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, maxLines, step, floor, ...deps]);
}

/** Display text that steps down to fit (for program names, amounts and similar). */
export function FitText({ as: Tag = 'span', size, maxLines = 2, step = 4, floor = 0.6, className, children, ...rest }: {
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

/** The label of a main action: steps down 2 px at a time (to 66 %), then wraps to two lines. */
export function ActionLabel({ children, size = 30 }: { children: ReactNode; size?: number }) {
  return (
    <FitText className="action-label" size={size} maxLines={2} step={2} floor={0.66}>
      {children}
    </FitText>
  );
}
