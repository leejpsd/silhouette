// Screen heading. Receives focus when the screen changes (not on first load) so keyboard and
// screen reader users land on the new content (WCAG 2.4.3).
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

let firstScreen = true;

export function ScreenHeading({ children, id, headingRef }: { children: ReactNode; id?: string; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  const own = useRef<HTMLHeadingElement>(null);
  const ref = headingRef ?? own;
  useEffect(() => {
    if (firstScreen) {
      firstScreen = false;
      return;
    }
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} id={id}>
      {children}
    </h1>
  );
}
