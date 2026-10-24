import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { assessmentFormat } from "@shared/index";
import { createUser, createLecture } from "../helpers/seedFixtures.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { reviewCourseAssessments } from "../../src/contentAutomation/reviewCourseAssessments.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { ExamMaterialService } from "../../src/examMaterials/examMaterialService.js";
import { refreshDiverseAssessments } from "../../src/examMaterials/refreshDiverseAssessments.js";
import { diverseAssessmentPolicy } from "../../src/examMaterials/diverseAssessment.js";
import { readFileSync } from "node:fs";
import { auditCyberComparisonQuestions } from "../../src/examMaterials/examCaseRevisionAudit.js";
import type { GroundedQuestion } from "../../src/examMaterials/sourceGrounding.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
}
beforeEach(reset); afterEach(reset); afterAll(async () => { await pool.end(); });
const expectedFormats = new Set(["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"]);

describe("published six-format curriculum and exam material revisions", () => {
  it("updates all five real course banks and exam papers once, preserving existing grading programs and archives", async () => {
    const admin = await createUser(pool, { email: "diverse-courses@example.test", providerSubject: "diverse-courses", roleName: "admin" });
    for (const source of manifest.subjects) {
      const subjectId = subjectMapping[source.id]!;
      await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectId, source.title, admin]);
      for (const lecture of source.lectures.filter(lecture => lecture.status === "published")) await createLecture(pool, { subjectId, title: lecture.title, orderIndex: lecture.number, status: "published", createdBy: admin });
      const bank = (await pool.query("insert into question_banks(subject_id,title,created_by) values($1,'legacy',$2) returning id", [subjectId, admin])).rows[0].id;
      const native = source.quizzes.flatMap(quiz => quiz.questions)[0]!;
      const question = finquizRecordId("question:" + native.id);
      await pool.query("insert into questions(id,question_bank_id,question_type,prompt,created_by) values($1,$2,'multiple_choice','سؤال سابق محفوظ في الأرشيف.',$3)", [question, bank, admin]);
      await pool.query("insert into question_options(question_id,option_text,is_correct,order_index) values($1,'الإجابة الأصلية',true,0)", [question]);
      const quiz = (await pool.query("insert into quizzes(subject_id,title,status,created_by) values($1,'اختبار المادة','published',$2) returning id", [subjectId, admin])).rows[0].id;
      await pool.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,0)", [quiz, question]);
    }
    const originalKeys = (await pool.query("select * from question_options order by id")).rows;
    await reviewCourseAssessments(pool);
    const repository = new PgAssessmentsRepository(pool), service = new ExamMaterialService(pool);
    for (const subjectId of Object.values(subjectMapping)) {
      const quiz = (await repository.listQuizzesForSubject(subjectId, false)).find(quiz => !quiz.lectureId)!;
      expect(new Set((await repository.listQuestionsForAttempt(quiz.id)).map(assessmentFormat))).toEqual(expectedFormats);
    }
    const first = await refreshDiverseAssessments(pool);
    expect(first.issues).toEqual([]); expect(first.published).toBe(5);
    const published = (await pool.query("select * from exam_material_groups order by subject_id")).rows;
    expect(published).toHaveLength(5);
    for (const group of published) {
      expect(group.summary.grounding.questionPolicy).toBe(diverseAssessmentPolicy);
      const paper = await service.academicPaper(group.subject_id, group.id, { kind: "user", userId: admin }, true);
      expect(new Set(paper.questions.map(question => question.type))).toEqual(new Set(["multiple_choice", "true_false", "match", "order", "short_answer", "case_study"]));
      expect(paper.answerKey).toHaveLength(group.question_count);
      expect(paper.answerKey!.every(answer => answer.rubric.length > 0 && answer.rubric.every(item => item.references.length > 0))).toBe(true);
      if (group.subject_id === subjectMapping["cybersecurity-governance"]) {
        const cases = JSON.parse(readFileSync(new URL("../../content/finquiz/analyticalCases.json", import.meta.url), "utf8")) as { cases: Array<{ id: string; criterion: string; sha256: string }> };
        // The catalog selection covers lectures 1–5 and ISO; the privately
        // uploaded sixth lecture is not part of this integration fixture.
        const comparisons = cases.cases.filter(question => question.id.startsWith("cmp-cyber") && !question.id.startsWith("cmp-cyber6-"));
        expect(comparisons).toHaveLength(5);
        const stored = (await pool.query<{ id: string; prompt: string; program: GroundedQuestion }>("select q.id,q.prompt,q.rubric->'sourceProgram' as program from questions q join quiz_questions qq on qq.question_id=q.id where qq.quiz_id=$1", [group.quiz_id])).rows;
        for (const comparison of comparisons) {
          const matching = stored.filter(row => row.program?.assessment?.criterion === comparison.criterion);
          expect(matching).toHaveLength(1);
          const row = matching[0]!;
          expect(row.program.assessment!.policy).toBe("source-case-assessment-v1");
          expect(row.program.references.every(reference => reference.sha256 === comparison.sha256)).toBe(true);
          expect(row.prompt).toBe(row.program.prompt);
          expect(paper.questions.find(question => question.id === row.id)?.prompt).toBe(row.prompt);
        }
      }
      const learner = await service.academicPaper(group.subject_id, group.id, { kind: "user", userId: admin }, false);
      expect(JSON.stringify(learner)).not.toMatch(/"(?:answerKey|modelAnswer|correctIndex|isCorrect|sourceProgram|matchingRightIds|excerpt)"/u);
    }
    const rerun = await refreshDiverseAssessments(pool);
    const comparisonAudit = await auditCyberComparisonQuestions(pool);
    expect(comparisonAudit).toMatchObject({ expected: 7, verifiedCourseCases: 5, missingExamSelections: 0 });
    expect(rerun).toMatchObject({ published: 0, alreadyCurrent: 5, issues: [] });
    expect((await pool.query("select * from exam_material_groups order by subject_id")).rows).toEqual(published);
    expect((await pool.query("select * from question_options where id=any($1::uuid[]) order by id", [originalKeys.map(key => key.id)])).rows).toEqual(originalKeys);

    // An older saved selection receives a new edition; its question keys,
    // membership and summary remain exactly as they were before the refresh.
    const previous = published[0]!;
    await pool.query("update exam_material_groups set summary=summary #- '{grounding,questionPolicy}' where id=$1", [previous.id]);
    const snapshot = async () => ({ group: (await pool.query("select * from exam_material_groups where id=$1", [previous.id])).rows,
      questions: (await pool.query("select q.* from questions q join quiz_questions qq on qq.question_id=q.id where qq.quiz_id=$1 order by q.id", [previous.quiz_id])).rows,
      options: (await pool.query("select o.* from question_options o join quiz_questions qq on qq.question_id=o.question_id where qq.quiz_id=$1 order by o.id", [previous.quiz_id])).rows });
    const before = await snapshot(), revised = await refreshDiverseAssessments(pool);
    expect(revised).toMatchObject({ published: 1, alreadyCurrent: 4, issues: [] });
    expect(await snapshot()).toEqual(before);
    const index = await service.index(previous.subject_id, false, { page: 1, limit: 20, offset: 0 });
    expect(index.total).toBe(1); expect(index.groups[0]!.id).not.toBe(previous.id);
    expect((await refreshDiverseAssessments(pool))).toMatchObject({ published: 0, alreadyCurrent: 5, issues: [] });
    // A new reviewed-case revision must also refresh a current-format group.
    // Every earlier summary and copied answer program remains untouched.
    const archived = (await pool.query("select id,summary,source_digest,quiz_id from exam_material_groups order by id")).rows;
    const sourceRefresh = await refreshDiverseAssessments(pool, "comparison-cases-regression");
    expect(sourceRefresh).toMatchObject({ published: 5, alreadyCurrent: 0, issues: [] });
    expect((await pool.query("select id,summary,source_digest,quiz_id from exam_material_groups where id=any($1::uuid[]) order by id", [archived.map(group => group.id)])).rows).toEqual(archived);
    const afterSource = (await pool.query("select count(*)::int n from exam_material_groups")).rows[0].n;
    expect(await refreshDiverseAssessments(pool, "comparison-cases-regression")).toMatchObject({ published: 0, alreadyCurrent: 5, issues: [] });
    expect((await pool.query("select count(*)::int n from exam_material_groups")).rows[0].n).toBe(afterSource);
  }, 180000);
});
