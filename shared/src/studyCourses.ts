/** Existing platform identities; titles and published lectures come from the API. */
export const STUDY_COURSES = [
  { slug: "ai-data", id: "2d6c0980-e4d2-4687-9027-cf090b3d1a67", anchor: "ai", lectures: 6 },
  { slug: "legal-regulatory", id: "ade09563-02ec-4a09-a97b-58857f6cd876", anchor: "legal", lectures: 7 },
  { slug: "cybersecurity-governance", id: "bc861a76-620d-4646-81ca-c49d24665b75", anchor: "cyber", lectures: 7 },
  { slug: "innovation-project-management", id: "7eb2b714-570f-4ed0-a00e-10efec7a20e5", anchor: "innovation", lectures: 5 },
  { slug: "risk-management", id: "1f4d2071-d1c9-46ee-a848-d5c90eedf287", anchor: "risk", lectures: 3 },
] as const;

export const STUDY_VOICES = [
  { id: "msa-male", voice: "ar-SY-LaithNeural", label: "العربية الفصحى — ليث (رجل)" },
  { id: "msa-female", voice: "ar-SY-AmanyNeural", label: "العربية الفصحى — أماني (امرأة)" },
  { id: "iraqi-male", voice: "ar-IQ-BasselNeural", label: "فصحى بلكنة عراقية — باسل (رجل)" },
  { id: "iraqi-female", voice: "ar-IQ-RanaNeural", label: "فصحى بلكنة عراقية — رنا (امرأة)" },
  { id: "saudi-male", voice: "ar-SA-HamedNeural", label: "فصحى بلكنة سعودية — حامد (رجل)" },
  { id: "saudi-female", voice: "ar-SA-ZariyahNeural", label: "فصحى بلكنة سعودية — زارية (امرأة)" },
] as const;

export interface StudyModuleLecture {
  id: string; lectureId: string; number: number; title: string; filename: string;
  sha256: string; sourceHref: string; overview: string;
  sections: Array<{ heading: string; points: Array<{ term: string; text: string }> }>;
  transcript: string; summarySha256: string; audioUrl: string;
}
export interface StudyModuleUnavailable { lectureId: string; title: string; reason: string }
export interface StudySummaryDocument {
  live: true; subjectId: string; courseTitle: string; revision: string;
  voices: Array<{ id: string; label: string }>;
  lectures: StudyModuleLecture[]; unavailableLectures: StudyModuleUnavailable[];
}
export interface StudyPracticeReference {
  lectureId: string; fileId: string; sha256: string; filename: string;
  number: number; startLine: number; endLine: number; excerpt: string;
}
export interface StudyPracticeQuestion {
  id: string; lecture: number; type: "multiple_choice" | "true_false" | "match" | "order" | "essay" | "short_scenario";
  level: string; prompt: string; explanation: string; references: number[];
  options?: string[]; correctIndex?: number; pairs?: Array<{ left: string; right: string }>;
  items?: string[]; rubric?: Array<{ text: string; keywords: string[] }>;
  model?: string[];
}
export interface StudyExamDocument {
  live: true; subjectId: string; courseTitle: string; revision: string; policy: string;
  lectures: StudyModuleLecture[]; questions: StudyPracticeQuestion[];
  references: StudyPracticeReference[]; unavailableLectures: StudyModuleUnavailable[];
}
