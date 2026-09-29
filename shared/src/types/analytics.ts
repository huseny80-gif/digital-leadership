import type { QuizAttemptStatus } from "./quiz.js";

/**
 * Phase 5.2 — Learning Analytics. Every field here is computed from
 * existing tables (`lecture_progress`, `quiz_attempts`, `quizzes`,
 * `lectures`, `subjects`) — no new column or table was added to produce
 * any of these shapes (PHASE5_2_LEARNING_ANALYTICS_REPORT.md). There is
 * no "passing score" concept anywhere in the schema, so no pass/fail
 * metric is modeled here — see that report for why.
 *
 * A quiz's raw `score` (quiz_attempts.score) is points, not a percentage,
 * and the total possible points differs per quiz — every percentage
 * below is computed server-side from `score / totalPossiblePoints * 100`,
 * never a raw point total compared across different quizzes.
 */

export interface LearnerOverallProgress {
  totalLectures: number;
  completedLectures: number;
  progressPercentage: number;
}

export interface LearnerQuizPerformance {
  attemptsStarted: number;
  attemptsCompleted: number;
  averageScorePercentage: number | null;
  bestScorePercentage: number | null;
  lastScorePercentage: number | null;
}

export interface LearnerSubjectAnalytics {
  subjectId: string;
  subjectTitle: string;
  totalLectures: number;
  completedLectures: number;
  progressPercentage: number;
  quizAttempts: number;
  averageQuizScorePercentage: number | null;
}

export interface LearnerLastQuizAttempt {
  quizId: string;
  quizTitle: string;
  status: QuizAttemptStatus;
  scorePercentage: number | null;
  startedAt: string;
  submittedAt: string | null;
}

export interface LearnerLastLectureCompletion {
  lectureId: string;
  lectureTitle: string;
  completedAt: string;
}

export interface LearnerRecentActivity {
  lastQuizAttempt: LearnerLastQuizAttempt | null;
  lastLectureCompletion: LearnerLastLectureCompletion | null;
}

/** Response for `GET /api/v1/analytics/me` — always scoped to the
 * requesting user's own id (`req.user!.id`), never a client-supplied
 * user id (PHASE5_2 "Security"). */
export interface LearnerAnalytics {
  overallProgress: LearnerOverallProgress;
  quizPerformance: LearnerQuizPerformance;
  subjects: LearnerSubjectAnalytics[];
  recentActivity: LearnerRecentActivity;
}

/** Response for `GET /api/v1/admin/analytics/overview`. */
export interface AdminAnalyticsPlatformOverview {
  totalStudents: number;
  activeStudents: number;
  activeSubjects: number;
  totalLectures: number;
  totalQuizzes: number;
  totalQuizAttempts: number;
}

/** Response for `GET /api/v1/admin/analytics/performance`. Bucket edges
 * are fixed (0-59/60-69/70-79/80-89/90-100) — the same convention a
 * pass/fail threshold would use if one existed, without inventing one. */
export interface AdminAnalyticsPerformance {
  averageScorePercentage: number | null;
  totalGradedAttempts: number;
  scoreDistribution: {
    range: "0-59" | "60-69" | "70-79" | "80-89" | "90-100";
    count: number;
  }[];
}

export interface AdminSubjectAnalyticsRow {
  subjectId: string;
  subjectTitle: string;
  activeStudents: number;
  totalLectures: number;
  averageProgressPercentage: number | null;
  quizAttempts: number;
  averageQuizScorePercentage: number | null;
}

export interface AdminStudentAnalyticsRow {
  userId: string;
  displayName: string;
  email: string;
  totalLectures: number;
  completedLectures: number;
  progressPercentage: number;
  quizAttempts: number;
  averageScorePercentage: number | null;
  lastActivityAt: string | null;
}

export interface AdminStudentAnalyticsFilters {
  subjectId?: string;
  from?: string;
  to?: string;
  studentId?: string;
}
