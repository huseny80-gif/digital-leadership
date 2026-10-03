export type LibrarySection = "lectures" | "summaries" | "assignments" | "references" | "resources" | "updates";
export interface LibraryAsset {
  id: string;
  filename: string;
  label: string;
  sizeBytes: number;
  bodyHtml?: string;
}
export interface LibraryEntry {
  id: string;
  title: string;
  section: LibrarySection;
  description?: string;
  date?: string;
  due?: string | null;
  difficulty?: string;
  demo?: boolean;
  lectureId?: string;
  assignmentId?: string;
  objectives?: string[];
  keyPoints?: string[];
  concepts?: Array<{ term: string; definition: string }>;
  terms?: string[];
  author?: string;
  publisher?: string;
  year?: string | number;
  note?: string;
  url?: string | null;
  files: LibraryAsset[];
  unavailableFiles: string[];
}
export interface SubjectLibrary {
  subjectId: string;
  entries: LibraryEntry[];
  sourceQuestionCount: number;
}
