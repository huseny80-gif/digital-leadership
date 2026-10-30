import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { assessmentFormat } from "@shared/index";
import { Pool } from "pg";
import { createUser, createLecture } from "../helpers/seedFixtures.js";
import { manifest, subjectMapping } from "../../src/finquiz/catalog.js";
import { finquizRecordId } from "../../src/finquiz/recordIdentity.js";
import { reviewCourseAssessments, courseAssessmentAudit } from "../../src/contentAutomation/reviewCourseAssessments.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { AssessmentsService } from "../../src/assessments/assessmentsService.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function reset() {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires an isolated test database");
  await pool.query("truncate users,audit_logs restart identity cascade");
}
beforeEach(reset); afterEach(reset); afterAll(async () => { await pool.end(); });
const subjectId = subjectMapping["legal-regulatory"]!;
async function seed() {
  const admin = await createUser(pool, { email: "course-review@example.test", providerSubject: "course-review", roleName: "admin" });
  const source = manifest.subjects.find(subject => subject.id === "legal-regulatory")!;
  await pool.query("insert into subjects(id,title,status,created_by) values($1,$2,'published',$3)", [subjectId, source.title, admin]);
  const lectures = [];
  for (const lecture of source.lectures) lectures.push(await createLecture(pool, { subjectId, title: lecture.title, orderIndex: lecture.number, status: "published", createdBy: admin }));
  const bank = (await pool.query("insert into question_banks(subject_id,title,created_by) values($1,'legacy',$2) returning id", [subjectId, admin])).rows[0].id;
  const q = finquizRecordId("question:lg-q1-1");
  await pool.query("insert into questions(id,question_bank_id,question_type,prompt,points,created_by,lecture_id) values($1,$2,'multiple_choice',$3,1,$4,$5)", [q, bank, "وفقًا لنص المحاضرة، أكمل العبارة بالمصطلح الذي ورد فيها: القانونية la لا بين المواطن ______ فقط.", admin, lectures[0]]);
  const option = (await pool.query("insert into question_options(question_id,option_text,is_correct,order_index) values($1,'البيئة',true,0) returning id", [q])).rows[0].id;
  await pool.query("insert into question_options(question_id,option_text,is_correct,order_index) values($1,'والبرنامج',false,1)", [q]);
  async function quiz(lecture: string | null, purpose = "course") {
    const id = (await pool.query("insert into quizzes(subject_id,lecture_id,title,status,created_by,purpose) values($1,$2,'اختبار المادة','published',$3,$4) returning id", [subjectId, lecture, admin, purpose])).rows[0].id;
    await pool.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,0)", [id, q]);
    return id;
  }
  const original = await quiz(null), lectureQuiz = await quiz(lectures[0]!), examQuiz = await quiz(null, "exam_material");
  const attempt = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,score) values($1,$2,'graded',1) returning *", [original, admin])).rows[0];
  await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded) values($1,$2,$3,true,1)", [attempt.id, q, option]);
  const inProgress = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status) values($1,$2,'in_progress') returning id", [original, admin])).rows[0].id;
  return { admin, lectures, bank, q, original, lectureQuiz, examQuiz, attempt, inProgress, quiz, repository: new PgAssessmentsRepository(pool) };
}

describe("publish file-verified course questions without rewriting learner history", () => {
  it("replaces the pictured cloze using all six real legal PDFs and leaves old grades, options and exam archives unchanged", async () => {
    const s = await seed();
    const snapshot = async () => ({ questions: (await pool.query("select * from questions where id=$1", [s.q])).rows,
      options: (await pool.query("select * from question_options where question_id=$1 order by id", [s.q])).rows,
      attempts: (await pool.query("select * from quiz_attempts where quiz_id=$1 order by id", [s.original])).rows,
      answers: (await pool.query("select * from quiz_attempt_answers where attempt_id=$1", [s.attempt.id])).rows,
      memberships: (await pool.query("select * from quiz_questions where quiz_id=any($1::uuid[]) order by quiz_id,order_index", [[s.original, s.lectureQuiz, s.examQuiz]])).rows });
    const before = await snapshot();
    const result = await reviewCourseAssessments(pool, [subjectId]);
    expect(result.courses[0]).toMatchObject({ changed: true, unavailableLectures: [] });
    const current = (await s.repository.listQuizzesForSubject(subjectId, false)).find(quiz => quiz.lectureId === null)!;
    expect(current.id).not.toBe(s.original);
    const questions = await s.repository.listQuestionsForAttempt(current.id);
    expect(questions).toHaveLength(74);
    expect(new Set(questions.map(q => q.lectureId))).toEqual(new Set(s.lectures));
    expect(new Set(questions.map(assessmentFormat))).toEqual(new Set(["multiple_choice", "true_false", "match", "order", "essay", "short_scenario"]));
    expect(questions.every(q => !/___|أكمل العبارة|CamScanner|\bla\b/u.test(q.prompt))).toBe(true);
    expect(questions.filter(q => q.questionType === "multiple_choice").every(q => q.options!.every(option => option.optionText.length >= 24))).toBe(true);
    expect(questions.filter(q => q.questionType === "true_false").every(q => q.options!.map(option => option.optionText).sort().join(":") === ["صح", "خطأ"].sort().join(":"))).toBe(true);
    expect(JSON.stringify(questions)).not.toMatch(/isCorrect|is_correct|sourceReferences|correctIndex|sourceProgram|matchingRightIds/);
    expect(await snapshot()).toEqual(before);
    const service = new AssessmentsService(s.repository);
    const fresh = await service.startAttempt(s.original, { kind: "user", userId: s.admin }, false);
    expect(fresh.quizId).toBe(current.id);
    expect(fresh.id).not.toBe(s.inProgress);
    expect((await pool.query("select status from quiz_attempts where id=$1", [s.inProgress])).rows[0].status).toBe("in_progress");
    expect((await s.repository.getQuizById(s.original, false))!.supersededBy).toBe(current.id);
    const audit = await courseAssessmentAudit(pool, subjectId, false);
    expect(audit.quizzes.every(quiz => quiz.referenced === quiz.questions && quiz.weakFormatQuestions === 0)).toBe(true);
  }, 30000);

  it("delivers independent matching IDs, grades and restores them without exposing the private mapping", async () => {
    const s = await seed(); await reviewCourseAssessments(pool, [subjectId]);
    const quiz = (await s.repository.listQuizzesForSubject(subjectId, false)).find(q => !q.lectureId)!;
    const question = (await s.repository.listQuestionsForAttempt(quiz.id)).find(q => q.questionType === "match")!;
    const left = new Set(question.matchItems!.left.map(item => item.id));
    expect(question.matchItems!.right.every(item => !left.has(item.id))).toBe(true);
    expect(JSON.stringify(question)).not.toMatch(/matchingRightIds|sourceProgram|isCorrect|rubric/);
    const service = new AssessmentsService(s.repository), principal = { kind: "user" as const, userId: s.admin };
    const attempt = await service.startAttempt(quiz.id, principal, false);
    const correct = (await s.repository.getStudyAnswer(question.id)).review!.correctMatches!;
    const wrong = correct.map((pair, index) => ({ ...pair, rightId: correct[(index + 1) % correct.length]!.rightId }));
    expect(await s.repository.scoreMatchAnswer(question.id, wrong)).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
    await expect(service.submitAnswer(attempt.id, principal, { questionId: question.id, matchAnswer: [{ ...correct[0]!, rightId: randomUUID() }, ...correct.slice(1)] })).rejects.toThrow(/does not belong/);
    const ack = await service.submitAnswer(attempt.id, principal, { questionId: question.id, matchAnswer: correct });
    expect(ack.isCorrect).toBe(true);
    const restored = (await service.getAnswersOrThrow(attempt.id, principal)).find(answer => answer.questionId === question.id)!;
    expect(restored.matchAnswer!.sort((a,b) => a.leftId.localeCompare(b.leftId))).toEqual([...correct].sort((a,b) => a.leftId.localeCompare(b.leftId)));
    const childSnapshot = (await pool.query("select * from question_pairs where question_id=$1 order by id", [question.id])).rows;
    await reviewCourseAssessments(pool, [subjectId], "replay-matching-identities");
    expect((await pool.query("select * from question_pairs where question_id=$1 order by id", [question.id])).rows).toEqual(childSnapshot);
    expect((await service.getAnswersOrThrow(attempt.id, principal)).find(answer => answer.questionId === question.id)!.matchAnswer!.sort((a,b) => a.leftId.localeCompare(b.leftId))).toEqual(restored.matchAnswer);
  }, 30000);

  it("is idempotent and repairs a late legacy generation without altering its saved membership", async () => {
    const s = await seed();
    await reviewCourseAssessments(pool, [subjectId]);
    const count = async () => (await pool.query("select count(*)::int as n from quizzes")).rows[0].n;
    const before = await count();
    await reviewCourseAssessments(pool, [subjectId]);
    expect(await count()).toBe(before);
    const current = (await s.repository.listQuizzesForSubject(subjectId, false)).find(q => !q.lectureId)!;
    await pool.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,99)", [current.id, s.q]);
    await reviewCourseAssessments(pool, [subjectId]);
    expect((await pool.query("select count(*)::int as n from quiz_questions where quiz_id=$1", [current.id])).rows[0].n).toBe(75);
    const fixed = (await s.repository.listQuizzesForSubject(subjectId, false)).find(q => !q.lectureId)!;
    expect(await s.repository.listQuestionsForAttempt(fixed.id)).toHaveLength(74);
    const nextCount = await count();
    await reviewCourseAssessments(pool, [subjectId]);
    expect(await count()).toBe(nextCount);
  }, 30000);

  it("does not invent content for a missing source, include hidden lectures or overwrite a trainer-authored quiz", async () => {
    const s = await seed();
    await pool.query("update lectures set status='draft' where id=$1", [s.lectures[1]]);
    const unknown = await createLecture(pool, { subjectId, title: "المحاضرة السابعة قانونية", status: "published", createdBy: s.admin, orderIndex: 7 });
    const unavailableQuiz = await s.quiz(unknown);
    const manualQuestion = (await pool.query("insert into questions(question_bank_id,question_type,prompt,points,created_by,lecture_id) values($1,'open','ناقش الضوابط القانونية في تطبيقك المهني.',1,$2,$3) returning id", [s.bank, s.admin, s.lectures[0]])).rows[0].id;
    const manualQuiz = (await pool.query("insert into quizzes(subject_id,title,status,created_by) values($1,'مناقشة المدرب','published',$2) returning id", [subjectId, s.admin])).rows[0].id;
    await pool.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,0)", [manualQuiz, manualQuestion]);
    await reviewCourseAssessments(pool, [subjectId]);
    expect((await pool.query("select superseded_by from quizzes where id=$1", [manualQuiz])).rows[0].superseded_by).toBeNull();
    const missing = (await pool.query("select successor.status from quizzes old join quizzes successor on successor.id=old.superseded_by where old.id=$1", [unavailableQuiz])).rows[0];
    expect(missing.status).toBe("draft");
    const current = (await s.repository.listQuizzesForSubject(subjectId, false)).find(q => !q.lectureId && q.id !== manualQuiz)!;
    const questions = await s.repository.listQuestionsForAttempt(current.id);
    expect(questions).toHaveLength(66);
    expect(questions.some(q => q.lectureId === unknown || q.lectureId === s.lectures[1])).toBe(false);
  }, 30000);

  it("expands managed editions for a newly approved source once, preserving old attempts, manual questions and point overrides", async () => {
    const s = await seed();
    await pool.query("update lectures set status='draft' where id=$1", [s.lectures[5]]);
    await reviewCourseAssessments(pool, [subjectId]);
    const root = (await s.repository.listQuizzesForSubject(subjectId, false)).find(q => !q.lectureId)!;
    const before = (await pool.query("select * from quiz_questions where quiz_id=$1 order by order_index", [root.id])).rows;
    expect(before).toHaveLength(68);
    await pool.query("update quiz_questions set points_override=3 where quiz_id=$1 and question_id=$2", [root.id, before[0].question_id]);
    const originalAttempt = (await pool.query("select * from quiz_attempts where id=$1", [s.attempt.id])).rows[0];
    const manual = (await pool.query("insert into quizzes(subject_id,title,status,created_by) values($1,'مناقشة خاصة بالمدرب','published',$2) returning id", [subjectId, s.admin])).rows[0].id;
    const custom = (await pool.query("insert into questions(question_bank_id,question_type,prompt,points,created_by) values($1,'open','ناقش التطبيق القانوني في مؤسستك.',1,$2) returning id", [s.bank, s.admin])).rows[0].id;
    await pool.query("insert into quiz_questions(quiz_id,question_id,order_index) values($1,$2,0)", [manual, custom]);
    await pool.query("update lectures set status='published' where id=$1", [s.lectures[5]]);
    await reviewCourseAssessments(pool, [subjectId], "approved-sixth-original");
    const current = (await s.repository.listQuizzesForSubject(subjectId, false)).find(q => !q.lectureId && q.id !== manual)!;
    expect(current.id).not.toBe(root.id);
    const questions = await s.repository.listQuestionsForAttempt(current.id);
    expect(questions).toHaveLength(74);
    expect(new Set(questions.map(q => q.lectureId))).toEqual(new Set(s.lectures));
    expect((await pool.query("select points_override from quiz_questions where quiz_id=$1 and question_id=$2", [current.id, before[0].question_id])).rows[0].points_override).toBe(3);
    expect((await pool.query("select count(*)::int n from quiz_questions where quiz_id=$1", [root.id])).rows[0].n).toBe(68);
    expect((await pool.query("select * from quiz_attempts where id=$1", [s.attempt.id])).rows[0]).toEqual(originalAttempt);
    expect((await pool.query("select superseded_by from quizzes where id=$1", [manual])).rows[0].superseded_by).toBeNull();
    const count = (await pool.query("select count(*)::int n from quizzes")).rows[0].n;
    await reviewCourseAssessments(pool, [subjectId], "approved-sixth-original");
    await reviewCourseAssessments(pool, [subjectId], "same-content-new-review");
    expect((await pool.query("select count(*)::int n from quizzes")).rows[0].n).toBe(count);
  }, 30000);
});
