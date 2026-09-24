import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { signFakeSupabaseToken } from "../helpers/fakeSupabaseToken.js";
import {
  createSubject,
  createUser,
  createQuiz,
  addQuestionToQuiz,
  createEmptyQuestionBank,
  createMatchQuestion,
  createOrderQuestion,
} from "../helpers/seedFixtures.js";

/**
 * Phase 12F-BE-HTTP-WIRING — HTTP-boundary tests for `matchAnswer`/
 * `orderAnswer` now that `assessmentsRoutes.ts`'s zod schema accepts
 * them. These are additive to (not a replacement for)
 * `assessmentsMultiType.test.ts`'s existing service-level match/order
 * tests, which already prove the grading/storage/validation logic
 * itself — this file proves the same payloads actually reach that logic
 * through a real HTTP request.
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

async function seedUserAndSubject() {
  const adminId = await createUser(pool, { email: "admin@example.com", roleName: "admin", providerSubject: "admin-sub" });
  const userId = await createUser(pool, { email: "user@example.com", roleName: "user", providerSubject: "user-sub" });
  const subjectId = await createSubject(pool, { title: "HTTP Multi-type Subject", status: "published", createdBy: adminId });
  const userToken = await signFakeSupabaseToken({ sub: "user-sub", email: "user@example.com" });
  return { adminId, userId, subjectId, userToken };
}

describe("POST /attempts/:attemptId/answers — match, over real HTTP", () => {
  it("A1. a valid match payload reaches the service and is graded (full credit)", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [
        { left: "HTTP", right: "Port 80" },
        { left: "HTTPS", right: "Port 443" },
      ],
      points: 2,
    });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Match Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const answerRes = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        questionId,
        matchAnswer: [
          { leftId: pairIds[0], rightId: pairIds[0] },
          { leftId: pairIds[1], rightId: pairIds[1] },
        ],
      });
    expect(answerRes.status).toBe(200);
    expect(answerRes.body.data).toEqual({ questionId, recorded: true });
    // No correctness/points in the ack, for match either (unchanged rule).
    expect(JSON.stringify(answerRes.body)).not.toMatch(/isCorrect|is_correct|pointsAwarded/i);

    const submitRes = await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);
    expect(submitRes.body.data.score).toBe(2);
  });

  it("A2. a malformed match payload (missing rightId) is rejected", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, { bankId, createdBy: adminId, pairs: [{ left: "A", right: "1" }] });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Match Malformed Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, matchAnswer: [{ leftId: pairIds[0] }] });
    expect(res.status).toBe(400);
  });

  it("A3. a duplicate left-item mapping is rejected", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [
        { left: "A", right: "1" },
        { left: "B", right: "2" },
      ],
    });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Match Dup Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        questionId,
        matchAnswer: [
          { leftId: pairIds[0], rightId: pairIds[0] },
          { leftId: pairIds[0], rightId: pairIds[1] },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("A4. wrong payload type (a string instead of pair objects) is rejected", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId } = await createMatchQuestion(pool, { bankId, createdBy: adminId, pairs: [{ left: "A", right: "1" }] });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Match Wrong Type Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    // A match question must not silently accept a scalar answerText
    // payload when the approved contract requires match mappings.
    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, answerText: "not a match mapping" });
    expect(res.status).toBe(400);
  });

  it("A5. an is_correct field on the request body is ignored, never forwarded, never affects grading", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, pairIds } = await createMatchQuestion(pool, {
      bankId,
      createdBy: adminId,
      pairs: [
        { left: "A", right: "1" },
        { left: "B", right: "2" },
      ],
      points: 2,
    });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Match IsCorrect Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    // Client claims full credit with a wrong mapping and injects
    // is_correct/pointsAwarded directly -- the server must ignore all of
    // it and grade from the real question_pairs data only.
    await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        questionId,
        matchAnswer: [
          { leftId: pairIds[0], rightId: pairIds[1] }, // wrong
          { leftId: pairIds[1], rightId: pairIds[0] }, // wrong
        ],
        is_correct: true,
        isCorrect: true,
        pointsAwarded: 999,
      });
    const submitRes = await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);
    expect(submitRes.body.data.score).toBe(0);
  });
});

describe("POST /attempts/:attemptId/answers — order, over real HTTP", () => {
  it("B1. a valid order payload reaches the service and is graded (full credit)", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["Mix", "Bake", "Cool"], points: 1 });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Order Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const answerRes = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, orderAnswer: itemIds });
    expect(answerRes.status).toBe(200);
    expect(answerRes.body.data).toEqual({ questionId, recorded: true });

    const submitRes = await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);
    expect(submitRes.body.data.score).toBe(1);
  });

  it("B2. a malformed order payload (non-uuid entry) is rejected", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B"] });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Order Malformed Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, orderAnswer: ["not-a-uuid"] });
    expect(res.status).toBe(400);
  });

  it("B3. a duplicate item id is rejected", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B", "C"] });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Order Dup Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, orderAnswer: [itemIds[0], itemIds[0], itemIds[2]] });
    expect(res.status).toBe(400);
  });

  it("B4. wrong payload type (selectedOptionId instead of orderAnswer) is rejected", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B"] });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Order Wrong Type Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, selectedOptionId: "11111111-1111-1111-1111-111111111111" });
    // Structurally valid uuid, but wrong for an order-type question --
    // rejected at the service layer's type-check (400 via ValidationError).
    expect(res.status).toBe(400);
  });

  it("B5. a correct_order_index field on the request body is ignored, never forwarded", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B", "C"], points: 1 });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Order Index Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const reversed = [...itemIds].reverse();
    await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, orderAnswer: reversed, correct_order_index: 0, correctOrderIndex: 0 });
    const submitRes = await request(app).post(`/api/v1/attempts/${attemptId}/submit`).set("Authorization", `Bearer ${userToken}`);
    expect(submitRes.body.data.score).toBe(0); // reversed of 3 distinct items is never correct
  });
});

describe("regression — existing answer types still work over HTTP", () => {
  it("C1. selectedOptionId (multiple_choice) still works, exactly one field required", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const questionResult = await pool.query<{ id: string }>(
      "insert into questions (question_bank_id, question_type, prompt, points, created_by) values ($1, 'multiple_choice', '2+2=?', 1, $2) returning id",
      [bankId, adminId],
    );
    const questionId = questionResult.rows[0]!.id;
    const optionsResult = await pool.query<{ id: string }>(
      "insert into question_options (question_id, option_text, is_correct, order_index) values ($1, '3', false, 0), ($1, '4', true, 1) returning id",
      [questionId],
    );
    const correctOptionId = (
      await pool.query<{ id: string }>("select id from question_options where question_id = $1 and is_correct = true", [questionId])
    ).rows[0]!.id;
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Regression MC Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, selectedOptionId: correctOptionId });
    expect(res.status).toBe(200);
  });

  it("C2. a request with zero submission fields is still rejected (unchanged refine rule, now covering 4 fields)", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B"] });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Regression Empty Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const res = await request(app).post(`/api/v1/attempts/${attemptId}/answers`).set("Authorization", `Bearer ${userToken}`).send({ questionId });
    expect(res.status).toBe(400);
  });

  it("C3. a request with two submission fields at once is rejected", async () => {
    const { adminId, subjectId, userToken } = await seedUserAndSubject();
    const bankId = await createEmptyQuestionBank(pool, { subjectId, createdBy: adminId });
    const { questionId, itemIds } = await createOrderQuestion(pool, { bankId, createdBy: adminId, items: ["A", "B"] });
    const quizId = await createQuiz(pool, { subjectId, title: "HTTP Regression Two Fields Quiz", status: "published", createdBy: adminId });
    await addQuestionToQuiz(pool, { quizId, questionId });

    const app = createApp();
    const startRes = await request(app).post(`/api/v1/quizzes/${quizId}/attempts`).set("Authorization", `Bearer ${userToken}`);
    const attemptId = startRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/attempts/${attemptId}/answers`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ questionId, orderAnswer: itemIds, answerText: "also this" });
    expect(res.status).toBe(400);
  });
});
