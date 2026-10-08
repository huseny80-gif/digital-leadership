import type { Pool } from "pg";
import type { ImportedLecture } from "@shared/index";
import { normalizeText } from "./sourceAnalysis.js";
import { LEGAL_SUBJECT_ID, legalLectureNumber, legalLectureTitle } from "./legalLectureLabels.js";

interface LectureRow { id: string; title: string; status: string }
interface ItemRow {
  id: string; lecture_id: string; item_type: string; title: string;
  body_text: string | null; file_id: string | null; checksum: string | null;
  file_status: string | null; file_deleted_at: Date | null;
  status: string; order_index: number;
}
interface ImportRow {
  id: string; lecture_id: string | null; lecture_item_id: string | null;
  result_lectures: ImportedLecture[];
}
interface PreviousLabel { table: string; id: string; title: string }
const legacyNumber = (title: string) => /^legal[\s_-]*[1-6]$/.test(normalizeText(title).replace(/\.pdf$/i, "").trim()) ? legalLectureNumber(title) : null;

function sameItem(a: ItemRow, b: ItemRow): boolean {
  if (a.item_type !== b.item_type || a.status !== b.status) return false;
  if (a.item_type === "pdf" && a.file_id && b.file_id && a.file_status === "active" && b.file_status === "active" && !a.file_deleted_at && !b.file_deleted_at)
    return a.file_id === b.file_id || !!(a.checksum && /^[a-f0-9]{64}$/i.test(a.checksum) && a.checksum === b.checksum);
  return a.item_type === "summary" && !a.file_id && !b.file_id &&
    a.title === b.title && !!a.body_text?.trim() && a.body_text.trim() === b.body_text?.trim();
}

/** Remove the former LegalN lecture containers, using protected rename
 * provenance to distinguish them from their Arabic source counterparts.
 * Reattach distinct content and assessment metadata; archive byte-identical
 * PDFs and identical summaries. No source bytes, questions, answer keys,
 * quiz memberships, attempts or grades are deleted or rewritten. */
export async function consolidateLegalContent(pool: Pool) {
  const client = await pool.connect();
  const changed = { lecturesArchived: 0, duplicateItemsArchived: 0, itemsRelinked: 0, questionsRelinked: 0, quizzesRelinked: 0, assignmentsRelinked: 0, importsRelinked: 0, completionsCarried: 0 };
  const replacements = new Map<string, string>();
  const itemReplacements = new Map<string, string>();
  const skippedNumbers: number[] = [];
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '30s'");
    await client.query("select pg_advisory_xact_lock(hashtext('legal-canonical-content-v1'))");
    // Match the import worker's lock order: import rows, then the subject.
    const imports = (await client.query<ImportRow>("select id,lecture_id,lecture_item_id,result_lectures from content_imports where subject_id=$1 order by id for update", [LEGAL_SUBJECT_ID])).rows;
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [LEGAL_SUBJECT_ID]);
    const subject = (await client.query<{ created_by: string }>("select created_by from subjects where id=$1 and deleted_at is null for update", [LEGAL_SUBJECT_ID])).rows[0];
    if (!subject) { await client.query("commit"); return { changed, availableNumbers: [], duplicateNumbers: [], skippedNumbers, remainingLegacyLabels: 0, contentCounts: null }; }
    const lectures = (await client.query<LectureRow>("select id,title,status from lectures where subject_id=$1 and deleted_at is null order by created_at,id for update", [LEGAL_SUBJECT_ID])).rows;
    const history = (await client.query<{ previous_labels: PreviousLabel[] }>("select metadata->'previousLabels' as previous_labels from audit_logs where action='legal_content.labels_normalized' and entity_type='subject' and entity_id=$1 order by created_at", [LEGAL_SUBJECT_ID])).rows;
    const legacyIds = new Set(history.flatMap(row => (row.previous_labels ?? []).filter(label => label.table === "lectures" && legacyNumber(label.title)).map(label => label.id)));
    for (const lecture of lectures) if (legacyNumber(lecture.title)) legacyIds.add(lecture.id);
    for (const number of [1, 2, 3, 4, 5, 6]) {
      const group = lectures.filter(lecture => legalLectureNumber(lecture.title) === number);
      const old = group.filter(lecture => legacyIds.has(lecture.id));
      const canonical = group.filter(lecture => !legacyIds.has(lecture.id));
      // Never remove the sole available fifth/sixth or guess which of two
      // instructor-authored Arabic lectures is the intended replacement.
      if (!old.length || group.length < 2) continue;
      if (canonical.length !== 1 || old.some(lecture => lecture.status !== canonical[0]!.status)) { skippedNumbers.push(number); continue; }
      for (const lecture of old) replacements.set(lecture.id, canonical[0]!.id);
    }
    const oldIds = [...replacements.keys()];
    if (oldIds.length) {
      const foreign = await client.query(`select 1 where
        exists(select 1 from questions q join question_banks b on b.id=q.question_bank_id where q.lecture_id=any($2::uuid[]) and b.subject_id is distinct from $1::uuid)
        or exists(select 1 from quizzes where lecture_id=any($2::uuid[]) and subject_id<>$1)
        or exists(select 1 from assignments where lecture_id=any($2::uuid[]) and subject_id<>$1)
        or exists(select 1 from content_imports i where i.subject_id is distinct from $1::uuid and (i.lecture_id=any($2::uuid[]) or i.lecture_item_id in (select id from lecture_items where lecture_id=any($2::uuid[])) or exists(select 1 from jsonb_array_elements(i.result_lectures) entry where entry->>'id'=any($2::text[]))))`, [LEGAL_SUBJECT_ID, oldIds]);
      if (foreign.rowCount) throw new Error("legal_consolidation_foreign_content_link");
      for (const [oldId, canonicalId] of replacements) {
        const items = (await client.query<ItemRow>(`select i.id,i.lecture_id,i.item_type,i.title,i.body_text,i.file_id,i.status,i.order_index,f.checksum,f.status as file_status,f.deleted_at as file_deleted_at
          from lecture_items i left join files f on f.id=i.file_id
          where i.lecture_id=any($1::uuid[]) and i.deleted_at is null order by i.order_index,i.created_at,i.id for update of i`, [[oldId, canonicalId]])).rows;
        const currentItems = items.filter(item => item.lecture_id === canonicalId);
        let nextIndex = Math.max(-1, ...currentItems.map(item => item.order_index)) + 1;
        for (const item of items.filter(row => row.lecture_id === oldId)) {
          const duplicate = currentItems.find(current => sameItem(item, current));
          if (duplicate) {
            await client.query("update lecture_items set deleted_at=now() where id=$1", [item.id]);
            itemReplacements.set(item.id, duplicate.id);
            changed.duplicateItemsArchived++;
          } else {
            await client.query("update lecture_items set lecture_id=$2,order_index=$3 where id=$1", [item.id, canonicalId, nextIndex++]);
            currentItems.push(item);
            changed.itemsRelinked++;
          }
        }
        // Only parent metadata changes: IDs and the exact graded content stay.
        changed.questionsRelinked += (await client.query("update questions set lecture_id=$2 where lecture_id=$1", [oldId, canonicalId])).rowCount ?? 0;
        changed.quizzesRelinked += (await client.query("update quizzes set lecture_id=$2 where lecture_id=$1", [oldId, canonicalId])).rowCount ?? 0;
        changed.assignmentsRelinked += (await client.query("update assignments set lecture_id=$2 where lecture_id=$1", [oldId, canonicalId])).rowCount ?? 0;
        for (const owner of ["user_id", "guest_session_id"] as const) {
          const carried = await client.query(`insert into lecture_progress(${owner},lecture_id,completed,completed_at,created_at)
            select ${owner},$2,true,completed_at,created_at from lecture_progress where lecture_id=$1 and ${owner} is not null and completed
            on conflict(${owner},lecture_id) do update set completed=true,completed_at=excluded.completed_at where not lecture_progress.completed`, [oldId, canonicalId]);
          changed.completionsCarried += carried.rowCount ?? 0;
        }
        await client.query("update lectures set deleted_at=now() where id=$1", [oldId]);
        changed.lecturesArchived++;
      }
      for (const job of imports) {
        const lectureId = replacements.get(job.lecture_id ?? "") ?? job.lecture_id;
        const itemId = itemReplacements.get(job.lecture_item_id ?? "") ?? job.lecture_item_id;
        const results = job.result_lectures.map(lecture => {
          const id = replacements.get(lecture.id);
          if (!id) return lecture;
          const number = legalLectureNumber(lectures.find(row => row.id === id)!.title)!;
          return { ...lecture, id, title: legalLectureTitle(number), number };
        });
        if (lectureId === job.lecture_id && itemId === job.lecture_item_id && JSON.stringify(results) === JSON.stringify(job.result_lectures)) continue;
        await client.query("update content_imports set lecture_id=$2,lecture_item_id=$3,result_lectures=$4::jsonb,updated_at=now() where id=$1", [job.id, lectureId, itemId, JSON.stringify(results)]);
        changed.importsRelinked++;
      }
      const stale = await client.query(`select 1 where
        exists(select 1 from lecture_items where lecture_id=any($1::uuid[]) and deleted_at is null)
        or exists(select 1 from questions where lecture_id=any($1::uuid[]))
        or exists(select 1 from quizzes where lecture_id=any($1::uuid[]))
        or exists(select 1 from assignments where lecture_id=any($1::uuid[]))
        or exists(select 1 from content_imports where subject_id=$2 and (lecture_id=any($1::uuid[]) or exists(select 1 from jsonb_array_elements(result_lectures) entry where entry->>'id'=any($1::text[]))))`, [oldIds, LEGAL_SUBJECT_ID]);
      if (stale.rowCount) throw new Error("legal_consolidation_stale_content_link");
    }
    const remaining = lectures.filter(lecture => !replacements.has(lecture.id));
    const numbers = remaining.map(lecture => legalLectureNumber(lecture.title)).filter((number): number is number => number !== null);
    const availableNumbers = [...new Set(numbers)].sort((a, b) => a - b);
    const duplicateNumbers = availableNumbers.filter(number => numbers.filter(value => value === number).length > 1);
    const contentCounts = (await client.query<{ lectures: number; lectureItems: number; currentQuestions: number; currentQuizzes: number }>(`select
      (select count(*)::int from lectures where subject_id=$1 and deleted_at is null) as lectures,
      (select count(*)::int from lecture_items i join lectures l on l.id=i.lecture_id where l.subject_id=$1 and l.deleted_at is null and i.deleted_at is null) as "lectureItems",
      (select count(distinct q.id)::int from quiz_questions qq join questions q on q.id=qq.question_id join quizzes z on z.id=qq.quiz_id where z.subject_id=$1 and z.deleted_at is null and z.superseded_by is null and q.deleted_at is null) as "currentQuestions",
      (select count(*)::int from quizzes where subject_id=$1 and deleted_at is null and superseded_by is null) as "currentQuizzes"`, [LEGAL_SUBJECT_ID])).rows[0]!;
    const result = { changed, availableNumbers, duplicateNumbers, skippedNumbers, remainingLegacyLabels: remaining.filter(lecture => legacyNumber(lecture.title)).length, contentCounts };
    if (oldIds.length) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'legal_content.consolidated','subject',$2,$3::jsonb)", [subject.created_by, LEGAL_SUBJECT_ID, JSON.stringify({ ...result, lectureReplacements: Object.fromEntries(replacements), itemReplacements: Object.fromEntries(itemReplacements) })]);
    await client.query("commit");
    return result;
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
