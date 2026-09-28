export interface SubjectTabDef {
  key: string;
  href: string;
  label: string;
  icon: string;
  /** Item count for this section, shown as a badge. Only known on the
   * page that already fetched that section's own list — passing it for
   * every tab on every page would mean extra API calls this phase isn't
   * scoped for, so tabs without a count simply render without a badge. */
  count?: number;
}

/**
 * Shared tab definitions for a given subject — single source of truth so
 * the 3 subject-scoped (server-component) pages don't each hand-roll the
 * same hrefs/labels. Kept in a plain (non-"use client") module: the
 * pages that call this are Server Components, and a plain function
 * cannot be imported from a "use client" file into server code (see
 * SubjectTabs.tsx, which is the client-only rendering half).
 */
export function subjectTabs(
  subjectId: string,
  counts: { lectures?: number; assessments?: number; assignments?: number } = {},
): SubjectTabDef[] {
  return [
    {
      key: "lectures",
      href: `/subjects/${subjectId}`,
      label: "Lectures",
      icon: "📖",
      count: counts.lectures,
    },
    {
      key: "assessments",
      href: `/subjects/${subjectId}/assessments`,
      label: "Assessments",
      icon: "❓",
      count: counts.assessments,
    },
    {
      key: "assignments",
      href: `/subjects/${subjectId}/assignments`,
      label: "Assignments",
      icon: "📋",
      count: counts.assignments,
    },
  ];
}
