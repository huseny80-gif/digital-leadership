import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { assessmentFormat } from "@shared/index";
import { Pool } from "pg";
import { createUser } from "../helpers/seedFixtures.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { manifest, subjectMapping, LibraryService } from "../../src/finquiz/catalog.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { refreshCatalogStudyMaterials } from "../../src/contentAutomation/refreshCatalogStudyMaterials.js";
import { reviewCourseAssessments } from "../../src/contentAutomation/reviewCourseAssessments.js";
import { ContentService } from "../../src/content/contentService.js";
import { PgContentRepository } from "../../src/content/contentRepository.js";
import { ExamMaterialService } from "../../src/examMaterials/examMaterialService.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
}
beforeEach(reset); afterEach(reset); afterAll(async () => { await pool.end(); });
async function seed() {
  const actor = await createUser(pool, { email: "curriculum@example.test", providerSubject: "curriculum", roleName: "admin" });
  for (const source of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[source.id], source.title, actor]);
  await synchronizeFinquizCore(pool);
  return actor;
}
describe("a verified curriculum review across all five materials", () => {
  it("recovers a missing original source slot, publishes five complete reviews, and preserves historical answer keys and attempts", async () => {
    const actor = await seed();
    const old = (await pool.query("select id from quizzes where subject_id=$1 and purpose='course' limit 1", [subjectMapping["legal-regulatory"]])).rows[0].id;
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',2) returning *", [old, actor])).rows[0];
    const snapshot = async () => ({ options: (await pool.query("select * from question_options order by id")).rows,
      membership: (await pool.query("select * from quiz_questions where quiz_id=$1 order by order_index", [old])).rows,
      attempt: (await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0] });
    const before = await snapshot();
    const deleted = finquizRecordId("lecture:cs-iso-roadmap");
    await pool.query("update lectures set deleted_at=now() where id=$1", [deleted]);
    const result = await refreshCatalogStudyMaterials(pool);
    expect(result.courses).toHaveLength(5);
    expect(result.courses.reduce((n, course) => n + course.verifiedFiles, 0)).toBe(26);
    expect(result.courses.every(course => course.groupId && course.questionCount > 0)).toBe(true);
    expect(result.courses.find(course => course.slug === "cybersecurity-governance")!.registered).toBe(1);
    const content = new ContentService(new PgContentRepository(pool));
    const cyber = await new LibraryService(content).get(subjectMapping["cybersecurity-governance"]!, false);
    expect(cyber.entries.find(entry => entry.id === "cs-iso-roadmap")!.lectureId).not.toBe(deleted);
    const originalOptions = new Set(before.options.map(option => option.id));
    const after = await snapshot();
    expect(after.options.filter(option => originalOptions.has(option.id))).toEqual(before.options);
    expect(after.membership).toEqual(before.membership); expect(after.attempt).toEqual(before.attempt);
    for (const report of result.courses) {
      const group = await new ExamMaterialService(pool).detail(report.subjectId, report.groupId!, false);
      expect(group.summary.grounding!.sourceScope).toBe("catalog-primary");
      expect(group.summary.grounding!.sources).toHaveLength(report.currentLectures);
      expect(group.lectures).toHaveLength(report.currentLectures);
      const questions = await new PgAssessmentsRepository(pool).listQuestionsForAttempt(group.quizId);
      expect(JSON.stringify(questions)).not.toMatch(/isCorrect|sourceReferences|correctIndex/);
      expect(new Set(questions.map(assessmentFormat))).toEqual(new Set(["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"]));
      expect(questions.every(question => !/___|أكمل العبارة/u.test(question.prompt))).toBe(true);
    }
    await reviewCourseAssessments(pool);
    expect((await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0]).toEqual(before.attempt);
  }, 90000);
  it("does not duplicate reviews or source bindings after a teacher changes a display title", async () => {
    await seed();
    const subjectId = subjectMapping["legal-regulatory"]!;
    const first = await refreshCatalogStudyMaterials(pool, [subjectId]);
    const lectureId = finquizRecordId("lecture:lg-l1");
    await pool.query("update lectures set title='عنوان اختاره المدرب' where id=$1", [lectureId]);
    const second = await refreshCatalogStudyMaterials(pool, [subjectId]);
    expect(second.courses[0]!.groupId).toBe(first.courses[0]!.groupId);
    expect(second.courses[0]!.bound).toBe(0); expect(second.courses[0]!.registered).toBe(0);
    const library = await new LibraryService(new ContentService(new PgContentRepository(pool))).get(subjectId, false);
    expect(library.entries.find(entry => entry.id === "lg-l1")!.lectureId).toBe(lectureId);
    expect((await pool.query("select count(*)::int n from exam_material_groups where subject_id=$1", [subjectId])).rows[0].n).toBe(1);
    expect((await pool.query("select title from lectures where id=$1", [lectureId])).rows[0].title).toBe("عنوان اختاره المدرب");
  }, 60000);
  it("respects a subsequent instructor deletion and publishes the verified second cyber lecture", async () => {
    await seed();
    const subjectId = subjectMapping["cybersecurity-governance"]!;
    await refreshCatalogStudyMaterials(pool, [subjectId]);
    const third = finquizRecordId("lecture:cs-l3");
    await pool.query("update lectures set deleted_at=now() where id=$1", [third]);
    const result = await refreshCatalogStudyMaterials(pool, [subjectId]);
    expect(result.courses[0]!.registered).toBe(0);
    expect(result.courses[0]!.issues).toContainEqual({ sourceLectureId: "cs-l3", code: "source_slot_removed" });
    expect(result.courses[0]!.currentLectures).toBe(5);
    expect((await pool.query("select status from lectures where id=$1", [finquizRecordId("lecture:cs-l2")])).rows[0].status).toBe("published");
  }, 60000);
});
