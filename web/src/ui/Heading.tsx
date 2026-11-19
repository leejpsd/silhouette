// Screen heading: the display headline. Receives focus when the screen changes (not on first load)
// so keyboard and screen reader users land on the new content (WCAG 2.4.3). Its size follows the
// size-step rule: it starts at the design size and steps down until it fits its line limit.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useFit } from './design/parts';

let firstScreen = true;

/** Every screen title at this share of its design size (narrow and wide). */
const HEADING_SCALE = 0.82;

export function ScreenHeading({
  children,
  id,
  headingRef,
  size = 46,
  wideSize = 64,
  maxLines = 4,
  leading = 'normal',
  level = 1,
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
  /** 2: a page shown inside another screen (a program beside the results list), whose own title is the h1. */
  level?: 1 | 2;
}) {
  const own = useRef<HTMLHeadingElement>(null);
  const ref = headingRef ?? own;
  // One step quieter than the design sizes everywhere: a benefits tool's titles need not fill half a screen.
  useFit(ref, Math.round(size * HEADING_SCALE), { maxLines, wideDesign: Math.round(wideSize * HEADING_SCALE) }, [children]);
  useEffect(() => {
    // Only the screen's own title takes focus on arrival.
    if (level !== 1) return;
    if (firstScreen) {
      firstScreen = false;
      return;
    }
    ref.current?.focus();
  }, [ref, level]);
  const Tag = level === 1 ? 'h1' : 'h2';
  return (
    <Tag ref={ref} tabIndex={-1} id={id} className={`display${leading === 'tight' ? ' tight' : ''}`}>
      {children}
    </Tag>
  );
}
