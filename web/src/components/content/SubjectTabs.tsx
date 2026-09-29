"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SubjectTabDef } from "./subjectTabs.config";

export type { SubjectTabDef } from "./subjectTabs.config";
export { subjectTabs } from "./subjectTabs.config";

/**
 * Phase 18.2 — section tab bar for a subject's Lectures/Assessments/
 * Assignments routes (Finquiz's `.sectionbar` pattern, restricted to the
 * 3 sections Digital Leadership's API actually supports — per the
 * approved Phase 18.2 scope, Summaries/References/Resources/Updates are
 * not implemented here).
 *
 * This links between the existing separate routes
 * (`/subjects/:id`, `/subjects/:id/assessments`, `/subjects/:id/assignments`)
 * rather than switching content client-side — each route keeps its own
 * server-side data fetching exactly as before, per the pre-existing
 * "preserve the existing route structure" convention. Adding a further
 * tab (e.g. a future Summaries module) only means appending one more
 * `SubjectTabDef` at the call site — the component itself has no
 * knowledge of which sections exist.
 *
 * Tab data lives in the sibling `subjectTabs.ts` (no "use client"
 * directive) because the 3 pages that build tab lists are Server
 * Components — a plain function can't be imported from a "use client"
 * module into server code, only the component itself can.
 */
export function SubjectTabs({ tabs }: { tabs: SubjectTabDef[] }) {
  const pathname = usePathname();

  return (
    <nav className="section-tabs" aria-label="Subject sections">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className="section-tab"
          aria-current={pathname === tab.href ? "page" : undefined}
        >
          <span aria-hidden="true">{tab.icon}</span> {tab.label}
          {typeof tab.count === "number" ? (
            <span className="section-tab-count">{tab.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
