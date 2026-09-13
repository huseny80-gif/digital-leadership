import type { Pool } from "pg";
import type { FileMetadata } from "@shared/index";

interface FileRow {
  id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  status: "active" | "archived";
  uploaded_by: string;
  created_at: Date;
  storage_key: string;
}

function toFileMetadata(row: FileRow): FileMetadata {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Data-access boundary for `files` (DATABASE_DESIGN.md §5). Uses the
 * existing, unmodified `files` table only — no new table, no duplicate
 * metadata store (PHASE 08 §8). Visibility for read access follows the
 * educational-content relationship chain (PHASE 08 §14): a file is
 * visible to a non-admin only if at least one `lecture_items` row
 * referencing it is itself visible under the exact same rules Phase 7
 * established for lecture items (published item, published lecture,
 * published subject).
 */
export class FilesRepository {
  constructor(private readonly pool: Pool) {}

  async subjectExists(subjectId: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from subjects where id = $1 and deleted_at is null", [subjectId]);
    return result.rowCount! > 0;
  }

  async lectureExistsUnderSubject(lectureId: string, subjectId: string): Promise<boolean> {
    const result = await this.pool.query(
      "select 1 from lectures where id = $1 and subject_id = $2 and deleted_at is null",
      [lectureId, subjectId],
    );
    return result.rowCount! > 0;
  }

  async insertFile(input: {
    id: string;
    storageKey: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedBy: string;
  }): Promise<FileMetadata> {
    const result = await this.pool.query<FileRow>(
      `insert into files (id, storage_key, original_filename, mime_type, size_bytes, uploaded_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, original_filename, mime_type, size_bytes, status, uploaded_by, created_at, storage_key`,
      [input.id, input.storageKey, input.originalFilename, input.mimeType, input.sizeBytes, input.uploadedBy],
    );
    return toFileMetadata(result.rows[0]!);
  }

  async getFileById(id: string): Promise<(FileMetadata & { storageKey: string }) | null> {
    const result = await this.pool.query<FileRow>(
      `select id, original_filename, mime_type, size_bytes, status, uploaded_by, created_at, storage_key
       from files where id = $1 and deleted_at is null`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { ...toFileMetadata(row), storageKey: row.storage_key };
  }

  /** True if a non-admin caller may read this file, via the content
   * visibility chain (Phase 7's exact predicate, reused unmodified). */
  async isFileVisibleToNonAdmin(fileId: string): Promise<boolean> {
    const result = await this.pool.query(
      `select 1
       from lecture_items li
       join lectures l on l.id = li.lecture_id
       join subjects s on s.id = l.subject_id
       where li.file_id = $1
         and li.deleted_at is null and l.deleted_at is null and s.deleted_at is null
         and li.status = 'published' and l.status = 'published' and s.status = 'published'
       limit 1`,
      [fileId],
    );
    return result.rowCount! > 0;
  }

  async countLectureItemReferences(fileId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "select count(*) from lecture_items where file_id = $1 and deleted_at is null",
      [fileId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async archiveFile(id: string): Promise<void> {
    await this.pool.query("update files set status = 'archived' where id = $1", [id]);
  }

  /** Repoints every lecture_item referencing `oldFileId` to `newFileId`,
   * used by the replace flow (PHASE 08 §16) so a lecture item's reference
   * follows the new version automatically. */
  async repointLectureItems(oldFileId: string, newFileId: string): Promise<void> {
    await this.pool.query("update lecture_items set file_id = $1 where file_id = $2", [newFileId, oldFileId]);
  }
}
