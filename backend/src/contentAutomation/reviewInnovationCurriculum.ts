import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { ImportedLecture } from "@shared/index";
import { courseLabelsForSubject } from "./courseSourceLabels.js";
import { cleanArabicDisplayLabel } from "./arabicDisplayLabels.js";
import { normalizeText } from "./sourceAnalysis.js";
import { consolidateCourseContent } from "./consolidateLegalContent.js";
import { reviewCourseAssessments } from "./reviewCourseAssessments.js";
import { manifest, subjectMapping, LibraryService } from "../finquiz/catalog.js";
import { catalogSourceBindingSql, findSourceLecture, finquizRecordId } from "../finquiz/recordIdentity.js";
import { catalogStudyContent } from "../finquiz/catalogStudyContent.js";
import { actualFileText, LectureSourceFiles } from "../examMaterials/lectureSourceFiles.js";
import { ExamMaterialService } from "../examMaterials/examMaterialService.js";
import { ContentService } from "../content/contentService.js";
import { PgContentRepository } from "../content/contentRepository.js";
import { getStorageProvider } from "../files/storageProviderFactory.js";
import type { StorageProvider } from "../files/storageProvider.js";

export const innovationSubjectId = subjectMapping["innovation-project-management"]!;
export const innovationReviewPolicy = "innovation-source-curriculum-v1-2026-10-14";
const profile = courseLabelsForSubject(innovationSubjectId)!;
const marked = (title: string) => /^\s*\[\s*مكرر(?:\s|\]|-)/u.test(cleanArabicDisplayLabel(title));
const stripMarker = (title: string) => cleanArabicDisplayLabel(title).replace(/^\[\s*مكرر[^\]]*\]\s*/u, "");
const ordinals = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة", "السادسة"].map(normalizeText);

/** Presentation within the verified innovation subject only, never classification
 * of an arbitrary upload or evidence that a missing lecture exists. */
export function innovationLectureNumber(title: string): number | null {
  const cleaned = stripMarker(title).replace(/\.(?:pdf|pptx)$/iu, "");
  const known = profile.numberOf(cleaned);
  if (known && known <= 6) return known;
  const match = /^(?:المحاضرة|محاضرة)[\s_-]+(\S+)(.*)$/u.exec(normalizeText(cleaned));
  if (!match || !/^(?:\s+(?:في\s+)?(?:مادة\s+)?(?:ال)?ابتكار(?:\s+وادارة\s+المشاريع(?:\s+الرقمية)?)?)?$/u.test(match[2]!)) return null;
  const number = /^\d$/u.test(match[1]!) ? Number(match[1]) : ordinals.indexOf(match[1]!) + 1;
  return number >= 1 && number <= 6 ? number : null;
}

interface Slot { id: string; title: string; status: string; order_index: number; updated_at: Date; catalogSourceId?: string }
interface FileLink { id: string; lecture_id: string; original_filename: string; storage_key: string; checksum: string | null; size_bytes: string }

/** Retire duplicate containers through the existing history-preserving merger.
 * A lecture number, an empty template or a stored summary never substitutes for
 * an original PDF. Source gaps are reported explicitly, without dummy lectures. */
export async function reviewInnovationCurriculum(pool: Pool, storage: StorageProvider = getStorageProvider()) {
  const subject = (await pool.query<{ created_by: string }>("select created_by from subjects where id=$1 and deleted_at is null", [innovationSubjectId])).rows[0];
  if (!subject) return { policy: innovationReviewPolicy, status: "subject_missing" };
  const slots = (await pool.query<Slot>(`select l.id,l.title,l.status,l.order_index,l.updated_at,${catalogSourceBindingSql} as "catalogSourceId"
    from lectures l where l.subject_id=$1 and l.deleted_at is null order by l.created_at,l.id`, [innovationSubjectId])).rows;
  const files = (await pool.query<FileLink>(`select distinct f.id,i.lecture_id,f.original_filename,f.storage_key,f.checksum,f.size_bytes::text
    from lecture_items i join lectures l on l.id=i.lecture_id join files f on f.id=i.file_id
    where l.subject_id=$1 and l.deleted_at is null and i.deleted_at is null and i.item_type in ('pdf','summary')
    and f.status='active' and f.deleted_at is null and f.mime_type='application/pdf'`, [innovationSubjectId])).rows;
  const source = manifest.subjects.find(course => course.id === "innovation-project-management")!;
  const evidence = new Map<string, Set<number>>(), issues: Array<{ lectureId: string; code: string }> = [];
  const originalHashes = new Map<string, number>();
  const add = (id: string, number: number) => { const found = evidence.get(id) ?? new Set<number>(); found.add(number); evidence.set(id, found); };
  for (const original of source.lectures.filter(lecture => !lecture.demo)) {
    const asset = Object.values(manifest.assets).find(asset => !asset.bodyHtml && asset.filename.endsWith(".pdf") && original.files?.some(file => file.url === asset.path));
    if (!asset) continue;
    await catalogStudyContent(original, asset);
    originalHashes.set(asset.sha256, original.number);
    const slot = findSourceLecture(original, slots);
    if (slot) add(slot.id, original.number);
  }
  const extracted = new Map<string, number | null>();
  for (const file of files) {
    try {
      let number = extracted.get(file.id);
      if (!extracted.has(file.id)) {
        if (!storage.read) throw new Error("private_source_unavailable");
        const bytes = await storage.read(file.storage_key), sha256 = createHash("sha256").update(bytes).digest("hex");
        if (bytes.length !== Number(file.size_bytes) || file.checksum && sha256 !== file.checksum) throw new Error("source_changed");
        const actual = await actualFileText(bytes, file.original_filename, "application/pdf");
        if (actual.text.trim().length < 100) throw new Error("insufficient_source_text");
        number = originalHashes.get(sha256) ?? innovationLectureNumber(file.original_filename);
        extracted.set(file.id, number ?? null);
      }
      const slot = slots.find(slot => slot.id === file.lecture_id)!;
      number ??= innovationLectureNumber(slot.title) ?? (slot.order_index >= 1 && slot.order_index <= 6 ? slot.order_index : null);
      if (number) add(slot.id, number);
    } catch { issues.push({ lectureId: file.lecture_id, code: "original_pdf_unreadable" }); }
  }
  const labels: Array<{ table: string; id: string; title: string }> = [];
  const preferredLectureIds = new Map<number, string>();
  for (const original of source.lectures.filter(lecture => !lecture.demo)) {
    const slot = findSourceLecture(original, slots);
    if (slot) preferredLectureIds.set(original.number, slot.id);
  }
  const client = await pool.connect(); let hiddenTemplates = 0;
  try {
    await client.query("begin");
    await client.query("set local lock_timeout='30s'");
    const jobs = (await client.query<{ id: string; lecture_id: string | null; title: string; result_lectures: ImportedLecture[] }>("select id,lecture_id,title,result_lectures from content_imports where subject_id=$1 order by id for update", [innovationSubjectId])).rows;
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [innovationSubjectId]);
    const current = (await client.query<{ id: string; updated_at: Date }>("select id,updated_at from lectures where subject_id=$1 and deleted_at is null order by id for update", [innovationSubjectId])).rows;
    if (current.length !== slots.length || current.some(row => row.updated_at.toISOString() !== slots.find(slot => slot.id === row.id)?.updated_at.toISOString())) throw new Error("innovation_sources_changed");
    const currentFiles = (await client.query<FileLink>("select id,original_filename,storage_key,checksum,size_bytes::text from files where id=any($1::uuid[]) and status='active' and deleted_at is null for update", [[...new Set(files.map(file => file.id))]])).rows;
    if (currentFiles.length !== new Set(files.map(file => file.id)).size || currentFiles.some(file => {
      const before = files.find(before => before.id === file.id)!;
      return file.checksum !== before.checksum || file.storage_key !== before.storage_key || file.size_bytes !== before.size_bytes || file.original_filename !== before.original_filename;
    })) throw new Error("innovation_sources_changed");
    const applied = (await client.query("select 1 from audit_logs where action='innovation_curriculum.labels_normalized' and entity_id=$1 and metadata->>'policy'=$2 limit 1", [innovationSubjectId, innovationReviewPolicy])).rowCount;
    const titles = new Map<string, { title: string; number: number }>();
    for (const slot of slots) {
      const candidates = evidence.get(slot.id);
      if (candidates && candidates.size > 1) { issues.push({ lectureId: slot.id, code: "multiple_lecture_sources" }); continue; }
      const number = candidates?.values().next().value ?? innovationLectureNumber(slot.title);
      const demo = source.lectures.find(lecture => lecture.demo && (lecture.id === slot.catalogSourceId || finquizRecordId("lecture:" + lecture.id) === slot.id));
      if (!applied && demo && !candidates?.size && slot.status === "published") {
        await client.query("update lectures set status='draft' where id=$1", [slot.id]); hiddenTemplates++;
      }
      if (!number) continue;
      const title = profile.titleOf(number); titles.set(slot.id, { title, number });
      if (title !== slot.title || slot.order_index !== number) {
        labels.push({ table: "lectures", id: slot.id, title: slot.title });
        await client.query("update lectures set title=$2,order_index=$3 where id=$1", [slot.id, title, number]);
      }
    }
    const label = (value: string) => {
      for (const slot of slots) for (const prefix of ["", "ملخص ", "اختبار ", "الملخص الشامل: ", "اختبار المحاضرة: "]) {
        if (cleanArabicDisplayLabel(value) === prefix + cleanArabicDisplayLabel(slot.title) && titles.has(slot.id)) return prefix + titles.get(slot.id)!.title;
      }
      return profile.label(value);
    };
    for (const table of ["lecture_items", "quizzes", "assignments", "question_banks"] as const) {
      const sql = table === "lecture_items" ? "select i.id,i.title from lecture_items i join lectures l on l.id=i.lecture_id where l.subject_id=$1 and i.deleted_at is null for update of i" : `select id,title from ${table} where subject_id=$1 and deleted_at is null for update`;
      for (const row of (await client.query<{ id: string; title: string }>(sql, [innovationSubjectId])).rows) {
        const title = label(row.title);
        if (title !== row.title) { labels.push({ table, id: row.id, title: row.title }); await client.query(`update ${table} set title=$2 where id=$1`, [row.id, title]); }
      }
    }
    for (const job of jobs) {
      const results = job.result_lectures.map(lecture => ({ ...lecture, ...(titles.get(lecture.id) ?? {}) })), title = label(job.title);
      if (title !== job.title || JSON.stringify(results) !== JSON.stringify(job.result_lectures)) await client.query("update content_imports set title=$2,result_lectures=$3::jsonb,updated_at=now() where id=$1", [job.id, title, JSON.stringify(results)]);
    }
    for (const file of currentFiles) {
      const owners = files.filter(link => link.id === file.id).map(link => titles.get(link.lecture_id));
      if (owners.some(owner => !owner) || new Set(owners.map(owner => owner!.number)).size !== 1) continue;
      await client.query(`update files f set original_filename=$2 where f.id=$1 and f.original_filename<>$2 and not exists
        (select 1 from lecture_items i join lectures l on l.id=i.lecture_id where i.file_id=f.id and i.deleted_at is null and l.subject_id<>$3)`, [file.id, owners[0]!.title + ".pdf", innovationSubjectId]);
    }
    if (!applied || labels.length || hiddenTemplates) await client.query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,metadata) values($1,'innovation_curriculum.labels_normalized','subject',$2,$3::jsonb)", [subject.created_by, innovationSubjectId, JSON.stringify({ policy: innovationReviewPolicy, previousLabels: labels, hiddenTemplates })]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
  const consolidation = await consolidateCourseContent(pool, { ...profile, numberOf: innovationLectureNumber,
    legacyNumber: value => marked(value) ? innovationLectureNumber(value) : profile.legacyNumber(value), preferredLectureIds,
    labelsAuditAction: "innovation_curriculum.labels_normalized", auditAction: "innovation_curriculum.duplicates_removed", lockKey: innovationReviewPolicy });
  const content = new ContentService(new PgContentRepository(pool)), library = new LibraryService(content), reader = new LectureSourceFiles(pool, library);
  const lectures = (await content.listLecturesForSubjectOrThrow(innovationSubjectId, false, { page: 1, limit: 100, offset: 0 })).items;
  const catalog = await library.get(innovationSubjectId, false);
  const verified: Array<{ id: string; number: number; files: Array<{ id: string; sha256: string }> }> = [];
  for (const lecture of lectures) {
    const number = innovationLectureNumber(lecture.title);
    if (!number) continue;
    try {
      const result = await reader.read(innovationSubjectId, [lecture], catalog);
      verified.push({ id: lecture.id, number, files: result.sources[0]!.documents.map(document => ({ id: document.id, sha256: document.sha256 })) });
    } catch { issues.push({ lectureId: lecture.id, code: "original_pdf_unavailable" }); }
  }
  const availableNumbers = [...new Set(verified.map(lecture => lecture.number))].sort((a, b) => a - b);
  const digest = createHash("sha256").update(JSON.stringify(verified)).digest("hex");
  const assessments = verified.length && !consolidation.duplicateNumbers.length
    ? await reviewCourseAssessments(pool, [innovationSubjectId], innovationReviewPolicy + ":" + digest) : null;
  let groupId: string | null = null;
  if (verified.length && !consolidation.duplicateNumbers.length) {
    try { groupId = (await new ExamMaterialService(pool).generate(innovationSubjectId, verified.map(lecture => lecture.id), finquizRecordId(innovationReviewPolicy + ":" + digest), subject.created_by)).id; }
    catch { issues.push({ lectureId: "course", code: "exam_review_unavailable" }); }
  }
  return { policy: innovationReviewPolicy, subjectId: innovationSubjectId, labelsUpdated: labels.length, hiddenTemplates, consolidation,
    lectures: lectures.map(lecture => ({ id: lecture.id, title: lecture.title, number: lecture.orderIndex })), verified,
    availableNumbers, missingNumbers: [1, 2, 3, 4, 5, 6].filter(number => !availableNumbers.includes(number)), groupId, assessments, issues };
}
