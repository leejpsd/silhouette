// Line icons of the design (stroke in the current text colour). Always decorative: the text next to
// them carries the meaning.
import type { ReactNode } from 'react';

function Svg({ size = 20, view = 20, children, stroke = 2, className }: { size?: number; view?: number; children: ReactNode; stroke?: number; className?: string }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox={`0 0 ${view} ${view}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ArrowRight = () => (
  <Svg view={22} stroke={2.6}>
    <path d="M3 11h16M12 4l7 7-7 7" />
  </Svg>
);
export const ArrowUp = () => (
  <Svg stroke={2.4}>
    <path d="M10 15V7M5 8l5-5 5 5M4 18h12" />
  </Svg>
);
export const ChevronLeft = () => (
  <Svg size={16} view={16} stroke={2.2}>
    <path d="M10 3L5 8l5 5" />
  </Svg>
);
export const ChevronRight = () => (
  <Svg size={18} view={18} stroke={2.2}>
    <path d="M7 4l5 5-5 5" />
  </Svg>
);
export const Close = () => (
  <Svg size={18} view={18} stroke={2.2}>
    <path d="M3 3l12 12M15 3L3 15" />
  </Svg>
);
export const Cloud = ({ size = 18 }: { size?: number }) => (
  <Svg size={size} view={22}>
    <path d="M6.5 17h9.5a4 4 0 00.6-7.95A6 6 0 005 10.5 3.3 3.3 0 006.5 17z" />
  </Svg>
);
export const Phone = ({ size = 18 }: { size?: number }) => (
  <Svg size={size} view={20}>
    <rect x="6" y="2.5" width="8" height="15" rx="2" />
    <path d="M9 15h2" />
  </Svg>
);
export const Lock = () => (
  <Svg>
    <rect x="4" y="9" width="12" height="9" rx="2.5" />
    <path d="M7 9V7a3 3 0 016 0v3" />
  </Svg>
);
export const Check = ({ size = 20 }: { size?: number }) => (
  <svg className="icon icon-check" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
    <circle cx="10" cy="10" r="10" fill="currentColor" />
    <path d="M5.5 10.5l3 3 6-6.5" fill="none" className="icon-check-mark" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const CrossCircle = () => (
  <Svg size={16} view={16} stroke={1.6}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
  </Svg>
);
export const Minus = () => (
  <Svg size={14} view={14} stroke={1.8}>
    <circle cx="7" cy="7" r="6" />
    <path d="M4.5 7h5" />
  </Svg>
);
export const Alert = () => (
  <Svg size={18} view={20}>
    <path d="M10 3l8 14H2z" />
    <path d="M10 8v4M10 14.5v.5" />
  </Svg>
);
export const Trash = () => (
  <Svg size={18} view={20}>
    <path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11" />
  </Svg>
);
export const Search = () => (
  <Svg size={48} view={24} stroke={1.8}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L21 21" />
  </Svg>
);
export const Pin = () => (
  <Svg size={48} view={24} stroke={1.8}>
    <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
);
export const Camera = () => (
  <Svg view={20}>
    <path d="M3 6.5h3l1.5-2h5l1.5 2h3v9.5H3z" />
    <circle cx="10" cy="11" r="3" />
  </Svg>
);
export const Doc = () => (
  <Svg view={20}>
    <path d="M5 2.5h7l3 3v12H5z" />
    <path d="M8 9h4M8 12h4" />
  </Svg>
);
export const Clipboard = () => (
  <Svg view={20}>
    <rect x="4.5" y="3.5" width="11" height="14" rx="2" />
    <path d="M8 3.5h4M8 8h4M8 11h4M8 14h2" />
  </Svg>
);
export const Keyboard = () => (
  <Svg view={20}>
    <rect x="2.5" y="5" width="15" height="10" rx="2" />
    <path d="M5.5 8h1M9.5 8h1M13.5 8h1M6 12h8" />
  </Svg>
);
export const Retry = () => (
  <Svg size={16} view={16} stroke={1.8}>
    <path d="M13 8a5 5 0 11-1.5-3.5M13 2.5v3h-3" />
  </Svg>
);
export const Speaker = () => (
  <Svg size={18} view={20}>
    <path d="M3 8v4h3l4 3V5L6 8z" />
    <path d="M13 7.5a3.5 3.5 0 010 5M15 5.5a6.5 6.5 0 010 9" />
  </Svg>
);
export const Caret = ({ open }: { open: boolean }) => (
  <svg className="icon caret" width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" focusable="false" data-open={open}>
    <path d="M1.5 3.5h9L6 9.5z" />
  </svg>
);
