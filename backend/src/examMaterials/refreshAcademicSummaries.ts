import type { Pool } from "pg";
import { ExamMaterialService } from "./examMaterialService.js";
import { examGroupVisible } from "./visibility.js";
import { finquizRecordId } from "../finquiz/recordIdentity.js";

interface LegacyGroup { id: string; subject_id: string; lecture_ids: string[]; created_by: string }

/** Publish a version-two academic review for each existing lecture selection.
 * Original groups, summaries, copied answer keys and attempts stay immutable.
 * The stable request ID makes concurrent/repeated deployments safe. */
export async function refreshAcademicSummaries(pool: Pool) {
  const legacy = (await pool.query<LegacyGroup>(`select g.id,g.subject_id,g.lecture_ids,g.created_by
    from exam_material_groups g join subjects s on s.id=g.subject_id join quizzes q on q.id=g.quiz_id
    where coalesce(g.summary->>'version','1')='1' and s.status='published' and s.deleted_at is null
    and q.status='published' and q.deleted_at is null and ${examGroupVisible}
    order by g.created_at,g.id`)).rows;
  const selections = new Map<string, LegacyGroup>();
  for (const group of legacy) selections.set(group.subject_id + ":" + [...group.lecture_ids].sort().join(":"), group);
  const service = new ExamMaterialService(pool);
  const reviews: Array<{ originalId: string; currentId: string; subjectId: string }> = [];
  const issues: Array<{ groupId: string; code: string }> = [];
  let alreadyCurrent = 0;
  // Newest original selection remains the newest published review.
  const groups = [...selections.values()].sort((a, b) => legacy.indexOf(a) - legacy.indexOf(b));
  for (const group of groups) {
    const current = await pool.query(`select 1 from exam_material_groups g join subjects s on s.id=g.subject_id join quizzes q on q.id=g.quiz_id
      where g.subject_id=$1 and g.summary->>'version'='2' and g.lecture_ids @> $2::uuid[] and g.lecture_ids <@ $2::uuid[]
      and q.status='published' and q.deleted_at is null and ${examGroupVisible} limit 1`, [group.subject_id, group.lecture_ids]);
    if (current.rowCount) { alreadyCurrent++; continue; }
    try {
      const requestId = finquizRecordId("academic-exam-summary-v2:" + group.id);
      const review = await service.generate(group.subject_id, group.lecture_ids, requestId, group.created_by);
      reviews.push({ originalId: group.id, currentId: review.id, subjectId: group.subject_id });
    } catch (error) {
      // Incomplete/changed sources do not overwrite a saved archive or stop
      // the platform. A later deployment/admin generation can retry them.
      issues.push({ groupId: group.id, code: error instanceof Error && "code" in error ? String(error.code) : "source_review_unavailable" });
    }
  }
  return { key: "academic-exam-summary-v2-2026-10-09", legacyGroups: legacy.length, selections: groups.length, published: reviews.length, alreadyCurrent, reviews, issues };
}
