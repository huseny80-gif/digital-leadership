import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { aiAssessmentReview, questionContentHash, type AiReviewCatalog } from "../../src/contentAutomation/aiAssessmentReviewCatalog.js";
import { reviewAiAssessments } from "../../src/contentAutomation/reviewAiAssessments.js";
import { PgAssessmentsRepository } from "../../src/assessments/assessmentsRepository.js";
import { createUser, createSubject, createLecture, createQuiz, createQuestionBankWithAnswer, addQuestionToQuiz } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Requires isolated test database");
  await pool.query("truncate audit_logs,quiz_attempt_answers,quiz_attempts,quiz_questions,question_options,questions,question_banks,quizzes,lecture_items,lectures,subjects,files,user_identities,users restart identity cascade");
});
afterAll(async () => { await pool.end(); });

async function seed() {
  const actor = await createUser(pool, { email: "ai-editor@example.test", roleName: "admin", providerSubject: randomUUID() });
  const learner = await createUser(pool, { email: "ai-learner@example.test", roleName: "user", providerSubject: randomUUID() });
  const subject = await createSubject(pool, { title: "الذكاء الاصطناعي", status: "published", createdBy: actor });
  const otherSubject = await createSubject(pool, { title: "مادة أخرى", status: "published", createdBy: actor });
  const other = await createQuestionBankWithAnswer(pool, { subjectId: otherSubject, createdBy: actor });
  const lecture = await createLecture(pool, { subjectId: subject, title: "محاضرة", status: "published", createdBy: actor });
  const aggregate = await createQuiz(pool, { subjectId: subject, title: "اختبار المادة", status: "published", createdBy: actor });
  const individual = await createQuiz(pool, { subjectId: subject, title: "اختبار المحاضرة", status: "published", createdBy: actor });
  await pool.query("update quizzes set lecture_id=$2 where id=$1", [individual, lecture]);
  const bank = await createQuestionBankWithAnswer(pool, { subjectId: subject, createdBy: actor });
  await addQuestionToQuiz(pool, { quizId: aggregate, questionId: bank.questionId });
  await addQuestionToQuiz(pool, { quizId: individual, questionId: bank.questionId });
  const original = (await pool.query("select question_type,prompt,points,explanation,rubric,lecture_id,difficulty,kind,source_import_id,source_excerpt from questions where id=$1", [bank.questionId])).rows[0];
  const opts = (await pool.query("select option_text,is_correct,order_index from question_options where question_id=$1 order by order_index", [bank.questionId])).rows;
  const edited = structuredClone(aiAssessmentReview.groups[0]!.questions[0]!);
  delete edited.lectureId;
  edited.originalId = bank.questionId;
  edited.originalSha256 = questionContentHash({ ...original, options: opts.map(option => [option.option_text, option.is_correct, option.order_index]), answers: [], pairs: [], items: [] });
  const source = aiAssessmentReview.sources[edited.citations[0]!.sourceKey]!;
  await pool.query("insert into files(id,storage_key,original_filename,mime_type,size_bytes,checksum,uploaded_by) values($1,$2,$3,'application/pdf',100,$4,$5)", [source.fileId, `test/${randomUUID()}`, source.filename, source.sha256, actor]);
  const review: AiReviewCatalog = { key: "test-ai-review", subjectId: subject, sources: { [edited.citations[0]!.sourceKey]: source }, groups: [{ sourceKey: null, importId: null, questions: [edited] }] };
  return { actor, learner, subject, bank, aggregate, individual, other, review, source };
}

describe("versioned AI assessment proofreading", () => {
  it("publishes current editions while preserving completed and unfinished attempts and other subjects", async () => {
    const s = await seed();
    const repo = new PgAssessmentsRepository(pool);
    const oldCorrect = await repo.getStudyAnswer(s.bank.questionId);
    const option = (await pool.query("select id from question_options where question_id=$1 and is_correct", [s.bank.questionId])).rows[0].id;
    const completed = (await pool.query("insert into quiz_attempts(quiz_id,user_id,status,submitted_at,score) values($1,$2,'graded',now(),100) returning *", [s.aggregate, s.learner])).rows[0];
    await pool.query("insert into quiz_attempt_answers(attempt_id,question_id,selected_option_id,is_correct,points_awarded) values($1,$2,$3,true,1)", [completed.id, s.bank.questionId, option]);
    const unfinished = (await pool.query("insert into quiz_attempts(quiz_id,user_id) values($1,$2) returning *", [s.individual, s.learner])).rows[0];
    const result = await reviewAiAssessments(pool, s.review);
    expect(result).toMatchObject({ status: "applied", questionCount: 1, quizCount: 2 });
    expect((await pool.query("select * from quiz_attempts where id=$1", [completed.id])).rows[0]).toEqual(completed);
    expect((await pool.query("select * from quiz_attempts where id=$1", [unfinished.id])).rows[0]).toEqual(unfinished);
    expect(await repo.getStudyAnswer(s.bank.questionId)).toEqual(oldCorrect);
    expect((await repo.scoreOption(s.bank.questionId, option)).isCorrect).toBe(true);
    expect((await repo.listQuestionsForAttempt(s.aggregate))[0]?.prompt).toBe("2+2=?");
    const current = await repo.listQuizzesForSubject(s.subject, false);
    expect(current).toHaveLength(2);
    expect(current.map(quiz => quiz.id)).not.toContain(s.aggregate);
    const questions = await repo.listQuestionsForAttempt(current[0]!.id);
    expect(questions[0]?.prompt).toBe(s.review.groups[0]!.questions[0]!.question.prompt);
    expect(JSON.stringify(questions)).not.toMatch(/correctIndex|source_excerpt|acceptedAnswers|rubric|explanation|is_correct/);
    expect((await repo.getStudyAnswer(questions[0]!.id)).summary).toContain("توقّع");
    expect((await pool.query("select prompt from questions where id=$1", [s.other.questionId])).rows[0].prompt).toBe("2+2=?");
    const counts = (await pool.query("select (select count(*) from questions) as questions,(select count(*) from quizzes) as quizzes")).rows[0];
    expect(await reviewAiAssessments(pool, s.review)).toMatchObject({ status: "already_applied", questionCount: 0 });
    expect((await pool.query("select (select count(*) from questions) as questions,(select count(*) from quizzes) as quizzes")).rows[0]).toEqual(counts);
  });
  it("rolls back rather than overwriting an answer key edited after inspection", async () => {
    const s = await seed();
    await pool.query("update question_options set option_text='Teacher edit' where question_id=$1 and is_correct", [s.bank.questionId]);
    await expect(reviewAiAssessments(pool, s.review)).rejects.toThrow("ai_review_question_changed");
    expect((await pool.query("select superseded_by from quizzes where id=$1", [s.aggregate])).rows[0].superseded_by).toBeNull();
    expect((await pool.query("select count(*)::int as n from audit_logs where action='assessments.language_reviewed'")).rows[0].n).toBe(0);
    expect((await pool.query("select count(*)::int as n from questions")).rows[0].n).toBe(2);
  });
  it("requires the exact inspected source file checksum", async () => {
    const s = await seed();
    await pool.query("update files set checksum=$2 where id=$1", [s.source.fileId, "0".repeat(64)]);
    await expect(reviewAiAssessments(pool, s.review)).rejects.toThrow("ai_review_source_changed");
    expect((await pool.query("select superseded_by from quizzes where id=$1", [s.aggregate])).rows[0].superseded_by).toBeNull();
  });
  it("does not mutate an installation without the inspected questions", async () => {
    expect(await reviewAiAssessments(pool)).toEqual({ status: "not_applicable", questionCount: 0, quizCount: 0 });
  });
});
