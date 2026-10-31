import { STUDY_COURSES } from "@digital-leadership/shared";

const courseId = (slug: typeof STUDY_COURSES[number]["slug"]) => STUDY_COURSES.find(course => course.slug === slug)!.id;

/** Each reviewed course owns its summaries route; the comprehensive exam remains inside exam material. */
export const SUBJECT_STUDY_IDS = {
  ai: courseId("ai-data"),
  cybersecurity: courseId("cybersecurity-governance"),
  innovation: courseId("innovation-project-management"),
  legal: courseId("legal-regulatory"),
  risk: courseId("risk-management"),
} as const;

export const INNOVATION_STUDY_SUBJECT_ID = SUBJECT_STUDY_IDS.innovation;
export const ALLOWLISTED_STUDY_SUBJECT_IDS = Object.values(SUBJECT_STUDY_IDS);

const comprehensiveRoute = "/exam-module.html";

type StudyModules = { summaries: string; comprehensive?: typeof comprehensiveRoute };
const studyModulesBySubject: Record<string, StudyModules> = {
  [SUBJECT_STUDY_IDS.ai]: { summaries: `/subjects/${SUBJECT_STUDY_IDS.ai}/summaries` },
  [SUBJECT_STUDY_IDS.cybersecurity]: { summaries: `/subjects/${SUBJECT_STUDY_IDS.cybersecurity}/summaries` },
  [SUBJECT_STUDY_IDS.innovation]: { summaries: `/subjects/${SUBJECT_STUDY_IDS.innovation}/summaries`, comprehensive: comprehensiveRoute },
  [SUBJECT_STUDY_IDS.legal]: { summaries: `/subjects/${SUBJECT_STUDY_IDS.legal}/summaries` },
  [SUBJECT_STUDY_IDS.risk]: { summaries: `/subjects/${SUBJECT_STUDY_IDS.risk}/summaries` },
};

export function studyModulesForSubject(subjectId: string): StudyModules | null {
  const modules = studyModulesBySubject[subjectId];
  return modules ? { ...modules } : null;
}

/** Static HTML needs a document navigation rather than a Next.js RSC request. */
export function isStudyModuleDocument(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0];
  return path === "/summaries.html" || path === comprehensiveRoute;
}

export function lectureSummaryHref(subjectId: string, entryId: string, lectureNumber: number): string {
  const modules = studyModulesForSubject(subjectId);
  const course = STUDY_COURSES.find(course => course.id === subjectId);
  if (modules && course && Number.isInteger(lectureNumber) && lectureNumber >= 1 && lectureNumber <= course.lectures) return `${modules.summaries}#lecture-${lectureNumber}`;
  return `/subjects/${subjectId}/library?section=summaries&entry=${encodeURIComponent(entryId)}`;
}
