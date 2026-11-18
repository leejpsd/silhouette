// The privacy dock: on narrow screens, the screen's one main action (provided by the screen through
// <BlockActions>) above the "Leaving your device" count row, at the bottom of every screen. From
// layout.wide.from the dock is the foot of the rail (the count row and Details) and the screen's
// actions stand in the content, where the screen puts them.
// Modes: compact (count row only), standard (action row + count row), decision (routing line,
// keep / send, count row). When the dock would cover more than 40 % of the screen it scrolls with
// the content and only the count row stays pinned.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TWO_COLUMNS_FROM, WIDE_FROM } from '../tokens';

export type BlockMode = 'compact' | 'standard' | 'decision';

interface BlockContextValue {
  readonly slot: HTMLElement | null;
  setSlot(el: HTMLElement | null): void;
  readonly mode: BlockMode;
  /** The registration whose actions the block shows: the latest one (a decision opened over a page). */
  readonly top: number | null;
  register(id: number, mode: BlockMode): () => void;
}

const BlockContext = createContext<BlockContextValue | null>(null);
let nextId = 0;

export function BlockProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [stack, setStack] = useState<{ id: number; mode: BlockMode }[]>([]);
  const last = stack[stack.length - 1];
  const value: BlockContextValue = {
    slot,
    setSlot,
    mode: last?.mode ?? 'compact',
    top: last?.id ?? null,
    register: (id, mode) => {
      setStack((s) => [...s, { id, mode }]);
      return () => setStack((s) => s.filter((r) => r.id !== id));
    },
  };
  return <BlockContext.Provider value={value}>{children}</BlockContext.Provider>;
}

function useBlock(): BlockContextValue {
  const value = useContext(BlockContext);
  if (!value) throw new Error('useBlock outside BlockProvider');
  return value;
}

/**
 * Puts a screen's main action into the bottom block. The block carries one main action: when a step
 * opens over the page (the decision before sending), its actions replace the page's until it closes.
 */
export function BlockActions({ mode = 'standard', inline = false, children }: { mode?: Exclude<BlockMode, 'compact'>; inline?: boolean; children: ReactNode }) {
  const { slot, register, top } = useBlock();
  const [id] = useState(() => ++nextId);
  const wide = useWide();
  // `inline`: actions inside a sheet or modal stay there, and the dock keeps the page's own actions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => (inline ? undefined : register(id, mode)), [mode, inline]);
  // Wide screens: the actions stay where the screen declares them, in the content.
  if (wide || inline) {
    return (
      <div className={`screen-actions block-${mode}`} data-testid="screen-actions">
        {children}
      </div>
    );
  }
  return slot && top === id ? createPortal(<div className={`block-actions-inner block-${mode}`}>{children}</div>, slot) : null;
}

/** The block itself; `count` is the count row (the "Leaving your device" bar). */
export function BottomBlock({ count, label }: { count: ReactNode; label: string }) {
  const { setSlot, mode: registered } = useBlock();
  const wide = useWide();
  const mode = wide ? 'compact' : registered;
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Wide screens: the block is a panel beside the content and never covers it.
      const wide = window.innerWidth >= WIDE_FROM;
      // The block's height as if pinned: the actions and the count row, measured the same way whether
      // or not the count row is currently pinned on its own (so the decision cannot flip back and forth).
      const actions = (el.querySelector('.block-actions') as HTMLElement | null)?.offsetHeight ?? 0;
      const count = (el.querySelector('.count-row') as HTMLElement | null)?.offsetHeight ?? 0;
      const tall = !wide && actions + count + 34 > window.innerHeight * 0.4;
      setTall(tall);
      // What the block covers at the bottom of the screen, so that scrolling a field into view (and
      // focus moving to it) keeps it above the block.
      const covers = wide ? 0 : tall ? count + 24 : el.offsetHeight;
      document.documentElement.style.setProperty('--block-covers', `${covers}px`);
      // The rail's upper part ends where its foot (the count row) begins.
      document.documentElement.style.setProperty('--rail-foot', `${wide ? el.offsetHeight : 0}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    // While a text field has focus on a touch screen, the count row shrinks to the number so the
    // block stays small above the keyboard.
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (!coarse) return;
    const isText = (el: EventTarget | null) => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['radio', 'checkbox', 'button', 'submit', 'file'].includes(el.type));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: FocusEvent) => {
      clearTimeout(timer);
      if (isText(e.target)) setTyping(true);
      // Focus moving to a button (pressing it) must not move that button mid-press either.
      else timer = setTimeout(() => setTyping(isText(document.activeElement)), 400);
    };
    // Grow back only after a tap has finished, so a button under the finger does not move mid-tap.
    const off = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setTyping(isText(document.activeElement)), 400);
    };
    document.addEventListener('focusin', on);
    document.addEventListener('focusout', off);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('focusin', on);
      document.removeEventListener('focusout', off);
    };
  }, []);

  return (
    <div ref={ref} className="block" role="region" aria-label={label} data-mode={mode} data-tall={tall} data-typing={typing} data-testid="bottom-block">
      <div className="block-actions" ref={setSlot} />
      {count}
    </div>
  );
}

/** Whether the wide layout (the rail and the content area) is in use (layout.wide.from). */
export function useWide(): boolean {
  return useMinWidth(WIDE_FROM);
}

/**
 * Whether the content area has room for two columns (layout.wide.twoColumnsFrom): the results list beside
 * a program, the two documents of the silhouette, Start's example beside its headline. Between the two
 * widths the rail is there and the content is one column.
 */
export function useTwoColumns(): boolean {
  return useMinWidth(TWO_COLUMNS_FROM);
}

function useMinWidth(from: number): boolean {
  const query = `(min-width: ${from}px)`;
  const [wide, setWide] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const on = () => setWide(list.matches);
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  }, [query]);
  return wide;
}
