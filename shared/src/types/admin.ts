import type { QuestionType } from "./quiz.js";

/**
 * Admin-only contracts (PHASE 09C). These deliberately mirror the learner
 * types in `quiz.ts` where the shape is the same (Subject, Lecture,
 * LectureItem — reused as-is, an admin just sees `draft` rows too), and
 * exist as SEPARATE types only where the learner type must never carry a
 * field an admin type legitimately does — `AdminQuestionOption.isCorrect`
 * above all (QUIZ_SECURITY.md's boundary, preserved here: this type is
 * never imported by any learner-facing route or component).
 */
export interface AdminQuestionOption {
  id: string;
  optionText: string;
  isCorrect: boolean;
  orderIndex: number;
}

export interface AdminQuestion {
  id: string;
  questionBankId: string;
  questionType: QuestionType;
  prompt: string;
  points: number;
  options: AdminQuestionOption[];
}

export interface QuestionBank {
  id: string;
  subjectId: string | null;
  title: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminQuizQuestionLink {
  questionId: string;
  orderIndex: number;
  pointsOverride: number | null;
  question: AdminQuestion;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: "active" | "suspended";
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Every count here comes from a real query — none is a placeholder or
 * an invented statistic (PHASE 09C "Admin Dashboard"). */
export interface AdminOverviewCounts {
  subjects: number;
  lectures: number;
  files: number;
  questionBanks: number;
  quizzes: number;
  users: number;
}
