import { SUBJECT_STUDY_IDS, studyModulesForSubject } from "./studyModules";
import { reflectiveQuestions } from "@/content/reflectiveQuestions";

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
  const modules = studyModulesForSubject(subjectId);
  const tabs: SubjectTabDef[] = [
    {
      key: "lectures",
      href: `/subjects/${subjectId}`,
      label: "المحاضرات",
      icon: "📖",
      count: counts.lectures,
    },
    { key: "pdf", href: `/subjects/${subjectId}/pdf`, label: "PDF", icon: "📁" },
    { key: "summaries", href: modules?.summaries ?? `/subjects/${subjectId}/library?section=summaries`, label: modules ? "الملخصات والبودكاست" : "الملخصات", icon: "📄" },
    { key: "mind-maps", href: `/subjects/${subjectId}/mind-maps`, label: "خرائط ذهنية", icon: "◈" },
    {
      key: "assessments",
      href: `/subjects/${subjectId}/assessments`,
      label: "الاختبارات",
      icon: "❓",
      count: counts.assessments,
    },
    { key: "exam-material", href: `/subjects/${subjectId}/exam-material`, label: "المادة الامتحانية", icon: "📑" },
    {
      key: "assignments",
      href: `/subjects/${subjectId}/assignments`,
      label: "التكليفات",
      icon: "📋",
      count: counts.assignments,
    },
    { key: "references", href: `/subjects/${subjectId}/library?section=references`, label: "المراجع", icon: "📚" },
    { key: "resources", href: `/subjects/${subjectId}/library?section=resources`, label: "الموارد", icon: "📁" },
    { key: "updates", href: `/subjects/${subjectId}/library?section=updates`, label: "التحديثات", icon: "🗓️" },
  ];
  // The reviewed reflective-question bank belongs to the legal and organizational course only.
  if (subjectId === SUBJECT_STUDY_IDS.legal) {
    tabs.splice(tabs.findIndex(tab => tab.key === "exam-material") + 1, 0, {
      key: "reflective-questions", href: `/subjects/${subjectId}/reflective-questions`, label: reflectiveQuestions.title, icon: "💭", count: reflectiveQuestions.questions.length,
    });
  }
  return tabs;
}
