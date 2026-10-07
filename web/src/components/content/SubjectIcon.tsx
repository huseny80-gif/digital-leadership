import type { ReactNode } from "react";
import type { SubjectTheme } from "./subjectTheme";

/** Small vector illustrations with shaded faces, extruded edges and highlights. */
export function SubjectIcon({ theme, idPrefix }: { theme: SubjectTheme; idPrefix: string }) {
  const face = `url(#${idPrefix}-face)`;
  const metal = `url(#${idPrefix}-metal)`;
  const edge = `url(#${idPrefix}-edge)`;
  const solid = (path: string) => <>
    <path d={path} transform="translate(2 4)" fill={edge} />
    <path d={path} fill={face} stroke="#fff" strokeOpacity=".45" strokeWidth="1.4" />
  </>;
  let shape: ReactNode;

  switch (theme) {
    case "ai":
      shape = <>
        {solid("M47 23c-7-12-22-8-24 3-11 0-15 13-8 21-7 11 0 22 12 22 3 10 15 12 20 3 5 9 18 7 21-3 12 0 19-11 12-22 7-8 3-21-8-21-2-11-17-15-25-3Z")}
        <g stroke="#062c52" strokeOpacity=".45" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M47 24v47M27 29c-5 8 1 14 8 13M17 48c8-6 17-2 16 7M27 68c-4-8 2-15 8-14M66 29c5 8-1 14-8 13M78 48c-8-6-17-2-16 7M67 68c4-8-2-15-8-14" />
        </g>
        <g stroke="#e0f5ff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M46 23v47M26 28c-5 8 1 14 8 13M16 47c8-6 17-2 16 7M26 67c-4-8 2-15 8-14M65 28c5 8-1 14-8 13M77 47c-8-6-17-2-16 7M66 67c4-8-2-15-8-14" />
        </g>
        <ellipse cx="31" cy="28" rx="8" ry="4" fill="#fff" opacity=".18" transform="rotate(-30 31 28)" />
      </>;
      break;
    case "legal":
      shape = <>
        <ellipse cx="50" cy="78" rx="29" ry="7" fill={edge} />
        <ellipse cx="48" cy="74" rx="29" ry="6" fill={metal} />
        <rect x="44" y="24" width="9" height="49" rx="4" fill={face} stroke="#fff" strokeOpacity=".3" />
        <path d="m19 32 57-9 2 8-57 9Z" fill={edge} transform="translate(1 3)" />
        <path d="m18 30 57-9 2 8-57 9Z" fill={metal} />
        <circle cx="48" cy="22" r="7" fill={face} stroke="#d6ffed" strokeWidth="1.3" />
        <g stroke="#c4fce4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m27 36-13 22h27ZM68 30 55 52h27Z" />
        </g>
        {solid("M12 57h31c-3 15-26 15-31 0Z")}
        {solid("M53 51h31c-3 15-26 15-31 0Z")}
        <path d="M13 57h29M54 51h29M45 73h17" stroke="#e0fff2" strokeWidth="2" strokeLinecap="round" />
      </>;
      break;
    case "cyber":
      shape = <>
        {solid("M48 13 77 25v23c0 21-17 32-29 36-12-4-29-15-29-36V25Z")}
        <path d="M48 21 69 30v18c0 15-12 24-21 29-9-5-21-14-21-29V30Z" fill="#391278" fillOpacity=".35" stroke="#eadbff" strokeOpacity=".45" />
        <path d="M40 44v-7a8 8 0 0 1 16 0v7" stroke="#f3eaff" strokeWidth="5" strokeLinecap="round" />
        <rect x="36" y="43" width="26" height="24" rx="5" fill={edge} />
        <rect x="35" y="41" width="26" height="24" rx="5" fill={metal} />
        <circle cx="48" cy="51" r="3.3" fill="#442379" />
        <path d="M48 53v6" stroke="#442379" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M23 27 46 17" stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round" />
      </>;
      break;
    case "innovation":
      shape = <>
        <g stroke="var(--subject-accent)" strokeWidth="3" strokeLinecap="round" opacity=".75">
          <path d="M48 4v5M19 15l4 4M77 15l-4 4M9 42h6M81 42h6" />
        </g>
        {solid("M30 54c-7-6-11-12-11-21a29 29 0 0 1 58 0c0 9-4 15-11 21-5 4-6 8-6 13H36c0-5-1-9-6-13Z")}
        <ellipse cx="36" cy="26" rx="8" ry="11" fill="#fff" opacity=".3" transform="rotate(35 36 26)" />
        <path d="m37 41 11 12 11-12M48 53v13" stroke="#e0fdff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="37" y="65" width="24" height="17" rx="5" fill={edge} />
        <path d="M37 68h23M37 73h23M40 78h17" stroke="#b6f3ff" strokeWidth="3" strokeLinecap="round" />
        <path d="M43 83h11" stroke="var(--subject-accent)" strokeWidth="5" strokeLinecap="round" />
      </>;
      break;
    case "risk":
      shape = <>
        {solid("M41 17c3-6 11-6 14 0l30 54c4 7 0 12-7 12H18c-7 0-11-5-7-12Z")}
        <path d="m48 24 28 50H20Z" fill="#bd2c17" fillOpacity=".17" stroke="#ffe5cb" strokeOpacity=".5" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="46" y="36" width="7" height="23" rx="3.5" fill={edge} />
        <rect x="44" y="34" width="7" height="23" rx="3.5" fill={metal} />
        <circle cx="49" cy="66" r="4.5" fill={edge} />
        <circle cx="47" cy="64" r="4.5" fill={metal} />
        <path d="m17 71 22-40" stroke="#fff5e8" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" />
      </>;
      break;
  }

  return <svg className="dl-subject-mark" viewBox="0 0 96 96" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${idPrefix}-face`} x1="18" y1="13" x2="76" y2="82" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--subject-highlight)" /><stop offset=".48" stopColor="var(--subject-accent)" /><stop offset="1" stopColor="var(--subject-depth)" />
      </linearGradient>
      <linearGradient id={`${idPrefix}-edge`} x1="20" y1="20" x2="74" y2="88" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--subject-accent)" /><stop offset=".55" stopColor="var(--subject-depth)" /><stop offset="1" stopColor="#040e1c" />
      </linearGradient>
      <linearGradient id={`${idPrefix}-metal`} x1="21" y1="22" x2="69" y2="81" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fff" /><stop offset=".45" stopColor="var(--subject-highlight)" /><stop offset="1" stopColor="var(--subject-accent)" />
      </linearGradient>
      <filter id={`${idPrefix}-shadow`} x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="2.5" floodColor="#020711" floodOpacity=".65" /></filter>
    </defs>
    <g filter={`url(#${idPrefix}-shadow)`}>{shape}</g>
  </svg>;
}
