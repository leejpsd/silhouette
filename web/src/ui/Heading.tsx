// Screen heading. Receives focus when the screen changes (not on first load) so keyboard and
// screen reader users land on the new content (WCAG 2.4.3).
import { useEffect, useRef, type ReactNode } from 'react';

let firstScreen = true;

export function ScreenHeading({ children, id }: { children: ReactNode; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
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
