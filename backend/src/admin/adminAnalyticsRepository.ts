import type { Pool } from "pg";

/**
 * Data-access boundary for admin-facing Learning Analytics (Phase 5.2).
 * Unlike the learner-facing `AnalyticsRepository`, these queries are not
 * scoped to a single user — every route calling this repository is
 * gated by `requireAdmin` (applied router-wide in `adminRoutes.ts`), the
 * same boundary every other admin repository relies on.
 *
 * Every query is parameterized; optional filters (`subjectId`/`from`/
 * `to`/`studentId`) are only ever bound as `$n` placeholders — the SQL
 * text itself only branches on whether a filter was PROVIDED (a trusted
 * boolean from route-level zod validation), never on its value, matching
 * `ContentRepository`'s `visibilityClause` convention.
 */

const TOTAL_POSSIBLE_LATERAL = `
  cross join lateral (
    select coalesce(sum(qn.points), 0)::numeric as total_possible
    from quiz_questions qq
    join questions qn on qn.id = qq.question_id
    where qq.quiz_id = q.id
  ) tp
`;

export interface StudentAnalyticsFilters {
  subjectId?: string;
  from?: Date;
  to?: Date;
  studentId?: string;
}

interface StudentAnalyticsRowInternal {
  user_id: string;
  display_name: string;
  email: string;
  total_lectures: string;
  completed_lectures: string;
  quiz_attempts: string;
  avg_percentage: string | null;
  last_activity_at: Date | null;
}

export class AdminAnalyticsRepository {
  constructor(private readonly pool: Pool) {}

  async getPlatformOverview() {
    const result = await this.pool.query<{
      total_students: string;
      active_students: string;
      active_subjects: string;
      total_lectures: string;
      total_quizzes: string;
      total_quiz_attempts: string;
    }>(
      `select
         (select count(*) from users u join roles r on r.id = u.role_id where r.name = 'user' and u.deleted_at is null) as total_students,
         (select count(distinct uid) from (
            select user_id as uid from lecture_progress
            union
            select user_id as uid from quiz_attempts
          ) active) as active_students,
         (select count(*) from subjects where status = 'published' and deleted_at is null) as active_subjects,
         (select count(*) from lectures where deleted_at is null) as total_lectures,
         (select count(*) from quizzes where deleted_at is null) as total_quizzes,
         (select count(*) from quiz_attempts) as total_quiz_attempts`,
    );
    const row = result.rows[0]!;
    return {
      totalStudents: Number(row.total_students),
      activeStudents: Number(row.active_students),
      activeSubjects: Number(row.active_subjects),
      totalLectures: Number(row.total_lectures),
      totalQuizzes: Number(row.total_quizzes),
      totalQuizAttempts: Number(row.total_quiz_attempts),
    };
  }

  async getPerformance() {
    const result = await this.pool.query<{
      avg_percentage: string | null;
      total_graded: string;
      bucket_0_59: string;
      bucket_60_69: string;
      bucket_70_79: string;
      bucket_80_89: string;
      bucket_90_100: string;
    }>(
      `with attempt_pct as (
         select (case when tp.total_possible > 0 then (qa.score / tp.total_possible) * 100 end) as percentage
         from quiz_attempts qa
         join quizzes q on q.id = qa.quiz_id
         ${TOTAL_POSSIBLE_LATERAL}
         where qa.score is not null
       )
       select
         avg(percentage) as avg_percentage,
         count(*) filter (where percentage is not null) as total_graded,
         count(*) filter (where percentage < 60) as bucket_0_59,
         count(*) filter (where percentage >= 60 and percentage < 70) as bucket_60_69,
         count(*) filter (where percentage >= 70 and percentage < 80) as bucket_70_79,
         count(*) filter (where percentage >= 80 and percentage < 90) as bucket_80_89,
         count(*) filter (where percentage >= 90) as bucket_90_100
       from attempt_pct`,
    );
    const row = result.rows[0]!;
    return {
      averageScorePercentage: row.avg_percentage !== null ? Number(row.avg_percentage) : null,
      totalGradedAttempts: Number(row.total_graded),
      scoreDistribution: [
        { range: "0-59" as const, count: Number(row.bucket_0_59) },
        { range: "60-69" as const, count: Number(row.bucket_60_69) },
        { range: "70-79" as const, count: Number(row.bucket_70_79) },
        { range: "80-89" as const, count: Number(row.bucket_80_89) },
        { range: "90-100" as const, count: Number(row.bucket_90_100) },
      ],
    };
  }

  async getSubjectAnalytics() {
    const lectureRows = await this.pool.query<{ subject_id: string; subject_title: string; total_lectures: string }>(
      `select s.id as subject_id, s.title as subject_title, count(l.id) as total_lectures
       from subjects s
       left join lectures l on l.subject_id = s.id and l.status = 'published' and l.deleted_at is null
       where s.status = 'published' and s.deleted_at is null
       group by s.id, s.title, s.order_index
       order by s.order_index asc, s.title asc`,
    );

    const progressRows = await this.pool.query<{ subject_id: string; user_id: string; completed: string }>(
      `select l.subject_id, lp.user_id, count(*) filter (where lp.completed) as completed
       from lecture_progress lp
       join lectures l on l.id = lp.lecture_id and l.status = 'published' and l.deleted_at is null
       group by l.subject_id, lp.user_id`,
    );

    const quizRows = await this.pool.query<{ subject_id: string; attempts: string; avg_percentage: string | null }>(
      `select q.subject_id,
         count(qa.id) as attempts,
         avg(case when qa.score is not null and tp.total_possible > 0 then (qa.score / tp.total_possible) * 100 end) as avg_percentage
       from quizzes q
       left join quiz_attempts qa on qa.quiz_id = q.id
       ${TOTAL_POSSIBLE_LATERAL}
       where q.status = 'published' and q.deleted_at is null
       group by q.subject_id`,
    );

    const activeRows = await this.pool.query<{ subject_id: string; active_students: string }>(
      `select subject_id, count(distinct user_id) as active_students
       from (
         select l.subject_id, lp.user_id
         from lecture_progress lp
         join lectures l on l.id = lp.lecture_id
         union
         select q.subject_id, qa.user_id
         from quiz_attempts qa
         join quizzes q on q.id = qa.quiz_id
       ) combined
       group by subject_id`,
    );

    const quizBySubject = new Map(quizRows.rows.map((r) => [r.subject_id, r]));
    const activeBySubject = new Map(activeRows.rows.map((r) => [r.subject_id, Number(r.active_students)]));

    const progressBySubject = new Map<string, number[]>();
    for (const row of progressRows.rows) {
      const list = progressBySubject.get(row.subject_id) ?? [];
      list.push(Number(row.completed));
      progressBySubject.set(row.subject_id, list);
    }

    return lectureRows.rows.map((row) => {
      const totalLectures = Number(row.total_lectures);
      const completedCounts = progressBySubject.get(row.subject_id) ?? [];
      const averageProgressPercentage =
        totalLectures > 0 && completedCounts.length > 0
          ? (completedCounts.reduce((sum, c) => sum + c / totalLectures, 0) / completedCounts.length) * 100
          : null;
      const quiz = quizBySubject.get(row.subject_id);
      return {
        subjectId: row.subject_id,
        subjectTitle: row.subject_title,
        totalLectures,
        activeStudents: activeBySubject.get(row.subject_id) ?? 0,
        averageProgressPercentage,
        quizAttempts: Number(quiz?.attempts ?? 0),
        averageQuizScorePercentage: quiz?.avg_percentage !== null && quiz?.avg_percentage !== undefined ? Number(quiz.avg_percentage) : null,
      };
    });
  }

  async getStudentAnalytics(filters: StudentAnalyticsFilters, limit: number, offset: number) {
    const { where, params, nextIndex } = this.buildStudentFilterClauses(filters);
    const limitIndex = nextIndex;
    const offsetIndex = nextIndex + 1;

    const totalLecturesResult = await this.pool.query<{ total: string }>(
      `select count(*) as total from lectures l
       where l.status = 'published' and l.deleted_at is null
       ${filters.subjectId ? "and l.subject_id = $1" : ""}`,
      filters.subjectId ? [filters.subjectId] : [],
    );
    const totalLectures = Number(totalLecturesResult.rows[0]?.total ?? 0);

    const result = await this.pool.query<StudentAnalyticsRowInternal>(
      `with lecture_stats as (
         select lp.user_id,
           count(*) filter (where lp.completed) as completed_lectures,
           max(lp.completed_at) as last_lecture_completed_at
         from lecture_progress lp
         join lectures l on l.id = lp.lecture_id and l.status = 'published' and l.deleted_at is null
         where 1 = 1 ${where.lecture}
         group by lp.user_id
       ),
       quiz_stats as (
         select qa.user_id,
           count(*) as quiz_attempts,
           avg(case when qa.score is not null and tp.total_possible > 0 then (qa.score / tp.total_possible) * 100 end) as avg_percentage,
           max(coalesce(qa.submitted_at, qa.started_at)) as last_quiz_activity_at
         from quiz_attempts qa
         join quizzes q on q.id = qa.quiz_id and q.status = 'published' and q.deleted_at is null
         ${TOTAL_POSSIBLE_LATERAL}
         where 1 = 1 ${where.quiz}
         group by qa.user_id
       )
       select u.id as user_id, u.display_name, u.email,
         coalesce(ls.completed_lectures, 0) as completed_lectures,
         coalesce(qs.quiz_attempts, 0) as quiz_attempts,
         qs.avg_percentage,
         greatest(ls.last_lecture_completed_at, qs.last_quiz_activity_at) as last_activity_at
       from users u
       left join lecture_stats ls on ls.user_id = u.id
       left join quiz_stats qs on qs.user_id = u.id
       join roles r on r.id = u.role_id and r.name = 'user'
       where u.deleted_at is null ${where.user}
       order by u.display_name asc
       limit $${limitIndex} offset $${offsetIndex}`,
      [...params, limit, offset],
    );

    // Separate, independently-numbered param list: the count query only
    // ever needs the studentId filter (the student list itself isn't
    // narrowed by subject/date — those filters only shape each listed
    // student's stats via the CTEs above), so it must not receive the
    // larger `params` array whose placeholder numbering belongs to the
    // main query above (pg errors on a param-count/placeholder mismatch).
    const countParams: unknown[] = [];
    let countUserClause = "";
    if (filters.studentId) {
      countParams.push(filters.studentId);
      countUserClause = "and u.id = $1";
    }
    const countResult = await this.pool.query<{ count: string }>(
      `select count(*) as count from users u join roles r on r.id = u.role_id and r.name = 'user'
       where u.deleted_at is null ${countUserClause}`,
      countParams,
    );

    return {
      items: result.rows.map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        email: row.email,
        totalLectures,
        completedLectures: Number(row.completed_lectures),
        progressPercentage: totalLectures > 0 ? (Number(row.completed_lectures) / totalLectures) * 100 : 0,
        quizAttempts: Number(row.quiz_attempts),
        averageScorePercentage: row.avg_percentage !== null && row.avg_percentage !== undefined ? Number(row.avg_percentage) : null,
        lastActivityAt: row.last_activity_at ? row.last_activity_at.toISOString() : null,
      })),
      total: Number(countResult.rows[0]?.count ?? 0),
    };
  }

  /** Builds parameterized WHERE fragments shared by the student-analytics
   * query's CTEs and outer query. Every filter value is bound as a `$n`
   * placeholder — the strings below only vary on which filters were
   * PROVIDED (a boolean the caller already validated), never on the
   * filter values themselves. */
  private buildStudentFilterClauses(filters: StudentAnalyticsFilters) {
    const params: unknown[] = [];
    let index = 1;
    const lectureParts: string[] = [];
    const quizParts: string[] = [];
    const userParts: string[] = [];

    if (filters.subjectId) {
      params.push(filters.subjectId);
      lectureParts.push(`and l.subject_id = $${index}`);
      index += 1;
      params.push(filters.subjectId);
      quizParts.push(`and q.subject_id = $${index}`);
      index += 1;
    }
    if (filters.from) {
      params.push(filters.from);
      lectureParts.push(`and lp.completed_at >= $${index}`);
      index += 1;
      params.push(filters.from);
      quizParts.push(`and coalesce(qa.submitted_at, qa.started_at) >= $${index}`);
      index += 1;
    }
    if (filters.to) {
      params.push(filters.to);
      lectureParts.push(`and lp.completed_at <= $${index}`);
      index += 1;
      params.push(filters.to);
      quizParts.push(`and coalesce(qa.submitted_at, qa.started_at) <= $${index}`);
      index += 1;
    }
    if (filters.studentId) {
      params.push(filters.studentId);
      userParts.push(`and u.id = $${index}`);
      index += 1;
    }

    return {
      where: { lecture: lectureParts.join(" "), quiz: quizParts.join(" "), user: userParts.join(" ") },
      params,
      nextIndex: index,
    };
  }
}
