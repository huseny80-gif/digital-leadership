import type { Pool } from "pg";
import type {
  AssessmentPrincipal,
  AssignmentProgress,
  LearningActivity,
  LearningOverview,
} from "@shared/index";
import { notFound } from "../lib/httpError.js";
import { examQuizVisible } from "../examMaterials/visibility.js";

function owner(principal: AssessmentPrincipal) {
  return principal.kind === "user"
    ? { column: "user_id", id: principal.userId }
    : { column: "guest_session_id", id: principal.guestSessionId };
}

/** All dashboard queries use learner visibility, including for administrator accounts. */
const visibleContent = `
  visible_subjects as (select id,title from subjects where status='published' and deleted_at is null),
  visible_lectures as (
    select l.id,l.subject_id from lectures l join visible_subjects s on s.id=l.subject_id
    where l.status='published' and l.deleted_at is null
  ),
  visible_assignments as (
    select a.*,s.title as subject_title from assignments a join visible_subjects s on s.id=a.subject_id
    where a.status='published' and a.deleted_at is null
      and (a.lecture_id is null or exists(select 1 from visible_lectures l where l.id=a.lecture_id and l.subject_id=a.subject_id))
  ),
  visible_quizzes as (
    select q.*,s.title as subject_title from quizzes q join visible_subjects s on s.id=q.subject_id
    where q.status='published' and q.deleted_at is null and q.superseded_by is null
      and ${examQuizVisible}
      and (q.lecture_id is null or exists(select 1 from visible_lectures l where l.id=q.lecture_id and l.subject_id=q.subject_id))
  )`;

export class LearningRepository {
  constructor(private readonly pool: Pool) {}

  async overview(principal: AssessmentPrincipal): Promise<LearningOverview> {
    const actor = owner(principal);
    const [metrics, activities] = await Promise.all([
      this.pool.query<Record<string, number | string>>(
        `with ${visibleContent}
        select
          (select count(*) from visible_lectures)::int as "totalLectures",
          (select count(*) from visible_lectures l join lecture_progress p on p.lecture_id=l.id where p.${actor.column}=$1 and p.completed)::int as "completedLectures",
          (select count(*) from visible_assignments)::int as "totalAssignments",
          (select count(*) from visible_assignments a join assignment_progress p on p.assignment_id=a.id where p.${actor.column}=$1 and p.completed)::int as "completedAssignments",
          (select count(*) from visible_quizzes)::int as "totalQuizzes",
          (select count(*) from visible_quizzes q where exists(select 1 from quiz_attempts t where t.quiz_id=q.id and t.${actor.column}=$1 and t.status in ('submitted','graded')))::int as "completedQuizzes",
          coalesce((select learning_seconds from learning_activity where ${actor.column}=$1),0) as "learningSeconds"`,
        [actor.id],
      ),
      this.pool.query<{
        id: string;
        kind: "assignment" | "quiz";
        title: string;
        subject_id: string;
        subject_title: string;
        due_at: Date | null;
        completed: boolean;
        started: boolean;
      }>(
        `with ${visibleContent}
        select a.id,'assignment' as kind,a.title,a.subject_id,a.subject_title,a.due_at,
          coalesce(p.completed,false) as completed,(p.started_at is not null) as started
        from visible_assignments a left join assignment_progress p on p.assignment_id=a.id and p.${actor.column}=$1
        union all
        select q.id,'quiz' as kind,q.title,q.subject_id,q.subject_title,q.due_at,
          exists(select 1 from quiz_attempts t where t.quiz_id=q.id and t.${actor.column}=$1 and t.status in ('submitted','graded')) as completed,
          exists(select 1 from quiz_attempts t where t.quiz_id=q.id and t.${actor.column}=$1) as started
        from visible_quizzes q`,
        [actor.id],
      ),
    ]);
    const values = Object.fromEntries(
      Object.entries(metrics.rows[0]!).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ) as Omit<LearningOverview, "progressPercentage" | "activities">;
    const total =
      values.totalLectures + values.totalAssignments + values.totalQuizzes;
    const complete =
      values.completedLectures +
      values.completedAssignments +
      values.completedQuizzes;
    const upcoming: LearningActivity[] = activities.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      subjectTitle: row.subject_title,
      href:
        row.kind === "quiz"
          ? `/quizzes/${row.id}`
          : `/subjects/${row.subject_id}/assignments/${row.id}`,
      dueAt: row.due_at?.toISOString() ?? null,
      overdue:
        !row.completed &&
        row.due_at !== null &&
        row.due_at.getTime() < Date.now(),
      status: row.completed
        ? "completed"
        : row.due_at && row.due_at.getTime() <= Date.now() + 48 * 60 * 60 * 1000
          ? "urgent"
          : row.started
            ? "in_progress"
            : "pending",
    }));
    upcoming.sort(
      (a, b) =>
        Number(a.status === "completed") - Number(b.status === "completed") ||
        (a.dueAt ? Date.parse(a.dueAt) : Infinity) -
          (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
        a.title.localeCompare(b.title, "ar"),
    );
    return {
      ...values,
      progressPercentage: total
        ? Math.round((complete / total) * 1000) / 10
        : 0,
      activities: upcoming,
    };
  }

  private async requireContent(
    kind: "lecture" | "assignment" | "quiz" | "library",
    id: string,
  ): Promise<void> {
    const query =
      kind === "library"
        ? "select 1 from visible_subjects where id=$1"
        : `select 1 from visible_${kind === "lecture" ? "lectures" : kind === "assignment" ? "assignments" : "quizzes"} where id=$1`;
    if (
      !(await this.pool.query(`with ${visibleContent} ${query}`, [id])).rowCount
    )
      throw notFound("المحتوى غير متاح.");
  }

  async heartbeat(
    principal: AssessmentPrincipal,
    kind: "lecture" | "assignment" | "quiz" | "library",
    contentId: string,
    active: boolean,
  ): Promise<void> {
    await this.requireContent(kind, contentId);
    const actor = owner(principal);
    // The server's clock is authoritative. Long gaps, hidden pages and overlapping
    // tabs never backfill time; each confirmed interval adds at most 30 seconds.
    await this.pool.query(
      `insert into learning_activity (${actor.column},active) values($1,$2)
      on conflict (${actor.column}) do update set
        learning_seconds=learning_activity.learning_seconds + case
          when learning_activity.active and extract(epoch from (clock_timestamp()-learning_activity.last_heartbeat_at)) between 0 and 45
          then least(30,floor(extract(epoch from (clock_timestamp()-learning_activity.last_heartbeat_at))))::bigint else 0 end,
        last_heartbeat_at=clock_timestamp(),active=excluded.active`,
      [actor.id, active],
    );
    if (kind === "assignment" && active) {
      await this.pool.query(
        `insert into assignment_progress(assignment_id,${actor.column}) values($1,$2) on conflict(${actor.column},assignment_id) do nothing`,
        [contentId, actor.id],
      );
    }
  }

  async assignmentProgress(
    principal: AssessmentPrincipal,
    assignmentId: string,
  ): Promise<AssignmentProgress> {
    await this.requireContent("assignment", assignmentId);
    const actor = owner(principal);
    const row = (
      await this.pool.query<{
        started_at: Date;
        completed: boolean;
        completed_at: Date | null;
      }>(
        `select started_at,completed,completed_at from assignment_progress where assignment_id=$1 and ${actor.column}=$2`,
        [assignmentId, actor.id],
      )
    ).rows[0];
    return {
      assignmentId,
      startedAt: row?.started_at.toISOString() ?? null,
      completed: row?.completed ?? false,
      completedAt: row?.completed_at?.toISOString() ?? null,
    };
  }

  async setAssignmentProgress(
    principal: AssessmentPrincipal,
    assignmentId: string,
    completed: boolean,
  ): Promise<AssignmentProgress> {
    await this.requireContent("assignment", assignmentId);
    const actor = owner(principal);
    await this.pool.query(
      `insert into assignment_progress(assignment_id,${actor.column},completed,completed_at)
      values($1,$2,$3,case when $3 then now() else null end)
      on conflict(${actor.column},assignment_id) do update set completed=excluded.completed,
        completed_at=case when excluded.completed then coalesce(assignment_progress.completed_at,now()) else null end`,
      [assignmentId, actor.id, completed],
    );
    return this.assignmentProgress(principal, assignmentId);
  }
}
