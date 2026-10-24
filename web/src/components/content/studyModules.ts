import { STUDY_COURSES } from "@digital-leadership/shared";

export const INNOVATION_STUDY_SUBJECT_ID = STUDY_COURSES.find(course => course.slug === "innovation-project-management")!.id;

const innovationModules = {
  summaries: "/summaries.html",
  comprehensive: "/exam-module.html",
} as const;

export function studyModulesForSubject(subjectId: string) {
  if (!STUDY_COURSES.some(course => course.id === subjectId)) return null;
  if (subjectId === INNOVATION_STUDY_SUBJECT_ID) return innovationModules;
  return { summaries: `/summaries.html?subject=${subjectId}`, comprehensive: `/exam-module.html?subject=${subjectId}` };
}

/** Static HTML needs a document navigation rather than a Next.js RSC request. */
export function isStudyModuleDocument(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0];
  return path === innovationModules.summaries || path === innovationModules.comprehensive;
}

export function lectureSummaryHref(subjectId: string, entryId: string, lectureNumber: number): string {
  const modules = studyModulesForSubject(subjectId);
  const course = STUDY_COURSES.find(item => item.id === subjectId);
  if (modules && course && Number.isInteger(lectureNumber) && lectureNumber >= 1 && lectureNumber <= course.lectures) {
    return `${modules.summaries}#${course.anchor}-${String(lectureNumber).padStart(2, "0")}`;
  }
  return `/subjects/${subjectId}/library?section=summaries&entry=${encodeURIComponent(entryId)}`;
}
