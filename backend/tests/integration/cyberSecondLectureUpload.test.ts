import { readFile } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ContentImportService } from "../../src/contentAutomation/contentImportService.js";
import { subjectMapping } from "../../src/finquiz/catalog.js";
import type { StorageProvider } from "../../src/files/storageProvider.js";
import { createUser, createLecture } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const subjectId = subjectMapping["cybersecurity-governance"]!;
class MemoryStorage implements StorageProvider {
  readonly name = "local-filesystem" as const;
  objects = new Map<string, Buffer>();
  async upload(key: string, data: Buffer) { this.objects.set(key, Buffer.from(data)); }
  async read(key: string) { const data = this.objects.get(key); if (!data) throw new Error("missing"); return Buffer.from(data); }
  async delete(key: string) { this.objects.delete(key); }
  async getSignedUrl() { return "https://example.invalid/private-file"; }
}
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate audit_logs,quiz_attempt_answers,quiz_attempts,quiz_questions,question_options,questions,question_banks,quizzes,lecture_items,lectures,subjects,files,content_imports,user_identities,users restart identity cascade");
}
beforeEach(reset);
afterAll(async () => { await reset(); await pool.end(); });

describe("uploaded slide PDF with a verified catalog transcript", () => {
  it("uses the proofread transcript of the same bytes instead of the ligature-reversed extraction", async () => {
    const actor = await createUser(pool, { email: "cyber-second@example.test", roleName: "admin", providerSubject: "cyber-second-admin" });
    await pool.query("insert into subjects(id,title,status,created_by) values($1,'حوكمة الأمن السيبراني','published',$2)", [subjectId, actor]);
    const lecture = await createLecture(pool, { subjectId, title: "المحاضرة الثانية في حوكمة الأمن السيبراني", orderIndex: 2, status: "published", createdBy: actor });
    const bytes = await readFile(new URL("../../content/finquiz/files/cybersecurity-governance/المحاضرة الثانية في حوكمة الأمن السيبراني.pdf", import.meta.url));
    const service = new ContentImportService(pool, new MemoryStorage(), 10485760, { extract: async () => { throw new Error("raw extraction must not be used"); } });
    const job = await service.submitPdf({ actorId: actor, subjectId: null, filename: "المحاضرة الثانية امن سيبراني.pdf", mimeType: "application/pdf", buffer: bytes });
    await service.processNext();
    const done = await service.get(job.id);
    expect(done.status).toBe("completed");
    expect(done.lectures.map(row => row.id)).toEqual([lecture]);
    expect(done.questionCount).toBeGreaterThanOrEqual(5);
    const body = (await pool.query<{ body_text: string }>("select body_text from lecture_items where lecture_id=$1 and file_id is not null", [lecture])).rows[0]!.body_text;
    expect(body).toContain("الإطار الذي يحدد من خلاله مجلس الإدارة");
    expect(body).not.toMatch(/األ|اإل|\t/u);
  }, 60_000);
});
