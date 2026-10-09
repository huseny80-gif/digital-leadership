import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

export async function ensurePermanentTrainingAccessSchema(pool: Pool): Promise<void> {
  const migration = await readFile(new URL("../../../supabase/migrations/00000000000019_permanent_training_access.sql", import.meta.url), "utf8");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('permanent_training_access_schema_v1'))");
    await client.query(migration);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}

export async function ensureReusableTrainingLinksSchema(pool: Pool): Promise<{ active: number; archived: number }> {
  const migration = await readFile(new URL("../../../supabase/migrations/00000000000023_reusable_training_links.sql", import.meta.url), "utf8");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('reusable_training_links_schema_v1'))");
    await client.query(migration);
    const result = await client.query<{ active: string; archived: string }>("select count(*) filter(where not revoked and archived_at is null)::text as active, count(*) filter(where archived_at is not null)::text as archived from training_access_grants");
    await client.query("commit");
    return { active: Number(result.rows[0]!.active), archived: Number(result.rows[0]!.archived) };
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
