import type { Pool, PoolClient } from "pg";
import type { FeedbackCategory, FeedbackStatus, FeedbackSubmission, PaginatedResult, ParticipantFeedback } from "@shared/index";
import { notFound } from "../lib/httpError.js";
import { writeAuditLog } from "../lib/audit.js";
import { randomUUID } from "node:crypto";
import { anonymousFeedbackSubmissionKey, encryptFeedback, decryptFeedback } from "./privateContent.js";

type FeedbackRow = {
  id: string; category: FeedbackCategory; message: string; author_name: string;
  author_kind: ParticipantFeedback["authorKind"]; status: FeedbackStatus; internal_note: string;
  created_at: Date; updated_at: Date;
  message_ciphertext: string | null; internal_note_ciphertext: string | null; submitted_name_ciphertext: string | null;
};
export type FeedbackFilter = { page: number; limit: number; status?: FeedbackStatus | undefined; category?: FeedbackCategory | undefined };

export class FeedbackRepository {
  constructor(private readonly pool: Pool) {}

  async submit(input: FeedbackSubmission, author: { userId: string; guestSessionId?: never } | { guestSessionId: string; userId?: never }): Promise<void> {
    const id = randomUUID();
    const principal = author.userId ? `user:${author.userId}` : `guest:${author.guestSessionId}`;
    await this.pool.query(
      `insert into participant_feedback (id, submission_id, author_kind, category, message, message_ciphertext, internal_note_ciphertext, anonymous_submission_key)
       values ($1,$2,'anonymous',$3,'[encrypted]',$4,$5,$6) on conflict do nothing`,
      [id, input.submissionId, input.category, encryptFeedback(input.message, id, "message"), encryptFeedback("", id, "internal_note"),
        anonymousFeedbackSubmissionKey(principal, input.submissionId)],
    );
  }

  async list(filter: FeedbackFilter): Promise<PaginatedResult<ParticipantFeedback>> {
    const values = [filter.status ?? null, filter.category ?? null];
    const where = "($1::text is null or f.status = $1) and ($2::text is null or f.category = $2)";
    const count = await this.pool.query<{ total: string }>(`select count(*)::text as total from participant_feedback f where ${where}`, values);
    const result = await this.pool.query<FeedbackRow>(
      `select f.id, f.category, f.message, f.author_kind, f.status, f.internal_note, f.created_at, f.updated_at,
       f.message_ciphertext,f.internal_note_ciphertext,f.submitted_name_ciphertext,
       coalesce(f.submitted_name, u.display_name, g.display_name, 'غير محدد') as author_name
       from participant_feedback f left join users u on u.id = f.user_id
       left join guest_training_sessions g on g.id = f.guest_session_id
       where ${where} order by f.created_at desc, f.id desc limit $3 offset $4`,
      [...values, filter.limit, (filter.page - 1) * filter.limit],
    );
    return { data: result.rows.map(row => ({
      id: row.id, category: row.category, message: row.message_ciphertext ? decryptFeedback(row.message_ciphertext, row.id, "message") : row.message,
      authorName: row.author_kind === "anonymous" ? "مشاركة بدون اسم" : row.submitted_name_ciphertext ? decryptFeedback(row.submitted_name_ciphertext, row.id, "submitted_name") : row.author_name, authorKind: row.author_kind, status: row.status,
      internalNote: row.internal_note_ciphertext ? decryptFeedback(row.internal_note_ciphertext, row.id, "internal_note") : row.internal_note, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
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
        `update participant_feedback set status = coalesce($2,status), internal_note = case when $3::text is null then internal_note else '' end,
         internal_note_ciphertext = coalesce($3,internal_note_ciphertext),
         updated_by = $4, updated_at = now() where id = $1 returning id,status`,
        [id, input.status ?? null, input.internalNote === undefined ? null : encryptFeedback(input.internalNote, id, "internal_note"), actorUserId],
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
