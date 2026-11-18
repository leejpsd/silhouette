// Screen heading: the display headline. Receives focus when the screen changes (not on first load)
// so keyboard and screen reader users land on the new content (WCAG 2.4.3). Its size follows the
// size-step rule: it starts at the design size and steps down until it fits its line limit.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useFit } from './design/parts';

let firstScreen = true;

export function ScreenHeading({
  children,
  id,
  headingRef,
  size = 46,
  wideSize = 64,
  maxLines = 4,
  leading = 'normal',
}: {
  children: ReactNode;
  id?: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** Design size in px on narrow screens: Start and results 54, the other screens 46. */
  size?: number;
  /** Design size from layout.wide.from: Start 104, the other screens 64. */
  wideSize?: number;
  maxLines?: number;
  leading?: 'normal' | 'tight';
}) {
  const own = useRef<HTMLHeadingElement>(null);
  const ref = headingRef ?? own;
  useFit(ref, size, { maxLines, wideDesign: wideSize }, [children]);
  useEffect(() => {
    if (firstScreen) {
      firstScreen = false;
      return;
    }
    ref.current?.focus();
  }, [ref]);
  return (
    <h1 ref={ref} tabIndex={-1} id={id} className={`display${leading === 'tight' ? ' tight' : ''}`}>
      {children}
    </h1>
  );
}
