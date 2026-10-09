import type { ReactNode, SVGProps } from "react";

const paths: Record<string, ReactNode> = {
  headphones: <><path d="M3 14v-3a9 9 0 0 1 18 0v3" /><rect x="2" y="12" width="5" height="9" rx="2" /><rect x="17" y="12" width="5" height="9" rx="2" /></>,
  play: <path d="m8 3 13 9-13 9Z" />,
  pause: <><path d="M8 3v18M16 3v18" /></>,
  network: <><rect x="8" y="1" width="8" height="6" rx="1" /><path d="M12 7v5M4 16v-4h16v4" /><rect x="1" y="16" width="6" height="7" rx="1" /><rect x="17" y="16" width="6" height="7" rx="1" /><path d="M12 12v8" /></>,
  home: <><path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10" /><path d="m3 7 9-5 9 5M17 3h3v5" /></>,
  book: <><path d="M12 5c-3-3-7-3-10-2v17c3-1 7-1 10 2 3-3 7-3 10-2V3c-3-1-7-1-10 2Z" /><path d="M12 5v17" /></>,
  video: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m10 8 6 4-6 4Z" /></>,
  document: <><path d="M5 2h9l5 5v15H5Z" /><path d="M14 2v6h5M8 12h8M8 16h8" /></>,
  quiz: <><rect x="3" y="2" width="18" height="20" rx="2" /><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17v.5" /></>,
  folder: <path d="M2 5h8l2 3h10v13H2ZM2 8h20" />,
  users: <><circle cx="12" cy="7" r="3" /><path d="M7 21v-5a5 5 0 0 1 10 0v5M3 21v-4a4 4 0 0 1 3-4M21 21v-4a4 4 0 0 0-3-4M4 3a3 3 0 0 1 0 6M20 3a3 3 0 0 0 0 6M9 17h6" /></>,
  chart: <><path d="M3 21h19M5 21v-6h4v6M11 21V9h4v12M17 21V4h4v17M3 11l6-6 5 1 7-5" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 10v7M12 6v1" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="1" /><path d="m2 5 10 9L22 5" /></>,
  feedback: <><path d="M21 11a9 9 0 0 1-9 9H4l-3 3V11a10 10 0 0 1 20 0Z" /><path d="M6 8h10M6 12h10M6 16h6" /></>,
  search: <><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 6 6" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><ellipse cx="12" cy="12" rx="4.5" ry="10" /><path d="M2 12h20M4 6h16M4 18h16" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" /></>,
  moon: <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z" />,
  bell: <><path d="M5 9a7 7 0 0 1 14 0c0 8 3 8 3 10H2c0-2 3-2 3-10ZM9 22h6M12 1v2" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M7 2v5M17 2v5M3 10h18M7 14h2M13 14h2M7 18h2" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><path d="M12 5v7l5 3" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="18" rx="2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M8 11h8M8 15h8M8 19h5" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  next: <path d="m9 5 7 7-7 7" />,
  arrow: <path d="M21 12H3m5-5-5 5 5 5" />,
  menu: <path d="M3 5h18M3 12h18M3 19h18" />,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  assistant: <><path d="M4 15a7 7 0 0 1 11-9M4 15v6l4-3h7a6 6 0 0 0 6-6" /><path d="m18 2 1.5 4.5L24 8l-4.5 1.5L18 14l-1.5-4.5L12 8l4.5-1.5Z" /><path d="M8 12h3M8 15h7" /></>,
  download: <><path d="M12 2v13m-5-5 5 5 5-5M3 16v5h18v-5" /></>,
  print: <><path d="M6 8V2h12v6M6 17H3V8h18v9h-3M6 14h12v8H6Z" /><path d="M17 11h1" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 22v-2a8 8 0 0 1 16 0v2" /></>,
  settings: <><circle cx="12" cy="12" r="4" /><path d="m9 2-1 3-3 1-3 3 2 3-1 3 3 3 3-1 3 2 3-2 3 1 3-3-1-3 2-3-3-3-3-1-1-3Z" /></>,
};

export function PlatformIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name] ?? paths.document}</svg>;
}
