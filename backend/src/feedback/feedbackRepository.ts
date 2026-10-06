import type { Pool, PoolClient } from "pg";
import type { FeedbackCategory, FeedbackStatus, FeedbackSubmission, PaginatedResult, ParticipantFeedback } from "@shared/index";
import { notFound } from "../lib/httpError.js";
import { writeAuditLog } from "../lib/audit.js";

type FeedbackRow = {
  id: string; category: FeedbackCategory; message: string; author_name: string;
  author_kind: "user" | "guest"; status: FeedbackStatus; internal_note: string;
  created_at: Date; updated_at: Date;
};
export type FeedbackFilter = { page: number; limit: number; status?: FeedbackStatus | undefined; category?: FeedbackCategory | undefined };

export class FeedbackRepository {
  constructor(private readonly pool: Pool) {}

  async submit(input: FeedbackSubmission, author: { userId?: string; guestSessionId?: string }): Promise<void> {
    await this.pool.query(
      `insert into participant_feedback (submission_id, user_id, guest_session_id, author_kind, submitted_name, category, message)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing`,
      [input.submissionId, author.userId ?? null, author.guestSessionId ?? null, author.userId ? "user" : "guest", input.name || null, input.category, input.message],
    );
  }

  async list(filter: FeedbackFilter): Promise<PaginatedResult<ParticipantFeedback>> {
    const values = [filter.status ?? null, filter.category ?? null];
    const where = "($1::text is null or f.status = $1) and ($2::text is null or f.category = $2)";
    const count = await this.pool.query<{ total: string }>(`select count(*)::text as total from participant_feedback f where ${where}`, values);
    const result = await this.pool.query<FeedbackRow>(
      `select f.id, f.category, f.message, f.author_kind, f.status, f.internal_note, f.created_at, f.updated_at,
       coalesce(f.submitted_name, u.display_name, g.display_name, 'غير محدد') as author_name
       from participant_feedback f left join users u on u.id = f.user_id
       left join guest_training_sessions g on g.id = f.guest_session_id
       where ${where} order by f.created_at desc, f.id desc limit $3 offset $4`,
      [...values, filter.limit, (filter.page - 1) * filter.limit],
    );
    return { data: result.rows.map(row => ({
      id: row.id, category: row.category, message: row.message,
      authorName: row.author_name, authorKind: row.author_kind, status: row.status,
      internalNote: row.internal_note, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
    })), page: filter.page, limit: filter.limit, total: Number(count.rows[0]!.total) };
  }

  private async mutate(operation: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    try { await client.query("begin"); await operation(client); await client.query("commit"); }
    catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
  }

  async update(id: string, input: { status?: FeedbackStatus | undefined; internalNote?: string | undefined }, actorUserId: string): Promise<void> {
    await this.mutate(async client => {
      const result = await client.query<{ id: string; status: FeedbackStatus }>(
        `update participant_feedback set status = coalesce($2,status), internal_note = coalesce($3,internal_note),
         updated_by = $4, updated_at = now() where id = $1 returning id,status`,
        [id, input.status ?? null, input.internalNote ?? null, actorUserId],
      );
      if (!result.rows[0]) throw notFound("Feedback");
      await writeAuditLog(client, { actorUserId, action: "feedback.updated", entityType: "participant_feedback", entityId: id,
        metadata: { status: result.rows[0].status, noteUpdated: input.internalNote !== undefined } });
    });
  }

  async delete(id: string, actorUserId: string): Promise<void> {
    await this.mutate(async client => {
      const result = await client.query("delete from participant_feedback where id = $1 returning id", [id]);
      if (!result.rowCount) throw notFound("Feedback");
      await writeAuditLog(client, { actorUserId, action: "feedback.deleted", entityType: "participant_feedback", entityId: id });
    });
  }
}
