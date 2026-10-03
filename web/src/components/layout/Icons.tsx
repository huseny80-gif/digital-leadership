/**
 * Small inline-SVG icon set (no icon-library dependency exists in
 * package.json, and adding one just for a handful of glyphs would be
 * disproportionate — PHASE 18.1's original emoji glyphs are replaced here
 * with consistent, currentColor-driven SVGs instead).
 */
import type { SVGProps } from "react";

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.1em"
      height="1.1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </Svg>
  );
}

export function GridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </Svg>
  );
}

export function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.6a7.6 7.6 0 0 0 0-3.2l2-1.4-2-3.4-2.3.8a7.7 7.7 0 0 0-2.7-1.6L14 2h-4l-.4 2.8a7.7 7.7 0 0 0-2.7 1.6l-2.3-.8-2 3.4 2 1.4a7.6 7.6 0 0 0 0 3.2l-2 1.4 2 3.4 2.3-.8a7.7 7.7 0 0 0 2.7 1.6L10 22h4l.4-2.8a7.7 7.7 0 0 0 2.7-1.6l2.3.8 2-3.4-2-1.4Z" />
    </Svg>
  );
}

export function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20.2a7.6 7.6 0 0 1 15 0" />
    </Svg>
  );
}

export function InfoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </Svg>
  );
}

export function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a13 13 0 0 1 0 18 13 13 0 0 1 0-18Z" />
    </Svg>
  );
}

export function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M7 10l5 5 5-5" />
    </Svg>
  );
}

export function HamburgerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}


export function BookIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z"/></Svg>;
}
export function VideoIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/></Svg>;
}
export function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></Svg>;
}
export function QuizIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9.8 9a2.4 2.4 0 1 1 3.8 2c-1 .7-1.6 1.1-1.6 2M12 17h.01"/></Svg>;
}
export function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><path d="M3 6h7l2 2h9v11H3z"/></Svg>;
}
export function CommunityIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><circle cx="8" cy="9" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0M13.5 14a4.5 4.5 0 0 1 8 3"/></Svg>;
}
export function ChartIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></Svg>;
}
export function MailIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></Svg>;
}
export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></Svg>;
}
export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return <Svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Svg>;
}
