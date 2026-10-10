import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { getStorageProvider } from "../../src/files/storageProviderFactory.js";
import { createLectureItem } from "./seedFixtures.js";

/** An actual private file fixture, not an unverified body_text shortcut. */
export async function createExamSourceFile(pool: Pool, options: { lectureId: string; createdBy: string; text: string; title?: string; filename?: string }) {
  const bytes = Buffer.from(options.text, "utf8"), key = `exam-source-test/${randomUUID()}.txt`;
  await getStorageProvider().upload(key, bytes, "text/plain");
  const fileId = (await pool.query<{ id: string }>(`insert into files(storage_key,original_filename,mime_type,size_bytes,checksum,uploaded_by)
    values($1,$2,'text/plain',$3,$4,$5) returning id`, [key, options.filename ?? "المحاضرة.txt", bytes.length, createHash("sha256").update(bytes).digest("hex"), options.createdBy])).rows[0]!.id;
  const itemId = await createLectureItem(pool, { lectureId: options.lectureId, createdBy: options.createdBy, itemType: "pdf", title: options.title ?? "ملف المحاضرة", status: "published", fileId, bodyText: options.text });
  return { fileId, itemId, storageKey: key };
}
