import type { Pool } from "pg";

/**
 * Single shared helper for writing to `audit_logs` (DATABASE_DESIGN.md
 * §6) — PHASE 08 §23 requires reusing the existing audit system, not
 * building a second one. `metadata` must never contain a secret, token,
 * signed URL, or file content (DATABASE_SECURITY.md §12) — callers pass
 * only small, descriptive fields (e.g. `{ mimeType, sizeBytes }`).
 */
export async function writeAuditLog(
  pool: Pool,
  entry: { actorUserId: string; action: string; entityType: string; entityId: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await pool.query(
    `insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
     values ($1, $2, $3, $4, $5)`,
    [entry.actorUserId, entry.action, entry.entityType, entry.entityId, entry.metadata ? JSON.stringify(entry.metadata) : null],
  );
}
