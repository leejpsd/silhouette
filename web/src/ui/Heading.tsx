// Screen heading: the display headline. Receives focus when the screen changes (not on first load)
// so keyboard and screen reader users land on the new content (WCAG 2.4.3). Its size follows the
// size-step rule: it starts at the design size and steps down until it fits its line limit.
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useFit } from './design/parts';

let firstScreen = true;

export function ScreenHeading({
  children,
  id,
  headingRef,
  size = 56,
  maxLines = 4,
  leading = 'normal',
}: {
  children: ReactNode;
  id?: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /** Design size in px: Start 60, questions 56, results 62, review 50. */
  size?: number;
  maxLines?: number;
  leading?: 'normal' | 'tight';
}) {
  const own = useRef<HTMLHeadingElement>(null);
  const ref = headingRef ?? own;
  useFit(ref, size, { maxLines, wide: true }, [children]);
  useEffect(() => {
    if (firstScreen) {
      firstScreen = false;
      return;
    }
    ref.current?.focus();
  }, [ref]);
  return (
    <h1 ref={ref} tabIndex={-1} id={id} className={`display rise${leading === 'tight' ? ' tight' : ''}`} style={{ '--design': size } as CSSProperties}>
      {children}
    </h1>
  );
}
