import type { Pool } from "pg";
import type { FileMetadata, SignedFileUrl } from "@shared/index";
import type { StorageProvider } from "./storageProvider.js";
import { FilesRepository } from "./filesRepository.js";
import { buildObjectKey, generateFileId, sanitizeFilename } from "./objectPath.js";
import { validatePdfUpload } from "./pdfValidation.js";
import { ValidationError } from "../lib/validation.js";
import { notFound, conflict } from "../lib/httpError.js";
import { writeAuditLog } from "../lib/audit.js";

export interface UploadFileInput {
  subjectId: string;
  lectureId: string | null;
  originalFilename: string;
  declaredMimeType: string;
  buffer: Buffer;
  uploadedBy: string;
}

/**
 * Business logic for file storage (PHASE 08 §9-§17). Routes call this;
 * this calls `FilesRepository` (metadata) and `StorageProvider` (bytes) —
 * never the reverse, and routes never touch either directly
 * (ARCHITECTURE.md §3).
 */
export class FilesService {
  constructor(
    private readonly pool: Pool,
    private readonly repository: FilesRepository,
    private readonly storage: StorageProvider,
    private readonly maxSizeBytes: number,
    private readonly signedUrlExpirySeconds: number,
  ) {}

  /**
   * Upload flow (PHASE 08 §9-§10). Validation happens entirely before any
   * I/O; the object is written to storage BEFORE the metadata row is
   * inserted (Option B from PHASE 08 §10), because an orphaned storage
   * object (bytes with no database row) is inert and harmless — no API
   * response ever references a `files.id` that doesn't exist, so nothing
   * can try to fetch it — whereas the reverse (a `files` row with no
   * backing object) would make `GET /files/:fileId` fail confusingly
   * for a file that "exists" from the caller's perspective. If the
   * metadata insert fails after a successful upload, the just-uploaded
   * object is deleted (best-effort) so it doesn't linger; this is
   * documented compensation, not a distributed transaction — there is a
   * narrow window where a crash between upload and cleanup would leave
   * an orphaned object, acceptable because such an object is never
   * discoverable through any API (STORAGE_IMPLEMENTATION.md "Upload
   * Consistency" documents this precisely).
   */
  async uploadFile(input: UploadFileInput): Promise<FileMetadata> {
    if (!(await this.repository.subjectExists(input.subjectId))) {
      throw notFound("Subject");
    }
    if (input.lectureId && !(await this.repository.lectureExistsUnderSubject(input.lectureId, input.subjectId))) {
      throw notFound("Lecture");
    }

    validatePdfUpload({
      declaredMimeType: input.declaredMimeType,
      originalFilename: input.originalFilename,
      buffer: input.buffer,
      maxSizeBytes: this.maxSizeBytes,
    });

    const fileId = generateFileId();
    const safeFilename = sanitizeFilename(input.originalFilename);
    const objectKey = buildObjectKey({
      subjectId: input.subjectId,
      lectureId: input.lectureId,
      fileId,
      safeFilename,
    });

    await this.storage.upload(objectKey, input.buffer, "application/pdf");

    try {
      const file = await this.repository.insertFile({
        id: fileId,
        storageKey: objectKey,
        originalFilename: safeFilename,
        mimeType: "application/pdf",
        sizeBytes: input.buffer.length,
        uploadedBy: input.uploadedBy,
      });
      await writeAuditLog(this.pool, {
        actorUserId: input.uploadedBy,
        action: "file.uploaded",
        entityType: "file",
        entityId: fileId,
        metadata: { mimeType: file.mimeType, sizeBytes: file.sizeBytes },
      });
      return file;
    } catch (err) {
      await this.storage.delete(objectKey).catch(() => {
        // Best-effort cleanup; the primary error is what the caller sees.
      });
      throw err;
    }
  }

  /**
   * Secure access flow (PHASE 08 §11). A non-admin's visibility check
   * mirrors Phase 7's content-visibility predicate exactly — see
   * `FilesRepository.isFileVisibleToNonAdmin`. Nonexistent file and
   * existent-but-not-visible file return the identical `404`, per the
   * IDOR pattern this phase's instructions explicitly require re-using.
   */
  async getSignedUrlForFile(fileId: string, requester: { id: string; isAdmin: boolean }): Promise<SignedFileUrl> {
    const file = await this.repository.getFileById(fileId);
    if (!file || file.status === "archived") {
      throw notFound("File");
    }

    if (!requester.isAdmin) {
      const visible = await this.repository.isFileVisibleToNonAdmin(fileId);
      if (!visible) {
        await writeAuditLog(this.pool, {
          actorUserId: requester.id,
          action: "file.access_denied",
          entityType: "file",
          entityId: fileId,
        });
        throw notFound("File");
      }
    }

    const url = await this.storage.getSignedUrl(file.storageKey, this.signedUrlExpirySeconds);
    return {
      url,
      expiresAt: new Date(Date.now() + this.signedUrlExpirySeconds * 1000).toISOString(),
    };
  }

  /**
   * Replacement (PHASE 08 §16): creates a new file row + new storage
   * object (never overwrites the old object key — `objectPath.ts` always
   * mints a fresh `fileId`), repoints any lecture_items referencing the
   * old file to the new one, and archives (never hard-deletes) the old
   * file row — exactly the "no file-versioning table, replace creates a
   * new row and archives the old one" lifecycle DECISIONS.md D25 already
   * approved in Phase 3/5, now actually implemented.
   */
  async replaceFile(oldFileId: string, input: Omit<UploadFileInput, "subjectId" | "lectureId">): Promise<FileMetadata> {
    const oldFile = await this.repository.getFileById(oldFileId);
    if (!oldFile || oldFile.status === "archived") {
      throw notFound("File");
    }

    // Re-derive the same subject/lecture context the old file was
    // uploaded under, by inspecting the old object key rather than
    // trusting a client-supplied value for this (there is no
    // subject/lecture body field on the replace request at all).
    const context = parseSubjectAndLectureFromObjectKey(oldFile.storageKey);

    validatePdfUpload({
      declaredMimeType: input.declaredMimeType,
      originalFilename: input.originalFilename,
      buffer: input.buffer,
      maxSizeBytes: this.maxSizeBytes,
    });

    const newFileId = generateFileId();
    const safeFilename = sanitizeFilename(input.originalFilename);
    const objectKey = buildObjectKey({ ...context, fileId: newFileId, safeFilename });

    await this.storage.upload(objectKey, input.buffer, "application/pdf");

    try {
      const newFile = await this.repository.insertFile({
        id: newFileId,
        storageKey: objectKey,
        originalFilename: safeFilename,
        mimeType: "application/pdf",
        sizeBytes: input.buffer.length,
        uploadedBy: input.uploadedBy,
      });
      await this.repository.repointLectureItems(oldFileId, newFileId);
      await this.repository.archiveFile(oldFileId);
      await writeAuditLog(this.pool, {
        actorUserId: input.uploadedBy,
        action: "file.replaced",
        entityType: "file",
        entityId: newFileId,
        metadata: { replacedFileId: oldFileId },
      });
      return newFile;
    } catch (err) {
      await this.storage.delete(objectKey).catch(() => {});
      throw err;
    }
  }

  /**
   * Deletion (PHASE 08 §17): admin-only, and refuses to delete a file
   * still referenced by a lecture item (`409 conflict` — replace it
   * first) rather than silently breaking that reference or attempting a
   * hard delete the database's own `on delete restrict` foreign key
   * would reject anyway (DATABASE_DESIGN.md §5). Deletion here means
   * archiving the metadata row (never hard-deleting it, consistent with
   * every other soft-deletable table in the approved schema) plus a
   * best-effort storage object removal.
   */
  async deleteFile(fileId: string, actorUserId: string): Promise<void> {
    const file = await this.repository.getFileById(fileId);
    if (!file || file.status === "archived") {
      throw notFound("File");
    }
    const referenceCount = await this.repository.countLectureItemReferences(fileId);
    if (referenceCount > 0) {
      throw conflict("This file is still attached to a lecture item — replace or detach it before deleting.");
    }

    await this.repository.archiveFile(fileId);
    await this.storage.delete(file.storageKey).catch(() => {
      // Best-effort — the metadata is already safely archived either way.
    });
    await writeAuditLog(this.pool, {
      actorUserId,
      action: "file.deleted",
      entityType: "file",
      entityId: fileId,
    });
  }
}

function parseSubjectAndLectureFromObjectKey(objectKey: string): { subjectId: string; lectureId: string | null } {
  const match = /^subjects\/([^/]+)\/lectures\/([^/]+)\//.exec(objectKey);
  if (!match) {
    throw new ValidationError("Existing file has an unrecognized storage key format.");
  }
  const [, subjectId, lectureSegment] = match;
  return { subjectId: subjectId!, lectureId: lectureSegment === "unassigned" ? null : lectureSegment! };
}
