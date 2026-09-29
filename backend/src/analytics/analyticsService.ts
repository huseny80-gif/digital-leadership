import type { LearnerAnalytics } from "@shared/index";
import type { AnalyticsRepository } from "./analyticsRepository.js";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentageOrNull(value: number | null): number | null {
  return value === null ? null : round2(value);
}

/**
 * Learner-facing Learning Analytics (Phase 5.2). Thin orchestration over
 * `AnalyticsRepository` — no SQL here (ARCHITECTURE.md §3), only
 * assembling the repository's parallel results into one response and
 * rounding percentages consistently.
 *
 * `userId` always comes from the route handler's `req.user!.id` — this
 * service has no method that accepts a caller-chosen user id, so there
 * is no code path by which a learner could see another learner's data
 * (Phase 5.2 "Security").
 */
export class AnalyticsService {
  constructor(private readonly repository: AnalyticsRepository) {}

  async getMyAnalytics(userId: string): Promise<LearnerAnalytics> {
    const [overall, quizPerformance, lastQuizAttempt, lastLectureCompletion, subjects] = await Promise.all([
      this.repository.getOverallLectureProgress(userId),
      this.repository.getQuizPerformance(userId),
      this.repository.getLastQuizAttempt(userId),
      this.repository.getLastLectureCompletion(userId),
      this.repository.getSubjectAnalytics(userId),
    ]);

    const progressPercentage = overall.totalLectures > 0 ? round2((overall.completedLectures / overall.totalLectures) * 100) : 0;

    return {
      overallProgress: {
        totalLectures: overall.totalLectures,
        completedLectures: overall.completedLectures,
        progressPercentage,
      },
      quizPerformance: {
        attemptsStarted: quizPerformance.attemptsStarted,
        attemptsCompleted: quizPerformance.attemptsCompleted,
        averageScorePercentage: percentageOrNull(quizPerformance.averageScorePercentage),
        bestScorePercentage: percentageOrNull(quizPerformance.bestScorePercentage),
        lastScorePercentage: percentageOrNull(lastQuizAttempt?.scorePercentage ?? null),
      },
      subjects: subjects.map((s) => ({
        subjectId: s.subjectId,
        subjectTitle: s.subjectTitle,
        totalLectures: s.totalLectures,
        completedLectures: s.completedLectures,
        progressPercentage: s.totalLectures > 0 ? round2((s.completedLectures / s.totalLectures) * 100) : 0,
        quizAttempts: s.quizAttempts,
        averageQuizScorePercentage: percentageOrNull(s.averageQuizScorePercentage),
      })),
      recentActivity: {
        lastQuizAttempt: lastQuizAttempt
          ? {
              quizId: lastQuizAttempt.quizId,
              quizTitle: lastQuizAttempt.quizTitle,
              status: lastQuizAttempt.status,
              scorePercentage: percentageOrNull(lastQuizAttempt.scorePercentage),
              startedAt: lastQuizAttempt.startedAt.toISOString(),
              submittedAt: lastQuizAttempt.submittedAt ? lastQuizAttempt.submittedAt.toISOString() : null,
            }
          : null,
        lastLectureCompletion: lastLectureCompletion
          ? {
              lectureId: lastLectureCompletion.lectureId,
              lectureTitle: lastLectureCompletion.lectureTitle,
              completedAt: lastLectureCompletion.completedAt.toISOString(),
            }
          : null,
      },
    };
  }
}
