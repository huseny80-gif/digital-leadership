import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { assessmentFormat } from "@shared/index";
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
import { CourseStudyModules } from "../../src/studyTools/courseStudyModules.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const subjectId = subjectMapping["cybersecurity-governance"]!;
const checksum = "de079540644f0532a6e25cc77ac797c31630c6077ed5732cdb64e9155e1a289d";
const roadmapId = finquizRecordId("lecture:cs-iso-roadmap");
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
}
beforeEach(reset); afterEach(reset); afterAll(async () => { await pool.end(); });
async function seedPreviousCourse() {
  const actor = await createUser(pool, { email: "cyber-seven@example.test", providerSubject: "cyber-seven", roleName: "admin" });
  for (const source of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[source.id], source.title, actor]);
  await synchronizeFinquizCore(pool);
  // Reproduce the pre-update catalogue: no seventh-week original, roadmap in slot seven.
  await pool.query("delete from lectures where id=$1", [finquizRecordId("lecture:cs-l7")]);
  await pool.query("update lectures set order_index=7 where id=$1", [roadmapId]);
  return actor;
}
const library = () => new LibraryService(new ContentService(new PgContentRepository(pool)));

describe("publishing the original seventh cybersecurity governance lecture", () => {
  it("updates the complete learner pipeline without replacing ISO files, keys or grades", async () => {
    const actor = await seedPreviousCourse();
    const oldQuiz = (await pool.query("select id from quizzes where subject_id=$1 and purpose='course' order by created_at,id limit 1", [subjectId])).rows[0];
    expect(oldQuiz).toBeDefined();
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',2) returning *", [oldQuiz.id, actor])).rows[0];
    const snapshot = async () => ({
      attempt: (await pool.query("select * from quiz_attempts where id=$1", [attempt.id])).rows[0],
      membership: (await pool.query("select * from quiz_questions where quiz_id=$1 order by order_index", [oldQuiz.id])).rows,
      options: (await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [oldQuiz.id])).rows,
    });
    const before = await snapshot();
    const result = await refreshCatalogStudyMaterials(pool, [subjectId]);
    expect(result.courses[0]!.issues).toEqual([]);
    expect(result.courses[0]!.registered).toBe(1);
    const view = await library().get(subjectId, false);
    const entry = view.entries.find(entry => entry.id === "cs-l7")!;
    expect(entry.lectureId).toBeTruthy();
    expect(entry.files.some(file => file.sha256 === checksum)).toBe(true);
    expect(entry.files.some(file => file.bodyHtml?.includes("الخطر"))).toBe(true);
    const roadmap = view.entries.find(entry => entry.id === "cs-iso-roadmap")!;
    expect(roadmap.lectureId).toBe(roadmapId);
    expect(roadmap.files.some(file => file.filename.includes("ISO 27001"))).toBe(true);
    expect((await pool.query("select order_index from lectures where id=$1", [roadmapId])).rows[0].order_index).toBe(8);
    const documents = await new CourseStudyModules(pool).documents(subjectId);
    const seventh = documents.summaries.lectures.find(lecture => lecture.number === 7)!;
    expect(seventh.sha256).toBe(checksum);
    expect(seventh.sections.length).toBeGreaterThanOrEqual(8);
    const practice = documents.exam.questions.filter(question => question.lecture === 7);
    expect(practice.length).toBeGreaterThanOrEqual(24);
    expect(new Set(practice.map(question => question.type))).toEqual(new Set(["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"]));
    expect(practice.every(question => question.references.every(index => documents.exam.references[index]!.sha256 === checksum))).toBe(true);
    const group = await new ExamMaterialService(pool).detail(subjectId, result.courses[0]!.groupId!, false);
    expect(group.lectures.find(lecture => lecture.id === entry.lectureId)!.number).toBe(7);
    expect(group.summary.grounding!.sources.some(source => source.sha256 === checksum && source.lectureId === entry.lectureId)).toBe(true);
    await reviewCourseAssessments(pool, [subjectId]);
    const quiz = (await pool.query("select id from quizzes where subject_id=$1 and lecture_id=$2 and purpose='course' and status='published' and superseded_by is null and deleted_at is null", [subjectId, entry.lectureId])).rows[0];
    expect(quiz).toBeDefined();
    const publicQuestions = await new PgAssessmentsRepository(pool).listQuestionsForAttempt(quiz.id);
    expect(new Set(publicQuestions.map(assessmentFormat))).toEqual(new Set(["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"]));
    expect(JSON.stringify(publicQuestions)).not.toMatch(/isCorrect|correctIndex|sourceProgram|sourceReferences/);
    expect(await snapshot()).toEqual(before);
    const again = await refreshCatalogStudyMaterials(pool, [subjectId]);
    expect(again.courses[0]!.registered).toBe(0);
    expect(again.courses[0]!.groupId).toBe(result.courses[0]!.groupId);
  }, 90000);

  it("keeps the new file and derived study documents behind the same lecture visibility rules", async () => {
    await seedPreviousCourse();
    await refreshCatalogStudyMaterials(pool, [subjectId]);
    const visible = await library().get(subjectId, false);
    const seventh = visible.entries.find(entry => entry.id === "cs-l7")!;
    expect(seventh, "the original seventh lecture must be published").toBeDefined();
    const file = seventh.files.find(file => file.sha256 === checksum)!;
    await pool.query("update lectures set status='draft' where id=$1", [seventh.lectureId]);
    expect((await library().get(subjectId, false)).entries.some(entry => entry.id === "cs-l7")).toBe(false);
    await expect(library().file(subjectId, file.id, false)).rejects.toMatchObject({ status: 404 });
    const documents = await new CourseStudyModules(pool).documents(subjectId);
    expect(documents.summaries.lectures.some(lecture => lecture.number === 7)).toBe(false);
    expect(documents.exam.questions.some(question => question.lecture === 7)).toBe(false);
  }, 90000);
});
