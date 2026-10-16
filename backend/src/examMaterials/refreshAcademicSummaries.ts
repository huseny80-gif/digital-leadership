import type { Pool } from "pg";
import { ExamMaterialService } from "./examMaterialService.js";
import { examGroupVisible } from "./visibility.js";
import { finquizRecordId } from "../finquiz/recordIdentity.js";
import { examSummaryVersion } from "./summary.js";

interface LegacyGroup { id: string; subject_id: string; lecture_ids: string[]; created_by: string }

/** Original PDFs whose bundled transcripts were re-extracted on 2026-10-16
 * (poppler-ligature-verified-v1). Current-version archives quoting them hold
 * the old scrambled text and get one fresh revision each. */
const reextractedSources = [
  "f9d4c4665e3b3ed6084ead681d222c9397063600fd92e74735ee09b091e418ae", "0c91653e8afe2aa80f910c9040c5a994f59d3bed6f9ae16184915fc654ab1828",
  "b2c10f2ccae2d4102ff73a0a7cfcfcaad5511a0cecac42e04ffff9f5cd6b15bd", "4e5dc50d3aba76aa941f431b384d5246a9e4ebf7346d150b9fe39e6b5f5998db",
  "b51002203f61a96ef1e24ef9e17e026ba800de7627d4018ac0cd8859cec99d13", "f567de9bd8df8d0bbd6606bed669499854d539a0da55cfeafb526383f7b8f7ec",
  "55341ea2a940428c8fc3212ac6b9c57bf991daf1987f9f4c0766e98befba19f2", "ea9b8f2a66c5a50627529720e4b81788cbdd8bba3b4e62d6053efa6072635af9",
  "71e68863275b8b5bee0fb43e602edf37c9f83ab8e6b9023a6f0d26fe897bb7bf", "ffd344cb81930393fa4c7622b79c4cd6add69cb8efa9f392e641b8036517e6ef",
];
const reextractionKey = "poppler-reextract-2026-10-16";

/** Publish a study-only academic review for each existing lecture selection.
 * Original groups, summaries, copied answer keys and attempts stay immutable.
 * The stable request ID makes concurrent/repeated deployments safe. */
export async function refreshAcademicSummaries(pool: Pool) {
  const legacy = (await pool.query<LegacyGroup>(`select g.id,g.subject_id,g.lecture_ids,g.created_by
    from exam_material_groups g join subjects s on s.id=g.subject_id join quizzes q on q.id=g.quiz_id
    where coalesce(g.summary->>'version','1') in ('1','2','3','4','5','6') and s.status='published' and s.deleted_at is null
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
      where g.subject_id=$1 and g.summary->>'version'=$3 and g.lecture_ids @> $2::uuid[] and g.lecture_ids <@ $2::uuid[]
      and q.status='published' and q.deleted_at is null and ${examGroupVisible} limit 1`, [group.subject_id, group.lecture_ids, String(examSummaryVersion)]);
    if (current.rowCount) { alreadyCurrent++; continue; }
    try {
      const requestId = finquizRecordId(`academic-exam-summary-v${examSummaryVersion}:` + group.id);
      const review = await service.generate(group.subject_id, group.lecture_ids, requestId, group.created_by);
      reviews.push({ originalId: group.id, currentId: review.id, subjectId: group.subject_id });
    } catch (error) {
      // Incomplete/changed sources do not overwrite a saved archive or stop
      // the platform. A later deployment/admin generation can retry them.
      issues.push({ groupId: group.id, code: error instanceof Error && "code" in error ? String(error.code) : "source_review_unavailable" });
    }
  }
  // Regenerate each current selection once; the stable per-selection request
  // ID makes the new revision itself (and repeated deployments) a replay.
  const stale = (await pool.query<LegacyGroup & { request_id: string | null }>(`select g.id,g.subject_id,g.lecture_ids,g.created_by,g.request_id
    from exam_material_groups g join subjects s on s.id=g.subject_id join quizzes q on q.id=g.quiz_id
    where g.summary->>'version'=$1 and s.status='published' and s.deleted_at is null
    and q.status='published' and q.deleted_at is null and ${examGroupVisible}
    and exists (select 1 from unnest($2::text[]) h where position(h in g.summary::text)>0)
    order by g.created_at,g.id`, [String(examSummaryVersion), reextractedSources])).rows;
  const staleSelections = new Map<string, typeof stale>();
  for (const group of stale) {
    const key = group.subject_id + ":" + [...group.lecture_ids].sort().join(":");
    staleSelections.set(key, [...(staleSelections.get(key) ?? []), group]);
  }
  let reextracted = 0;
  for (const [key, groups] of staleSelections) {
    const requestId = finquizRecordId(`${reextractionKey}:` + key);
    if (groups.some(group => group.request_id === requestId || group.request_id === finquizRecordId(`academic-exam-summary-v${examSummaryVersion}:` + (selections.get(key)?.id ?? "")))) continue;
    const group = groups[groups.length - 1]!;
    try {
      const review = await service.generate(group.subject_id, group.lecture_ids, requestId, group.created_by);
      reviews.push({ originalId: group.id, currentId: review.id, subjectId: group.subject_id });
      reextracted++;
    } catch (error) {
      issues.push({ groupId: group.id, code: error instanceof Error && "code" in error ? String(error.code) : "source_review_unavailable" });
    }
  }
  return { key: "academic-exam-summary-v7-reviewed-arabic-2026-10-16", reextracted, legacyGroups: legacy.length, selections: groups.length, published: reviews.length, alreadyCurrent, reviews, issues };
}
