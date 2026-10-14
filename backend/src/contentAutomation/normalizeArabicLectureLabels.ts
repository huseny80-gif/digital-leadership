import type { Pool } from "pg";
import type { ImportedLecture } from "@shared/index";
import { allCourseLabels } from "./courseSourceLabels.js";
import { cleanArabicDisplayLabel, displayFilename } from "./arabicDisplayLabels.js";
import { oneDriveSourceReview } from "./reviewOneDriveSources.js";
import { catalogSourceBindingSql, findSourceLecture } from "../finquiz/recordIdentity.js";

export const arabicLectureLabelsPolicy = "source-folder-arabic-labels-v1-2026-10-14";
interface LectureRow { id: string; title: string; order_index: number; catalogSourceId?: string }

/** A presentation migration: canonical source titles once, then conservative
 * cleanup. Storage paths, PDF bytes, questions and historical grades stay put. */
export async function normalizeArabicLectureLabels(pool: Pool) {
  const courses = [];
  for (const profile of allCourseLabels) {
    const client = await pool.connect();
    const changed = { lectures: 0, items: 0, files: 0, quizzes: 0, banks: 0, assignments: 0, imports: 0 };
    const previousLabels: Array<{ table: string; id: string; title: string }> = [];
    try {
      await client.query("begin");
      await client.query("set local lock_timeout = '30s'");
      // Match the import worker's lock order before locking the parent.
      const jobs = (await client.query<{ id: string; title: string; filename: string | null; result_lectures: ImportedLecture[] }>("select id,title,filename,result_lectures from content_imports where subject_id=$1 order by id for update", [profile.subjectId])).rows;
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [profile.subjectId]);
      const owner = (await client.query<{ created_by: string }>("select created_by from subjects where id=$1 and deleted_at is null for share", [profile.subjectId])).rows[0];
      if (!owner) { await client.query("commit"); continue; }
      const applied = (await client.query("select 1 from audit_logs where action='course_content.arabic_labels_normalized' and entity_id=$1 and metadata->>'policy'=$2 limit 1", [profile.subjectId, arabicLectureLabelsPolicy])).rowCount;
      const lectures = (await client.query<LectureRow>(`select l.id,l.title,l.order_index,${catalogSourceBindingSql} as "catalogSourceId" from lectures l where l.subject_id=$1 and l.deleted_at is null order by l.created_at,l.id for update of l`, [profile.subjectId])).rows;
      const sourceTitles = new Map(profile.source.lectures.flatMap(source => {
        const lecture = findSourceLecture(source, lectures);
        return lecture ? [[lecture.id, source.title] as const] : [];
      }));
      const titles = new Map<string, string>();
      for (const lecture of lectures) {
        const title = !applied && sourceTitles.has(lecture.id) ? sourceTitles.get(lecture.id)! : profile.label(lecture.title);
        titles.set(lecture.id, title);
        if (title === lecture.title) continue;
        previousLabels.push({ table: "lectures", id: lecture.id, title: lecture.title });
        await client.query("update lectures set title=$2 where id=$1", [lecture.id, title]);
        changed.lectures++;
      }
      const label = (value: string) => {
        let result = profile.label(value);
        // Propagate complete linked labels only; never edit source paragraphs
        // or replace a substring inside another lecture number/title.
        for (const lecture of lectures) for (const prefix of ["", "ملخص ", "الملخص الشامل: ", "اختبار ", "اختبار المحاضرة: "]) {
          if (cleanArabicDisplayLabel(value) === prefix + cleanArabicDisplayLabel(lecture.title)) result = prefix + titles.get(lecture.id)!;
        }
        return result;
      };
      const targets = [
        { table: "lecture_items", key: "items" as const, sql: "select i.id,i.title from lecture_items i join lectures l on l.id=i.lecture_id where l.subject_id=$1 and i.deleted_at is null order by i.id for update of i" },
        { table: "quizzes", key: "quizzes" as const, sql: "select id,title from quizzes where subject_id=$1 and deleted_at is null order by id for update" },
        { table: "question_banks", key: "banks" as const, sql: "select id,title from question_banks where subject_id=$1 and deleted_at is null order by id for update" },
        { table: "assignments", key: "assignments" as const, sql: "select id,title from assignments where subject_id=$1 and deleted_at is null order by id for update" },
      ];
      for (const target of targets) for (const row of (await client.query<{ id: string; title: string }>(target.sql, [profile.subjectId])).rows) {
        const title = label(row.title);
        if (title === row.title) continue;
        previousLabels.push({ table: target.table, id: row.id, title: row.title });
        await client.query(`update ${target.table} set title=$2 where id=$1`, [row.id, title]);
        changed[target.key]++;
      }
      const files = (await client.query<{ id: string; original_filename: string; checksum: string | null }>(`select f.id,f.original_filename,f.checksum from files f where f.deleted_at is null and f.status='active'
        and exists(select 1 from lecture_items i join lectures l on l.id=i.lecture_id where i.file_id=f.id and l.subject_id=$1 and i.deleted_at is null and l.deleted_at is null)
        and not exists(select 1 from lecture_items i join lectures l on l.id=i.lecture_id where i.file_id=f.id and l.subject_id<>$1 and i.deleted_at is null)
        order by f.id for update`, [profile.subjectId])).rows;
      for (const file of files) {
        const verified = oneDriveSourceReview.files.find(source => source.slug === profile.slug && source.sha256 === file.checksum);
        const filename = verified?.canonicalFilename ?? profile.label(displayFilename(file.original_filename));
        if (filename === file.original_filename) continue;
        previousLabels.push({ table: "files", id: file.id, title: file.original_filename });
        await client.query("update files set original_filename=$2 where id=$1", [file.id, filename]);
        changed.files++;
      }
      for (const job of jobs) {
        const title = label(job.title), filename = job.filename ? profile.label(displayFilename(job.filename)) : null;
        const results = job.result_lectures.map(lecture => ({ ...lecture, title: titles.get(lecture.id) ?? label(lecture.title) }));
        if (title === job.title && filename === job.filename && JSON.stringify(results) === JSON.stringify(job.result_lectures)) continue;
        previousLabels.push({ table: "content_imports", id: job.id, title: job.title });
        await client.query("update content_imports set title=$2,filename=$3,result_lectures=$4::jsonb,updated_at=now() where id=$1", [job.id, title, filename, JSON.stringify(results)]);
        changed.imports++;
      }
      if (!applied || previousLabels.length) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'course_content.arabic_labels_normalized','subject',$2,$3::jsonb)", [owner.created_by, profile.subjectId, JSON.stringify({ policy: arabicLectureLabelsPolicy, changed, previousLabels })]);
      await client.query("commit");
      courses.push({ slug: profile.slug, changed, lectures: lectures.map(lecture => ({ id: lecture.id, title: titles.get(lecture.id)!, number: lecture.order_index })) });
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }
  return { policy: arabicLectureLabelsPolicy, courses };
}
