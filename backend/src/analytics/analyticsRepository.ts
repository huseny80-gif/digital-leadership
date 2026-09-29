import type { Pool } from "pg";
import type { QuizAttemptStatus } from "@shared/index";

/**
 * Data-access boundary for learner-facing Learning Analytics (Phase 5.2,
 * PHASE5_2_LEARNING_ANALYTICS_REPORT.md). Every query is parameterized
 * and scoped to a single `userId` passed in by the caller — never a
 * client-supplied value (mirrors `assessmentsRepository.ts`'s "ownership
 * always from req.user!.id" rule).
 *
 * Only `published` subjects/lectures/quizzes (not soft-deleted) are ever
 * counted, matching `ContentRepository`/`AssessmentsRepository`'s
 * existing learner-visibility rule — an admin never sees more/less here,
 * since this endpoint always reports on the caller's OWN activity, not
 * content visibility that differs by role.
 *
 * Score percentages are computed in SQL from `score / totalPossiblePoints
 * * 100` via a `lateral` join per quiz (never a raw point total compared
 * across quizzes with different maximums) — this is the single query
 * doing that division for every attempt in one round trip, not a
 * per-attempt loop in application code (Phase 5.2 "Performance").
 */
export interface AnalyticsRepository {
  getOverallLectureProgress(userId: string): Promise<{ totalLectures: number; completedLectures: number }>;
  getQuizPerformance(userId: string): Promise<{
    attemptsStarted: number;
    attemptsCompleted: number;
    averageScorePercentage: number | null;
    bestScorePercentage: number | null;
  }>;
  getLastQuizAttempt(userId: string): Promise<{
    quizId: string;
    quizTitle: string;
    status: QuizAttemptStatus;
    scorePercentage: number | null;
    startedAt: Date;
    submittedAt: Date | null;
  } | null>;
  getLastLectureCompletion(userId: string): Promise<{ lectureId: string; lectureTitle: string; completedAt: Date } | null>;
  getSubjectAnalytics(userId: string): Promise<
    {
      subjectId: string;
      subjectTitle: string;
      totalLectures: number;
      completedLectures: number;
      quizAttempts: number;
      averageQuizScorePercentage: number | null;
    }[]
  >;
}

/** Shared subquery fragment: each quiz's total possible points. Mirrors
 * `assessmentsRepository.gradeAttempt`'s own total-possible computation
 * exactly (`sum(qn.points)` — `quiz_questions.points_override` is a
 * schema column with no read anywhere in this codebase, confirmed by
 * grep; using it here would silently disagree with the percentage the
 * learner already saw on their result page), but as a lateral join
 * instead of a correlated scalar subquery, so it works across many
 * attempts/quizzes in one query instead of one round trip per attempt. */
const TOTAL_POSSIBLE_LATERAL = `
  cross join lateral (
    select coalesce(sum(qn.points), 0)::numeric as total_possible
    from quiz_questions qq
    join questions qn on qn.id = qq.question_id
    where qq.quiz_id = q.id
  ) tp
`;

export class PgAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  async getOverallLectureProgress(userId: string) {
    const result = await this.pool.query<{ total: string; completed: string }>(
      `select
         count(l.id) as total,
         count(lp.lecture_id) filter (where lp.completed) as completed
       from lectures l
       join subjects s on s.id = l.subject_id and s.status = 'published' and s.deleted_at is null
       left join lecture_progress lp on lp.lecture_id = l.id and lp.user_id = $1
       where l.status = 'published' and l.deleted_at is null`,
      [userId],
    );
    const row = result.rows[0];
    return { totalLectures: Number(row?.total ?? 0), completedLectures: Number(row?.completed ?? 0) };
  }

  async getQuizPerformance(userId: string) {
    const result = await this.pool.query<{
      started: string;
      completed: string;
      avg_percentage: string | null;
      best_percentage: string | null;
    }>(
      `select
         count(*) as started,
         count(*) filter (where qa.status in ('submitted', 'graded')) as completed,
         avg(case when qa.score is not null and tp.total_possible > 0 then (qa.score / tp.total_possible) * 100 end) as avg_percentage,
         max(case when qa.score is not null and tp.total_possible > 0 then (qa.score / tp.total_possible) * 100 end) as best_percentage
       from quiz_attempts qa
       join quizzes q on q.id = qa.quiz_id and q.status = 'published' and q.deleted_at is null
       join subjects s on s.id = q.subject_id and s.status = 'published' and s.deleted_at is null
       ${TOTAL_POSSIBLE_LATERAL}
       where qa.user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return {
      attemptsStarted: Number(row?.started ?? 0),
      attemptsCompleted: Number(row?.completed ?? 0),
      averageScorePercentage: row?.avg_percentage !== null && row?.avg_percentage !== undefined ? Number(row.avg_percentage) : null,
      bestScorePercentage: row?.best_percentage !== null && row?.best_percentage !== undefined ? Number(row.best_percentage) : null,
    };
  }

  async getLastQuizAttempt(userId: string) {
    const result = await this.pool.query<{
      quiz_id: string;
      quiz_title: string;
      status: QuizAttemptStatus;
      score: string | null;
      total_possible: string;
      started_at: Date;
      submitted_at: Date | null;
    }>(
      `select qa.quiz_id, q.title as quiz_title, qa.status, qa.score, tp.total_possible, qa.started_at, qa.submitted_at
       from quiz_attempts qa
       join quizzes q on q.id = qa.quiz_id and q.status = 'published' and q.deleted_at is null
       join subjects s on s.id = q.subject_id and s.status = 'published' and s.deleted_at is null
       ${TOTAL_POSSIBLE_LATERAL}
       where qa.user_id = $1
       order by coalesce(qa.submitted_at, qa.started_at) desc
       limit 1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const totalPossible = Number(row.total_possible);
    const scorePercentage = row.score !== null && totalPossible > 0 ? (Number(row.score) / totalPossible) * 100 : null;
    return {
      quizId: row.quiz_id,
      quizTitle: row.quiz_title,
      status: row.status,
      scorePercentage,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
    };
  }

  async getLastLectureCompletion(userId: string) {
    const result = await this.pool.query<{ lecture_id: string; lecture_title: string; completed_at: Date }>(
      `select lp.lecture_id, l.title as lecture_title, lp.completed_at
       from lecture_progress lp
       join lectures l on l.id = lp.lecture_id and l.status = 'published' and l.deleted_at is null
       join subjects s on s.id = l.subject_id and s.status = 'published' and s.deleted_at is null
       where lp.user_id = $1 and lp.completed = true
       order by lp.completed_at desc
       limit 1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { lectureId: row.lecture_id, lectureTitle: row.lecture_title, completedAt: row.completed_at };
  }

  async getSubjectAnalytics(userId: string) {
    const lectureRows = await this.pool.query<{ subject_id: string; subject_title: string; total: string; completed: string }>(
      `select s.id as subject_id, s.title as subject_title,
         count(l.id) as total,
         count(lp.lecture_id) filter (where lp.completed) as completed
       from subjects s
       left join lectures l on l.subject_id = s.id and l.status = 'published' and l.deleted_at is null
       left join lecture_progress lp on lp.lecture_id = l.id and lp.user_id = $1
       where s.status = 'published' and s.deleted_at is null
       group by s.id, s.title, s.order_index
       order by s.order_index asc, s.title asc`,
      [userId],
    );

    const quizRows = await this.pool.query<{ subject_id: string; attempts: string; avg_percentage: string | null }>(
      `select q.subject_id,
         count(qa.id) as attempts,
         avg(case when qa.score is not null and tp.total_possible > 0 then (qa.score / tp.total_possible) * 100 end) as avg_percentage
       from quizzes q
       left join quiz_attempts qa on qa.quiz_id = q.id and qa.user_id = $1
       ${TOTAL_POSSIBLE_LATERAL}
       where q.status = 'published' and q.deleted_at is null
       group by q.subject_id`,
      [userId],
    );
    const quizBySubject = new Map(quizRows.rows.map((r) => [r.subject_id, r]));

    return lectureRows.rows.map((row) => {
      const quiz = quizBySubject.get(row.subject_id);
      return {
        subjectId: row.subject_id,
        subjectTitle: row.subject_title,
        totalLectures: Number(row.total),
        completedLectures: Number(row.completed),
        quizAttempts: Number(quiz?.attempts ?? 0),
        averageQuizScorePercentage: quiz?.avg_percentage !== null && quiz?.avg_percentage !== undefined ? Number(quiz.avg_percentage) : null,
      };
    });
  }
}
