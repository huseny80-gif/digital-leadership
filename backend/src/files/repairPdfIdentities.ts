import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { getEnv } from "../config/env.js";
import type { StorageProvider } from "./storageProvider.js";
import { getStorageProvider } from "./storageProviderFactory.js";

export const pdfIdentityPolicy = "original-pdf-byte-identity-v1-2026-10-18";
interface LegacyPdf { id: string; storage_key: string; size_bytes: string; checksum: string | null }

/** Older file rows predate upload-time SHA-256. Read their private originals
 * once, verify the declared byte length, then record the computed digest.
 * Never infer identity from a filename, remove a file or rewrite its bytes.
 * CAS plus the audit insert is one atomic statement, so a replacement or
 * archive during the storage read cannot receive the old version's hash. */
export async function repairPdfIdentities(
  pool: Pool,
  storage: StorageProvider = getStorageProvider(),
  maxBytes = getEnv().MAX_PDF_SIZE_BYTES,
) {
  const files = (await pool.query<LegacyPdf>(`select f.id,f.storage_key,f.size_bytes::text,f.checksum from files f
    where f.status='active' and f.deleted_at is null and f.mime_type='application/pdf'
      and (f.checksum is null or f.checksum !~* '^[a-f0-9]{64}$')
      and exists(select 1 from lecture_items i join lectures l on l.id=i.lecture_id join subjects s on s.id=l.subject_id
        where i.file_id=f.id and i.item_type='pdf' and i.status='published' and l.status='published' and s.status='published'
          and i.deleted_at is null and l.deleted_at is null and s.deleted_at is null)
    order by f.id`)).rows;
  const issues: Array<{ fileId: string; code: string }> = [];
  let repaired = 0;
  for (const file of files) {
    const size = Number(file.size_bytes);
    if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) {
      issues.push({ fileId: file.id, code: "source_size_not_allowed" }); continue;
    }
    if (!storage.read) { issues.push({ fileId: file.id, code: "storage_read_unavailable" }); continue; }
    let bytes: Buffer;
    try { bytes = await storage.read(file.storage_key); }
    catch { issues.push({ fileId: file.id, code: "source_read_failed" }); continue; }
    if (bytes.length !== size || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      issues.push({ fileId: file.id, code: "source_bytes_mismatch" }); continue;
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    try {
      const result = await pool.query(`with verified as (
        update files f set checksum=$5 where f.id=$1 and f.storage_key=$2 and f.checksum is not distinct from $3
          and f.size_bytes=$4 and f.status='active' and f.deleted_at is null and f.mime_type='application/pdf'
          and (f.checksum is null or f.checksum !~* '^[a-f0-9]{64}$')
          and exists(select 1 from lecture_items i join lectures l on l.id=i.lecture_id join subjects s on s.id=l.subject_id
            where i.file_id=f.id and i.item_type='pdf' and i.status='published' and l.status='published' and s.status='published'
              and i.deleted_at is null and l.deleted_at is null and s.deleted_at is null)
        returning f.id
      ) insert into audit_logs(action,entity_type,entity_id,metadata)
        select 'file.content_identity_verified','file',id,$6::jsonb from verified returning entity_id`,
      [file.id, file.storage_key, file.checksum, file.size_bytes, digest, JSON.stringify({ policy: pdfIdentityPolicy, sha256: digest, sizeBytes: size })]);
      if (result.rowCount) repaired++;
      else issues.push({ fileId: file.id, code: "source_changed_during_read" });
    } catch { issues.push({ fileId: file.id, code: "identity_record_failed" }); }
  }
  return { policy: pdfIdentityPolicy, candidates: files.length, repaired, issues };
}
