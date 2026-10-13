import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createUser, createLecture } from "../helpers/seedFixtures.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { ExamMaterialService } from "../../src/examMaterials/examMaterialService.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function resetFixture() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
}
beforeEach(resetFixture);
afterEach(resetFixture);
afterAll(async () => { await pool.end(); });
async function seed() {
  const admin = await createUser(pool, { email: "legal-review@example.test", providerSubject: "legal-review", roleName: "admin" });
  const subjectId = subjectMapping["legal-regulatory"]!;
  const source = manifest.subjects.find(subject => subject.id === "legal-regulatory")!;
  await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectId, source.title, admin]);
  const lectures = [];
  for (const lecture of source.lectures) lectures.push(await createLecture(pool, { subjectId, title: lecture.title, orderIndex: lecture.number, status: "published", createdBy: admin }));
  return { admin, subjectId, lectures, service: new ExamMaterialService(pool) };
}
describe("legal archive study repair using actual course PDFs", () => {
  it("uses the same reviewed text for new generation, old bookmarks, narration and export without rewriting historical records", async () => {
    const s = await seed(), group = await s.service.generate(s.subjectId, s.lectures, randomUUID(), s.admin);
    expect(group.summary.grounding?.summaryPolicy).toBe("visually-verified-legal-excerpts-v1");
    expect(group.summary.sections.reduce((count, section) => count + section.topics!.length, 0)).toBe(64);
    const noisy = structuredClone(group.summary);
    delete noisy.grounding!.summaryPolicy;
    noisy.sections.forEach(section => { section.text = "هذا نص قديم.\nI\n6800568008: تم المسح الضوئي ب CamScanner\n| -"; section.topics = [{ title: "العرض الأكاديمي للمحاضرة", text: section.text }]; });
    await pool.query("update exam_material_groups set summary=$2::jsonb where id=$1", [group.id, JSON.stringify(noisy)]);
    const row = (await pool.query("select * from exam_material_groups where id=$1", [group.id])).rows[0];
    const keys = (await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [group.quizId])).rows;
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [group.quizId, s.admin])).rows[0];
    const corrected = await s.service.detail(s.subjectId, group.id, false);
    expect(corrected.summary).toEqual(group.summary);
    expect(JSON.stringify(corrected.review)).not.toMatch(/CamScanner|6800568008|صفحات ملف PDF/);
    const exported = await s.service.reviewPackage(s.subjectId, group.id, false);
    expect(exported.group.summary).toEqual(corrected.summary);
    expect((await pool.query("select * from exam_material_groups where id=$1", [group.id])).rows[0]).toEqual(row);
    expect((await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [group.quizId])).rows).toEqual(keys);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(attempt);
    expect((await s.service.index(s.subjectId, false, { page: 1, limit: 100, offset: 0 })).total).toBe(1);
  }, 30000);
  it("keeps unselected, hidden and wrong-subject groups inaccessible", async () => {
    const s = await seed(), group = await s.service.generate(s.subjectId, [s.lectures[4]!], randomUUID(), s.admin);
    expect(group.summary.sections.map(section => section.number)).toEqual([5]);
    await expect(s.service.detail(randomUUID(), group.id, false)).rejects.toMatchObject({ status: 404 });
    await pool.query("update lectures set status='draft' where id=$1", [s.lectures[4]]);
    await expect(s.service.detail(s.subjectId, group.id, false)).rejects.toMatchObject({ status: 404 });
  }, 20000);
});
