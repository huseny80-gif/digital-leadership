export type StudySourceKind = "lecture" | "summary" | "assignment";
export interface StudySourceRef { id: string; subjectId: string; kind: StudySourceKind }
export interface StudySourceChoice extends StudySourceRef {
  title: string;
  subjectTitle: string;
  href: string;
  ready: boolean;
}
export interface StudyCatalog {
  subjects: Array<{ id: string; title: string }>;
  sources: StudySourceChoice[];
  total: number;
  page: number;
}
export type StudyAssistantMode = "answer" | "summary" | "quiz";
export interface StudyAssistantRequest {
  message: string;
  mode: StudyAssistantMode;
  subjectId?: string;
  text?: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
}
export interface StudyCitation { sourceId: string; title: string; href: string | null; excerpt: string }
export interface StudyReviewQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
export interface StudyAssistantResponse {
  text: string;
  citations: StudyCitation[];
  quiz: StudyReviewQuestion[];
  method: "source" | "ai";
}
export interface StudyReportRequest {
  title: string;
  author: string;
  sources: StudySourceRef[];
  notes?: string;
}
export interface StudyReportReference {
  sourceId: string;
  title: string;
  author: string | null;
  date: string | null;
  url: string;
  formatted: string;
}
export interface StudyReport {
  title: string;
  author: string;
  introduction: string;
  sections: Array<{ sourceId: string; title: string; kind: StudySourceKind; paragraphs: string[]; citation: string }>;
  notes: string;
  references: StudyReportReference[];
  digest: string;
}
