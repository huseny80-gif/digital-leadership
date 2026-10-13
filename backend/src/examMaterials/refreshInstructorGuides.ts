import type { Pool } from "pg";
import { ExamMaterialService } from "./examMaterialService.js";
import { instructorGuidePolicy } from "./instructorGuide.js";
import { examGroupVisible } from "./visibility.js";

/** Repair private preparation only. Do not create quiz revisions or alter
 * historical questions, summaries, scores or trainee attempts. GET also
 * revalidates against the actual files, so a saved marker is never authority. */
export async function refreshInstructorGuides(pool: Pool) {
  const groups = await pool.query<{ id: string; subject_id: string }>(`select g.id,g.subject_id from exam_material_groups g
    join subjects s on s.id=g.subject_id join quizzes q on q.id=g.quiz_id
    left join exam_instructor_guides i on i.group_id=g.id
    where s.status='published' and s.deleted_at is null and q.status='published' and q.deleted_at is null
    and ${examGroupVisible} and (i.guide->>'generator' is distinct from $1 or i.guide->>'sourceScope' is distinct from 'current-lecture-files')
    order by g.sequence desc,g.id`, [instructorGuidePolicy]);
  const service = new ExamMaterialService(pool), issues: Array<{ groupId: string; code: string }> = [];
  let repaired = 0, unavailableLectures = 0;
  for (const group of groups.rows) {
    try {
      const guide = await service.instructorGuide(group.subject_id, group.id);
      repaired++; unavailableLectures += guide.unavailableLectures?.length ?? 0;
    } catch (error) {
      issues.push({ groupId: group.id, code: error instanceof Error && "code" in error ? String(error.code) : "instructor_source_unavailable" });
    }
  }
  return { policy: instructorGuidePolicy, reviewedGroups: groups.rowCount, repaired, unavailableLectures, issues };
}
