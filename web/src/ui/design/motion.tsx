// How the interface behaves under the hand, in one place: what opens comes into view and takes focus,
// and nothing moves when the person asked for reduced motion. The durations, curves and distances are
// the motion tokens (shared/design/tokens.json, motion.use); the keyframes and transitions that use
// them are in styles.css under "Motion".
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

export const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The nearest ancestor that scrolls (a sheet's content, a long card); null when the page itself scrolls. */
function scrollBox(el: Element): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

const px = (value: string): number => Number.parseFloat(value) || 0;

export interface IntoView {
  /** The height the element will have once it has finished opening (it may still be growing). */
  height?: number;
  /** Receives focus, without a scroll jump of its own. */
  focus?: HTMLElement | null | undefined;
  /** Room kept between the element and the edges it must stay clear of. */
  margin?: number;
  /** Never animated (a correction while typing must not swim). */
  instant?: boolean;
}

/**
 * Brings an element fully into view: clear of the dock at the bottom (--block-covers, measured in
 * design/block.tsx), of the on-screen keyboard (the visual viewport) and of the top of the scroll area.
 * When it is taller than the room there is, its top wins. Scrolls only as far as needed and only when
 * needed, smoothly unless reduced motion is asked for.
 */
export function bringIntoView(el: Element | null | undefined, { height, focus, margin = 16, instant = false }: IntoView = {}): void {
  focus?.focus({ preventScroll: true });
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const size = Math.max(height ?? 0, rect.height);
  const box = scrollBox(el);
  const viewport = window.visualViewport;
  const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  let top: number;
  let bottom: number;
  if (box) {
    const frame = box.getBoundingClientRect();
    top = frame.top + margin;
    bottom = Math.min(frame.bottom, visibleBottom) - margin;
  } else {
    const root = getComputedStyle(document.documentElement);
    const covers = px(root.getPropertyValue('--block-covers'));
    // With the keyboard up the dock sits behind it on some systems: whichever edge is higher counts.
    top = (viewport?.offsetTop ?? 0) + margin;
    bottom = Math.min(window.innerHeight - covers, visibleBottom) - margin;
  }
  let delta = 0;
  if (rect.top + size > bottom) delta = rect.top + size - bottom;
  if (rect.top - delta < top) delta = rect.top - top;
  if (Math.abs(delta) < 1) return;
  const behavior: ScrollBehavior = instant || reducedMotion() ? 'auto' : 'smooth';
  (box ?? window).scrollBy({ top: delta, behavior });
}

/**
 * Keeps an element in view while it opens. The page can only scroll as far as it is tall, and it is
 * still growing: following the growth frame by frame makes the scroll and the opening one movement.
 * With reduced motion there is no growth and the first frame is the last. Returns a cancel function.
 */
export function followGrowth(el: Element, duration?: number): () => void {
  const style = getComputedStyle(el);
  const seconds = (value: string) => Math.max(0, ...value.split(',').map((part) => (part.trim().endsWith('ms') ? px(part) / 1000 : px(part))));
  const ms = reducedMotion() ? 0 : (duration ?? Math.max(seconds(style.transitionDuration), seconds(style.animationDuration)) * 1000);
  const until = performance.now() + ms + 50;
  // On wide screens the screen's action row stands under the content: it stays in view too when there
  // is room for both (the part that opened wins when there is not).
  const actions = el.closest('.screen')?.querySelector(':scope > .screen-actions') ?? null;
  let frame = 0;
  const follow = () => {
    bringIntoView(actions, { instant: true });
    bringIntoView(el, { instant: true });
    if (performance.now() < until) frame = requestAnimationFrame(follow);
  };
  frame = requestAnimationFrame(follow);
  return () => cancelAnimationFrame(frame);
}

const FIRST_FIELD = 'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';

/**
 * Something that opens under the control that asked for it (a field under a choice, the body of a
 * disclosure). It grows and fades in together, is brought fully into view while it grows, and its first
 * field takes focus when `focus` is set. Render it only while it is open.
 */
export function Reveal({ children, className, focus = false, id, testId }: { children: ReactNode; className?: string; focus?: boolean; id?: string; testId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (focus) el.querySelector<HTMLElement>(FIRST_FIELD)?.focus({ preventScroll: true });
    return followGrowth(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} id={id} className={`reveal${className ? ` ${className}` : ''}`} data-testid={testId}>
      <div className="reveal-inner">{children}</div>
    </div>
  );
}

let lastOrder: number | null = null;

/**
 * The direction of travel through an ordered flow (the questions): 'forward' when this step comes after
 * the one shown before, 'back' when before, 'none' on first arrival. The screen sets it as data-enter.
 */
export function useTravel(order: number): 'forward' | 'back' | 'none' {
  const direction = useRef<'forward' | 'back' | 'none'>(lastOrder === null || lastOrder === order ? 'none' : order > lastOrder ? 'forward' : 'back');
  useLayoutEffect(() => {
    lastOrder = order;
  }, [order]);
  return direction.current;
}

/** Leaving the flow: the next arrival is a first arrival again. */
export function forgetTravel(): void {
  lastOrder = null;
}

const isTextField = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['radio', 'checkbox', 'button', 'submit', 'file', 'range'].includes(el.type));

/**
 * The on-screen keyboard arrives a moment after a field takes focus and takes the lower part of the
 * screen with it. Whenever the visible area changes while a field has focus, the field (with the part
 * that opened around it, when there is one) is brought back into view.
 */
export function useKeyboardFollow(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const follow = () => {
      const field = document.activeElement;
      if (!isTextField(field)) return;
      bringIntoView(field.closest('.reveal, .field') ?? field, { instant: true });
    };
    viewport.addEventListener('resize', follow);
    return () => viewport.removeEventListener('resize', follow);
  }, []);
}

/**
 * Every disclosure behaves the same way, wherever it is: a button with aria-expanded and aria-controls,
 * or a native <details>. When one opens, what it opened grows in (styles.css, .is-opening), is kept in
 * view while it grows, and a field marked data-autofocus inside it takes focus. Closing leaves focus on
 * the control and the page where it is.
 */
export function useDisclosures(): void {
  useEffect(() => {
    const opened = (body: HTMLElement) => {
      body.classList.add('is-opening');
      const done = () => body.classList.remove('is-opening');
      body.addEventListener('animationend', done, { once: true });
      setTimeout(done, 600);
      const field = body.matches('[data-autofocus]') ? body : body.querySelector<HTMLElement>('[data-autofocus]');
      field?.focus({ preventScroll: true });
      followGrowth(body);
    };
    const onClick = (e: MouseEvent) => {
      const control = (e.target as Element | null)?.closest?.('[aria-expanded][aria-controls]');
      if (!control) return;
      const was = control.getAttribute('aria-expanded');
      // After the screen has rendered the new state.
      requestAnimationFrame(() => {
        if (was === 'true' || control.getAttribute('aria-expanded') !== 'true') return;
        const body = document.getElementById(control.getAttribute('aria-controls') ?? '');
        if (body) opened(body);
      });
    };
    const onToggle = (e: Event) => {
      const details = e.target;
      // Its content grows by the reveal duration (styles.css, ::details-content).
      if (details instanceof HTMLDetailsElement && details.open) followGrowth(details, px(getComputedStyle(document.documentElement).getPropertyValue('--duration-reveal')));
    };
    // In the capture phase: the control still shows the state it had before this click.
    document.addEventListener('click', onClick, true);
    document.addEventListener('toggle', onToggle, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('toggle', onToggle, true);
    };
  }, []);
}

/** Shows a keycap going down for a moment when its key is used (a <kbd data-key="…"> on the screen). */
export function pressKey(key: string): void {
  for (const cap of document.querySelectorAll<HTMLElement>(`kbd[data-key="${key}"]`)) {
    cap.dataset.down = 'true';
    setTimeout(() => delete cap.dataset.down, 160);
  }
}
