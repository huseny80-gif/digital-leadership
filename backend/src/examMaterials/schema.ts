import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

export async function ensureExamMaterialSchema(pool: Pool): Promise<void> {
  const sql = await readFile(new URL("../../../supabase/migrations/00000000000022_exam_material.sql", import.meta.url), "utf8");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('exam_material_schema_v1'))");
    await client.query(sql);
    await client.query(await readFile(new URL("../../../supabase/migrations/00000000000024_exam_challenge.sql", import.meta.url), "utf8"));
    await client.query(await readFile(new URL("../../../supabase/migrations/00000000000025_exam_instructor_guides.sql", import.meta.url), "utf8"));
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
