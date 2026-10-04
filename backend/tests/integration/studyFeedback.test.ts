import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import { createUser, createSubject, createQuiz, createQuestionBankWithAnswer, createFillQuestion, createMatchQuestion, createOrderQuestion, createOpenQuestion, addQuestionToQuiz } from "../helpers/seedFixtures.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Study feedback tests require an isolated test database");
  await pool.query("truncate audit_logs, quiz_attempt_answers, quiz_attempts, quiz_questions, question_options, questions, question_banks, quizzes, lecture_items, lectures, subjects, files, user_identities, users restart identity cascade");
});
afterAll(async () => { await pool.end(); });

async function seed() {
  const admin = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  await createUser(pool, { email: "trainee@example.com", roleName: "user", providerSubject: "trainee-sub" });
  await createUser(pool, { email: "other@example.com", roleName: "user", providerSubject: "other-sub" });
  const token = await signFakeSupabaseToken({ sub: "trainee-sub", email: "trainee@example.com" });
  const other = await signFakeSupabaseToken({ sub: "other-sub", email: "other@example.com" });
  const subjectId = await createSubject(pool, { title: "Training", status: "published", createdBy: admin });
  const quizId = await createQuiz(pool, { subjectId, title: "Interactive Training", status: "published", createdBy: admin });
  const { bankId, questionId: mcq } = await createQuestionBankWithAnswer(pool, { subjectId, createdBy: admin });
  const options = await pool.query<{ id: string; is_correct: boolean }>("select id, is_correct from question_options where question_id=$1", [mcq]);
  const fill = await createFillQuestion(pool, { bankId, createdBy: admin, acceptedAnswers: ["ميثاق المشروع", "الميثاق"] });
  const match = await createMatchQuestion(pool, { bankId, createdBy: admin, pairs: [{ left: "فرنسا", right: "باريس" }, { left: "اليابان", right: "طوكيو" }] });
  const order = await createOrderQuestion(pool, { bankId, createdBy: admin, items: ["التخطيط", "التنفيذ"] });
  const open = await createOpenQuestion(pool, { bankId, createdBy: admin });
  const rubric = [{ text: "تحديد المخاطر", keywords: ["تحليل", "تحديد"] }, { text: "خطة استجابة", keywords: ["قرار"] }];
  await pool.query("update questions set rubric=$2::jsonb, explanation=$3 where id=$1", [open, JSON.stringify(rubric), "توضيح السيناريو الأصلي"]);
  await pool.query("update questions set explanation='توضيح الاختيار الأصلي' where id=$1", [mcq]);
  for (const [index, id] of [mcq, fill, match.questionId, order.questionId, open].entries()) await addQuestionToQuiz(pool, { quizId, questionId: id, orderIndex: index });
  const app = createApp();
  const started = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${token}`);
  expect(started.status).toBe(201);
  return { app, token, other, quizId, attemptId: started.body.data.id as string, mcq, fill, match, order, open, rubric, correct: options.rows.find(row => row.is_correct)!.id, wrong: options.rows.find(row => !row.is_correct)!.id };
}

describe("owned post-answer study feedback over HTTP", () => {
  it("does not expose any keys or rubrics in initial questions or an empty attempt", async () => {
    const s = await seed();
    const questions = await request(s.app).get(`/api/v1/quizzes/${s.quizId}/questions`).set("Authorization", `Bearer ${s.token}`);
    expect(questions.status).toBe(200);
    expect(JSON.stringify(questions.body)).not.toMatch(/"(isCorrect|is_correct|answerReview|correctAnswerSummary|explanation|rubric|correctOptionIds|correctOrder|correctMatches)"\s*:/);
    const feedback = await request(s.app).get(`/api/v1/attempts/${s.attemptId}/feedback`).set("Authorization", `Bearer ${s.token}`);
    expect(feedback.status).toBe(200); expect(feedback.body.data).toEqual([]);
    expect(feedback.headers["cache-control"]).toBe("private, no-store");
  });
  it("returns the real correct option and explanation after a wrong response, and restores only that answered question", async () => {
    const s = await seed();
    const answer = await request(s.app).post(`/api/v1/attempts/${s.attemptId}/answers`).set("Authorization", `Bearer ${s.token}`).send({ questionId: s.mcq, selectedOptionId: s.wrong, isCorrect: true });
    expect(answer.status).toBe(200);
    expect(answer.body.data).toEqual(expect.objectContaining({ isCorrect: false, correctAnswerSummary: "4", feedback: "توضيح الاختيار الأصلي", answerReview: { correctOptionIds: [s.correct] } }));
    const restored = await request(s.app).get(`/api/v1/attempts/${s.attemptId}/feedback`).set("Authorization", `Bearer ${s.token}`);
    expect(restored.body.data).toEqual([answer.body.data]);
    expect(JSON.stringify(restored.body)).not.toContain("تحديد المخاطر");
  });
  it("includes all accepted fill answers and structured match/order corrections only after valid submission", async () => {
    const s = await seed();
    const post = (body: Record<string, unknown>) => request(s.app).post(`/api/v1/attempts/${s.attemptId}/answers`).set("Authorization", `Bearer ${s.token}`).send(body);
    const fill = await post({ questionId: s.fill, answerText: "ميثاق المشروع" });
    expect(fill.status).toBe(200); expect(fill.body.data.isCorrect).toBe(true); expect(fill.body.data.correctAnswerSummary).toContain("الميثاق");
    const match = await post({ questionId: s.match.questionId, matchAnswer: s.match.pairIds.map(id => ({ leftId: id, rightId: id })) });
    expect(match.status).toBe(200); expect(match.body.data.answerReview.correctMatches).toEqual(s.match.pairIds.map(id => ({ leftId: id, rightId: id })));
    const order = await post({ questionId: s.order.questionId, orderAnswer: [...s.order.itemIds].reverse() });
    expect(order.status).toBe(200); expect(order.body.data.isCorrect).toBe(false); expect(order.body.data.answerReview.correctOrder).toEqual(s.order.itemIds);
  });
  it("reveals essay/scenario criteria and keywords as text, never marks an essay automatically wrong", async () => {
    const s = await seed();
    const empty = await request(s.app).post(`/api/v1/attempts/${s.attemptId}/answers`).set("Authorization", `Bearer ${s.token}`).send({ questionId: s.open, answerText: "   " });
    expect(empty.status).toBe(400);
    const answer = await request(s.app).post(`/api/v1/attempts/${s.attemptId}/answers`).set("Authorization", `Bearer ${s.token}`).send({ questionId: s.open, answerText: "أحدد المخاطر ثم أضع خطة استجابة" });
    expect(answer.status).toBe(200); expect(answer.body.data.isCorrect).toBeNull();
    expect(answer.body.data.answerReview.rubric).toEqual(s.rubric);
    expect(answer.body.data.correctAnswerSummary).toBe("تحديد المخاطر\nخطة استجابة");
    expect(answer.body.data.feedback).toBe("توضيح السيناريو الأصلي");
    expect(JSON.stringify(answer.body)).not.toContain("[object Object]");
    await request(s.app).post(`/api/v1/attempts/${s.attemptId}/submit`).set("Authorization", `Bearer ${s.token}`).expect(200);
    const restored = await request(s.app).get(`/api/v1/attempts/${s.attemptId}/feedback`).set("Authorization", `Bearer ${s.token}`);
    expect(restored.body.data).toEqual([answer.body.data]);
  });
  it("denies unauthenticated and cross-owner access even after feedback exists", async () => {
    const s = await seed();
    await request(s.app).post(`/api/v1/attempts/${s.attemptId}/answers`).set("Authorization", `Bearer ${s.token}`).send({ questionId: s.mcq, selectedOptionId: s.correct }).expect(200);
    await request(s.app).get(`/api/v1/attempts/${s.attemptId}/feedback`).expect(401);
    const other = await request(s.app).get(`/api/v1/attempts/${s.attemptId}/feedback`).set("Authorization", `Bearer ${s.other}`);
    expect(other.status).toBe(404); expect(other.body.data).toBeUndefined();
    const strangerAnswer = await request(s.app).post(`/api/v1/attempts/${s.attemptId}/answers`).set("Authorization", `Bearer ${s.other}`).send({ questionId: s.open, answerText: "An answer" });
    expect(strangerAnswer.status).toBe(404); expect(strangerAnswer.body.data).toBeUndefined();
  });
  it("invalid or incomplete responses cannot unlock another question's answers", async () => {
    const s = await seed();
    const invalid = await request(s.app).post(`/api/v1/attempts/${s.attemptId}/answers`).set("Authorization", `Bearer ${s.token}`).send({ questionId: s.match.questionId, matchAnswer: [{ leftId: s.match.pairIds[0], rightId: s.match.pairIds[0] }] });
    expect(invalid.status).toBe(400);
    const restored = await request(s.app).get(`/api/v1/attempts/${s.attemptId}/feedback`).set("Authorization", `Bearer ${s.token}`);
    expect(restored.body.data).toEqual([]);
    await pool.query("update quizzes set status='draft' where id=$1", [s.quizId]);
    await request(s.app).get(`/api/v1/attempts/${s.attemptId}/feedback`).set("Authorization", `Bearer ${s.token}`).expect(404);
  });
});
