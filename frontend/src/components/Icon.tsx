import type { ReactNode } from 'react';

const paths = {
  user: <><circle cx="12" cy="8" r="3.2"/><path d="M5 20v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2"/></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6"/>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>,
  download: <><path d="M12 4v12m-5-5 5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zm0 0v6h6M8 13h8m-8 4h5"/></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
  drive: <><path d="m3.3 13 2.1-7a2 2 0 0 1 2-1.4h9.2A2 2 0 0 1 18.5 6l2.2 7"/><rect x="3" y="13" width="18" height="6.5" rx="2"/><path d="M7 16.2h.1m3 0h.1"/></>,
  copy: <><path d="M8 16H6a2.5 2.5 0 0 1-2.5-2.5v-8A2.5 2.5 0 0 1 6 3h8a2.5 2.5 0 0 1 2.5 2.5v2"/><rect x="8" y="8" width="12.5" height="13" rx="2.5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12m-8 4v5m4-5v5"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
  exit: <><path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h6m5-13 5 5-5 5m5-5H9"/></>,
  calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/></>,
  count: <path d="m10 3-4 18M18 3l-4 18M4 9h16M3 15h16"/>,
  link: <><path d="m10 13 4-4m-5 6-2 2a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m2 0 2-2a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0"/></>,
} satisfies Record<string, ReactNode>;

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
