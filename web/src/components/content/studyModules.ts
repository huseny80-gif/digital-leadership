/** Public, reviewed summaries cover the five allowlisted subjects; the comprehensive exam remains Innovation-only. */
export const SUBJECT_STUDY_IDS = {
  ai: "2d6c0980-e4d2-4687-9027-cf090b3d1a67",
  cybersecurity: "bc861a76-620d-4646-81ca-c49d24665b75",
  innovation: "7eb2b714-570f-4ed0-a00e-10efec7a20e5",
  legal: "ade09563-02ec-4a09-a97b-58857f6cd876",
  risk: "1f4d2071-d1c9-46ee-a848-d5c90eedf287",
} as const;

export const INNOVATION_STUDY_SUBJECT_ID = SUBJECT_STUDY_IDS.innovation;
export const ALLOWLISTED_STUDY_SUBJECT_IDS = Object.values(SUBJECT_STUDY_IDS);

const summariesRoute = "/summaries.html";
const comprehensiveRoute = "/exam-module.html";

type StudyModules = { summaries: string; comprehensive?: typeof comprehensiveRoute };
const studyModulesBySubject: Record<string, StudyModules> = {
  [SUBJECT_STUDY_IDS.ai]: { summaries: summariesRoute },
  [SUBJECT_STUDY_IDS.cybersecurity]: { summaries: summariesRoute },
  [SUBJECT_STUDY_IDS.innovation]: { summaries: summariesRoute, comprehensive: comprehensiveRoute },
  [SUBJECT_STUDY_IDS.legal]: { summaries: summariesRoute },
  [SUBJECT_STUDY_IDS.risk]: { summaries: summariesRoute },
};

/** The standalone page receives the subject UUID in its query, never a caller-controlled subject slug. */
export function studyModulesForSubject(subjectId: string): StudyModules | null {
  const modules = studyModulesBySubject[subjectId];
  return modules ? { ...modules, summaries: `${modules.summaries}?subject=${encodeURIComponent(subjectId)}` } : null;
}

/** Static HTML needs a document navigation rather than a Next.js RSC request. */
export function isStudyModuleDocument(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0];
  return path === summariesRoute || path === comprehensiveRoute;
}

const summaryLectureIds: Record<string, string[]> = {
  [SUBJECT_STUDY_IDS.ai]: ["ai-l1", "ai-l2", "ai-l3", "ai-l4", "ai-l5", "ai-l6"],
  [SUBJECT_STUDY_IDS.cybersecurity]: ["cs-l1", "cs-l2", "cs-l3", "cs-l4", "cs-l5", "cs-iso-roadmap"],
  [SUBJECT_STUDY_IDS.innovation]: ["innovation-01", "innovation-02", "innovation-03", "innovation-04", "innovation-05"],
  // The legal catalogue order is intentionally non-natural: lg-l3 is lecture 2, etc.
  [SUBJECT_STUDY_IDS.legal]: ["lg-l1", "lg-l3", "lg-l4", "lg-l2", "lg-l5", "lg-l6"],
  [SUBJECT_STUDY_IDS.risk]: ["rm-l1", "rm-l2", "rm-l3"],
};

export function lectureSummaryHref(subjectId: string, entryId: string, lectureNumber: number): string {
  const modules = studyModulesForSubject(subjectId);
  const lectureId = modules && Number.isInteger(lectureNumber) && lectureNumber >= 1
    ? summaryLectureIds[subjectId]?.[lectureNumber - 1]
    : undefined;
  if (modules && lectureId) return `${modules.summaries}#${lectureId}`;
  return `/subjects/${subjectId}/library?section=summaries&entry=${encodeURIComponent(entryId)}`;
}
