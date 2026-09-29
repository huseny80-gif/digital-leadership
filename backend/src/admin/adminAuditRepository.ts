import type { Pool } from "pg";
import type { AuditLogEntry } from "@shared/index";

interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

function toEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Read-only admin access to the existing `audit_logs` table
 * (PHASE 09C "Audit Logging" — no second audit table, this is the same
 * one every write path in this phase already writes to via
 * `lib/audit.ts`). No write method here: nothing in this codebase ever
 * updates or deletes an audit entry (append-only by omission, matching
 * `DATABASE_SECURITY.md` §3's stated policy).
 */
export class AdminAuditRepository {
  constructor(private readonly pool: Pool) {}

  async listRecent(pagination: { limit: number; offset: number }): Promise<{ items: AuditLogEntry[]; total: number }> {
    const rows = await this.pool.query<AuditLogRow>(
      `select id, actor_user_id, action, entity_type, entity_id, metadata, created_at
       from audit_logs order by created_at desc limit $1 offset $2`,
      [pagination.limit, pagination.offset],
    );
    const countResult = await this.pool.query<{ count: string }>("select count(*) from audit_logs");
    return { items: rows.rows.map(toEntry), total: Number(countResult.rows[0]?.count ?? 0) };
  }
}
