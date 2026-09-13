import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import {
  addQuestionToQuiz,
  createQuestionBankWithAnswer,
  createQuiz,
  createSubject,
  createUser,
} from "../helpers/seedFixtures.js";

/**
 * Assessment API tests (ASSESSMENT_TEST_PLAN.md). Run against the same
 * real local PostgreSQL database as the other integration suites.
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetDatabase() {
  await pool.query(
    `truncate audit_logs, quiz_attempt_answers, quiz_attempts, quiz_questions, question_options,
     questions, question_banks, quizzes, lecture_items, lectures, subjects, files, user_identities, users
     restart identity cascade`,
  );
}

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDatabase();
});

async function seedQuizScenario() {
  const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  const userId = await createUser(pool, { email: "user@example.com", roleName: "user", providerSubject: "user-sub" });
  const otherUserId = await createUser(pool, { email: "other@example.com", roleName: "user", providerSubject: "other-sub" });

  const publishedSubjectId = await createSubject(pool, { title: "Mathematics", status: "published", createdBy: adminId });
  const draftSubjectId = await createSubject(pool, { title: "Draft Subject", status: "draft", createdBy: adminId });

  const { questionId } = await createQuestionBankWithAnswer(pool, { subjectId: publishedSubjectId, createdBy: adminId });
  const optionsResult = await pool.query<{ id: string; option_text: string; is_correct: boolean }>(
    "select id, option_text, is_correct from question_options where question_id = $1 order by order_index asc",
    [questionId],
  );
  const wrongOptionId = optionsResult.rows.find((r) => !r.is_correct)!.id;
  const correctOptionId = optionsResult.rows.find((r) => r.is_correct)!.id;

  const publishedQuizId = await createQuiz(pool, {
    subjectId: publishedSubjectId,
    title: "Arithmetic Quiz",
    status: "published",
    createdBy: adminId,
  });
  await addQuestionToQuiz(pool, { quizId: publishedQuizId, questionId });

  const draftQuizId = await createQuiz(pool, {
    subjectId: publishedSubjectId,
    title: "Unpublished Quiz",
    status: "draft",
    createdBy: adminId,
  });

  const quizUnderDraftSubjectId = await createQuiz(pool, {
    subjectId: draftSubjectId,
    title: "Quiz under a draft subject",
    status: "published",
    createdBy: adminId,
  });

  const userToken = signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });
  const otherUserToken = signFakeSupabaseToken({ sub: "other-sub", email: "other@example.com" });
  const adminToken = signFakeSupabaseToken({ sub: "admin-sub", email: "admin@example.com" });

  return {
    adminId,
    userId,
    otherUserId,
    publishedSubjectId,
    draftSubjectId,
    questionId,
    wrongOptionId,
    correctOptionId,
    publishedQuizId,
    draftQuizId,
    quizUnderDraftSubjectId,
    userToken,
    otherUserToken,
    adminToken,
  };
}

describe("Quiz visibility and access", () => {
  it("1. unauthenticated quiz access rejected", async () => {
    const { publishedQuizId } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app).get(`/api/v1/quizzes/${publishedQuizId}`);
    expect(res.status).toBe(401);
  });

  it("2. an unpublished (draft) quiz is rejected for a non-admin (404, identical to nonexistent)", async () => {
    const { draftQuizId, userToken } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app).get(`/api/v1/quizzes/${draftQuizId}`).set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("a published quiz under a draft subject is rejected for a non-admin (subject visibility chain)", async () => {
    const { quizUnderDraftSubjectId, userToken } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/quizzes/${quizUnderDraftSubjectId}`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("an admin can see a draft quiz", async () => {
    const { draftQuizId, adminToken } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app).get(`/api/v1/quizzes/${draftQuizId}`).set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("3. inaccessible question access rejected (questions for a draft quiz)", async () => {
    const { draftQuizId, userToken } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/quizzes/${draftQuizId}/questions`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("a published subject's assessments list only returns published quizzes", async () => {
    const { publishedSubjectId, publishedQuizId, userToken } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/subjects/${publishedSubjectId}/assessments`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(publishedQuizId);
  });
});

describe("11. is_correct never appears in learner question responses", () => {
  it("GET /quizzes/:quizId/questions never includes is_correct/isCorrect, in any casing", async () => {
    const { publishedQuizId, userToken } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/quizzes/${publishedQuizId}/questions`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/is_correct|isCorrect/i);
    expect(res.body.data[0]).not.toHaveProperty("isCorrect");
    expect(res.body.data[0].options[0]).not.toHaveProperty("isCorrect");
  });

  it("same check for an admin's request — no debug/include path exposes it either", async () => {
    const { publishedQuizId, adminToken } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app)
      .get(`/api/v1/quizzes/${publishedQuizId}/questions`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(JSON.stringify(res.body)).not.toMatch(/is_correct|isCorrect/i);
  });
});

describe("Quiz attempts", () => {
  it("starting an attempt on an inaccessible quiz is rejected", async () => {
    const { draftQuizId, userToken } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/quizzes/${draftQuizId}/attempts`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(404);
  });

  it("starting an attempt twice returns the same in-progress attempt (idempotent resume, no duplicate)", async () => {
    const { publishedQuizId, userToken } = await seedQuizScenario();
    const app = createApp();
    const first = await request(app)
      .post(`/api/v1/quizzes/${publishedQuizId}/attempts`)
      .set("Authorization", `Bearer ${userToken}`);
    const second = await request(app)
      .post(`/api/v1/quizzes/${publishedQuizId}/attempts`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it("4. an attempt belongs to the authenticated user who started it", async () => {
    const { publishedQuizId, userToken } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/quizzes/${publishedQuizId}/attempts`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.body.data.status).toBe("in_progress");
    expect(res.body.data.quizId).toBe(publishedQuizId);
  });

  it("9. client cannot submit a userId — the server always uses the authenticated identity", async () => {
    const { publishedQuizId, userToken, userId, otherUserId } = await seedQuizScenario();
    const app = createApp();
    const res = await request(app)
      .post(`/api/v1/quizzes/${publishedQuizId}/attempts`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ userId: otherUserId });
    expect(res.body.data.userId).toBe(userId);
    expect(res.body.data.userId).not.toBe(otherUserId);
  });
});

describe("Answer submission", () => {
  async function startAttempt(app: ReturnType<typeof createApp>, quizId: string, token: string) {
    const res = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${token}`);
    return res.body.data.id as string;
  }

  it("5. a user cannot submit an answer to another user's attempt", async () => {
    const { publishedQuizId, userToken, otherUserToken, questionId, correctOptionId } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${otherUserToken}`)
      .send({ questionId, selectedOptionId: correctOptionId });

    expect(res.status).toBe(404);
  });

  it("6. a user cannot submit an answer for a question outside the quiz", async () => {
    const { publishedQuizId, userToken, publishedSubjectId, adminId } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);

    // A second, unrelated question that was never added to this quiz.
    const { questionId: unrelatedQuestionId, } = await createQuestionBankWithAnswer(pool, {
      subjectId: publishedSubjectId,
      createdBy: adminId,
    });

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId: unrelatedQuestionId, answerText: "n/a" });

    expect(res.status).toBe(400);
  });

  it("7. a user cannot submit an invalid option for the question", async () => {
    const { publishedQuizId, userToken, questionId, publishedSubjectId, adminId } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);

    const { questionId: otherQuestionId } = await createQuestionBankWithAnswer(pool, {
      subjectId: publishedSubjectId,
      createdBy: adminId,
    });
    const otherOptionsResult = await pool.query<{ id: string }>(
      "select id from question_options where question_id = $1 limit 1",
      [otherQuestionId],
    );
    const optionFromAnotherQuestion = otherOptionsResult.rows[0]!.id;

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, selectedOptionId: optionFromAnotherQuestion });

    expect(res.status).toBe(400);
  });

  it("10. client cannot submit correctness or points — the answer acknowledgment carries no such fields", async () => {
    const { publishedQuizId, userToken, questionId, correctOptionId } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, selectedOptionId: correctOptionId, isCorrect: true, pointsAwarded: 999, score: 100 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ questionId, recorded: true });
    expect(JSON.stringify(res.body)).not.toMatch(/isCorrect|pointsAwarded|score/i);
  });

  it("8. a user cannot submit an answer after the attempt has already been submitted", async () => {
    const { publishedQuizId, userToken, questionId, correctOptionId } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);
    await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, selectedOptionId: correctOptionId });

    expect(res.status).toBe(409);
  });
});

describe("Scoring and results", () => {
  async function startAttempt(app: ReturnType<typeof createApp>, quizId: string, token: string) {
    const res = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${token}`);
    return res.body.data.id as string;
  }

  it("12. score is calculated server-side from the correct answer, not the client's claim", async () => {
    const { publishedQuizId, userToken, questionId, wrongOptionId } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);

    await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, selectedOptionId: wrongOptionId });

    const submitRes = await request(app)
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.correctAnswers).toBe(0);
    expect(submitRes.body.data.score).toBe(0);
    expect(submitRes.body.data.percentage).toBe(0);
  });

  it("a correct answer yields a correct score and a 100% result", async () => {
    const { publishedQuizId, userToken, questionId, correctOptionId } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);

    await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, selectedOptionId: correctOptionId });

    const submitRes = await request(app)
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(submitRes.body.data.correctAnswers).toBe(1);
    expect(submitRes.body.data.percentage).toBe(100);
    expect(submitRes.body.data.status).toBe("graded");
  });

  it("13. a duplicate submission is handled safely (409, not a second grading pass)", async () => {
    const { publishedQuizId, userToken } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);

    const first = await request(app)
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set("Authorization", `Bearer ${userToken}`);
    const second = await request(app)
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it("14. a result is only accessible to the owning user, not another authenticated user", async () => {
    const { publishedQuizId, userToken, otherUserToken } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);
    await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);

    const ownResult = await request(app)
      .get(`/api/v1/attempts/${attemptId}/result`)
      .set("Authorization", `Bearer ${userToken}`);
    const otherResult = await request(app)
      .get(`/api/v1/attempts/${attemptId}/result`)
      .set("Authorization", `Bearer ${otherUserToken}`);

    expect(ownResult.status).toBe(200);
    expect(otherResult.status).toBe(404);
  });

  it("an admin may access another user's result for oversight", async () => {
    const { publishedQuizId, userToken, adminToken } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);
    await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);

    const res = await request(app)
      .get(`/api/v1/attempts/${attemptId}/result`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("a result is not available while the attempt is still in progress", async () => {
    const { publishedQuizId, userToken } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);

    const res = await request(app)
      .get(`/api/v1/attempts/${attemptId}/result`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it("the result response never includes is_correct/isCorrect", async () => {
    const { publishedQuizId, userToken, questionId, correctOptionId } = await seedQuizScenario();
    const app = createApp();
    const attemptId = await startAttempt(app, publishedQuizId, userToken);
    await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, selectedOptionId: correctOptionId });
    const submitRes = await request(app)
      .post(`/api/v1/attempts/${attemptId}/submit`)
      .set("Authorization", `Bearer ${userToken}`);

    expect(JSON.stringify(submitRes.body)).not.toMatch(/is_correct|isCorrect/i);
  });
});
