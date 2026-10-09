import type { Lecture, Subject } from "./content.js";
import type { Quiz, QuizAttempt, QuestionForAttempt, AttemptAnswer, SubmitAnswerAck, QuizAttemptResult } from "./quiz.js";

export interface ExamLectureSnapshot { id: string; title: string; number: number }
export interface ExamSummaryTopic { title: string; text: string; details?: string }
export interface ExamSummarySection extends ExamLectureSnapshot {
  text: string;
  keyPoints: string[];
  topics?: ExamSummaryTopic[];
  objectives?: string[];
  concepts?: Array<{ term: string; definition: string }>;
}
export interface ExamMaterialSummary { introduction: string; sections: ExamSummarySection[]; version?: number }
export interface ExamMaterialGroup {
  id: string;
  subjectId: string;
  title: string;
  sequence: number;
  createdAt: string;
  lectures: ExamLectureSnapshot[];
  questionCount: number;
  quizId: string;
  /** Number of visible revisions of this exact lecture selection. */
  revisionCount?: number;
}
export interface ExamMaterialDetail extends ExamMaterialGroup {
  summary: ExamMaterialSummary;
  quiz: Quiz;
  /** Latest visible revision; the requested snapshot and quiz remain unchanged. */
  currentRevision?: ExamMaterialGroup;
}
export interface ExamMaterialHistory {
  revisions: ExamMaterialGroup[];
  latestId: string;
  total: number;
  page: number;
}
export interface ExamMaterialIndex {
  subject: Subject;
  lectures: Lecture[];
  groups: ExamMaterialGroup[];
  canGenerate: boolean;
  total: number;
  page: number;
}
export interface ExamMaterialAttempt {
  quiz: Quiz;
  attempt: QuizAttempt;
  questions: QuestionForAttempt[];
  answers: AttemptAnswer[];
  feedback: SubmitAnswerAck[];
  result: QuizAttemptResult | null;
}
