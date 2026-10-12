import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { encryptFeedback } from "./privateContent.js";

export async function ensureParticipantFeedbackSchema(pool: Pool): Promise<void> {
  const migration = await readFile(new URL("../../../supabase/migrations/00000000000020_participant_feedback.sql", import.meta.url), "utf8");
  const encryptionMigration = await readFile(new URL("../../../supabase/migrations/00000000000026_private_feedback_encryption.sql", import.meta.url), "utf8");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('participant_feedback_schema_v1'))");
    await client.query(migration);
    await client.query(encryptionMigration);
    for (;;) {
      const rows = (await client.query<{ id: string; message: string; internal_note: string; submitted_name: string | null }>(
        "select id,message,internal_note,submitted_name from participant_feedback where message_ciphertext is null order by id limit 100 for update",
      )).rows;
      if (!rows.length) break;
      for (const row of rows) await client.query(
        "update participant_feedback set message_ciphertext=$2,internal_note_ciphertext=$3,submitted_name_ciphertext=$4,message='[encrypted]',internal_note='',submitted_name=null where id=$1",
        [row.id, encryptFeedback(row.message, row.id, "message"), encryptFeedback(row.internal_note, row.id, "internal_note"), row.submitted_name === null ? null : encryptFeedback(row.submitted_name, row.id, "submitted_name")],
      );
    }
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
