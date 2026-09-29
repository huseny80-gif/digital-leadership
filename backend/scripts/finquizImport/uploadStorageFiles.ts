/**
 * Phase 20.4 — Storage Files Completion (READY TO RUN, NOT YET EXECUTED).
 *
 * Prepared during Phase 20.4 when this session had no Supabase Storage
 * upload capability (no MCP storage tool, no service-role key). This
 * script needs a session/environment that has:
 *   - `SUPABASE_URL`      (same project: pkfxotbirtmfrgxcfufj)
 *   - `SUPABASE_SERVICE_ROLE_KEY`  (from the real `backend/.env` —
 *     never committed; see `backend/src/files/supabaseStorageProvider.ts`)
 *   - `DATABASE_URL`      (direct Postgres connection to the same project,
 *     for the `files`/`lecture_items` inserts — service-role key does not
 *     grant Postgres access, only Storage access)
 *   - a local checkout of the Finquiz source repo, with its path in
 *     `FINQUIZ_REPO_DIR` (the directory that CONTAINS `data/` and `files/`,
 *     e.g. what this session had at `/home/user/huseny80-gif/finquiz`)
 *
 * What it does, per manifest entry:
 *   1. Reads the real PDF bytes from `${FINQUIZ_REPO_DIR}/${sourcePath}`.
 *   2. Generates a fresh file id (`generateFileId()`) and object key via
 *      the existing `buildObjectKey()` convention — same function the
 *      running backend uses for every other file, so no new naming rule
 *      is introduced.
 *   3. Uploads to the `educational-files` bucket via
 *      `SupabaseStorageProvider.upload()` (same class the backend uses).
 *   4. Verifies the object exists in `storage.objects` (Postgres query;
 *      `storage.objects` is queryable like any other table).
 *   5. Inserts one `files` row (dependency: none) then one `lecture_items`
 *      row (dependency: `files.id`) in a single transaction per manifest
 *      entry, matching the dependency order already used in Phase 20.3.
 *   6. After all entries: verifies signed-URL generation works for every
 *      inserted file, and checks for orphan `lecture_items` (a `file_id`
 *      that doesn't resolve to a `files` row — should never happen given
 *      the FK, but checked explicitly per the Phase 20.4 brief).
 *
 * What it deliberately does NOT do:
 *   - touch `lectures`, `questions`, `quizzes`, `assignments`, or any
 *     other content table (Phase 20.4 rule #1/#2).
 *   - insert a `files`/`lecture_items` row before its object is confirmed
 *     uploaded (Phase 20.4 rule #2 — "no placeholder file rows").
 *   - `upsert`/overwrite an existing object (`upload()` already passes
 *     `upsert: false` per `SupabaseStorageProvider`'s own PHASE 08 §16
 *     contract) — if a manifest entry's object key were ever re-run, it
 *     fails loudly rather than silently overwriting.
 *
 * Run with: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... \
 *   FINQUIZ_REPO_DIR=... npx tsx backend/scripts/finquizImport/uploadStorageFiles.ts`
 *
 * The script is idempotent at the manifest level: re-running it after a
 * partial failure skips any `lectureId` that already has a non-deleted
 * `lecture_items` row of type `pdf` pointing at a `files` row (checked
 * before upload, so a retry never double-uploads or double-inserts).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { SupabaseStorageProvider } from "../../src/files/supabaseStorageProvider.js";
import { buildObjectKey, sanitizeFilename } from "../../src/files/objectPath.js";

const ADMIN_USER_ID = "6d8bc8e6-1962-4c3f-8b4f-88f83f717470";
const BUCKET = "educational-files";

/**
 * The 15 lecture→PDF links approved for import (Phase 19/20.2-B scope:
 * "real PDF files only"). Resolved against the ACTUAL production subject
 * and lecture UUIDs already inserted in Phase 20.3 — this script inserts
 * NO new lectures/subjects, only references them.
 *
 * `sourcePath` is relative to `FINQUIZ_REPO_DIR` (i.e. `${FINQUIZ_REPO_DIR}/${sourcePath}`
 * is the real PDF file on disk, already verified present in Phase 20.4).
 *
 * Two entries (ai-week1, ai-week2) point at the SAME physical PDF bytes
 * (`files/ai-data/Ai-week1-week2.pdf`) because the Finquiz source itself
 * links that one file from two separate lectures. Consistent with the
 * existing `buildObjectKey()`/`filesService.ts` design (no dedup
 * mechanism exists in the codebase — every upload gets its own file id
 * and object key even if the bytes are identical), this script uploads it
 * twice, once per lecture, rather than introducing new dedup logic.
 */
const MANIFEST: Array<{
  finquizLectureId: string;
  lectureId: string;
  subjectId: string;
  lectureTitle: string;
  sourcePath: string;
  originalFilename: string;
}> = [
  {
    finquizLectureId: "ai-l1",
    lectureId: "f9e3d5d4-8067-41df-ba13-7b397ee29c62",
    subjectId: "2d6c0980-e4d2-4687-9027-cf090b3d1a67",
    lectureTitle: "الأسبوع الأول — كلود Claude: مدخل إلى الذكاء الاصطناعي التوليدي",
    sourcePath: "files/ai-data/Ai-week1-week2.pdf",
    originalFilename: "Ai-week1-week2.pdf",
  },
  {
    finquizLectureId: "ai-l2",
    lectureId: "a6c118f1-1c5b-4e9f-b9f8-433873c6b246",
    subjectId: "2d6c0980-e4d2-4687-9027-cf090b3d1a67",
    lectureTitle: "الأسبوع الثاني — جولة داخل كلود: الواجهات والإعدادات",
    sourcePath: "files/ai-data/Ai-week1-week2.pdf",
    originalFilename: "Ai-week1-week2.pdf",
  },
  {
    finquizLectureId: "lg-l1",
    lectureId: "6fa3b55b-ea1d-40d0-a738-05539a0cc8cb",
    subjectId: "ade09563-02ec-4a09-a97b-58857f6cd876",
    lectureTitle: "التحول الإلكتروني وأثره في الإدارة والوظيفة العامة",
    sourcePath: "files/legal-regulatory/Legal1.pdf",
    originalFilename: "Legal1.pdf",
  },
  {
    finquizLectureId: "lg-l3",
    lectureId: "cf93ea5c-3794-4bc0-809f-2d186fe0bb10",
    subjectId: "ade09563-02ec-4a09-a97b-58857f6cd876",
    lectureTitle: "الثقافة القانونية والتنظيمية في عصر التحول الرقمي والحكومة الرقمية والمشروعية",
    sourcePath: "files/legal-regulatory/Legal2.pdf",
    originalFilename: "Legal2.pdf",
  },
  {
    finquizLectureId: "lg-l4",
    lectureId: "179073ca-8fd3-4c04-b155-1fe7a7c7dae6",
    subjectId: "ade09563-02ec-4a09-a97b-58857f6cd876",
    lectureTitle: "المعاملات والوثائق والتوقيع الإلكتروني",
    sourcePath: "files/legal-regulatory/Legal3.pdf",
    originalFilename: "Legal3.pdf",
  },
  {
    finquizLectureId: "lg-l2",
    lectureId: "60803dae-409a-4b99-bb19-fd90aaf03207",
    subjectId: "ade09563-02ec-4a09-a97b-58857f6cd876",
    lectureTitle: "حماية البيانات والخصوصية",
    sourcePath: "files/legal-regulatory/Legal4.pdf",
    originalFilename: "Legal4.pdf",
  },
  {
    finquizLectureId: "cs-l1",
    lectureId: "ff007bfd-8150-44ca-816c-7084f5dd160b",
    subjectId: "bc861a76-620d-4646-81ca-c49d24665b75",
    lectureTitle: "مقدمة في الأمن السيبراني وحوكمة أمن المعلومات",
    sourcePath: "files/cybersecurity-governance/Cybersecurity1.pdf",
    originalFilename: "Cybersecurity1.pdf",
  },
  {
    finquizLectureId: "cs-l3",
    lectureId: "5d20506b-6140-4285-8f88-aaefe2646578",
    subjectId: "bc861a76-620d-4646-81ca-c49d24665b75",
    lectureTitle: "إطار NIST CSF 2.0 للأمن السيبراني ووظيفة الحوكمة (Govern)",
    sourcePath: "files/cybersecurity-governance/Cybersecurity3.pdf",
    originalFilename: "Cybersecurity3.pdf",
  },
  {
    finquizLectureId: "cs-l4",
    lectureId: "e5980770-ba9d-41a7-903c-9d6e7babf630",
    subjectId: "bc861a76-620d-4646-81ca-c49d24665b75",
    lectureTitle: "معيار ISO 27014 وISO 27001: العلاقة بين الحوكمة والإدارة",
    sourcePath: "files/cybersecurity-governance/Cybersecurity4.pdf",
    originalFilename: "Cybersecurity4.pdf",
  },
  {
    finquizLectureId: "ip-l1",
    lectureId: "930415c5-0f95-428f-8faf-91586418b666",
    subjectId: "7eb2b714-570f-4ed0-a00e-10efec7a20e5",
    lectureTitle: "الابتكار وإدارة المشاريع الرقمية ودور الابتكار في الاقتصاد الرقمي",
    sourcePath: "files/innovation-project-management/Innovation1.pdf",
    originalFilename: "Innovation1.pdf",
  },
  {
    finquizLectureId: "ip-l3",
    lectureId: "a066a19e-b300-4602-8271-b1f17e78d7a8",
    subjectId: "7eb2b714-570f-4ed0-a00e-10efec7a20e5",
    lectureTitle: "نظريات ونماذج الابتكار الحديثة: الأطر النظرية والتطبيقات الاستراتيجية",
    sourcePath: "files/innovation-project-management/Innovation2.pdf",
    originalFilename: "Innovation2.pdf",
  },
  {
    finquizLectureId: "ip-l4",
    lectureId: "0e7e78be-7d50-4383-aed4-6a16e8bae0be",
    subjectId: "7eb2b714-570f-4ed0-a00e-10efec7a20e5",
    lectureTitle: "الابتكار في البيئة الرقمية: الاقتصاد الرقمي والمنصات ونماذج الأعمال",
    sourcePath: "files/innovation-project-management/Innovation4.pdf",
    originalFilename: "Innovation4.pdf",
  },
  {
    finquizLectureId: "rm-l1",
    lectureId: "ce0a0ce7-95dc-4750-99aa-7568334cee96",
    subjectId: "1f4d2071-d1c9-46ee-a848-d5c90eedf287",
    lectureTitle: "الفصل الأول — لماذا لا تكفي معرفة الخطر؟",
    sourcePath: "files/risk-management/RiskManagement1.pdf",
    originalFilename: "RiskManagement1.pdf",
  },
  {
    finquizLectureId: "rm-l2",
    lectureId: "6f12fddb-e99c-4c5e-a0ee-fb18d4833b8d",
    subjectId: "1f4d2071-d1c9-46ee-a848-d5c90eedf287",
    lectureTitle: "الفصل الثاني — من سجلّ إلى منظومة",
    sourcePath: "files/risk-management/RiskManagement2.pdf",
    originalFilename: "RiskManagement2.pdf",
  },
  {
    finquizLectureId: "rm-l3",
    lectureId: "8f3021a3-4166-4437-a76d-5b7945d135da",
    subjectId: "1f4d2071-d1c9-46ee-a848-d5c90eedf287",
    lectureTitle: "الفصل الثالث — من يملك هذا الخطر؟",
    sourcePath: "files/risk-management/RiskManagement3.pdf",
    originalFilename: "RiskManagement3.pdf",
  },

  // NOT included, by design (no PDF exists for these in the Finquiz
  // source — "real PDF files only" scope excludes them):
  //   cs-l2 "السياسات وإدارة الحوادث السيبرانية" (22e9b1f2-e9d5-473e-830b-b90dbcfa0b4d)
  //   ip-l2 "دورة حياة المشروع والقيود الثلاثية" (c114804a-4c75-459f-8393-d4388a30c068)
];

async function main() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const databaseUrl = requireEnv("DATABASE_URL");
  const finquizRepoDir = requireEnv("FINQUIZ_REPO_DIR");

  const storage = new SupabaseStorageProvider(BUCKET, supabaseUrl, serviceRoleKey);
  const pool = new Pool({ connectionString: databaseUrl });

  const results: Array<{ lectureId: string; fileId: string; objectKey: string; status: "uploaded" | "skipped-existing" }> = [];

  try {
    for (const entry of MANIFEST) {
      // Idempotency check: skip if this lecture already has a non-deleted
      // pdf lecture_item pointing at a files row.
      const existing = await pool.query(
        `select li.id, li.file_id from lecture_items li
         where li.lecture_id = $1 and li.item_type = 'pdf' and li.deleted_at is null`,
        [entry.lectureId],
      );
      if (existing.rows.length > 0) {
        console.log(`[skip] ${entry.finquizLectureId} (${entry.lectureId}) already has a pdf lecture_item — not re-uploading.`);
        results.push({ lectureId: entry.lectureId, fileId: existing.rows[0].file_id, objectKey: "(pre-existing)", status: "skipped-existing" });
        continue;
      }

      const absolutePath = path.resolve(finquizRepoDir, entry.sourcePath);
      const buffer = await readFile(absolutePath);
      const fileId = randomUUID();
      const safeFilename = sanitizeFilename(entry.originalFilename);
      const objectKey = buildObjectKey({
        subjectId: entry.subjectId,
        lectureId: entry.lectureId,
        fileId,
        safeFilename,
      });

      console.log(`[upload] ${entry.finquizLectureId} -> ${objectKey} (${buffer.length} bytes)`);
      await storage.upload(objectKey, buffer, "application/pdf");

      // Verify the object actually landed in storage.objects before
      // inserting any DB row referencing it (rule: no placeholder rows).
      const objectCheck = await pool.query(
        `select id from storage.objects where bucket_id = $1 and name = $2`,
        [BUCKET, objectKey],
      );
      if (objectCheck.rows.length === 0) {
        throw new Error(`Upload reported success but storage.objects has no row for "${objectKey}" — aborting before any DB insert.`);
      }

      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `insert into files (id, storage_key, original_filename, mime_type, size_bytes, uploaded_by)
           values ($1, $2, $3, $4, $5, $6)`,
          [fileId, objectKey, safeFilename, "application/pdf", buffer.length, ADMIN_USER_ID],
        );
        const lectureItemId = randomUUID();
        // order_index 0 — a pdf attachment is the only lecture_item this
        // script creates per lecture; existing lecture_items (if any) are
        // untouched, consistent with rule #1/#2.
        await client.query(
          `insert into lecture_items (id, lecture_id, item_type, title, file_id, order_index, status, created_by)
           values ($1, $2, 'pdf', $3, $4, 0, 'published', $5)`,
          [lectureItemId, entry.lectureId, entry.originalFilename.replace(/\.pdf$/i, ""), fileId, ADMIN_USER_ID],
        );
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        // Best-effort cleanup of the orphaned storage object so a retry
        // doesn't collide (upload() uses upsert:false).
        await storage.delete(objectKey).catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      results.push({ lectureId: entry.lectureId, fileId, objectKey, status: "uploaded" });
    }

    // Post-import verification.
    console.log("\n--- Verification ---");

    // 1. Signed URL flow for every file just inserted (or pre-existing).
    for (const r of results) {
      const row = await pool.query(`select storage_key from files where id = $1`, [r.fileId]);
      if (row.rows.length === 0) {
        console.error(`[FAIL] files row missing for ${r.fileId}`);
        continue;
      }
      const signedUrl = await storage.getSignedUrl(row.rows[0].storage_key, 60);
      console.log(`[ok] signed URL generated for ${r.fileId}: ${signedUrl.slice(0, 60)}...`);
    }

    // 2. Orphan check: lecture_items with a file_id not present in files.
    const orphans = await pool.query(
      `select li.id, li.lecture_id, li.file_id from lecture_items li
       left join files f on f.id = li.file_id
       where li.file_id is not null and f.id is null and li.deleted_at is null`,
    );
    console.log(`Orphan lecture_items (file_id with no matching files row): ${orphans.rows.length}`);
    if (orphans.rows.length > 0) {
      console.error(orphans.rows);
    }

    // 3. Row-count summary.
    const counts = await pool.query(
      `select (select count(*) from files) as files_total,
              (select count(*) from lecture_items where item_type = 'pdf' and deleted_at is null) as pdf_lecture_items_total`,
    );
    console.log("Final counts:", counts.rows[0]);

    console.log(`\nDone. ${results.filter((r) => r.status === "uploaded").length} uploaded, ${results.filter((r) => r.status === "skipped-existing").length} already present.`);
  } finally {
    await pool.end();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
