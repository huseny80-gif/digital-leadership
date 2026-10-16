import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { manifest, subjectMapping, type SourceLecture } from "../finquiz/catalog.js";
import { catalogStudyContent, catalogStudyPolicy, type CatalogStudyContent } from "../finquiz/catalogStudyContent.js";
import { catalogSourceBindingSql, findSourceLecture, finquizRecordId } from "../finquiz/recordIdentity.js";
import { ExamMaterialService } from "../examMaterials/examMaterialService.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
interface Slot { id: string; title: string; status: string; order_index: number; catalogSourceId?: string }
interface Prepared { source: SourceLecture; content: CatalogStudyContent }
export const catalogCurriculumPolicy = "catalog-primary-review-v2-arabic-2026-10-16";

/** Register only byte-verified lecture PDFs, with permanent source bindings.
 * Content, summaries and exams use the same files. Prior snapshots stay intact.
 * Missing empty templates and solutions guides are never fabricated lectures. */
export async function refreshCatalogStudyMaterials(pool: Pool, subjectIds = Object.values(subjectMapping)) {
  const reports = [], contentService = new ContentService(new PgContentRepository(pool));
  for (const course of manifest.subjects.filter(course => subjectIds.includes(subjectMapping[course.id]!))) {
    const subjectId = subjectMapping[course.id]!;
    const subject = (await pool.query<{ created_by: string }>("select created_by from subjects where id=$1 and status='published' and deleted_at is null", [subjectId])).rows[0];
    if (!subject) continue;
    const prepared: Prepared[] = [], issues: Array<{ sourceLectureId: string; code: string }> = [];
    for (const source of course.lectures.filter(lecture => lecture.status === "published")) {
      const asset = Object.values(manifest.assets).find(asset => asset.subjectSlug === course.id && !asset.bodyHtml && asset.filename.endsWith(".pdf") && source.files?.some(file => file.url === asset.path));
      if (!asset) { issues.push({ sourceLectureId: source.id, code: "no_primary_pdf" }); continue; }
      try { prepared.push({ source, content: await catalogStudyContent(source, asset) }); }
      catch { issues.push({ sourceLectureId: source.id, code: "source_verification_failed" }); }
    }
    const client = await pool.connect(); let registered = 0, bound = 0;
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [subjectId]);
      const liveParent = await client.query("select id from subjects where id=$1 and status='published' and deleted_at is null for share", [subjectId]);
      if (!liveParent.rowCount) throw new Error("source_subject_changed");
      const slots = (await client.query<Slot>(`select l.id,l.title,l.status,l.order_index,${catalogSourceBindingSql} as "catalogSourceId" from lectures l where l.subject_id=$1 and l.deleted_at is null order by l.created_at,l.id for update of l`, [subjectId])).rows;
      for (const item of prepared) {
        let slot = findSourceLecture(item.source, slots);
        if (!slot) {
          const earlier = await client.query("select 1 from audit_logs where action='catalog_study.source_bound' and metadata->>'subjectId'=$1 and metadata->>'sourceLectureId'=$2 limit 1", [subjectId, item.source.id]);
          if (earlier.rowCount) { issues.push({ sourceLectureId: item.source.id, code: "source_slot_removed" }); continue; }
          // Recover a uniquely identified existing upload rather than duplicate it.
          const matches = (await client.query<Slot>(`select distinct l.id,l.title,l.status,l.order_index from lectures l join lecture_items i on i.lecture_id=l.id join files f on f.id=i.file_id
            where l.subject_id=$1 and l.deleted_at is null and i.deleted_at is null and f.deleted_at is null and f.checksum=$2`, [subjectId, item.content.sha256])).rows;
          if (matches.length > 1) { issues.push({ sourceLectureId: item.source.id, code: "ambiguous_file_slot" }); continue; }
          slot = matches[0];
          if (!slot) {
            const id = finquizRecordId(`${catalogStudyPolicy}:lecture:${item.source.id}`);
            const inserted = (await client.query<Slot>("insert into lectures(id,subject_id,title,description,order_index,status,created_by) values($1,$2,$3,null,$4,'published',$5) on conflict(id) do nothing returning id,title,status,order_index", [id, subjectId, item.source.title, item.source.number, subject.created_by])).rows[0];
            if (!inserted) { issues.push({ sourceLectureId: item.source.id, code: "source_slot_removed" }); continue; }
            slot = inserted; registered++;
          }
          slots.push(slot);
        }
        if (slot.status !== "published") { issues.push({ sourceLectureId: item.source.id, code: "source_slot_private" }); continue; }
        const previous = await client.query("select 1 from audit_logs where action='catalog_study.source_bound' and entity_id=$1 and metadata->>'sha256'=$2 and metadata->>'sourceLectureId'=$3", [slot.id, item.content.sha256, item.source.id]);
        if (!previous.rowCount) {
          await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'catalog_study.source_bound','lecture',$2,$3::jsonb)", [subject.created_by, slot.id, JSON.stringify({ policy: catalogStudyPolicy, subjectId, sourceLectureId: item.source.id, assetId: item.content.assetId, sha256: item.content.sha256 })]);
          bound++;
        }
        if (slot.order_index !== item.source.number) await client.query("update lectures set order_index=$2 where id=$1", [slot.id, item.source.number]);
      }
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    const published = (await contentService.listLecturesForSubjectOrThrow(subjectId, false, { page: 1, limit: 100, offset: 0 })).items;
    const selected = prepared.flatMap(item => {
      const lecture = findSourceLecture(item.source, published);
      return lecture ? [{ lecture, item }] : [];
    });
    let groupId: string | null = null, questionCount = 0;
    if (selected.length) {
      try {
        const requestId = finquizRecordId(`${catalogCurriculumPolicy}:${subjectId}:${hash(selected.map(({ lecture, item }) => [lecture.id, item.content.sha256]))}`);
        const group = await new ExamMaterialService(pool).generate(subjectId, selected.map(item => item.lecture.id), requestId, subject.created_by, "catalog");
        groupId = group.id; questionCount = group.questionCount;
      } catch { issues.push({ sourceLectureId: "course", code: "exam_review_unavailable" }); }
    }
    reports.push({ subjectId, slug: course.id, verifiedFiles: prepared.length, currentLectures: selected.length, registered, bound,
      topics: prepared.reduce((n, item) => n + item.content.topicCount, 0), groupId, questionCount, issues });
  }
  return { policy: catalogCurriculumPolicy, courses: reports };
}
