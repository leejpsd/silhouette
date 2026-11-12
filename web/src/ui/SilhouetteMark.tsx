// The verdict mark: a head-and-shoulders silhouette whose fill encodes the verdict.
// likely = solid, maybe = half filled, depends = dashed outline, unlikely = faint outline.
// Always paired with text; never the only signal (WCAG 1.4.1).
import { useId } from 'react';
import type { Verdict } from '../core/rules';

const HEAD = 'M24 6a8.5 8.5 0 1 1 0 17a8.5 8.5 0 0 1 0-17z';
const BODY = 'M7 42c0-9.4 7.6-15 17-15s17 5.6 17 15z';

export function SilhouetteMark({ verdict, size = 40 }: { verdict: Verdict | 'brand'; size?: number }) {
  const clip = useId();
  const color = verdict === 'brand' ? 'var(--color-primary)' : `var(--color-verdict-${verdict})`;
  const outline = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinejoin: 'round' as const };
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {verdict === 'maybe' && (
        <defs>
          <clipPath id={clip}>
            <rect x="0" y="0" width="24" height="48" />
          </clipPath>
        </defs>
      )}
      {(verdict === 'likely' || verdict === 'brand') && (
        <g fill={color}>
          <path d={HEAD} />
          <path d={BODY} />
        </g>
      )}
      {verdict === 'maybe' && (
        <>
          <g fill={color} clipPath={`url(#${clip})`}>
            <path d={HEAD} />
            <path d={BODY} />
          </g>
          <g {...outline}>
            <path d={HEAD} />
            <path d={BODY} />
          </g>
        </>
      )}
      {verdict === 'depends' && (
        <g {...outline} strokeDasharray="4 3.2">
          <path d={HEAD} />
          <path d={BODY} />
        </g>
      )}
      {verdict === 'unlikely' && (
        <g {...outline} strokeWidth={1.5} opacity={0.75}>
          <path d={HEAD} />
          <path d={BODY} />
        </g>
      )}
    </svg>
  );
}
