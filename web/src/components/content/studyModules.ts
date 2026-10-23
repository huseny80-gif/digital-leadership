/** These public, reviewed documents contain Innovation content only. */
export const INNOVATION_STUDY_SUBJECT_ID = "7eb2b714-570f-4ed0-a00e-10efec7a20e5";

const innovationModules = {
  summaries: "/summaries.html",
  comprehensive: "/exam-module.html",
} as const;

export function studyModulesForSubject(subjectId: string) {
  return subjectId === INNOVATION_STUDY_SUBJECT_ID ? innovationModules : null;
}

/** Static HTML needs a document navigation rather than a Next.js RSC request. */
export function isStudyModuleDocument(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0];
  return path === innovationModules.summaries || path === innovationModules.comprehensive;
}

export function lectureSummaryHref(subjectId: string, entryId: string, lectureNumber: number): string {
  const modules = studyModulesForSubject(subjectId);
  if (modules && Number.isInteger(lectureNumber) && lectureNumber >= 1 && lectureNumber <= 5) {
    return `${modules.summaries}#innovation-${String(lectureNumber).padStart(2, "0")}`;
  }
  return `/subjects/${subjectId}/library?section=summaries&entry=${encodeURIComponent(entryId)}`;
}
