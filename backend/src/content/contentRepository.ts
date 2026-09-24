import type { Pool } from "pg";
import type { Assignment, FileMetadata, Lecture, LectureItemResponse, Subject } from "@shared/index";
import type { PaginationParams } from "../lib/validation.js";

/**
 * Data-access boundary for educational content (DATABASE_DESIGN.md §2-3).
 * All queries are parameterized (`$1`, `$2`, ...) — untrusted input is
 * never concatenated into SQL (PHASE 07 §20's SQL-injection guard).
 *
 * Visibility rule enforced uniformly here (not duplicated per caller):
 * a non-admin sees only `status = 'published'` rows with `deleted_at is
 * null`; an admin additionally sees `draft` rows (still excluding
 * soft-deleted ones — there is no "view trash" feature in this phase).
 * A lecture is additionally only visible if its parent subject is also
 * visible, and a lecture item only if its parent lecture is — so
 * publishing a lecture under a still-draft subject can never leak it.
 */
export interface ContentRepository {
  listSubjects(isAdmin: boolean, pagination: PaginationParams): Promise<{ items: Subject[]; total: number }>;
  getSubjectById(id: string, isAdmin: boolean): Promise<Subject | null>;
  listLecturesForSubject(
    subjectId: string,
    isAdmin: boolean,
    pagination: PaginationParams,
  ): Promise<{ items: Lecture[]; total: number }>;
  getLectureById(id: string, isAdmin: boolean): Promise<Lecture | null>;
  listItemsForLecture(
    lectureId: string,
    isAdmin: boolean,
    pagination: PaginationParams,
  ): Promise<{ items: LectureItemResponse[]; total: number }>;
  listAssignmentsForSubject(
    subjectId: string,
    isAdmin: boolean,
    pagination: PaginationParams,
  ): Promise<{ items: Assignment[]; total: number }>;
}

interface SubjectRow {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  status: "draft" | "published";
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface LectureRow {
  id: string;
  subject_id: string;
  title: string;
  description: string | null;
  order_index: number;
  status: "draft" | "published";
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface LectureItemRow {
  id: string;
  lecture_id: string;
  item_type: "pdf" | "summary" | "assignment" | "exercise";
  title: string;
  body_text: string | null;
  file_id: string | null;
  order_index: number;
  status: "draft" | "published";
  created_by: string;
  created_at: Date;
  updated_at: Date;
  file_original_filename: string | null;
  file_mime_type: string | null;
  file_size_bytes: string | null;
  file_status: "active" | "archived" | null;
  file_uploaded_by: string | null;
  file_created_at: Date | null;
}

interface AssignmentRow {
  id: string;
  subject_id: string;
  lecture_id: string | null;
  title: string;
  description: string | null;
  order_index: number;
  status: "draft" | "published";
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

function toSubject(row: SubjectRow): Subject {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toLecture(row: LectureRow): Lecture {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toLectureItem(row: LectureItemRow): LectureItemResponse {
  let file: FileMetadata | null = null;
  if (row.file_id && row.file_original_filename && row.file_mime_type && row.file_size_bytes && row.file_status && row.file_uploaded_by && row.file_created_at) {
    file = {
      id: row.file_id,
      originalFilename: row.file_original_filename,
      mimeType: row.file_mime_type,
      sizeBytes: Number(row.file_size_bytes),
      status: row.file_status,
      uploadedBy: row.file_uploaded_by,
      createdAt: row.file_created_at.toISOString(),
    };
  }
  return {
    id: row.id,
    lectureId: row.lecture_id,
    itemType: row.item_type,
    title: row.title,
    bodyText: row.body_text,
    fileId: row.file_id,
    orderIndex: row.order_index,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    file,
  };
}

function toAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    subjectId: row.subject_id,
    lectureId: row.lecture_id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PgContentRepository implements ContentRepository {
  constructor(private readonly pool: Pool) {}

  async listSubjects(isAdmin: boolean, pagination: PaginationParams) {
    const visibilityClause = isAdmin ? "" : "and status = 'published'";
    const rows = await this.pool.query<SubjectRow>(
      `select id, title, description, order_index, status, created_by, created_at, updated_at
       from subjects
       where deleted_at is null ${visibilityClause}
       order by order_index asc, title asc
       limit $1 offset $2`,
      [pagination.limit, pagination.offset],
    );
    const countResult = await this.pool.query<{ count: string }>(
      `select count(*) from subjects where deleted_at is null ${visibilityClause}`,
    );
    return { items: rows.rows.map(toSubject), total: Number(countResult.rows[0]?.count ?? 0) };
  }

  async getSubjectById(id: string, isAdmin: boolean): Promise<Subject | null> {
    const visibilityClause = isAdmin ? "" : "and status = 'published'";
    const result = await this.pool.query<SubjectRow>(
      `select id, title, description, order_index, status, created_by, created_at, updated_at
       from subjects
       where id = $1 and deleted_at is null ${visibilityClause}`,
      [id],
    );
    return result.rows[0] ? toSubject(result.rows[0]) : null;
  }

  async listLecturesForSubject(subjectId: string, isAdmin: boolean, pagination: PaginationParams) {
    const visibilityClause = isAdmin ? "" : "and l.status = 'published'";
    const rows = await this.pool.query<LectureRow>(
      `select l.id, l.subject_id, l.title, l.description, l.order_index, l.status, l.created_by, l.created_at, l.updated_at
       from lectures l
       where l.subject_id = $1 and l.deleted_at is null ${visibilityClause}
       order by l.order_index asc, l.title asc
       limit $2 offset $3`,
      [subjectId, pagination.limit, pagination.offset],
    );
    const countResult = await this.pool.query<{ count: string }>(
      `select count(*) from lectures l where l.subject_id = $1 and l.deleted_at is null ${visibilityClause}`,
      [subjectId],
    );
    return { items: rows.rows.map(toLecture), total: Number(countResult.rows[0]?.count ?? 0) };
  }

  async getLectureById(id: string, isAdmin: boolean): Promise<Lecture | null> {
    // A lecture is only visible if its parent subject is ALSO visible —
    // publishing a lecture under a still-draft subject must not leak it.
    const visibilityClause = isAdmin ? "" : "and l.status = 'published' and s.status = 'published'";
    const result = await this.pool.query<LectureRow>(
      `select l.id, l.subject_id, l.title, l.description, l.order_index, l.status, l.created_by, l.created_at, l.updated_at
       from lectures l
       join subjects s on s.id = l.subject_id
       where l.id = $1 and l.deleted_at is null and s.deleted_at is null ${visibilityClause}`,
      [id],
    );
    return result.rows[0] ? toLecture(result.rows[0]) : null;
  }

  async listItemsForLecture(lectureId: string, isAdmin: boolean, pagination: PaginationParams) {
    const visibilityClause = isAdmin ? "" : "and li.status = 'published'";
    const rows = await this.pool.query<LectureItemRow>(
      `select
         li.id, li.lecture_id, li.item_type, li.title, li.body_text, li.file_id,
         li.order_index, li.status, li.created_by, li.created_at, li.updated_at,
         f.original_filename as file_original_filename,
         f.mime_type as file_mime_type,
         f.size_bytes as file_size_bytes,
         f.status as file_status,
         f.uploaded_by as file_uploaded_by,
         f.created_at as file_created_at
       from lecture_items li
       left join files f on f.id = li.file_id and f.deleted_at is null
       where li.lecture_id = $1 and li.deleted_at is null ${visibilityClause}
       order by li.order_index asc, li.title asc
       limit $2 offset $3`,
      [lectureId, pagination.limit, pagination.offset],
    );
    const countResult = await this.pool.query<{ count: string }>(
      `select count(*) from lecture_items li where li.lecture_id = $1 and li.deleted_at is null ${visibilityClause}`,
      [lectureId],
    );
    return { items: rows.rows.map(toLectureItem), total: Number(countResult.rows[0]?.count ?? 0) };
  }

  async listAssignmentsForSubject(subjectId: string, isAdmin: boolean, pagination: PaginationParams) {
    const visibilityClause = isAdmin ? "" : "and status = 'published'";
    const rows = await this.pool.query<AssignmentRow>(
      `select id, subject_id, lecture_id, title, description, order_index, status, created_by, created_at, updated_at
       from assignments
       where subject_id = $1 and deleted_at is null ${visibilityClause}
       order by order_index asc, title asc
       limit $2 offset $3`,
      [subjectId, pagination.limit, pagination.offset],
    );
    const countResult = await this.pool.query<{ count: string }>(
      `select count(*) from assignments where subject_id = $1 and deleted_at is null ${visibilityClause}`,
      [subjectId],
    );
    return { items: rows.rows.map(toAssignment), total: Number(countResult.rows[0]?.count ?? 0) };
  }
}
