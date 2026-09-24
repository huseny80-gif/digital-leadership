import type { Pool } from "pg";
import type { Assignment, PublicationStatus } from "@shared/index";

/**
 * PHASE 12H — admin write access to the new, dedicated `assignments`
 * table (Phase 12G-R's recommended Option B). Mirrors
 * `AdminContentRepository`'s existing conventions exactly: explicit
 * field lists (never a body spread), soft-delete via `deleted_at`.
 */
interface AssignmentRow {
  id: string;
  subject_id: string;
  lecture_id: string | null;
  title: string;
  description: string | null;
  order_index: number;
  status: PublicationStatus;
  created_by: string;
  created_at: Date;
  updated_at: Date;
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

export class AdminAssignmentsRepository {
  constructor(private readonly pool: Pool) {}

  async subjectExists(subjectId: string): Promise<boolean> {
    const result = await this.pool.query("select 1 from subjects where id = $1 and deleted_at is null", [subjectId]);
    return result.rowCount! > 0;
  }

  async listForSubject(subjectId: string): Promise<Assignment[]> {
    const result = await this.pool.query<AssignmentRow>(
      `select id, subject_id, lecture_id, title, description, order_index, status, created_by, created_at, updated_at
       from assignments where subject_id = $1 and deleted_at is null order by order_index asc`,
      [subjectId],
    );
    return result.rows.map(toAssignment);
  }

  async create(input: {
    subjectId: string;
    lectureId: string | null;
    title: string;
    description: string | null;
    orderIndex: number;
    createdBy: string;
  }): Promise<Assignment> {
    const result = await this.pool.query<AssignmentRow>(
      `insert into assignments (subject_id, lecture_id, title, description, order_index, created_by)
       values ($1, $2, $3, $4, $5, $6)
       returning id, subject_id, lecture_id, title, description, order_index, status, created_by, created_at, updated_at`,
      [input.subjectId, input.lectureId, input.title, input.description, input.orderIndex, input.createdBy],
    );
    return toAssignment(result.rows[0]!);
  }

  async update(
    id: string,
    fields: { title?: string; description?: string | null; orderIndex?: number; status?: PublicationStatus },
  ): Promise<Assignment | null> {
    const result = await this.pool.query<AssignmentRow>(
      `update assignments set
         title = coalesce($2, title),
         description = case when $3 then $4 else description end,
         order_index = coalesce($5, order_index),
         status = coalesce($6, status)
       where id = $1 and deleted_at is null
       returning id, subject_id, lecture_id, title, description, order_index, status, created_by, created_at, updated_at`,
      [
        id,
        fields.title ?? null,
        Object.prototype.hasOwnProperty.call(fields, "description"),
        fields.description ?? null,
        fields.orderIndex ?? null,
        fields.status ?? null,
      ],
    );
    return result.rows[0] ? toAssignment(result.rows[0]) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.pool.query("update assignments set deleted_at = now() where id = $1 and deleted_at is null", [id]);
    return result.rowCount! > 0;
  }
}
