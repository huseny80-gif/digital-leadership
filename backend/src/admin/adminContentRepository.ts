import type { Pool } from "pg";
import type { Lecture, LectureItem, LectureItemType, PublicationStatus, Subject } from "@shared/index";

/**
 * Admin write access to the content hierarchy (subjects/lectures/
 * lecture_items). Reuses the exact tables Phase 5 approved — no new
 * column, no new table. Every write explicitly names its fields (never a
 * spread of the request body — PHASE 09C "Mass Assignment Protection").
 *
 * "Delete" here is always the existing soft-delete pattern
 * (`deleted_at`) already used by every other read path in this codebase
 * (`contentRepository.ts`) — never a hard `delete`. This is not merely
 * "safer": the visibility chain those reads already enforce (a lecture is
 * only visible if its parent subject is also not-deleted) means a
 * soft-deleted parent's children become unreachable through every
 * existing read path automatically, with nothing else to orphan or
 * cascade — see ADMIN_ARCHITECTURE.md §5 for the full reasoning.
 */
export class AdminContentRepository {
  constructor(private readonly pool: Pool) {}

  // ---------- Subjects ----------

  async listSubjectsAdmin(): Promise<Subject[]> {
    const result = await this.pool.query(
      `select id, title, description, order_index, status, created_by, created_at, updated_at
       from subjects where deleted_at is null order by order_index asc, title asc`,
    );
    return result.rows.map(toSubject);
  }

  async getSubjectAdmin(id: string): Promise<Subject | null> {
    const result = await this.pool.query(
      `select id, title, description, order_index, status, created_by, created_at, updated_at
       from subjects where id = $1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ? toSubject(result.rows[0]) : null;
  }

  async createSubject(input: { title: string; description: string | null; orderIndex: number; createdBy: string }): Promise<Subject> {
    const result = await this.pool.query(
      `insert into subjects (title, description, order_index, created_by)
       values ($1, $2, $3, $4)
       returning id, title, description, order_index, status, created_by, created_at, updated_at`,
      [input.title, input.description, input.orderIndex, input.createdBy],
    );
    return toSubject(result.rows[0]!);
  }

  async updateSubject(
    id: string,
    fields: { title?: string; description?: string | null; orderIndex?: number; status?: PublicationStatus },
  ): Promise<Subject | null> {
    const result = await this.pool.query(
      `update subjects set
         title = coalesce($2, title),
         description = case when $3::boolean then $4 else description end,
         order_index = coalesce($5, order_index),
         status = coalesce($6, status)
       where id = $1 and deleted_at is null
       returning id, title, description, order_index, status, created_by, created_at, updated_at`,
      [id, fields.title ?? null, fields.description !== undefined, fields.description ?? null, fields.orderIndex ?? null, fields.status ?? null],
    );
    return result.rows[0] ? toSubject(result.rows[0]) : null;
  }

  async softDeleteSubject(id: string): Promise<boolean> {
    const result = await this.pool.query("update subjects set deleted_at = now() where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }

  // ---------- Lectures ----------

  async subjectExists(subjectId: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from subjects where id = $1 and deleted_at is null", [subjectId]);
    return result.rowCount! > 0;
  }

  async listLecturesAdmin(subjectId: string): Promise<Lecture[]> {
    const result = await this.pool.query(
      `select id, subject_id, title, description, order_index, status, created_by, created_at, updated_at
       from lectures where subject_id = $1 and deleted_at is null order by order_index asc, title asc`,
      [subjectId],
    );
    return result.rows.map(toLecture);
  }

  async getLectureAdmin(id: string): Promise<Lecture | null> {
    const result = await this.pool.query(
      `select id, subject_id, title, description, order_index, status, created_by, created_at, updated_at
       from lectures where id = $1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ? toLecture(result.rows[0]) : null;
  }

  async createLecture(input: {
    subjectId: string;
    title: string;
    description: string | null;
    orderIndex: number;
    createdBy: string;
  }): Promise<Lecture> {
    const result = await this.pool.query(
      `insert into lectures (subject_id, title, description, order_index, created_by)
       values ($1, $2, $3, $4, $5)
       returning id, subject_id, title, description, order_index, status, created_by, created_at, updated_at`,
      [input.subjectId, input.title, input.description, input.orderIndex, input.createdBy],
    );
    return toLecture(result.rows[0]!);
  }

  async updateLecture(
    id: string,
    fields: { title?: string; description?: string | null; orderIndex?: number; status?: PublicationStatus },
  ): Promise<Lecture | null> {
    const result = await this.pool.query(
      `update lectures set
         title = coalesce($2, title),
         description = case when $3::boolean then $4 else description end,
         order_index = coalesce($5, order_index),
         status = coalesce($6, status)
       where id = $1 and deleted_at is null
       returning id, subject_id, title, description, order_index, status, created_by, created_at, updated_at`,
      [id, fields.title ?? null, fields.description !== undefined, fields.description ?? null, fields.orderIndex ?? null, fields.status ?? null],
    );
    return result.rows[0] ? toLecture(result.rows[0]) : null;
  }

  async softDeleteLecture(id: string): Promise<boolean> {
    const result = await this.pool.query("update lectures set deleted_at = now() where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }

  // ---------- Lecture items ----------

  async lectureExists(lectureId: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from lectures where id = $1 and deleted_at is null", [lectureId]);
    return result.rowCount! > 0;
  }

  async fileExists(fileId: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from files where id = $1 and deleted_at is null", [fileId]);
    return result.rowCount! > 0;
  }

  async listItemsAdmin(lectureId: string): Promise<LectureItem[]> {
    const result = await this.pool.query(
      `select id, lecture_id, item_type, title, body_text, file_id, order_index, status, created_by, created_at, updated_at
       from lecture_items where lecture_id = $1 and deleted_at is null order by order_index asc, title asc`,
      [lectureId],
    );
    return result.rows.map(toLectureItem);
  }

  async getItemAdmin(id: string): Promise<LectureItem | null> {
    const result = await this.pool.query(
      `select id, lecture_id, item_type, title, body_text, file_id, order_index, status, created_by, created_at, updated_at
       from lecture_items where id = $1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ? toLectureItem(result.rows[0]) : null;
  }

  async createItem(input: {
    lectureId: string;
    itemType: LectureItemType;
    title: string;
    bodyText: string | null;
    fileId: string | null;
    orderIndex: number;
    createdBy: string;
  }): Promise<LectureItem> {
    const result = await this.pool.query(
      `insert into lecture_items (lecture_id, item_type, title, body_text, file_id, order_index, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, lecture_id, item_type, title, body_text, file_id, order_index, status, created_by, created_at, updated_at`,
      [input.lectureId, input.itemType, input.title, input.bodyText, input.fileId, input.orderIndex, input.createdBy],
    );
    return toLectureItem(result.rows[0]!);
  }

  async updateItem(
    id: string,
    fields: { title?: string; bodyText?: string | null; fileId?: string | null; orderIndex?: number; status?: PublicationStatus },
  ): Promise<LectureItem | null> {
    const result = await this.pool.query(
      `update lecture_items set
         title = coalesce($2, title),
         body_text = case when $3::boolean then $4 else body_text end,
         file_id = case when $5::boolean then $6 else file_id end,
         order_index = coalesce($7, order_index),
         status = coalesce($8, status)
       where id = $1 and deleted_at is null
       returning id, lecture_id, item_type, title, body_text, file_id, order_index, status, created_by, created_at, updated_at`,
      [
        id,
        fields.title ?? null,
        fields.bodyText !== undefined,
        fields.bodyText ?? null,
        fields.fileId !== undefined,
        fields.fileId ?? null,
        fields.orderIndex ?? null,
        fields.status ?? null,
      ],
    );
    return result.rows[0] ? toLectureItem(result.rows[0]) : null;
  }

  async softDeleteItem(id: string): Promise<boolean> {
    const result = await this.pool.query("update lecture_items set deleted_at = now() where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }
}

interface SubjectRow {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  status: PublicationStatus;
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
  status: PublicationStatus;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface LectureItemRow {
  id: string;
  lecture_id: string;
  item_type: LectureItemType;
  title: string;
  body_text: string | null;
  file_id: string | null;
  order_index: number;
  status: PublicationStatus;
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

function toLectureItem(row: LectureItemRow): LectureItem {
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
  };
}
