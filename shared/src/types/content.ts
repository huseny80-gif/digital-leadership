/**
 * Mirrors the educational content hierarchy in DATABASE_DESIGN.md §2-3:
 * Subject -> Lecture -> LectureItem (generalized PDF/Summary/Assignment/
 * Exercise). File binaries are never part of these shapes — only file
 * metadata references (see `FileMetadata` in `file.ts`).
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
