import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { ContentImportService } from "./contentImportService.js";
import { getStorageProvider } from "../files/storageProviderFactory.js";
import { getEnv } from "../config/env.js";
import { subjectMapping } from "../finquiz/catalog.js";
import { courseSourceRevision, reviewCourseAssessments } from "./reviewCourseAssessments.js";

/** Retry the administrator's previously failed upload using the newly
 * verified transcript. Authorization is tied to the exact approved bytes;
 * never classify, publish or replace an arbitrary upload by its title. */
export async function reprocessCyberSecondLecture(pool: Pool, options: { importId?: string; imports?: ContentImportService } = {}) {
  const importId = options.importId ?? "372c9ff7-107e-4482-adce-3be9a16af88d";
  const present = await pool.query("select id from content_imports where id=$1", [importId]);
  if (!present.rowCount) return { status: "not_uploaded" };
  const imports = options.imports ?? new ContentImportService(pool, getStorageProvider(), getEnv().MAX_PDF_SIZE_BYTES);
  let job = await imports.get(importId);
  const subjectId = subjectMapping["cybersecurity-governance"]!;
  if (job.subjectId && job.subjectId !== subjectId) throw new Error("cyber_second_wrong_subject");
  const reviewCurrentEdition = () => reviewCourseAssessments(pool, [subjectId], `${courseSourceRevision()}:recovered:${importId}`);
  if (job.status === "completed") {
    await reviewCurrentEdition();
    return { status: job.status, importId, questionCount: job.questionCount };
  }
  if (job.status !== "failed") return { status: job.status, importId };
  const source = await imports.readSource(importId);
  if (source.bytes.length !== 225458 || createHash("sha256").update(source.bytes).digest("hex") !== "a9575490de2eb2ee2076b9905dfb749c095e0afdf48046c40444f7668a37921c") throw new Error("cyber_second_source_changed");
  const slots = (await pool.query<{ id: string }>("select id from lectures where subject_id=$1 and order_index=2 and status='published' and deleted_at is null", [subjectId])).rows;
  if (slots.length !== 1) throw new Error("cyber_second_ambiguous_slot");
  const changed = await pool.query(`update content_imports set subject_id=$2,lecture_id=$3,updated_at=now() where id=$1 and status='failed'
    and (subject_id is null or subject_id=$2) and (lecture_id is null or lecture_id=$3)`, [importId, subjectId, slots[0]!.id]);
  if (!changed.rowCount) throw new Error("cyber_second_import_changed");
  await imports.retry(importId);
  await imports.processNext(importId);
  job = await imports.get(importId);
  if (job.status !== "completed" || job.subjectId !== subjectId || job.lectures.length !== 1 || job.lectures[0]!.id !== slots[0]!.id) throw new Error("cyber_second_reprocess_incomplete");
  // Import editions append newly generated questions to preserve history.
  // Publish the canonical file-verified edition once after recovery so the
  // current course/lecture tests do not repeat their previous questions.
  await reviewCurrentEdition();
  return { status: job.status, importId, lectureId: slots[0]!.id, questionCount: job.questionCount };
}
