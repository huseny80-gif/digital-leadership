import type { Lecture, Subject } from "./content.js";
import type { Quiz, QuizAttempt, QuestionForAttempt, AttemptAnswer, SubmitAnswerAck, QuizAttemptResult } from "./quiz.js";

export interface ExamLectureSnapshot { id: string; title: string; number: number }
export interface ExamSummarySection extends ExamLectureSnapshot { text: string; keyPoints: string[] }
export interface ExamMaterialSummary { introduction: string; sections: ExamSummarySection[] }
export interface ExamMaterialGroup {
  id: string;
  subjectId: string;
  title: string;
  sequence: number;
  createdAt: string;
  lectures: ExamLectureSnapshot[];
  questionCount: number;
  quizId: string;
}
export interface ExamMaterialDetail extends ExamMaterialGroup { summary: ExamMaterialSummary; quiz: Quiz }
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
