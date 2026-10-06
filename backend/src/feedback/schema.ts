import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

export async function ensureParticipantFeedbackSchema(pool: Pool): Promise<void> {
  const migration = await readFile(new URL("../../../supabase/migrations/00000000000020_participant_feedback.sql", import.meta.url), "utf8");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('participant_feedback_schema_v1'))");
    await client.query(migration);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
