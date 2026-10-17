import type { Pool } from "pg";
import type { ExamMaterialSummary } from "@shared/index";
import { ExamMaterialService } from "./examMaterialService.js";
import { diverseAssessmentPolicy } from "./diverseAssessment.js";
import { examGroupVisible } from "./visibility.js";
import { finquizRecordId } from "../finquiz/recordIdentity.js";
import { subjectMapping } from "../finquiz/catalog.js";
import { courseAssessmentReviewPolicy } from "../contentAutomation/reviewCourseAssessments.js";

interface Selection { id: string; subject_id: string; lecture_ids: string[]; created_by: string; summary: ExamMaterialSummary }
/** Publish one new revision per saved selection, preserving every old question,
 * answer, score and archive. Stable request IDs make restart/retry safe. */
export async function refreshDiverseAssessments(pool: Pool) {
  const rows = (await pool.query<Selection>(`select g.id,g.subject_id,g.lecture_ids,g.created_by,g.summary
    from exam_material_groups g join subjects s on s.id=g.subject_id join quizzes q on q.id=g.quiz_id
    where s.id=any($1::uuid[]) and s.status='published' and s.deleted_at is null and q.status='published' and q.deleted_at is null
    and ${examGroupVisible} order by g.created_at,g.sequence,g.id`, [Object.values(subjectMapping)])).rows;
  const latest = new Map<string, Selection>();
  const keyFor = (subject: string, lectures: string[]) => subject + ":" + [...new Set(lectures)].sort().join(":");
  for (const row of rows) latest.set(keyFor(row.subject_id, row.lecture_ids), row);
  // A material without a saved group receives one initial group from its
  // already-verified current lecture quizzes, never from unsupported titles.
  const baselines = (await pool.query<{ subject_id: string; created_by: string; lecture_ids: string[] }>(`select s.id as subject_id,s.created_by,
    array_agg(distinct z.lecture_id) as lecture_ids from subjects s join quizzes z on z.subject_id=s.id
    join quiz_questions qq on qq.quiz_id=z.id join questions question on question.id=qq.question_id and question.deleted_at is null
    where s.id=any($1::uuid[]) and s.status='published' and s.deleted_at is null and z.purpose='course' and z.status='published'
    and z.deleted_at is null and z.superseded_by is null and z.lecture_id is not null and question.rubric->>'courseReview'=$2
    group by s.id,s.created_by`, [Object.values(subjectMapping), courseAssessmentReviewPolicy])).rows;
  for (const baseline of baselines) if (!rows.some(row => row.subject_id === baseline.subject_id)) {
    const row: Selection = { ...baseline, id: "initial", summary: { introduction: "", sections: [] } };
    latest.set(keyFor(row.subject_id, row.lecture_ids), row);
  }
  const service = new ExamMaterialService(pool), reviews: Array<{ subjectId: string; groupId: string; questions: number }> = [];
  const issues: Array<{ subjectId: string; code: string }> = [];
  let alreadyCurrent = 0;
  for (const [key, selection] of latest) {
    if (selection.summary.grounding?.questionPolicy === diverseAssessmentPolicy) { alreadyCurrent++; continue; }
    try {
      const requestId = finquizRecordId(`${diverseAssessmentPolicy}:selection:${key}`);
      const scope = selection.id === "initial" || selection.summary.grounding?.sourceScope === "catalog-primary" ? "catalog" : "all";
      const review = await service.generate(selection.subject_id, selection.lecture_ids, requestId, selection.created_by, scope);
      reviews.push({ subjectId: selection.subject_id, groupId: review.id, questions: review.questionCount });
    } catch (error) {
      issues.push({ subjectId: selection.subject_id, code: error instanceof Error && "code" in error ? String(error.code) : "source_review_unavailable" });
    }
  }
  return { policy: diverseAssessmentPolicy, selections: latest.size, published: reviews.length, alreadyCurrent, reviews, issues };
}
