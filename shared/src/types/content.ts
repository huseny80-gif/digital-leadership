import type { FileMetadata } from "./file.js";

/**
 * Mirrors the educational content hierarchy in DATABASE_DESIGN.md §2-3:
 * Subject -> Lecture -> LectureItem (generalized PDF/Summary/Assignment/
 * Exercise). File binaries are never part of these shapes — only file
 * metadata references (see `FileMetadata` in `file.ts`).
 *
 * `Subject`, `Lecture`, and `LectureItem` below ARE the API response DTOs
 * (API_V1.md / PHASE 07 §11's `SubjectResponse`/`LectureResponse`/
 * `LectureItemResponse` naming) — they were already shaped as
 * client-facing contracts, not raw database rows, when defined in Phase 4
 * (no `deleted_at`, snake_case converted to camelCase, no internal-only
 * columns). `LectureItemResponse` extends the base shape with an embedded,
 * already-safe `FileMetadata` for `pdf`-type items — never the file's
 * `storageKey` or a signed URL (API_V1.md §10, `DATABASE_SECURITY.md` §6).
 */
export type PublicationStatus = "draft" | "published";

export interface Subject {
  id: string;
  title: string;
  description: string | null;
  orderIndex: number;
  status: PublicationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Lecture {
  id: string;
  subjectId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  status: PublicationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type LectureItemType = "pdf" | "summary" | "assignment" | "exercise";

export interface LectureItem {
  id: string;
  lectureId: string;
  itemType: LectureItemType;
  title: string;
  bodyText: string | null;
  fileId: string | null;
  orderIndex: number;
  status: PublicationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Response shape for `GET /lectures/:lectureId/items` — the base
 * `LectureItem` plus embedded, already-safe file metadata for `pdf` items
 * (`null` for every other `itemType`, and `null` if the item is `pdf` but
 * the referenced file could not be resolved). */
export interface LectureItemResponse extends LectureItem {
  file: FileMetadata | null;
}
