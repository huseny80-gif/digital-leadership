export type ContentImportStatus = "uploading" | "queued" | "processing" | "completed" | "failed";
export interface ImportedLecture {
  id: string;
  title: string;
  number: number;
  questionCount: number;
  quizId: string;
}
export interface ContentImport {
  id: string;
  title: string;
  filename: string | null;
  uploadPartCount: number;
  status: ContentImportStatus;
  stage: string;
  subjectId: string | null;
  subjectTitle: string | null;
  fileId: string | null;
  lectures: ImportedLecture[];
  questionCount: number;
  generationMethod: "source" | "ai" | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
