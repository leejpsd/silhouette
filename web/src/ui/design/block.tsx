// The inverted bottom block: the screen's one main action (provided by the screen through
// <BlockActions>) above the "Leaving your device" count row, on every screen.
// Modes: compact (count row only), standard (action row + count row), decision (routing line,
// keep / send, count row). When the block would cover more than 40 % of the screen it scrolls with
// the content and only the count row stays pinned.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type BlockMode = 'compact' | 'standard' | 'decision';

interface BlockContextValue {
  readonly slot: HTMLElement | null;
  setSlot(el: HTMLElement | null): void;
  readonly mode: BlockMode;
  register(mode: BlockMode): () => void;
}

const BlockContext = createContext<BlockContextValue | null>(null);

export function BlockProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [modes, setModes] = useState<BlockMode[]>([]);
  const value: BlockContextValue = {
    slot,
    setSlot,
    mode: modes[modes.length - 1] ?? 'compact',
    register: (mode) => {
      setModes((m) => [...m, mode]);
      return () =>
        setModes((m) => {
          const i = m.lastIndexOf(mode);
          return i === -1 ? m : [...m.slice(0, i), ...m.slice(i + 1)];
        });
    },
  };
  return <BlockContext.Provider value={value}>{children}</BlockContext.Provider>;
}

function useBlock(): BlockContextValue {
  const value = useContext(BlockContext);
  if (!value) throw new Error('useBlock outside BlockProvider');
  return value;
}

/** Puts a screen's main action into the bottom block. */
export function BlockActions({ mode = 'standard', children }: { mode?: Exclude<BlockMode, 'compact'>; children: ReactNode }) {
  const { slot, register } = useBlock();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => register(mode), [mode]);
  return slot ? createPortal(<div className={`block-actions-inner block-${mode}`}>{children}</div>, slot) : null;
}

/** The block itself; `count` is the count row (the "Leaving your device" bar). */
export function BottomBlock({ count }: { count: ReactNode }) {
  const { setSlot, mode } = useBlock();
  const ref = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // The block's height as if pinned: the actions and the count row, measured the same way whether
      // or not the count row is currently pinned on its own (so the decision cannot flip back and forth).
      const actions = (el.querySelector('.block-actions') as HTMLElement | null)?.offsetHeight ?? 0;
      const count = (el.querySelector('.count-row') as HTMLElement | null)?.offsetHeight ?? 0;
      setTall(actions + count + 34 > window.innerHeight * 0.4);
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
    <div ref={ref} className="block" data-mode={mode} data-tall={tall} data-typing={typing} data-testid="bottom-block">
      <div className="block-actions" ref={setSlot} />
      {count}
    </div>
  );
}
