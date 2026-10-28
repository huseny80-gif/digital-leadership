import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createUser, createLecture } from "../helpers/seedFixtures.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { synchronizeFinquizCore } from "../../src/finquiz/synchronizeCore.js";
import { reviewCourseAssessments } from "../../src/contentAutomation/reviewCourseAssessments.js";
import { repairRiskQuizSourceLabels } from "../../src/contentAutomation/repairRiskQuizSourceLabels.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { AssessmentsService } from "../../src/assessments/assessmentsService.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const subjectId = subjectMapping["risk-management"]!;
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
});
afterAll(async () => { await pool.end(); });

async function seed() {
  const actor = await createUser(pool, { email: "risk-labels@example.test", providerSubject: "risk-labels", roleName: "admin" });
  for (const source of manifest.subjects) await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectMapping[source.id], source.title, actor]);
  await synchronizeFinquizCore(pool);
  await reviewCourseAssessments(pool, [subjectId]);
  const repository = new PgAssessmentsRepository(pool);
  const root = (await repository.listQuizzesForSubject(subjectId, false)).find(quiz => !quiz.lectureId)!;
  async function copy(title: string, lectureId: string | null = null, onlyLecture?: string, purpose = "course") {
    const id = (await pool.query("insert into quizzes(subject_id,lecture_id,title,description,time_limit_seconds,due_at,status,created_by,purpose) values($1,$2,$3,'اختبار متنوع الصيغ موثّق بملفات المحاضرات',600,'2027-11-01T12:00:00Z','published',$4,$5) returning id", [subjectId, lectureId, title, actor, purpose])).rows[0].id as string;
    await pool.query(`insert into quiz_questions(quiz_id,question_id,order_index,points_override)
      select $1,qq.question_id,qq.order_index,3 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=$2 and ($3::uuid is null or q.lecture_id=$3)`, [id, root.id, onlyLecture ?? null]);
    return id;
  }
  return { actor, root, copy, repository };
}

describe("risk quiz labels follow verified question sources, not legacy lecture numbers", () => {
  it("replaces the pictured sixth-lecture card with its actual source scope while preserving every saved grade and key", async () => {
    const s = await seed();
    const stray = await createLecture(pool, { subjectId, title: "المحاضرة السادسة مخاطر", status: "published", createdBy: s.actor, orderIndex: 6 });
    const old = await s.copy("اختبار المحاضرة السادسة مخاطر", stray);
    const q = (await pool.query("select q.id from questions q join quiz_questions qq on qq.question_id=q.id where qq.quiz_id=$1 and q.question_type='multiple_choice' order by qq.order_index limit 1", [old])).rows[0].id;
    const option = (await pool.query("select id from question_options where question_id=$1 and is_correct", [q])).rows[0].id;
    const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',3) returning id", [old, s.actor])).rows[0].id;
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded) values($1,$2,$3,true,3)", [attempt, q, option]);
    const active = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status) values($1,$2,'in_progress') returning id", [old, s.actor])).rows[0].id;
    const snapshot = async () => ({
      memberships: (await pool.query("select * from quiz_questions where quiz_id=$1 order by order_index", [old])).rows,
      questions: (await pool.query("select * from questions order by id")).rows,
      options: (await pool.query("select * from question_options order by id")).rows,
      attempts: (await pool.query("select * from quiz_attempts where quiz_id=$1 order by id", [old])).rows,
      answers: (await pool.query("select * from quiz_attempt_answers where attempt_id=$1", [attempt])).rows,
    });
    const before = await snapshot();
    await repairRiskQuizSourceLabels(pool);
    const successor = (await pool.query("select superseded_by from quizzes where id=$1", [old])).rows[0].superseded_by;
    expect(successor).toBeTruthy();
    const quiz = await s.repository.getQuizById(successor, false);
    expect(quiz).toMatchObject({ lectureId: null, timeLimitSeconds: 600, dueAt: "2027-11-01T12:00:00.000Z" });
    expect(quiz!.title).toBe("اختبار شامل — إدارة المخاطر واتخاذ القرار (المحاضرات 1، 2، 3، 4، 5، 6)");
    expect((await s.repository.listQuizzesForSubject(subjectId, false)).some(quiz => quiz.id === old)).toBe(false);
    expect((await pool.query("select question_id,order_index,points_override from quiz_questions where quiz_id=$1 order by order_index", [successor])).rows)
      .toEqual(before.memberships.map(({ quiz_id: _quiz, ...row }) => row));
    expect(await snapshot()).toEqual(before);
    const service = new AssessmentsService(s.repository), principal = { kind: "user" as const, userId: s.actor };
    expect((await service.getResultOrThrow(attempt, principal, false)).score).toBe(3);
    expect((await service.startAttempt(old, principal, false)).quizId).toBe(successor);
    expect((await pool.query("select status from quiz_attempts where id=$1", [active])).rows[0].status).toBe("in_progress");
    const count = (await pool.query("select count(*)::int n from quizzes")).rows[0].n;
    expect((await repairRiskQuizSourceLabels(pool)).editions).toBe(0);
    expect((await pool.query("select count(*)::int n from quizzes")).rows[0].n).toBe(count);
  }, 60000);

  it("binds a mislabeled unlinked test to the actual second lecture using its question evidence", async () => {
    const s = await seed();
    const second = (await s.repository.listQuizzesForSubject(subjectId, false)).find(quiz => quiz.title === "اختبار المحاضرة الثانية مخاطر")!.lectureId!;
    const old = await s.copy("اختبار Lecture 6", null, second);
    await repairRiskQuizSourceLabels(pool);
    const successor = (await pool.query("select superseded_by from quizzes where id=$1", [old])).rows[0].superseded_by;
    expect(await s.repository.getQuizById(successor, false)).toMatchObject({ title: "اختبار المحاضرة الثانية مخاطر", lectureId: second });
  }, 60000);

  it("preserves instructor names, exam archives and records with incomplete source evidence", async () => {
    const s = await seed();
    const manual = await s.copy("مناقشة خاصة أعدّها المدرب");
    const archive = await s.copy("اختبار المحاضرة السادسة مخاطر", null, undefined, "exam_material");
    const unsupported = await s.copy("اختبار المحاضرة السادسة مخاطر");
    const q = (await pool.query("select question_id from quiz_questions where quiz_id=$1 order by order_index limit 1", [unsupported])).rows[0].question_id;
    await pool.query("update questions set rubric=jsonb_set(rubric,'{sourceReferences}','[]'::jsonb) where id=$1", [q]);
    const before = (await pool.query("select * from quizzes where id=any($1::uuid[]) order by id", [[manual, archive, unsupported]])).rows;
    const result = await repairRiskQuizSourceLabels(pool);
    expect(result.skipped).toBeGreaterThan(0);
    expect((await pool.query("select * from quizzes where id=any($1::uuid[]) order by id", [[manual, archive, unsupported]])).rows).toEqual(before);
  }, 60000);

  it("rejects cross-lecture redirects without repair provenance and after any membership change", async () => {
    const s = await seed();
    const second = (await s.repository.listQuizzesForSubject(subjectId, false)).find(quiz => quiz.title === "اختبار المحاضرة الثانية مخاطر")!.lectureId!;
    const old = await s.copy("اختبار Lecture 6", null, second);
    const unrelated = await s.copy("اختبار خاص", second, second);
    await pool.query("update quizzes set superseded_by=$2 where id=$1", [old, unrelated]);
    const service = new AssessmentsService(s.repository), principal = { kind: "user" as const, userId: s.actor };
    await expect(service.startAttempt(old, principal, false)).rejects.toMatchObject({ status: 409 });
    await pool.query("update quizzes set superseded_by=null where id=$1", [old]);
    await repairRiskQuizSourceLabels(pool);
    const successor = (await pool.query("select superseded_by from quizzes where id=$1", [old])).rows[0].superseded_by;
    expect(await s.repository.isVerifiedQuizScopeRepair(old, successor)).toBe(true);
    await pool.query("update quiz_questions set points_override=9 where quiz_id=$1", [successor]);
    expect(await s.repository.isVerifiedQuizScopeRepair(old, successor)).toBe(false);
    await expect(service.startAttempt(old, principal, false)).rejects.toMatchObject({ status: 409 });
  }, 60000);

  it("never makes an effectively hidden quiz visible by changing its lecture scope", async () => {
    const s = await seed();
    const draft = await createLecture(pool, { subjectId, title: "محاضرة مخفية", status: "draft", createdBy: s.actor });
    const deleted = await createLecture(pool, { subjectId, title: "محاضرة محذوفة", status: "published", createdBy: s.actor });
    await pool.query("update lectures set deleted_at=now() where id=$1", [deleted]);
    const foreign = await createLecture(pool, { subjectId: subjectMapping["legal-regulatory"]!, title: "محاضرة في مادة أخرى", status: "published", createdBy: s.actor });
    const hidden = [];
    for (const lecture of [draft, deleted, foreign]) {
      const quiz = await s.copy("اختبار المحاضرة السادسة مخاطر", lecture);
      expect(await s.repository.getQuizById(quiz, false)).toBeNull();
      hidden.push(quiz);
    }
    const before = (await pool.query("select * from quizzes where id=any($1::uuid[]) order by id", [hidden])).rows;
    await repairRiskQuizSourceLabels(pool);
    expect((await pool.query("select * from quizzes where id=any($1::uuid[]) order by id", [hidden])).rows).toEqual(before);
    expect((await pool.query("select count(*)::int n from quizzes where id=any($1::uuid[]) and superseded_by is not null", [hidden])).rows[0].n).toBe(0);
    for (const quiz of hidden) expect(await s.repository.getQuizById(quiz, false)).toBeNull();
  }, 60000);
});
